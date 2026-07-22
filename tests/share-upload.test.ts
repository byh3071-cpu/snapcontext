import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { uploadShareWithToken } from '../src/utils/share-upload'
import { TOKEN_STORAGE_KEY } from '../src/utils/token'
import { stubChromeStorage } from './helpers/chrome-storage'

const STORED_TOKEN = 'sc_AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB'
const ISSUED_TOKEN = 'sc_CCCCCCCCCCCCCCCCCCCCCC.DDDDDDDDDDDDDDDDDDDDDD'

const okUpload = () =>
  new Response(JSON.stringify({ id: 'x', url: 'https://w.example.dev/s/x' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })

/** /token 은 항상 성공, /upload 는 넘긴 순서대로 응답한다 */
function stubFetch(uploadResponses: Response[]) {
  const uploads: Array<{ headers: unknown; body: FormData }> = []
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/token')) {
      return new Response(JSON.stringify({ token: ISSUED_TOKEN }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    uploads.push({ headers: init.headers, body: init.body as FormData })
    const next = uploadResponses.shift()
    if (!next) throw new Error('예상보다 많은 업로드 호출')
    return next
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, uploads }
}

const pngBlob = () => new Blob([new Uint8Array([1])], { type: 'image/png' })

describe('uploadShareWithToken', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://w.example.dev')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('저장된 토큰을 bearer 로 실어 업로드한다', async () => {
    stubChromeStorage({ [TOKEN_STORAGE_KEY]: STORED_TOKEN })
    const { uploads } = stubFetch([okUpload()])

    // 토큰이 실린 업로드 = owner 스탬프됨 → anonymous false
    await expect(uploadShareWithToken(pngBlob(), undefined, 7)).resolves.toEqual({
      url: 'https://w.example.dev/s/x',
      anonymous: false
    })
    expect(uploads).toHaveLength(1)
    expect(uploads[0].headers).toEqual({ Authorization: `Bearer ${STORED_TOKEN}` })
  })

  // B1 회귀 — 시크릿 로테이션·엔드포인트 전환으로 서버가 저장된 토큰을 거부하는 상황.
  // 폐기하지 않으면 익명이면 200 이 나올 업로드를 확장이 스스로 401 로 만들고 무한 반복한다.
  it('401 이면 저장분을 제거하고 익명으로 1회 재시도해 성공한다', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: STORED_TOKEN })
    const { uploads } = stubFetch([
      new Response('Unauthorized', { status: 401 }),
      okUpload()
    ])

    // 401 폐기 후 익명으로 성공한 경우도 사용자에게 알려야 한다
    await expect(uploadShareWithToken(pngBlob(), undefined, 30)).resolves.toEqual({
      url: 'https://w.example.dev/s/x',
      anonymous: true
    })

    expect(uploads).toHaveLength(2)
    expect(uploads[0].headers).toEqual({ Authorization: `Bearer ${STORED_TOKEN}` })
    // 재시도는 헤더 키 자체가 없어야 익명 200 이 된다
    expect(uploads[1].headers).toBeUndefined()
    // 보관 기간은 토큰과 무관하므로 재시도에도 그대로 유지된다
    expect(uploads[0].body.get('expiresInDays')).toBe('30')
    expect(uploads[1].body.get('expiresInDays')).toBe('30')
    // 거부된 토큰은 storage 에서 사라져야 다음 업로드가 재발급을 탄다
    expect(storage.store.has(TOKEN_STORAGE_KEY)).toBe(false)
  })

  it('재시도도 401 이면 던지고 멈춘다 (재시도는 1회뿐)', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: STORED_TOKEN })
    const { uploads } = stubFetch([
      new Response('Unauthorized', { status: 401 }),
      new Response('Unauthorized', { status: 401 })
    ])

    await expect(uploadShareWithToken(pngBlob(), undefined, 7)).rejects.toThrow(
      '업로드 실패 (401)'
    )
    expect(uploads).toHaveLength(2)
    expect(storage.store.has(TOKEN_STORAGE_KEY)).toBe(false)
  })

  it('토큰 없이 보낸 요청이 401 이면 재시도하지 않는다', async () => {
    stubChromeStorage()
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', '')
    const { uploads } = stubFetch([new Response('Unauthorized', { status: 401 })])

    await expect(uploadShareWithToken(pngBlob(), undefined, 7)).rejects.toThrow()
    // 엔드포인트가 없으면 uploadShare 가 먼저 던진다 — 업로드 호출 자체가 없다
    expect(uploads).toHaveLength(0)
  })

  it('401 이 아닌 실패는 재시도하지 않고 토큰도 유지한다', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: STORED_TOKEN })
    const { uploads } = stubFetch([new Response('too big', { status: 413 })])

    await expect(uploadShareWithToken(pngBlob(), undefined, 7)).rejects.toThrow(
      '업로드 실패 (413)'
    )
    expect(uploads).toHaveLength(1)
    expect(storage.store.get(TOKEN_STORAGE_KEY)).toBe(STORED_TOKEN)
  })

  // 토큰 발급 자체가 실패한 경로(현재 프로덕션 상태 — 시크릿 미주입이라 /token 이 500)
  it('토큰 발급이 실패하면 익명으로 업로드하고 anonymous 를 알린다', async () => {
    stubChromeStorage()
    const uploads: Array<{ headers: unknown }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith('/token')) {
          return new Response('Server misconfigured', { status: 500 })
        }
        uploads.push({ headers: init.headers })
        return okUpload()
      })
    )

    await expect(uploadShareWithToken(pngBlob(), undefined, 7)).resolves.toEqual({
      url: 'https://w.example.dev/s/x',
      anonymous: true
    })
    expect(uploads).toHaveLength(1)
    expect(uploads[0].headers).toBeUndefined()
  })

  it('컨텍스트를 그대로 전달한다', async () => {
    stubChromeStorage({ [TOKEN_STORAGE_KEY]: STORED_TOKEN })
    const { uploads } = stubFetch([okUpload()])

    await uploadShareWithToken(
      pngBlob(),
      {
        v: 1,
        sourceUrl: 'http://a',
        sourceTitle: 't',
        captureType: 'visible',
        capturedAt: '2026-07-22T00:00:00.000Z',
        viewport: { width: 1, height: 2 },
        pins: []
      },
      1
    )

    const sent = JSON.parse(uploads[0].body.get('context') as string)
    expect(sent.sourceUrl).toBe('http://a')
  })
})
