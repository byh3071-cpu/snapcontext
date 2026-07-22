import { type SharedContext } from './lib'

export interface CaptureInsertRow {
  id: string
  created_at: string
  url: string
  title: string
  capture_type: string
  pin_count: number
  expires_at: string
  /** SHA-256(토큰) hex. 익명 업로드는 null */
  owner: string | null
}

export interface CaptureRowInput {
  id: string
  ctx: SharedContext
  nowMs: number
  /** R2 customMetadata.expiresAt 와 동일 문자열 — 호출측에서 1회 계산해 전달 (SoT 봉인) */
  expiresAtIso: string
  owner: string | null
}

/**
 * SharedContext → D1 captures 행. created_at = 서버 now 기준 (ADR-009·Phase 2).
 * expires_at 은 여기서 재계산하지 않는다 — R2 customMetadata 와 같은 문자열을
 * 받아 써야 저장소 두 곳이 갈라지지 않는다.
 *
 * 위치 인자 대신 옵션 객체인 이유: owner(string|null)와 expiresAtIso(string)가
 * 인접해 있어 위치 인자면 오배치가 한 방향으로 타입 통과한다.
 */
export function captureRowFromSharedContext(
  input: CaptureRowInput
): CaptureInsertRow {
  const { id, ctx, nowMs, expiresAtIso, owner } = input
  const pins = Array.isArray(ctx.pins) ? ctx.pins : []
  return {
    id,
    created_at: new Date(nowMs).toISOString(),
    url: typeof ctx.sourceUrl === 'string' ? ctx.sourceUrl : '',
    title: typeof ctx.sourceTitle === 'string' ? ctx.sourceTitle : '',
    capture_type: typeof ctx.captureType === 'string' ? ctx.captureType : '',
    pin_count: pins.length,
    expires_at: expiresAtIso,
    owner
  }
}

export async function insertCapture(
  db: D1Database,
  row: CaptureInsertRow
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO captures (id, created_at, url, title, capture_type, pin_count, expires_at, owner)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.id,
      row.created_at,
      row.url,
      row.title,
      row.capture_type,
      row.pin_count,
      row.expires_at,
      row.owner
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
