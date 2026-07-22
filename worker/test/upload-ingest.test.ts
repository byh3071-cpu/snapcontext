import { describe, it, expect, vi } from 'vitest'
import worker from '../src/index'
import { MAX_AGE_MS } from '../src/lib'
import { listCaptures } from '../src/history'
import type { Env } from '../src/env'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

const SHARED_CTX = {
  v: 1 as const,
  sourceUrl: 'https://example.com/page',
  sourceTitle: 'Example Title',
  captureType: 'visible',
  capturedAt: '2026-07-10T00:00:00.000Z',
  viewport: { width: 1280, height: 720 },
  pins: [
    { id: 1, memo: 'a' },
    { id: 2, memo: 'b' }
  ]
}

type StoredObj = {
  bytes?: Uint8Array
  uploaded: Date
  contentType?: string
  text?: string
  customMetadata?: Record<string, string>
}

interface CaptureInsert {
  id: string
  created_at: string
  url: string
  title: string
  capture_type: string
  pin_count: number
  expires_at: string
}

function makeUploadEnv(opts?: {
  d1Fail?: boolean
  cleanupFail?: boolean
  now?: number
}): {
  env: Env
  objects: Map<string, StoredObj>
  inserts: CaptureInsert[]
  deleted: string[]
} {
  const objects = new Map<string, StoredObj>()
  const inserts: CaptureInsert[] = []
  const deleted: string[] = []
  const now = opts?.now ?? Date.now()

  const env: Env = {
    BUCKET: {
      async get(key: string) {
        const o = objects.get(key)
        if (!o) return null
        return {
          body: o.bytes,
          uploaded: o.uploaded,
          customMetadata: o.customMetadata,
          httpMetadata: { contentType: o.contentType },
          text: async () => o.text ?? ''
        }
      },
      async head(key: string) {
        const o = objects.get(key)
        if (!o) return null
        return { uploaded: o.uploaded, customMetadata: o.customMetadata }
      },
      async put(
        key: string,
        value: ArrayBuffer | string,
        putOpts?: {
          httpMetadata?: { contentType?: string }
          customMetadata?: Record<string, string>
        }
      ) {
        const common = {
          uploaded: new Date(now),
          contentType: putOpts?.httpMetadata?.contentType,
          customMetadata: putOpts?.customMetadata
        }
        if (typeof value === 'string') {
          objects.set(key, { ...common, text: value })
        } else {
          objects.set(key, { ...common, bytes: new Uint8Array(value) })
        }
      },
      async delete(key: string) {
        if (opts?.cleanupFail) {
          throw new Error('R2 delete failed')
        }
        deleted.push(key)
        objects.delete(key)
      }
    } as unknown as R2Bucket,
    DB: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async run() {
                if (opts?.d1Fail) {
                  throw new Error('D1 INSERT failed')
                }
                if (/INSERT\s+INTO\s+captures/i.test(sql)) {
                  inserts.push({
                    id: String(args[0]),
                    created_at: String(args[1]),
                    url: String(args[2]),
                    title: String(args[3]),
                    capture_type: String(args[4]),
                    pin_count: Number(args[5]),
                    expires_at: String(args[6])
                  })
                }
                return { success: true }
              },
              async all() {
                const nowIso = String(args[0])
                const limit = Number(args[1])
                const filtered = inserts
                  .filter((r) => r.expires_at > nowIso)
                  .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                  .slice(0, limit)
                return { results: filtered }
              }
            }
          }
        }
      }
    } as unknown as D1Database
  }

  return { env, objects, inserts, deleted }
}

async function postUpload(
  env: Env,
  fields: { image?: Blob; context?: string }
): Promise<Response> {
  const form = new FormData()
  if (fields.image) form.set('image', fields.image, 'shot.png')
  if (fields.context !== undefined) form.set('context', fields.context)
  return worker.fetch(
    new Request('https://w.test/upload', { method: 'POST', body: form }),
    env,
    {} as ExecutionContext
  )
}

