export const DEFAULT_HISTORY_LIMIT = 20

export interface CaptureIndexEntry {
  id: string
  createdAt: string
  url: string
  title: string
  captureType: string
  pinCount: number
}

interface CaptureRow {
  id: string
  created_at: string
  url: string
  title: string
  capture_type: string
  pin_count: number
  expires_at: string
}

export interface ListCapturesOptions {
  nowIso: string
  limit?: number
}

/** snap_history: D1 captures 를 created_at DESC + expires_at 필터로 조회 */
export async function listCaptures(
  db: D1Database,
  opts: ListCapturesOptions
): Promise<CaptureIndexEntry[]> {
  const limit = opts.limit ?? DEFAULT_HISTORY_LIMIT
  const result = await db
    .prepare(
      `SELECT id, created_at, url, title, capture_type, pin_count, expires_at
       FROM captures
       WHERE expires_at > ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .bind(opts.nowIso, limit)
    .all<CaptureRow>()

  const rows = result.results ?? []
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    url: r.url,
    title: r.title,
    captureType: r.capture_type,
    pinCount: r.pin_count
  }))
}
