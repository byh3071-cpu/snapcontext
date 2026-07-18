/** ADR-010: SHA-256 digest + timing-safe 비교 bearer 검증 */

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
