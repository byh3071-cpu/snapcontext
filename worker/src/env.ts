export interface Env {
  BUCKET: R2Bucket
  DB: D1Database
  SNAPCONTEXT_BEARER_TOKEN?: string
  /** per-user HMAC 토큰 서명. 미설정 시 /token 500, /upload 토큰 검증만 비활성 */
  TOKEN_SIGNING_SECRET?: string
}
