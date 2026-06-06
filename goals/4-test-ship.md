---
vhk_format: 1
type: goal
id: 4
title: Phase 4 — 테스트 + 커밋
status: NOT_STARTED
priority: P0
version: v0.2
---

# Mission

기존 E2E 유지 + 업로드 플로우 테스트, 빌드 green, push.

## Done when

- [ ] E2E 43개 + 업로드 E2E
- [ ] `npm run build` / `npm test` 통과
- [ ] 커밋 + push

## Gate

`node scripts/check-goal-4.mjs` — `npm run build` + `npm test`
