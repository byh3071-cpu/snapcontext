import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { uploadShare } from '../src/utils/upload'
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
})
