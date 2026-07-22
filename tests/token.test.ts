import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  TOKEN_STORAGE_KEY,
  ensureUserToken,
  isValidTokenFormat
} from '../src/utils/token'
import { stubChromeStorage } from './helpers/chrome-storage'

const VALID_TOKEN = 'sc_AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB'
const ISSUED_TOKEN = 'sc_CCCCCCCCCCCCCCCCCCCCCC.DDDDDDDDDDDDDDDDDDDDDD'

const tokenJson = (token: unknown) =>
  new Response(JSON.stringify({ token }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })

describe('isValidTokenFormat', () => {
  it('accepts sc_ + 점 하나로 갈라지는 2조각만 통과시킨다', () => {
    const accepted = ['sc_a.b', VALID_TOKEN]
    const rejected = ['sc_a', 'a.b', 'sc_a.b.c', 'sc_', '', 'sc_.b', 'sc_a.']
    for (const value of accepted) {
      expect(isValidTokenFormat(value), value).toBe(true)
    }
    for (const value of rejected) {
      expect(isValidTokenFormat(value), value).toBe(false)
    }
  })

  it('문자열이 아닌 값을 거부한다', () => {
    for (const value of [undefined, null, 42, {}, ['sc_a.b']]) {
      expect(isValidTokenFormat(value)).toBe(false)
    }
  })
})

describe('ensureUserToken', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://w.example.dev')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('저장된 유효 토큰이 있으면 재사용한다 (fetch 0회)', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: VALID_TOKEN })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(ensureUserToken()).resolves.toBe(VALID_TOKEN)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('저장된 토큰이 없으면 POST /token 으로 발급받아 저장한다', async () => {
    const storage = stubChromeStorage()
    const fetchMock = vi.fn().mockResolvedValue(tokenJson(ISSUED_TOKEN))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ensureUserToken()).resolves.toBe(ISSUED_TOKEN)

    const [calledUrl, opts] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe('https://w.example.dev/token')
    expect(opts.method).toBe('POST')
    // Origin 은 브라우저가 자동으로 붙이는 forbidden header — 직접 세팅하면 안 된다
    // (worker 는 chrome-extension:// Origin 이 없으면 403)
    expect(opts.headers).toBeUndefined()
    expect(storage.store.get(TOKEN_STORAGE_KEY)).toBe(ISSUED_TOKEN)
  })

  it('엔드포인트의 trailing slash 를 정규화한다', async () => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://w.example.dev/')
    stubChromeStorage()
    const fetchMock = vi.fn().mockResolvedValue(tokenJson(ISSUED_TOKEN))
    vi.stubGlobal('fetch', fetchMock)

    await ensureUserToken()
    expect(fetchMock.mock.calls[0][0]).toBe('https://w.example.dev/token')
  })

  it('동시 호출 2회가 발급 요청을 1번만 보낸다 (in-flight 가드)', async () => {
    const storage = stubChromeStorage()
    // 호출마다 새 Response — 하나를 공유하면 body 재사용 오류가 겹쳐 실패 원인이 흐려진다
    const fetchMock = vi.fn(async () => tokenJson(ISSUED_TOKEN))
    vi.stubGlobal('fetch', fetchMock)

    // await 없이 동시 발사 — 가드가 storage 읽기 뒤에 걸리면 fetch 가 2번 나간다
    const first = ensureUserToken()
    const second = ensureUserToken()
    const [a, b] = await Promise.all([first, second])

    expect(a).toBe(ISSUED_TOKEN)
    expect(b).toBe(ISSUED_TOKEN)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(storage.set).toHaveBeenCalledTimes(1)
  })

  it('발급이 끝난 뒤에는 가드가 풀려 다음 호출이 저장분을 쓴다', async () => {
    stubChromeStorage()
    const fetchMock = vi.fn().mockResolvedValue(tokenJson(ISSUED_TOKEN))
    vi.stubGlobal('fetch', fetchMock)

    await ensureUserToken()
    await expect(ensureUserToken()).resolves.toBe(ISSUED_TOKEN)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('500(시크릿 미주입)이면 null 을 반환하고 storage 를 오염시키지 않는다', async () => {
    const storage = stubChromeStorage()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Server misconfigured', { status: 500 }))
    )

    await expect(ensureUserToken()).resolves.toBeNull()
    expect(storage.set).not.toHaveBeenCalled()
    expect(storage.store.has(TOKEN_STORAGE_KEY)).toBe(false)
    expect(console.warn).toHaveBeenCalled()
  })

  it('429(rate limit)이면 null 을 반환하고 사유를 warn 으로 남긴다', async () => {
    const storage = stubChromeStorage()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Too many token requests', { status: 429 }))
    )

    await expect(ensureUserToken()).resolves.toBeNull()
    expect(storage.store.has(TOKEN_STORAGE_KEY)).toBe(false)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('429'))
  })

  it('네트워크 오류면 throw 하지 않고 null 을 반환한다', async () => {
    const storage = stubChromeStorage()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(ensureUserToken()).resolves.toBeNull()
    expect(storage.set).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('발급 응답의 토큰 형식이 깨졌으면 저장하지 않고 null 을 반환한다', async () => {
    const storage = stubChromeStorage()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tokenJson('nope')))

    await expect(ensureUserToken()).resolves.toBeNull()
    expect(storage.set).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('JSON 이 아닌 200 응답이면 null 을 반환한다', async () => {
    stubChromeStorage()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>not json</html>', { status: 200 }))
    )

    await expect(ensureUserToken()).resolves.toBeNull()
    expect(console.warn).toHaveBeenCalled()
  })

  it('손상된 저장값은 버리고 재발급한다', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: 'sc_broken' })
    const fetchMock = vi.fn().mockResolvedValue(tokenJson(ISSUED_TOKEN))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ensureUserToken()).resolves.toBe(ISSUED_TOKEN)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(storage.store.get(TOKEN_STORAGE_KEY)).toBe(ISSUED_TOKEN)
    expect(console.warn).toHaveBeenCalled()
  })

  it('엔드포인트가 없으면 fetch 없이 null 을 반환한다', async () => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', '')
    stubChromeStorage()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(ensureUserToken()).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })
})
