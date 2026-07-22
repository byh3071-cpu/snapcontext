import { describe, it, expect, vi, afterEach } from 'vitest'
import worker from '../src/index'
import { DAY_MS, MAX_AGE_MS } from '../src/lib'

// PNG 매직 + 더미 바이트 (무결성 비교용)
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

type StoredObj = {
  bytes?: Uint8Array
  uploaded: Date
  contentType?: string
  text?: string
  customMetadata?: Record<string, string>
}

// mock R2 BUCKET: Map 기반. get→body/uploaded/customMetadata/httpMetadata/text, head→uploaded/customMetadata.
function makeEnv(objects: Map<string, StoredObj>): any {
  return {
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
      async put() {}
    }
  }
}

const req = (path: string, method = 'GET') =>
  new Request(`https://w.test${path}`, { method })

const fresh = () => new Date()
const stale = () => new Date(Date.now() - MAX_AGE_MS - 1000)
/** 메타로 조기 만료(이미 지난 시각) */
const metaExpired = () => ({ expiresAt: new Date(Date.now() - 1000).toISOString() })
/** 메타로 연장(업로드 8일 경과분을 30일 보관으로) */
const metaExtended = () => ({
  expiresAt: new Date(Date.now() + 22 * DAY_MS).toISOString()
})
const eightDaysAgo = () => new Date(Date.now() - 8 * DAY_MS)

describe('GET /i/{id} — raw PNG 무결성 (#2, 회귀 방어)', () => {
  it('유효 이미지: 200 + content-type image/png + 원본 바이트 그대로 (JSON 아님)', async () => {
    const env = makeEnv(new Map([['id1', { bytes: PNG, uploaded: fresh(), contentType: 'image/png' }]]))
    const res = await worker.fetch(req('/i/id1'), env)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('content-type')).not.toContain('application/json')
    const buf = new Uint8Array(await res.arrayBuffer())
    expect(Array.from(buf)).toEqual(Array.from(PNG))
  })
})

describe('GET /i/{id} — 만료/없는 키 410 (#4)', () => {
  it('없는 키: 410 + GONE_MSG (빈 화면 아님)', async () => {
    const res = await worker.fetch(req('/i/nope'), makeEnv(new Map()))
    expect(res.status).toBe(410)
    expect(await res.text()).toContain('만료되었거나 존재하지 않습니다')
  })
  it('만료된 키(업로드 7일+ 경과): 410', async () => {
    const env = makeEnv(new Map([['old', { bytes: PNG, uploaded: stale(), contentType: 'image/png' }]]))
    const res = await worker.fetch(req('/i/old'), env)
    expect(res.status).toBe(410)
  })
})

describe('GET /s/{id} — 만료/없는 키 410 렌더 (#4)', () => {
  it('없는 키: 410 + 만료 HTML 페이지 (빈 화면 아님)', async () => {
    const res = await worker.fetch(req('/s/nope'), makeEnv(new Map()))
    expect(res.status).toBe(410)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('링크 만료')
  })
  it('만료된 키: 410 + 만료 HTML 페이지', async () => {
    const env = makeEnv(new Map([['old', { uploaded: stale() }]]))
    const res = await worker.fetch(req('/s/old'), env)
    expect(res.status).toBe(410)
    expect(await res.text()).toContain('링크 만료')
  })
  it('유효 키: 200 + 이미지 참조(/i/{id}) + context 렌더 (positive 대조)', async () => {
    const ctx = JSON.stringify({
      v: 1,
      sourceUrl: 'http://a.com/p',
      sourceTitle: 'TITLE_OK',
      captureType: 'visible',
      capturedAt: '2026-06-06',
      viewport: { width: 1, height: 2 },
      pins: []
    })
    const env = makeEnv(
      new Map([
        ['s1', { uploaded: fresh() }],
        ['s1.json', { uploaded: fresh(), text: ctx }]
      ])
    )
    const res = await worker.fetch(req('/s/s1'), env)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('/i/s1')
    expect(html).toContain('TITLE_OK')
  })
})

