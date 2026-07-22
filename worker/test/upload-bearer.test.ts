import { describe, it, expect } from 'vitest'
import worker from '../src/index'
import {
  generateUserToken,
  ownerFromToken
} from '../src/token'
import type { Env } from '../src/env'

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4
])

const SHARED_CTX = {
  v: 1 as const,
  sourceUrl: 'https://example.com/page',
  sourceTitle: 'Example',
  captureType: 'visible',
  capturedAt: '2026-07-10T00:00:00.000Z',
  viewport: { width: 1280, height: 720 },
  pins: [{ id: 1, memo: 'a' }]
}

const SIGNING = 'upload-bearer-signing-secret'

interface CaptureInsert {
  id: string
  owner: string | null
}

function makeEnv(): { env: Env; inserts: CaptureInsert[] } {
  const inserts: CaptureInsert[] = []
  const env: Env = {
    TOKEN_SIGNING_SECRET: SIGNING,
    BUCKET: {
      async get() {
        return null
      },
      async head() {
        return null
      },
      async put() {},
      async delete() {}
    } as unknown as R2Bucket,
    DB: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async run() {
                if (/INSERT\s+INTO\s+captures/i.test(sql)) {
                  inserts.push({
                    id: String(args[0]),
                    owner: (args[7] as string | null) ?? null
                  })
                }
                return { success: true }
              }
            }
          }
        }
      }
    } as unknown as D1Database
  }
  return { env, inserts }
}

async function postUpload(
  env: Env,
  headers: Record<string, string> = {}
): Promise<Response> {
  const form = new FormData()
  form.set('image', new Blob([PNG], { type: 'image/png' }), 'shot.png')
  form.set('context', JSON.stringify(SHARED_CTX))
  return worker.fetch(
    new Request('https://w.test/upload', {
      method: 'POST',
      headers,
      body: form
    }),
    env,
    {} as ExecutionContext
  )
}

describe('POST /upload — optional bearer (T2.1)', () => {
  it('Authorization 없음 → 200 + owner NULL (익명 하위호환)', async () => {
    const { env, inserts } = makeEnv()
    const res = await postUpload(env)
    expect(res.status).toBe(200)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]!.owner).toBeNull()
  })

  it('유효 sc_ bearer → 200 + owner = SHA-256(token)', async () => {
    const token = await generateUserToken(SIGNING)
    const owner = await ownerFromToken(token)
    const { env, inserts } = makeEnv()
    const res = await postUpload(env, { Authorization: `Bearer ${token}` })
    expect(res.status).toBe(200)
    expect(inserts[0]!.owner).toBe(owner)
  })

  it('malformed Authorization → 401', async () => {
    const { env, inserts } = makeEnv()
    const res = await postUpload(env, { Authorization: 'Bearer not-sc-token' })
    expect(res.status).toBe(401)
    expect(inserts).toHaveLength(0)
  })

  it('Bearer 형식 불일치 → 401', async () => {
    const { env } = makeEnv()
    const res = await postUpload(env, { Authorization: 'Token abc' })
    expect(res.status).toBe(401)
  })

  it('TOKEN_SIGNING_SECRET 미설정 + Authorization 있어도 익명 200 (검증 경로 비활성)', async () => {
    const { env, inserts } = makeEnv()
    delete env.TOKEN_SIGNING_SECRET
    const res = await postUpload(env, { Authorization: 'Bearer anything' })
    expect(res.status).toBe(200)
    expect(inserts[0]!.owner).toBeNull()
  })
})
