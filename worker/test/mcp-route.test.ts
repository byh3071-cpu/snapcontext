import { describe, it, expect } from 'vitest'
import worker from '../src/index'

const ctx = {} as ExecutionContext

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    BUCKET: {
      async get() {
        return null
      },
      async head() {
        return null
      },
      async put() {}
    },
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return { results: [] }
              }
            }
          }
        }
      }
    },
    ...overrides
  }
}

describe('POST /mcp — bearer 게이트 (ADR-010)', () => {
  it('Authorization 없으면 401 + WWW-Authenticate', async () => {
    const env = makeEnv({ SNAPCONTEXT_BEARER_TOKEN: 'secret' })
    const res = await worker.fetch(
      new Request('https://w.test/mcp', { method: 'POST' }),
      env as never,
      ctx
    )
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer')
  })

  it('secret 미설정이면 500 fail-closed', async () => {
    const env = makeEnv()
    const res = await worker.fetch(
      new Request('https://w.test/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer anything' }
      }),
      env as never,
      ctx
    )
    expect(res.status).toBe(500)
  })

  it('Origin 불일치면 403', async () => {
    const env = makeEnv({ SNAPCONTEXT_BEARER_TOKEN: 'secret' })
    const res = await worker.fetch(
      new Request('https://w.test/mcp', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer secret',
          Origin: 'https://evil.example'
        }
      }),
      env as never,
      ctx
    )
    expect(res.status).toBe(403)
  })
})

describe('OPTIONS /mcp — Origin 게이트가 전역 OPTIONS 보다 우선 (MAJOR-1)', () => {
  it('Origin 불일치 OPTIONS 는 403 (와일드카드 ACAO 광고 금지)', async () => {
    const env = makeEnv({ SNAPCONTEXT_BEARER_TOKEN: 'secret' })
    const res = await worker.fetch(
      new Request('https://w.test/mcp', {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example' }
      }),
      env as never,
      ctx
    )
    expect(res.status).toBe(403)
  })

  it('동일 Origin OPTIONS 는 bearer 없이 preflight 200', async () => {
    const env = makeEnv({ SNAPCONTEXT_BEARER_TOKEN: 'secret' })
    const res = await worker.fetch(
      new Request('https://w.test/mcp', {
        method: 'OPTIONS',
        headers: { Origin: 'https://w.test' }
      }),
      env as never,
      ctx
    )
    expect(res.status).toBe(200)
  })

  it('비-/mcp OPTIONS 는 기존처럼 200', async () => {
    const env = makeEnv()
    const res = await worker.fetch(
      new Request('https://w.test/upload', {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example' }
      }),
      env as never,
      ctx
    )
    expect(res.status).toBe(200)
  })
})