describe('/i/ Cache-Control — 잔여 수명만큼만 캐시 (T3.3)', () => {
  const T = Date.parse('2026-07-22T00:00:00.000Z')
  const meta = (expiresAtMs: number) => ({
    expiresAt: new Date(expiresAtMs).toISOString()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('7일 업로드 @T · 조회 @T+1d → public, max-age=518400 (잔여 6일)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T + DAY_MS)
    const env = makeEnv(
      new Map([
        [
          'c1',
          {
            bytes: PNG,
            uploaded: new Date(T),
            contentType: 'image/png',
            customMetadata: meta(T + MAX_AGE_MS)
          }
        ]
      ])
    )
    const res = await worker.fetch(req('/i/c1'), env)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=518400')
  })

  it('레거시(메타 없음) 도 같은 잔여초를 낸다', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T + DAY_MS)
    const env = makeEnv(
      new Map([
        ['c2', { bytes: PNG, uploaded: new Date(T), contentType: 'image/png' }]
      ])
    )
    const res = await worker.fetch(req('/i/c2'), env)
    expect(res.headers.get('cache-control')).toBe('public, max-age=518400')
  })

  it('1일 업로드는 max-age 도 1일치 (보관기간 따라 변한다)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T)
    const env = makeEnv(
      new Map([
        [
          'c3',
          {
            bytes: PNG,
            uploaded: new Date(T),
            contentType: 'image/png',
            customMetadata: meta(T + DAY_MS)
          }
        ]
      ])
    )
    const res = await worker.fetch(req('/i/c3'), env)
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400')
  })

  it('만료 500ms 전(잔여 1초 미만) → no-store', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T + MAX_AGE_MS - 500)
    const env = makeEnv(
      new Map([
        [
          'c4',
          {
            bytes: PNG,
            uploaded: new Date(T),
            contentType: 'image/png',
            customMetadata: meta(T + MAX_AGE_MS)
          }
        ]
      ])
    )
    const res = await worker.fetch(req('/i/c4'), env)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('잔여 정확히 1000ms → public, max-age=1 (경계)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(T + MAX_AGE_MS - 1000)
    const env = makeEnv(
      new Map([
        [
          'c5',
          {
            bytes: PNG,
            uploaded: new Date(T),
            contentType: 'image/png',
            customMetadata: meta(T + MAX_AGE_MS)
          }
        ]
      ])
    )
    const res = await worker.fetch(req('/i/c5'), env)
    expect(res.headers.get('cache-control')).toBe('public, max-age=1')
  })

  it('/i/ 410(없는 키·만료) 에도 Cache-Control: no-store — 410 은 heuristic cacheable', async () => {
    const missing = await worker.fetch(req('/i/nope'), makeEnv(new Map()))
    expect(missing.status).toBe(410)
    expect(missing.headers.get('cache-control')).toBe('no-store')

    const env = makeEnv(new Map([['old', { bytes: PNG, uploaded: stale() }]]))
    const expired = await worker.fetch(req('/i/old'), env)
    expect(expired.status).toBe(410)
    expect(expired.headers.get('cache-control')).toBe('no-store')
  })

  it('/s/ 410 은 기존 no-cache 유지 (회귀 방어)', async () => {
    const res = await worker.fetch(req('/s/nope'), makeEnv(new Map()))
    expect(res.status).toBe(410)
    expect(res.headers.get('cache-control')).toBe('no-cache')
  })
})

describe('만료 정각 경계 — R2 경로 (D1 과 통일)', () => {
  const T = Date.parse('2026-07-25T00:00:00.000Z')
  const expiresAt = T + DAY_MS

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('now === expiresAt 정각: /i/ 200 · /s/ 200 (아직 유효)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(expiresAt)
    const meta = { expiresAt: new Date(expiresAt).toISOString() }
    const env = makeEnv(
      new Map([
        [
          'b1',
          {
            bytes: PNG,
            uploaded: new Date(T),
            contentType: 'image/png',
            customMetadata: meta
          }
        ]
      ])
    )
    expect((await worker.fetch(req('/i/b1'), env)).status).toBe(200)
    expect((await worker.fetch(req('/s/b1'), env)).status).toBe(200)
  })

  it('1ms 뒤: /i/ 410 · /s/ 410', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(expiresAt + 1)
    const meta = { expiresAt: new Date(expiresAt).toISOString() }
    const env = makeEnv(
      new Map([
        [
          'b2',
          {
            bytes: PNG,
            uploaded: new Date(T),
            contentType: 'image/png',
            customMetadata: meta
          }
        ]
      ])
    )
    expect((await worker.fetch(req('/i/b2'), env)).status).toBe(410)
    expect((await worker.fetch(req('/s/b2'), env)).status).toBe(410)
  })
})

describe('만료 문구 탈-7일 (T3.3)', () => {
  it("/i/ 410 본문에 '7일' 이 없고 보관 기간 문구로 대체", async () => {
    const res = await worker.fetch(req('/i/nope'), makeEnv(new Map()))
    const text = await res.text()
    expect(text).not.toContain('7일')
    expect(text).toBe(
      '이 링크는 만료되었거나 존재하지 않습니다. (공유 링크는 선택한 보관 기간이 지나면 자동 삭제됩니다)'
    )
  })

  it("/s/ 410 HTML 에도 '7일' 없음", async () => {
    const res = await worker.fetch(req('/s/nope'), makeEnv(new Map()))
    const html = await res.text()
    expect(html).not.toContain('7일')
    expect(html).toContain('선택한 보관 기간이 지나면 자동 삭제됩니다')
  })
})

describe('customMetadata.expiresAt 가 uploaded 를 이긴다 (양방향)', () => {
  it('/i/: uploaded 는 신선해도 메타가 지났으면 410', async () => {
    const env = makeEnv(
      new Map([
        [
          'short',
          {
            bytes: PNG,
            uploaded: fresh(),
            contentType: 'image/png',
            customMetadata: metaExpired()
          }
        ]
      ])
    )
    const res = await worker.fetch(req('/i/short'), env)
    expect(res.status).toBe(410)
  })

  it('/i/: uploaded 가 8일 지났어도 메타가 남아 있으면 200', async () => {
    const env = makeEnv(
      new Map([
        [
          'long',
          {
            bytes: PNG,
            uploaded: eightDaysAgo(),
            contentType: 'image/png',
            customMetadata: metaExtended()
          }
        ]
      ])
    )
    const res = await worker.fetch(req('/i/long'), env)
    expect(res.status).toBe(200)
  })

  it('/s/: uploaded 는 신선해도 메타가 지났으면 410', async () => {
    const env = makeEnv(
      new Map([['short', { uploaded: fresh(), customMetadata: metaExpired() }]])
    )
    const res = await worker.fetch(req('/s/short'), env)
    expect(res.status).toBe(410)
    expect(await res.text()).toContain('링크 만료')
  })

  it('/s/: uploaded 가 8일 지났어도 메타가 남아 있으면 200', async () => {
    const env = makeEnv(
      new Map([
        ['long', { uploaded: eightDaysAgo(), customMetadata: metaExtended() }]
      ])
    )
    const res = await worker.fetch(req('/s/long'), env)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('/i/long')
  })
})
