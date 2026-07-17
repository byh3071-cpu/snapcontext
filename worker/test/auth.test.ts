import { describe, it, expect } from 'vitest'
import { verifyBearer, gateMcpBearer } from '../src/auth'

describe('verifyBearer (ADR-010)', () => {
  it('일치하는 Bearer 토큰이면 true', async () => {
    const token = 'test-secret-token-32chars-xxxxxx'
    const req = new Request('https://w.test/mcp', {
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(await verifyBearer(req, token)).toBe(true)
  })

  it('불일치면 false (길이 조기 반환 없이 digest 비교)', async () => {
    const req = new Request('https://w.test/mcp', {
      headers: { Authorization: 'Bearer wrong' }
    })
    expect(await verifyBearer(req, 'correct-token')).toBe(false)
  })

  it('Authorization 헤더 없으면 false', async () => {
    const req = new Request('https://w.test/mcp')
    expect(await verifyBearer(req, 'any-token')).toBe(false)
  })
})

describe('gateMcpBearer', () => {
  it('secret 미설정이면 500 fail-closed', async () => {
    const res = await gateMcpBearer(new Request('https://w.test/mcp'), undefined)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(500)
  })

  it('secret 빈 문자열이면 500 fail-closed', async () => {
    const res = await gateMcpBearer(new Request('https://w.test/mcp'), '')
    expect(res).not.toBeNull()
    expect(res!.status).toBe(500)
  })

  it('bearer 없으면 401 + WWW-Authenticate: Bearer', async () => {
    const res = await gateMcpBearer(new Request('https://w.test/mcp'), 'secret')
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
    expect(res!.headers.get('WWW-Authenticate')).toBe('Bearer')
  })

  it('bearer 불일치면 401 + WWW-Authenticate: Bearer', async () => {
    const req = new Request('https://w.test/mcp', {
      headers: { Authorization: 'Bearer nope' }
    })
    const res = await gateMcpBearer(req, 'secret')
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
    expect(res!.headers.get('WWW-Authenticate')).toBe('Bearer')
  })

  it('일치하면 null (통과)', async () => {
    const token = 'ok-token'
    const req = new Request('https://w.test/mcp', {
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(await gateMcpBearer(req, token)).toBeNull()
  })
})
