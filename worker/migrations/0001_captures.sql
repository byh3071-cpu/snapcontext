-- ADR-009: captures 메타데이터 인덱스
CREATE TABLE captures (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  capture_type TEXT NOT NULL,
  pin_count INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_captures_created ON captures(created_at DESC);
