/**
 * R2 {id}.json → D1 captures backfill 헬퍼 (단위테스트용 · 실행은 scripts/backfill-d1.mjs)
 * ADR-009 스키마 정합. 배포 후 1회 실행 전제.
 */

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function isContextJsonKey(key) {
  if (!key.endsWith('.json')) return false
  if (key.includes('/')) return false
  const id = key.slice(0, -'.json'.length)
  return id.length > 0
}

export function captureIdFromKey(key) {
  return key.slice(0, -'.json'.length)
}

export function rowFromSharedContext(id, ctx, expiresAt) {
  const pins = Array.isArray(ctx?.pins) ? ctx.pins : []
  return {
    id,
    created_at: typeof ctx?.capturedAt === 'string' ? ctx.capturedAt : new Date(0).toISOString(),
    url: typeof ctx?.sourceUrl === 'string' ? ctx.sourceUrl : '',
    title: typeof ctx?.sourceTitle === 'string' ? ctx.sourceTitle : '',
    capture_type: typeof ctx?.captureType === 'string' ? ctx.captureType : '',
    pin_count: pins.length,
    expires_at: expiresAt
  }
}

export function defaultExpiresAt(capturedAtIso) {
  const t = Date.parse(capturedAtIso)
  const base = Number.isFinite(t) ? t : Date.now()
  return new Date(base + MAX_AGE_MS).toISOString()
}

/**
 * @param {{ listKeys: () => Promise<string[]>, getJson: (id: string) => Promise<object|null>, expiresAtFrom?: (capturedAt: string) => string }} deps
 */
export async function collectBackfillRows(deps) {
  const keys = await deps.listKeys()
  const expiresAtFrom = deps.expiresAtFrom ?? defaultExpiresAt
  const rows = []
  for (const key of keys) {
    if (!isContextJsonKey(key)) continue
    const id = captureIdFromKey(key)
    const ctx = await deps.getJson(id)
    if (!ctx || typeof ctx !== 'object') {
      throw new Error(`backfill: missing or invalid JSON for ${id}`)
    }
    const createdAt =
      typeof ctx.capturedAt === 'string' ? ctx.capturedAt : new Date(0).toISOString()
    rows.push(rowFromSharedContext(id, ctx, expiresAtFrom(createdAt)))
  }
  return rows
}
