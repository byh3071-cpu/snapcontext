import {
  MAX_UPLOAD_BYTES,
  isPngMagic,
  isExpired,
  formatExpiryKST,
  buildViewerHtml,
  buildExpiredHtml,
  parseSharedContext
} from './lib'

export interface Env {
  BUCKET: R2Bucket
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
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
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

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
      try {
        await env.BUCKET.put(id, buf, {
          httpMetadata: { contentType: 'image/png' }
        })
        const context = form.get('context')
        if (typeof context === 'string' && context.length > 0) {
          await env.BUCKET.put(`${id}.json`, context, {
            httpMetadata: { contentType: 'application/json' }
          })
        }
      } catch {
        return textResponse('업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.', 502)
      }
      return jsonResponse({ id, url: `${url.origin}/s/${id}` })
    }

    // raw 이미지: GET /i/{id}
    if (req.method === 'GET' && url.pathname.startsWith('/i/')) {
      const id = url.pathname.slice(3)
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
      const id = url.pathname.slice(3)
      try {
        const head = await env.BUCKET.head(id)
        if (!head || isExpired(head.uploaded, Date.now())) {
          return htmlResponse(buildExpiredHtml(), 410)
        }
        const ctxObj = await env.BUCKET.get(`${id}.json`)
        const ctx = ctxObj ? parseSharedContext(await ctxObj.text()) : null
        const html = buildViewerHtml(id, ctx, formatExpiryKST(head.uploaded))
        return htmlResponse(html, 200)
      } catch {
        return textResponse('페이지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 502)
      }
    }

    return textResponse('Not found', 404)
  }
}
