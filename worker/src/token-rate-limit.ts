/**
 * POST /token 인메모리 rate-limit.
 * isolate 재시작 시 카운터가 리셋되는 한계가 있다 (Workers isolate 수명).
 */
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 10

interface Counter {
  count: number
  windowStart: number
}

const counters = new Map<string, Counter>()

export function resetTokenRateLimitForTests(): void {
  counters.clear()
}

/** true = 허용, false = 한도 초과(429) */
export function allowTokenRequest(ip: string, nowMs: number = Date.now()): boolean {
  const key = ip.length > 0 ? ip : 'unknown'
  const cur = counters.get(key)
  if (!cur || nowMs - cur.windowStart >= WINDOW_MS) {
    counters.set(key, { count: 1, windowStart: nowMs })
    return true
  }
  if (cur.count >= MAX_PER_WINDOW) return false
  cur.count += 1
  return true
}
