import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  EXPIRY_DAYS_ALLOWLIST,
  UploadFailedError,
  isExpiryDays,
  isUnauthorizedUploadError,
  uploadShare
} from '../src/utils/upload'
import type { ExpiryDays } from '../src/utils/upload'
import type { SharedContext } from '../src/types'

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })

describe('uploadShare', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://w.example.dev')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('posts image-only and returns url', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ id: 'x', url: 'https://w.example.dev/s/x' }))
    vi.stubGlobal('fetch', fetchMock)

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    const url = await uploadShare(blob)

    expect(url).toBe('https://w.example.dev/s/x')
    const [calledUrl, opts] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe('https://w.example.dev/upload')
    expect(opts.method).toBe('POST')
    expect(opts.body).toBeInstanceOf(FormData)
    expect((opts.body as FormData).get('context')).toBeNull()
  })

  it('includes context when provided and never leaks debugLogs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ url: 'https://w.example.dev/s/y' }))
    vi.stubGlobal('fetch', fetchMock)

    const ctx: SharedContext = {
      v: 1,
      sourceUrl: 'http://a',
      sourceTitle: 't',
      captureType: 'visible',
      capturedAt: '2026-06-04T00:00:00.000Z',
      viewport: { width: 1, height: 2 },
      pins: [{ id: 1, memo: 'm' }]
    }
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    await uploadShare(blob, ctx)

    const body = fetchMock.mock.calls[0][1].body as FormData
    const sent = JSON.parse(body.get('context') as string)
    expect(sent).toEqual(ctx)
    expect('debugLogs' in sent).toBe(false)
    expect('project' in sent).toBe(false)
  })

  it('throws on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 413 })))
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    await expect(uploadShare(blob)).rejects.toThrow('업로드 실패 (413)')
  })

  it('throws when endpoint missing', async () => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', '')
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    await expect(uploadShare(blob)).rejects.toThrow('엔드포인트가 설정되지')
  })

  it('propagates network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    await expect(uploadShare(blob)).rejects.toThrow(/fetch/i)
  })

  it('throws a Korean message on non-JSON 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>not json</html>', { status: 200 }))
    )
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    await expect(uploadShare(blob)).rejects.toThrow('서버 응답을 해석할 수 없습니다.')
  })

  it('normalizes a trailing slash in the endpoint (no double slash)', async () => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://w.example.dev/')
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ url: 'https://w.example.dev/s/z' }))
    vi.stubGlobal('fetch', fetchMock)
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    await uploadShare(blob)
    expect(fetchMock.mock.calls[0][0]).toBe('https://w.example.dev/upload')
  })
})

describe('업로드 실패 분류 (B1)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://w.example.dev')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const pngBlob = () => new Blob([new Uint8Array([1])], { type: 'image/png' })

  it('401 은 status 를 담은 UploadFailedError 로 던진다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }))
    )
    const err = await uploadShare(pngBlob()).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(UploadFailedError)
    expect((err as UploadFailedError).status).toBe(401)
    // 기존 메시지 포맷은 유지한다
    expect((err as UploadFailedError).message).toBe('업로드 실패 (401)')
  })

  it('isUnauthorizedUploadError 가 401 만 참이다', async () => {
    expect(isUnauthorizedUploadError(new UploadFailedError(401))).toBe(true)
    expect(isUnauthorizedUploadError(new UploadFailedError(413))).toBe(false)
    expect(isUnauthorizedUploadError(new Error('업로드 실패 (401)'))).toBe(false)
    expect(isUnauthorizedUploadError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isUnauthorizedUploadError(null)).toBe(false)
  })
})

describe('isExpiryDays', () => {
  it('worker 의 EXPIRY_DAYS_ALLOWLIST 와 같은 1·7·30 만 통과시킨다', () => {
    expect(EXPIRY_DAYS_ALLOWLIST).toEqual([1, 7, 30])
    for (const value of [1, 7, 30]) {
      expect(isExpiryDays(value), String(value)).toBe(true)
    }
    for (const value of [0, 3, 8, 31, -7, 7.5, '7', null, undefined, {}]) {
      expect(isExpiryDays(value), String(value)).toBe(false)
    }
  })
})

