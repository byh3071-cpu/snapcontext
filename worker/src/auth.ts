/** ADR-010: SHA-256 digest + timing-safe 비교 bearer 검증 */

import { ownerFromToken, verifyUserToken } from './token'
import type { Env } from './env'

type SubtleWithTiming = SubtleCrypto & {
  timingSafeEqual?: (a: BufferSource, b: BufferSource) => boolean
}

/** digest는 항상 32바이트 — Workers subtle.timingSafeEqual (메서드 호출) / Node XOR */
function timingSafeEqualDigest(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const aa = new Uint8Array(a)
  const bb = new Uint8Array(b)
  if (aa.byteLength !== bb.byteLength) return false
  const subtle = crypto.subtle as SubtleWithTiming
  if (typeof subtle.timingSafeEqual === 'function') {
    // 메서드로 호출해야 함 — 분리하면 Illegal invocation
    return subtle.timingSafeEqual(aa, bb)
  }
  let diff = 0
  for (let i = 0; i < aa.byteLength; i++) {
    diff |= aa[i]! ^ bb[i]!
  }
  return diff === 0
}

export async function verifyBearer(
  request: Request,
  expectedToken: string
): Promise<boolean> {
  const provided = request.headers.get('Authorization') ?? ''
  const expected = `Bearer ${expectedToken}`
  const encoder = new TextEncoder()
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ])
  return timingSafeEqualDigest(providedHash, expectedHash)
}

/**
 * /mcp 게이트. null = 통과.
 * secret 미설정 → 500 fail-closed / 불일치 → 401 + WWW-Authenticate
 */
export async function gateMcpBearer(
  request: Request,
  secret: string | undefined
): Promise<Response | null> {
  if (secret === undefined || secret.length === 0) {
    return new Response('Server misconfigured: SNAPCONTEXT_BEARER_TOKEN unset', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    })
  }
  const ok = await verifyBearer(request, secret)
  if (!ok) {
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'WWW-Authenticate': 'Bearer'
      }
    })
  }
  return null
}

export type McpAuthResult =
  | { scope: 'admin' }
  | { scope: 'user'; owner: string }

function unauthorized(): Response {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': 'Bearer'
    }
  })
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization')
  if (!header || !header.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length)
}

/**
 * /mcp 인증 우선순위:
 * ① SNAPCONTEXT_BEARER_TOKEN 정확일치 → admin
 *    (운영 규칙: admin 토큰은 sc_ 접두 금지 — user HMAC 네임스페이스와 분리)
 * ② sc_ 형식 + HMAC 유효 → user + owner
 * ③ SNAPCONTEXT_BEARER_TOKEN 미설정 → 500 fail-closed (ADR-010)
 * ④ 그 외 → 401
 */
export async function resolveMcpAuth(
  request: Request,
  env: Pick<Env, 'SNAPCONTEXT_BEARER_TOKEN' | 'TOKEN_SIGNING_SECRET'>
): Promise<McpAuthResult | Response> {
  const adminSecret = env.SNAPCONTEXT_BEARER_TOKEN

  // ① admin 정확일치 (sc_ 접두 admin 은 운영 금지 — 주석·테스트로 명시)
  if (adminSecret !== undefined && adminSecret.length > 0) {
    if (await verifyBearer(request, adminSecret)) {
      return { scope: 'admin' }
    }
  }

  // ② user HMAC
  const raw = extractBearerToken(request)
  const signing = env.TOKEN_SIGNING_SECRET
  if (
    raw !== null &&
    raw.startsWith('sc_') &&
    signing !== undefined &&
    signing.length > 0 &&
    (await verifyUserToken(raw, signing))
  ) {
    const owner = await ownerFromToken(raw)
    return { scope: 'user', owner }
  }

  // admin secret 미설정 → 기존 fail-closed 500 (기존 테스트 하위호환)
  if (adminSecret === undefined || adminSecret.length === 0) {
    return new Response('Server misconfigured: SNAPCONTEXT_BEARER_TOKEN unset', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    })
  }

  return unauthorized()
}
