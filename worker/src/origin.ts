/** ADR-008: Origin 헤더 검증 — 불일치 시 403 */

export function rejectInvalidOrigin(request: Request): Response | null {
  const origin = request.headers.get('Origin')
  if (!origin) return null
  const expected = new URL(request.url).origin
  if (origin === expected) return null
  return new Response(JSON.stringify({ error: 'Forbidden origin' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}
