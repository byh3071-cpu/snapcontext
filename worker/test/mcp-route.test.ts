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
