-- 0.4.0: per-user owner (SHA-256 hex, nullable — 익명 업로드는 NULL)
ALTER TABLE captures ADD COLUMN owner TEXT;
CREATE INDEX idx_captures_owner_created ON captures(owner, created_at DESC);
