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
  /** 지정 시 WHERE owner = ? (user 스코프). 미지정 = 전체(admin·레거시) */
  owner?: string
}

/**
 * snap_history: D1 captures 를 created_at DESC + expires_at 필터로 조회.
 *
 * 비교가 `>=` 인 이유: R2 경로의 isExpiredAt 은 strict `<`(만료 정각은 아직 유효)라
 * SQL 이 `>` 면 now === expires_at 인 1ms 동안 /i/·/s/·snap_pack 은 200 인데
 * snap_history 만 목록에서 빼는 모순이 생긴다. 두 경로가 같은 값을 같게 해석해야 한다.
 */
export async function listCaptures(
  db: D1Database,
  opts: ListCapturesOptions
): Promise<CaptureIndexEntry[]> {
  const limit = opts.limit ?? DEFAULT_HISTORY_LIMIT
  if (opts.owner !== undefined) {
    const result = await db
      .prepare(
        `SELECT id, created_at, url, title, capture_type, pin_count, expires_at
         FROM captures
         WHERE expires_at >= ? AND owner = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .bind(opts.nowIso, opts.owner, limit)
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
  const result = await db
    .prepare(
      `SELECT id, created_at, url, title, capture_type, pin_count, expires_at
       FROM captures
       WHERE expires_at >= ?
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
