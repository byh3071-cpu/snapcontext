---
id: ADR-009
date: 2026-07-18
tags: [d1, r2, index, storage, v0.3.0]
---

# ADR-009: 캡처 메타데이터 인덱스 = D1 (index.json 폐기)

## 상태

승인 (Phase 0 리서치 R3 기반 — `docs/research/phase0-storage-auth-limits.md`)

## 맥락

`snap_history`가 읽을 캡처 메타데이터 인덱스의 저장소가 미해결 질문 D였다. PRD 초안의 "경량 JSON 인덱스(index.json)"는 자리표시자였고, R2 list vs KV vs D1 비교 후 택1이 Phase 0 과제였다. (Turso 보류는 유지 — 이 결정은 확정 결정 2의 재론이 아니라 질문 D로 위임된 부분의 확정이다.)

## 결정

1. **이미지·Context JSON blob = R2 유지, 메타데이터 인덱스 = D1 채택.**
2. **단일 `index.json` read-modify-write는 사용하지 않는다** — R2 동일 키 동시 PUT은 last-writer-wins라 lost update 발생. D1은 DB 단위 직렬 처리 + PRIMARY KEY + 트랜잭션으로 해결.
3. 최소 테이블:
   ```sql
   CREATE TABLE captures (
     id TEXT PRIMARY KEY,          -- R2 오브젝트 키 (crypto.randomUUID)
     created_at TEXT NOT NULL,
     url TEXT NOT NULL,
     title TEXT NOT NULL,
     capture_type TEXT NOT NULL,
     pin_count INTEGER NOT NULL,
     expires_at TEXT NOT NULL
   );
   CREATE INDEX idx_captures_created ON captures(created_at DESC);
   ```
   인덱스는 `(created_at DESC)` 하나로 시작 — 실제 쿼리 생기기 전 추가 금지.
4. **backfill**: 기존 R2 `{id}.json` 객체를 `list()`로 열거해 D1에 1회 초기 적재하는 스크립트를 Phase 1에 포함 (PRD DoD #1 시연 전제).
5. 배제 근거: KV = eventual consistency(최대 60초+ stale)·동일 키 초당 1회 제한. R2 list = 사전순만·임의 필터 불가.

## 결과

- `snap_history` = `SELECT ... ORDER BY created_at DESC LIMIT ?` (+ 향후 url/type 필터 자연 확장).
- R2↔D1 cross-service 트랜잭션은 없음 → `id`를 idempotency key로 쓰고, R2 7일 lifecycle 삭제가 D1 행을 지우지 않으므로 조회 시 `expires_at` 필터 + 필요 시 R2 `head` 실재 확인(PRD 리스크 표와 일치). orphan 정리 정책은 Phase 2에서 확정.
- 무료 한도 여유: D1 Free 5M reads/100K writes/day·5GB — 개인 캡처량 대비 충분(질문 F 수치).
- wrangler에 D1 바인딩 + 마이그레이션 추가 필요. **D1 DB 생성(`wrangler d1 create`)은 계정 리소스 생성 — 사람 게이트 후보**(비용 0이지만 계정 상태 변경이므로 Phase 1 착수 시 1회 확인).

## 출처

비교표·한도 수치·확인일(2026-07-18)은 `docs/research/phase0-storage-auth-limits.md`. D1 무료 한도는 지휘자가 공식 pricing 페이지로 재검증함.
