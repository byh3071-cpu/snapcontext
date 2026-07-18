import {
  MAX_UPLOAD_BYTES,
  isPngMagic,
  isExpired,
  formatExpiryKST,
  buildViewerHtml,
  buildExpiredHtml,
  parseSharedContext,
  safeDecodeId
} from './lib'
import { gateMcpBearer } from './auth'
import { rejectInvalidOrigin } from './origin'
import {
  captureRowFromSharedContext,
  cleanupUploadObjects,
  insertCapture
} from './ingest'
import type { Env } from './env'

export type { Env }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

const GONE_MSG = '이 링크는 만료되었거나 존재하지 않습니다. (업로드 후 7일 보관)'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
  })
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS }
  })
}

function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      ...CORS
    }
  })
}

export default {
  async fetch(
    req: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(req.url)

    // MCP 분기 우선 — 전역 OPTIONS 보다 먼저 (MAJOR-1). Origin 불일치는 OPTIONS 포함 403
    if (url.pathname === '/mcp') {
      const originDenied = rejectInvalidOrigin(req)
      if (originDenied) return originDenied

      if (req.method === 'OPTIONS') {
        // preflight 는 Authorization 미포함 — Origin 통과 시에만 허용, bearer 는 실제 MCP 메서드에서
        return new Response(null, { headers: CORS })
      }

      const authDenied = await gateMcpBearer(req, env.SNAPCONTEXT_BEARER_TOKEN)
      if (authDenied) return authDenied

      // agents/mcp 는 cloudflare: 워커 모듈 — 게이트 통과 후에만 로드
      const { handleMcpRequest } = await import('./mcp-route')
      return handleMcpRequest(req, env, ctx)
    }

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS })
    }

    // 업로드: POST /upload (multipart/form-data: image 필수, context 선택)
    if (req.method === 'POST' && url.pathname === '/upload') {
      const cl = Number(req.headers.get('content-length') ?? '0')
      if (Number.isFinite(cl) && cl > MAX_UPLOAD_BYTES + 1024 * 1024) {
        return textResponse('파일이 너무 큽니다. (최대 10MB)', 413)
      }
      let form: FormData
      try {
        form = await req.formData()
      } catch {
        return textResponse('잘못된 업로드 형식입니다.', 400)
      }
      const image: unknown = form.get('image')
      if (!(image instanceof File) && !(image instanceof Blob)) {
        return textResponse('이미지가 없습니다.', 400)
      }
      if (image.size > MAX_UPLOAD_BYTES) {
        return textResponse('파일이 너무 큽니다. (최대 10MB)', 413)
      }
      const buf = await image.arrayBuffer()
      if (!isPngMagic(new Uint8Array(buf.slice(0, 8)))) {
        return textResponse('PNG 이미지만 업로드할 수 있습니다.', 415)
      }
      const id = crypto.randomUUID()
      const nowMs = Date.now()
      const context = form.get('context')
      const hasContext = typeof context === 'string' && context.length > 0
      let wroteJson = false
      try {
        await env.BUCKET.put(id, buf, {
          httpMetadata: { contentType: 'image/png' }
        })
        if (hasContext) {
          await env.BUCKET.put(`${id}.json`, context, {
            httpMetadata: { contentType: 'application/json' }
          })
          wroteJson = true
        }
      } catch {
        return textResponse('업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.', 502)
      }

      // 수집 = 공유 업로드분(context 있을 때만 D1 인덱스). bearer는 Phase 4 이연(ADR-010).
      if (hasContext) {
        const shared = parseSharedContext(context)
        if (shared) {
          try {
            await insertCapture(
              env.DB,
              captureRowFromSharedContext(id, shared, nowMs)
            )
          } catch {
            await cleanupUploadObjects(env.BUCKET, id, wroteJson)
            return textResponse(
              '인덱스 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
              500
            )
          }
        } else {
          // malformed JSON: R2 raw 는 유지·뷰어 그레이스풀 저하와 일관. D1 스킵은 관측 가능하게.
          console.warn(
            '[upload] context present but JSON parse failed; D1 index skipped',
            { id }
          )
        }
      }

      return jsonResponse({ id, url: `${url.origin}/s/${id}` })
    }

    // raw 이미지: GET /i/{id}
    if (req.method === 'GET' && url.pathname.startsWith('/i/')) {
      const id = safeDecodeId(url.pathname.slice(3))
      let obj: R2ObjectBody | null
      try {
        obj = await env.BUCKET.get(id)
      } catch {
        return textResponse('이미지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 502)
      }
      if (!obj || isExpired(obj.uploaded, Date.now())) {
        return textResponse(GONE_MSG, 410)
      }
      return new Response(obj.body, {
        headers: {
          'Content-Type': obj.httpMetadata?.contentType ?? 'image/png',
          'Cache-Control': 'public, max-age=604800',
          ...CORS
        }
      })
    }

    // 뷰어: GET /s/{id}
    if (req.method === 'GET' && url.pathname.startsWith('/s/')) {
      const id = safeDecodeId(url.pathname.slice(3))
      try {
        const head = await env.BUCKET.head(id)
        if (!head || isExpired(head.uploaded, Date.now())) {
          return htmlResponse(buildExpiredHtml(), 410)
        }
        const ctxObj = await env.BUCKET.get(`${id}.json`)
        const shared = ctxObj ? parseSharedContext(await ctxObj.text()) : null
        const html = buildViewerHtml(id, shared, formatExpiryKST(head.uploaded))
        return htmlResponse(html, 200)
      } catch {
        return textResponse('페이지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 502)
      }
    }

    return textResponse('Not found', 404)
  }
}
