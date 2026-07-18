/**
 * R2 {id}.json → D1 captures backfill 헬퍼 (단위테스트용 · 실행은 scripts/backfill-d1.mjs)
 * ADR-009 스키마 정합. 배포 후 1회 실행 전제.
 */

export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

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

/** R2 업로드 시각(last_modified) + 7일 — client capturedAt 시계와 무관 */
export function expiresAtFromLastModified(lastModified) {
  const t = Date.parse(lastModified)
  if (!Number.isFinite(t)) {
    throw new Error(`backfill: invalid last_modified: ${lastModified}`)
  }
  return new Date(t + MAX_AGE_MS).toISOString()
}

/**
 * Cloudflare API envelope — result 와 result_info 를 함께 보존 (BLOCKER-1)
 * @param {object} body
 * @returns {{ result: unknown, result_info: object|undefined }}
 */
export function parseCfEnvelope(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('backfill: invalid CF API envelope')
  }
  return {
    result: body.result,
    result_info: body.result_info
  }
}

/**
 * R2 List Objects 페이지네이션 — result_info.is_truncated / cursor 로 반복
 * @param {(cursor: string|undefined) => Promise<{ result: unknown, result_info?: { is_truncated?: boolean, cursor?: string } }>} fetchPage
 * @returns {Promise<Array<{ key: string, last_modified: string|undefined }>>}
 */
export async function listAllR2ObjectsFromPages(fetchPage) {
  const objects = []
  let cursor = undefined
  for (;;) {
    const page = await fetchPage(cursor)
    const result = page.result
    const list = Array.isArray(result)
      ? result
      : Array.isArray(result?.objects)
        ? result.objects
        : []
    for (const o of list) {
      if (typeof o === 'string') {
        objects.push({ key: o, last_modified: undefined })
      } else if (o && typeof o.key === 'string') {
        objects.push({
          key: o.key,
          last_modified: typeof o.last_modified === 'string' ? o.last_modified : undefined
        })
      }
    }
    const info = page.result_info
    if (info?.is_truncated && info.cursor) {
      cursor = info.cursor
      continue
    }
    break
  }
  return objects
}

/**
 * @param {{
 *   listObjects: () => Promise<Array<{ key: string, last_modified?: string }>>,
 *   getJson: (id: string) => Promise<object|null>
 * }} deps
 */
export async function collectBackfillRows(deps) {
  const listed = await deps.listObjects()
  const rows = []
  for (const item of listed) {
    const key = item.key
    if (!isContextJsonKey(key)) continue
    const id = captureIdFromKey(key)
    const ctx = await deps.getJson(id)
    if (!ctx || typeof ctx !== 'object') {
      throw new Error(`backfill: missing or invalid JSON for ${id}`)
    }
    if (!item.last_modified) {
      throw new Error(`backfill: missing last_modified for ${id}`)
    }
    const expiresAt = expiresAtFromLastModified(item.last_modified)
    rows.push(rowFromSharedContext(id, ctx, expiresAt))
  }
  return rows
}

/**
 * 행 단위 INSERT — 실패 시 inserted·failedId·재실행 안내를 담은 에러
 * @param {Array<object>} rows
 * @param {(row: object) => Promise<void>} insertOne
 */
export async function insertRowsWithCheckpoint(rows, insertOne) {
  let inserted = 0
  for (const row of rows) {
    try {
      await insertOne(row)
      inserted += 1
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const e = new Error(
        `backfill failed at id=${row.id}: inserted=${inserted}/${rows.length}. ` +
          `Re-run: node scripts/backfill-d1.mjs (INSERT OR REPLACE is idempotent). Cause: ${msg}`
      )
      e.inserted = inserted
      e.failedId = row.id
      e.scanned = rows.length
      throw e
    }
  }
  return { inserted, scanned: rows.length }
}