describe('uploadShare — bearer 토큰·보관 기간 (P5-T5.2)', () => {
  const TOKEN = 'sc_AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB'

  beforeEach(() => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://w.example.dev')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const stubOkFetch = () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ url: 'https://w.example.dev/s/t' }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  const pngBlob = () => new Blob([new Uint8Array([1])], { type: 'image/png' })

  it('토큰을 주면 Authorization: Bearer 로 싣는다', async () => {
    const fetchMock = stubOkFetch()
    await uploadShare(pngBlob(), undefined, { token: TOKEN })

    const opts = fetchMock.mock.calls[0][1]
    expect(opts.headers).toEqual({ Authorization: `Bearer ${TOKEN}` })
  })

  // worker 계약: Authorization 이 있는데 토큰이 무효면 401 → 없을 땐 헤더 키 자체가 없어야 익명 200
  it('토큰이 없으면 Authorization 헤더 키 자체가 없다', async () => {
    const fetchMock = stubOkFetch()
    await uploadShare(pngBlob(), undefined, {})
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined()
  })

  it('토큰이 null 이면(발급 실패) Authorization 을 붙이지 않는다', async () => {
    const fetchMock = stubOkFetch()
    await uploadShare(pngBlob(), undefined, { token: null })
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined()
  })

  it('토큰이 빈 문자열이면 "Bearer " 만 보내지 않는다', async () => {
    const fetchMock = stubOkFetch()
    await uploadShare(pngBlob(), undefined, { token: '' })
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined()
  })

  it('expiresInDays 를 주면 FormData 에 문자열로 싣는다', async () => {
    const fetchMock = stubOkFetch()
    await uploadShare(pngBlob(), undefined, { expiresInDays: 30 })

    const body = fetchMock.mock.calls[0][1].body as FormData
    expect(body.get('expiresInDays')).toBe('30')
  })

  // worker 계약: 빈 문자열은 400, 부재만 기본 7일로 받는다
  it('expiresInDays 미지정이면 필드를 아예 append 하지 않는다', async () => {
    const fetchMock = stubOkFetch()
    await uploadShare(pngBlob(), undefined, { token: TOKEN })

    const body = fetchMock.mock.calls[0][1].body as FormData
    expect(body.get('expiresInDays')).toBeNull()
  })

  it('옵션 객체를 통째로 생략해도 expiresInDays 를 보내지 않는다', async () => {
    const fetchMock = stubOkFetch()
    await uploadShare(pngBlob())

    const body = fetchMock.mock.calls[0][1].body as FormData
    expect(body.get('expiresInDays')).toBeNull()
  })

  it('allowlist 밖 보관 기간은 fetch 전에 거부한다 (조용한 치환 금지)', async () => {
    const fetchMock = stubOkFetch()
    // 타입을 우회해 들어온 값(손상된 storage 등)까지 막는지 보는 테스트라 as 가 필요하다
    const invalid = 3 as ExpiryDays

    await expect(
      uploadShare(pngBlob(), undefined, { expiresInDays: invalid })
    ).rejects.toThrow('보관 기간은 1, 7, 30일 중에서만 선택할 수 있습니다.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('토큰·보관 기간·컨텍스트를 함께 보낸다', async () => {
    const fetchMock = stubOkFetch()
    const ctx: SharedContext = {
      v: 1,
      sourceUrl: 'http://a',
      sourceTitle: 't',
      captureType: 'visible',
      capturedAt: '2026-07-22T00:00:00.000Z',
      viewport: { width: 1, height: 2 },
      pins: []
    }

    const url = await uploadShare(pngBlob(), ctx, {
      token: TOKEN,
      expiresInDays: 1
    })

    expect(url).toBe('https://w.example.dev/s/t')
    const [calledUrl, opts] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe('https://w.example.dev/upload')
    expect(opts.method).toBe('POST')
    expect(opts.headers).toEqual({ Authorization: `Bearer ${TOKEN}` })
    const body = opts.body as FormData
    expect(body.get('expiresInDays')).toBe('1')
    expect(JSON.parse(body.get('context') as string)).toEqual(ctx)
  })
})