describe('POST /upload — D1 captures INSERT (Phase 2)', () => {
  it('context 있는 성공 경로: R2 PUT 후 D1 INSERT (id=R2키, created_at=now, url/title/type/pin_count, expires_at=now+7d)', async () => {
    const fixedNow = Date.parse('2026-07-18T12:00:00.000Z')
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111')

    const { env, objects, inserts } = makeUploadEnv({ now: fixedNow })
    const res = await postUpload(env, {
      image: new Blob([PNG], { type: 'image/png' }),
      context: JSON.stringify(SHARED_CTX)
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; url: string }
    expect(body.id).toBe('11111111-1111-4111-8111-111111111111')
    expect(body.url).toBe('https://w.test/s/11111111-1111-4111-8111-111111111111')

    expect(objects.has(body.id)).toBe(true)
    expect(objects.has(`${body.id}.json`)).toBe(true)

    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toEqual({
      id: body.id,
      created_at: new Date(fixedNow).toISOString(),
      url: SHARED_CTX.sourceUrl,
      title: SHARED_CTX.sourceTitle,
      capture_type: SHARED_CTX.captureType,
      pin_count: SHARED_CTX.pins.length,
      expires_at: new Date(fixedNow + MAX_AGE_MS).toISOString()
    })

    vi.restoreAllMocks()
  })

  it('context 없는 업로드: 현행처럼 200 + R2 이미지만, D1 INSERT 없음', async () => {
    const { env, objects, inserts } = makeUploadEnv()
    const res = await postUpload(env, {
      image: new Blob([PNG], { type: 'image/png' })
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; url: string }
    expect(body.id).toBeTruthy()
    expect(body.url).toContain(`/s/${body.id}`)
    expect(objects.has(body.id)).toBe(true)
    expect(objects.has(`${body.id}.json`)).toBe(false)
    expect(inserts).toHaveLength(0)
  })

  it('R2 PUT 성공 후 D1 INSERT 실패: R2 정리 시도 + 명시적 5xx (조용한 무시 금지)', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('22222222-2222-4222-8222-222222222222')
    const { env, objects, deleted } = makeUploadEnv({ d1Fail: true })
    const res = await postUpload(env, {
      image: new Blob([PNG], { type: 'image/png' }),
      context: JSON.stringify(SHARED_CTX)
    })

    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(res.status).toBeLessThan(600)
    const text = await res.text()
    expect(text.length).toBeGreaterThan(0)
    expect(deleted).toEqual(
      expect.arrayContaining([
        '22222222-2222-4222-8222-222222222222',
        '22222222-2222-4222-8222-222222222222.json'
      ])
    )
    expect(objects.size).toBe(0)
    vi.restoreAllMocks()
  })

  it('D1 실패 후 R2 cleanup 자체 실패해도 명시적 500 유지 (가짜 성공 금지)', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('44444444-4444-4444-8444-444444444444')
    const { env, objects } = makeUploadEnv({ d1Fail: true, cleanupFail: true })
    const res = await postUpload(env, {
      image: new Blob([PNG], { type: 'image/png' }),
      context: JSON.stringify(SHARED_CTX)
    })

    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text.length).toBeGreaterThan(0)
    // cleanup 실패 → orphan 잔존 가능. 응답은 여전히 500 (allSettled best-effort)
    expect(objects.size).toBeGreaterThan(0)
    vi.restoreAllMocks()
  })

  it('context 존재 + JSON 파싱 실패: D1 스킵·200 유지 + console.warn 관측', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('55555555-5555-4555-8555-555555555555')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { env, objects, inserts } = makeUploadEnv()
    const res = await postUpload(env, {
      image: new Blob([PNG], { type: 'image/png' }),
      context: '{not-valid-json'
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; url: string }
    expect(body.id).toBe('55555555-5555-4555-8555-555555555555')
    expect(objects.has(body.id)).toBe(true)
    expect(objects.has(`${body.id}.json`)).toBe(true)
    expect(inserts).toHaveLength(0)
    expect(warn).toHaveBeenCalledWith(
      '[upload] context present but JSON parse failed; D1 index skipped',
      { id: body.id }
    )
    warn.mockRestore()
    vi.restoreAllMocks()
  })
})

