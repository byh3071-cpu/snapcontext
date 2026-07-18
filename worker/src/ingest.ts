import { MAX_AGE_MS, type SharedContext } from './lib'

export interface CaptureInsertRow {
  id: string
  created_at: string
  url: string
  title: string
  capture_type: string
  pin_count: number
  expires_at: string
}

/** SharedContext → D1 captures 행. created_at/expires_at = 서버 now 기준 (ADR-009·Phase 2) */
export function captureRowFromSharedContext(
  id: string,
  ctx: SharedContext,
  nowMs: number
): CaptureInsertRow {
  const pins = Array.isArray(ctx.pins) ? ctx.pins : []
  return {
    id,
    created_at: new Date(nowMs).toISOString(),
    url: typeof ctx.sourceUrl === 'string' ? ctx.sourceUrl : '',
    title: typeof ctx.sourceTitle === 'string' ? ctx.sourceTitle : '',
    capture_type: typeof ctx.captureType === 'string' ? ctx.captureType : '',
    pin_count: pins.length,
    expires_at: new Date(nowMs + MAX_AGE_MS).toISOString()
  }
}

export async function insertCapture(
  db: D1Database,
  row: CaptureInsertRow
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO captures (id, created_at, url, title, capture_type, pin_count, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.id,
      row.created_at,
      row.url,
      row.title,
      row.capture_type,
      row.pin_count,
      row.expires_at
    )
    .run()
}

/** D1 실패 시 R2 orphan 정리 — best-effort (allSettled). 본 에러는 호출측 D1 5xx */
export async function cleanupUploadObjects(
  bucket: R2Bucket,
  id: string,
  wroteJson: boolean
): Promise<void> {
  const keys = wroteJson ? [id, `${id}.json`] : [id]
  await Promise.allSettled(keys.map((key) => bucket.delete(key)))
}
