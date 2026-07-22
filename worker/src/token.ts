/** per-user HMAC 토큰 — WebCrypto만 사용 (Workers, node:crypto 금지) */

type SubtleWithTiming = SubtleCrypto & {
  timingSafeEqual?: (a: BufferSource, b: BufferSource) => boolean
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  const subtle = crypto.subtle as SubtleWithTiming
  if (typeof subtle.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(a, b)
  }
  let diff = 0
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i]! ^ b[i]!
  }
  return diff === 0
}

const B64URL =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function base64UrlEncode(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0
    const triple = (a << 16) | (b << 8) | c
    out += B64URL[(triple >> 18) & 63]
    out += B64URL[(triple >> 12) & 63]
    out += i + 1 < bytes.length ? B64URL[(triple >> 6) & 63]! : ''
    out += i + 2 < bytes.length ? B64URL[triple & 63]! : ''
  }
  return out
}

function base64UrlDecode(s: string): Uint8Array | null {
  if (s.length === 0 || !/^[A-Za-z0-9_-]+$/.test(s)) return null
  const lookup = new Map<string, number>()
  for (let i = 0; i < B64URL.length; i++) lookup.set(B64URL[i]!, i)
  const pad = (4 - (s.length % 4)) % 4
  const padded = s + '='.repeat(pad)
  const out: number[] = []
  for (let i = 0; i < padded.length; i += 4) {
    const a = lookup.get(padded[i]!)
    const b = lookup.get(padded[i + 1]!)
    const cChar = padded[i + 2]!
    const dChar = padded[i + 3]!
    const c = cChar === '=' ? 0 : lookup.get(cChar)
    const d = dChar === '=' ? 0 : lookup.get(dChar)
    if (a === undefined || b === undefined) return null
    if (cChar !== '=' && c === undefined) return null
    if (dChar !== '=' && d === undefined) return null
    const triple = (a << 18) | (b << 12) | ((c ?? 0) << 6) | (d ?? 0)
    out.push((triple >> 16) & 255)
    if (cChar !== '=') out.push((triple >> 8) & 255)
    if (dChar !== '=') out.push(triple & 255)
  }
  return new Uint8Array(out)
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0')
  }
  return hex
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

async function hmacSha256First16(
  secret: string,
  rand: Uint8Array
): Promise<Uint8Array> {
  const key = await importHmacKey(secret)
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, rand))
  return sig.slice(0, 16)
}

/**
 * 토큰 형식: sc_<base64url(rand 16B)>.<base64url(HMAC-SHA256(secret, rand) 앞 16B)>
 * @param randForTest 테스트 고정 벡터용 (프로덕션은 생략)
 */
export async function generateUserToken(
  secret: string,
  randForTest?: Uint8Array
): Promise<string> {
  const rand = randForTest ?? crypto.getRandomValues(new Uint8Array(16))
  if (rand.byteLength !== 16) {
    throw new Error('rand must be 16 bytes')
  }
  const mac = await hmacSha256First16(secret, rand)
  return `sc_${base64UrlEncode(rand)}.${base64UrlEncode(mac)}`
}

/** 무상태 HMAC 재계산 + timing-safe 비교 */
export async function verifyUserToken(
  token: string,
  secret: string
): Promise<boolean> {
  if (!token.startsWith('sc_')) return false
  const rest = token.slice(3)
  const parts = rest.split('.')
  if (parts.length !== 2) return false
  const [bodyB64, sigB64] = parts
  if (!bodyB64 || !sigB64) return false
  const rand = base64UrlDecode(bodyB64)
  const sig = base64UrlDecode(sigB64)
  if (!rand || !sig) return false
  if (rand.byteLength !== 16 || sig.byteLength !== 16) return false
  const expected = await hmacSha256First16(secret, rand)
  return timingSafeEqualBytes(sig, expected)
}

/** owner = SHA-256(토큰 전문) hex 64자 */
export async function ownerFromToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token)
  )
  return bytesToHex(new Uint8Array(digest))
}