describe('POST /upload → snap_history 통합 (로컬 D1 mock)', () => {
  it('업로드 후 listCaptures 에 동일 행이 최신순으로 보임', async () => {
    const fixedNow = Date.parse('2026-07-18T15:00:00.000Z')
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('33333333-3333-4333-8333-333333333333')

    const { env, inserts } = makeUploadEnv({ now: fixedNow })
    const res = await postUpload(env, {
      image: new Blob([PNG], { type: 'image/png' }),
      context: JSON.stringify(SHARED_CTX)
    })
    expect(res.status).toBe(200)

    const history = await listCaptures(env.DB, {
      nowIso: new Date(fixedNow).toISOString(),
      limit: 10
    })
    expect(history).toHaveLength(1)
    expect(history[0]).toEqual({
      id: '33333333-3333-4333-8333-333333333333',
      createdAt: new Date(fixedNow).toISOString(),
      url: SHARED_CTX.sourceUrl,
      title: SHARED_CTX.sourceTitle,
      captureType: SHARED_CTX.captureType,
      pinCount: 2
    })
    expect(inserts[0]?.id).toBe(history[0]?.id)

    vi.restoreAllMocks()
  })
})

describe('누출 회귀 — SharedContext 화이트리스트 미확장 + /s·/i 신규 필드 미노출', () => {
  it('/s 뷰어는 화이트리스트 밖 필드(userNote·tags·pin x/y·userAgent)를 HTML에 노출하지 않음', async () => {
    const leaky = {
      ...SHARED_CTX,
      userNote: 'SECRET_NOTE',
      tags: ['SECRET_TAG'],
      userAgent: 'SECRET_UA',
      pins: [{ id: 1, memo: 'ok', x: 99, y: 88 }]
    }
    const { env } = makeUploadEnv()
    const up = await postUpload(env, {
      image: new Blob([PNG], { type: 'image/png' }),
      context: JSON.stringify(leaky)
    })
    expect(up.status).toBe(200)
    const { id } = (await up.json()) as { id: string }

    const view = await worker.fetch(
      new Request(`https://w.test/s/${id}`),
      env,
      {} as ExecutionContext
    )
    expect(view.status).toBe(200)
    const html = await view.text()
    expect(html).toContain(SHARED_CTX.sourceTitle)
    expect(html).toContain('ok')
    expect(html).not.toContain('SECRET_NOTE')
    expect(html).not.toContain('SECRET_TAG')
    expect(html).not.toContain('SECRET_UA')
    expect(html).not.toContain('x: 99')
    expect(html).not.toMatch(/\bx\b[^<]*99/)
  })

  it('/i 는 이미지 바이트만 — JSON·메타 필드 미포함 (기존 공유 응답 회귀)', async () => {
    const { env } = makeUploadEnv()
    const up = await postUpload(env, {
      image: new Blob([PNG], { type: 'image/png' }),
      context: JSON.stringify({ ...SHARED_CTX, userNote: 'SECRET_NOTE' })
    })
    const { id } = (await up.json()) as { id: string }

    const img = await worker.fetch(
      new Request(`https://w.test/i/${id}`),
      env,
      {} as ExecutionContext
    )
    expect(img.status).toBe(200)
    expect(img.headers.get('content-type')).toBe('image/png')
    const buf = new Uint8Array(await img.arrayBuffer())
    expect(Array.from(buf)).toEqual(Array.from(PNG))
    const asText = new TextDecoder().decode(buf)
    expect(asText).not.toContain('SECRET_NOTE')
    expect(asText).not.toContain('sourceUrl')
  })

  it('업로드 성공 응답 형태 회귀: { id, url } 만 (추가 필드 없음)', async () => {
    const { env } = makeUploadEnv()
    const res = await postUpload(env, {
      image: new Blob([PNG], { type: 'image/png' }),
      context: JSON.stringify(SHARED_CTX)
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['id', 'url'])
  })
})
