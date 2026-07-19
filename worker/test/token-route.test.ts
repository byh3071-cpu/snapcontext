import { describe, it, expect, beforeEach } from 'vitest'
import worker from '../src/index'
import { resetTokenRateLimitForTests } from '../src/token-rate-limit'
import { verifyUserToken } from '../src/token'
import type { Env } from '../src/env'

const ctx = {} as ExecutionContext
const SECRET = 'token-route-signing-secret'

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    BUCKET: {
      async get() {
        return null
      },
      async head() {
        return null
      },
      async put() {}
    } as unknown as R2Bucket,
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return { results: [] }
              },
              async run() {
                return { success: true }
              }
            }
          }
        }
      }
    } as unknown as D1Database,
    TOKEN_SIGNING_SECRET: SECRET,
    ...overrides
  }
}

function postToken(
  env: Env,
  headers: Record<string, string> = {}
): Promise<Response> {
  return worker.fetch(
    new Request('https://w.test/token', {
      method: 'POST',
      headers
    }),
    env,
    ctx
  )
}

describe('POST /token', () => {
  beforeEach(() => {
    resetTokenRateLimitForTests()
  })

  it('chrome-extension Origin 이면 200 + { token } (HMAC 유효)', async () => {
    const res = await postToken(makeEnv(), {
      Origin: 'chrome-extension://abcdefghijklmnop'
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string }
    expect(body.token.startsWith('sc_')).toBe(true)
    expect(await verifyUserToken(body.token, SECRET)).toBe(true)
  })

  it('Origin 이 chrome-extension:// 가 아니면 403', async () => {
    const res = await postToken(makeEnv(), {
      Origin: 'https://evil.example'
    })
    expect(res.status).toBe(403)
  })

  it('Origin 헤더 없으면 403', async () => {
    const res = await postToken(makeEnv())
    expect(res.status).toBe(403)
  })

  it('TOKEN_SIGNING_SECRET 미설정이면 500 명시 에러', async () => {
    const env = makeEnv()
    delete env.TOKEN_SIGNING_SECRET
    const res = await postToken(env, {
      Origin: 'chrome-extension://abcdefghijklmnop'
    })
    expect(res.status).toBe(500)
    expect(await res.text()).toMatch(/TOKEN_SIGNING_SECRET/i)
  })

  it('동일 IP 분당 10회 초과 시 429', async () => {
    const env = makeEnv()
    const headers = {
      Origin: 'chrome-extension://abcdefghijklmnop',
      'CF-Connecting-IP': '203.0.113.10'
    }
    for (let i = 0; i < 10; i++) {
      const res = await postToken(env, headers)
      expect(res.status).toBe(200)
    }
    const denied = await postToken(env, headers)
    expect(denied.status).toBe(429)
  })

  it('/upload 에는 Origin 검증을 추가하지 않음 (회귀)', async () => {
    const PNG = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4
    ])
    const form = new FormData()
    form.set('image', new Blob([PNG], { type: 'image/png' }), 'shot.png')
    const res = await worker.fetch(
      new Request('https://w.test/upload', {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
        body: form
      }),
      makeEnv(),
      ctx
    )
    expect(res.status).toBe(200)
  })
})
