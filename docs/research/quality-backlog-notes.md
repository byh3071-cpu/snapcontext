# Quality backlog notes (0.3.x)

> SnapContext worker 품질 백로그 B1–B5 작업 기록 · 2026-07-18

## B4 — vitest-pool-workers 실 D1 왕복

**결과: 성공 (스킵 아님)**

- `@cloudflare/vitest-pool-workers@0.18.5` + `vitest.d1.config.mts` + `test-d1/`
- miniflare 로컬 D1에 migration 적용 후 `insertCapture` → `listCaptures` 실 SQL 검증
  (`expires_at` 필터 + `created_at DESC`)
- 설정 파일은 ESM-only 패키지 로딩을 위해 `.mts` 필수 (`.ts`는 require 경로로 실패)
- 기존 node 스위트(`test/**`)와 분리 — `pnpm test` = node 스위트 && D1 스위트

## B1–B3 · B5

- B1: `analyze.test.ts` 누출-회귀 (userNote/tags/userAgent/pin x/y)
- B2: `/upload` malformed context → `console.warn` + 테스트
- B3: D1 실패 + R2 cleanup 실패 → 500 유지 테스트 (구현은 `allSettled`로 이미 보장)
- B5: `analyze.ts` `imageUrl ?? '(missing...)'` dead code 제거
