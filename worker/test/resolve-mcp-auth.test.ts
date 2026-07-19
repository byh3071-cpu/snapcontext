import { describe, it, expect } from 'vitest'
import { resolveMcpAuth } from '../src/auth'
import { generateUserToken, ownerFromToken } from '../src/token'

const ADMIN = 'admin-shared-bearer-token'
const SIGNING = 'mcp-auth-signing-secret'

describe('resolveMcpAuth', () => {
  it('admin bearer 정확일치 → scope admin', async () => {
    const req = new Request('https://w.test/mcp', {
      headers: { Authorization: `Bearer ${ADMIN}` }
    })
    const result = await resolveMcpAuth(req, {
      SNAPCONTEXT_BEARER_TOKEN: ADMIN,
      TOKEN_SIGNING_SECRET: SIGNING
    })
    expect(result).toEqual({ scope: 'admin' })
  })

  it('sc_ user 토큰 + HMAC 유효 → scope user + owner', async () => {
    const token = await generateUserToken(SIGNING)
    const owner = await ownerFromToken(token)
    const req = new Request('https://w.test/mcp', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const result = await resolveMcpAuth(req, {
      SNAPCONTEXT_BEARER_TOKEN: ADMIN,
      TOKEN_SIGNING_SECRET: SIGNING
    })
    expect(result).toEqual({ scope: 'user', owner })
  })

  it('admin 이 sc_ 접두가 아니면 user 경로와 네임스페이스 분리 (운영 규칙)', async () => {
    // admin 토큰은 sc_ 접두 금지 — 동일 문자열이어도 admin 우선 매칭만 해당
    expect(ADMIN.startsWith('sc_')).toBe(false)
    const userToken = await generateUserToken(SIGNING)
    expect(userToken.startsWith('sc_')).toBe(true)
    expect(userToken).not.toBe(ADMIN)
  })

  it('malformed bearer → 401', async () => {
    const req = new Request('https://w.test/mcp', {
      headers: { Authorization: 'Bearer not-a-valid-token' }
    })
    const result = await resolveMcpAuth(req, {
      SNAPCONTEXT_BEARER_TOKEN: ADMIN,
      TOKEN_SIGNING_SECRET: SIGNING
    })
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })

  it('SNAPCONTEXT_BEARER_TOKEN 미설정 + 비-sc_ bearer → 500 fail-closed', async () => {
    const req = new Request('https://w.test/mcp', {
      headers: { Authorization: 'Bearer anything' }
    })
    const result = await resolveMcpAuth(req, {
      TOKEN_SIGNING_SECRET: SIGNING
    })
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(500)
  })

  it('admin 우선: admin 문자열과 일치하면 user HMAC 전에 admin', async () => {
    const req = new Request('https://w.test/mcp', {
      headers: { Authorization: `Bearer ${ADMIN}` }
    })
    const result = await resolveMcpAuth(req, {
      SNAPCONTEXT_BEARER_TOKEN: ADMIN,
      TOKEN_SIGNING_SECRET: SIGNING
    })
    expect(result).toEqual({ scope: 'admin' })
  })
})
