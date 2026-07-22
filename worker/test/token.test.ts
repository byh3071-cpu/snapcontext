import { describe, it, expect } from 'vitest'
import {
  generateUserToken,
  verifyUserToken,
  ownerFromToken
} from '../src/token'

const SECRET = 'test-signing-secret-for-hmac'
const OTHER_SECRET = 'other-signing-secret-xxxx'

/** 고정 rand 16B → 결정적 토큰 벡터 (WebCrypto HMAC) */
const FIXED_RAND = new Uint8Array([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16
])

describe('generateUserToken / verifyUserToken', () => {
  it('발급 토큰은 sc_ 접두 + 단일 점 구분자 형식', async () => {
    const token = await generateUserToken(SECRET)
    expect(token.startsWith('sc_')).toBe(true)
    const rest = token.slice(3)
    expect(rest.split('.').length).toBe(2)
    expect(rest.includes('..')).toBe(false)
  })

  it('발급 직후 동일 secret 로 검증 통과', async () => {
    const token = await generateUserToken(SECRET)
    expect(await verifyUserToken(token, SECRET)).toBe(true)
  })

  it('고정 벡터: HMAC 재계산과 일치', async () => {
    const token = await generateUserToken(SECRET, FIXED_RAND)
    expect(await verifyUserToken(token, SECRET)).toBe(true)
    // 동일 rand+secret → 동일 토큰
    const again = await generateUserToken(SECRET, FIXED_RAND)
    expect(again).toBe(token)
  })

  it('위조 서명(sig 변조) 거부', async () => {
    const token = await generateUserToken(SECRET, FIXED_RAND)
    const [body, sig] = token.slice(3).split('.')
    const first = sig![0]!
    const flippedFirst = first === 'A' ? 'B' : 'A'
    const forged = `sc_${body}.${flippedFirst}${sig!.slice(1)}`
    expect(await verifyUserToken(forged, SECRET)).toBe(false)
  })

  it('다른 secret 이면 거부', async () => {
    const token = await generateUserToken(SECRET, FIXED_RAND)
    expect(await verifyUserToken(token, OTHER_SECRET)).toBe(false)
  })
})

describe('verifyUserToken 형식 경계', () => {
  it('접두사 없으면 거부', async () => {
    const token = await generateUserToken(SECRET, FIXED_RAND)
    expect(await verifyUserToken(token.slice(3), SECRET)).toBe(false)
  })

  it('구분자 없으면 거부', async () => {
    expect(await verifyUserToken('sc_abcdef', SECRET)).toBe(false)
  })

  it('점이 둘 이상이면 거부', async () => {
    expect(await verifyUserToken('sc_ab.cd.ef', SECRET)).toBe(false)
  })

  it('rand 길이 아님(짧은 body) 거부', async () => {
    expect(await verifyUserToken('sc_YQ.AAAA', SECRET)).toBe(false)
  })

  it('빈 문자열 거부', async () => {
    expect(await verifyUserToken('', SECRET)).toBe(false)
  })
})

describe('non-canonical base64url 거부 (PAT-002)', () => {
  const B64URL =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

  /** 지정 위치 문자를 알파벳 전체로 치환한 변형 중 verify 를 통과하는 것들 */
  async function acceptedVariantsAt(
    token: string,
    index: number
  ): Promise<string[]> {
    const accepted: string[] = []
    for (const ch of B64URL) {
      const mutated = token.slice(0, index) + ch + token.slice(index + 1)
      if (mutated === token) continue
      if (await verifyUserToken(mutated, SECRET)) accepted.push(mutated)
    }
    return accepted
  }

  it('sig 끝 글자의 미사용 비트를 바꾼 변형을 전부 거부', async () => {
    const token = await generateUserToken(SECRET, FIXED_RAND)
    expect(await acceptedVariantsAt(token, token.length - 1)).toEqual([])
  })

  it('body 끝 글자의 미사용 비트를 바꾼 변형을 전부 거부', async () => {
    const token = await generateUserToken(SECRET, FIXED_RAND)
    expect(await acceptedVariantsAt(token, token.indexOf('.') - 1)).toEqual([])
  })

  it('발급 토큰 자신은 정규형이라 통과', async () => {
    const token = await generateUserToken(SECRET, FIXED_RAND)
    expect(await verifyUserToken(token, SECRET)).toBe(true)
  })
})

describe('ownerFromToken', () => {
  it('SHA-256 hex 64자 반환', async () => {
    const token = await generateUserToken(SECRET, FIXED_RAND)
    const owner = await ownerFromToken(token)
    expect(owner).toMatch(/^[0-9a-f]{64}$/)
  })

  it('동일 토큰 → 동일 owner (결정적)', async () => {
    const token = await generateUserToken(SECRET, FIXED_RAND)
    expect(await ownerFromToken(token)).toBe(await ownerFromToken(token))
  })

  it('다른 토큰 → 다른 owner', async () => {
    const a = await generateUserToken(SECRET)
    const b = await generateUserToken(SECRET)
    expect(await ownerFromToken(a)).not.toBe(await ownerFromToken(b))
  })
})
