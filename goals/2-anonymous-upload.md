---
vhk_format: 1
type: goal
id: 2
title: Phase 2 — 익명 업로드 + 공유 링크
status: NOT_STARTED
priority: P0
version: v0.2
---

# Mission

UUID 기반 R2 업로드, Side Panel ☁️ 버튼, 공유 링크 복사, 7일 만료 안내·만료 페이지.

## Done when

- [ ] Workers `PUT /{uuid}` presigned 또는 업로드 플로우
- [ ] Side Panel 업로드 UI (opt-in, 프로그레스, 토스트)
- [ ] 클립보드 공유 링크
- [ ] 만료 안내 + Workers 만료 페이지 (404 대신)
- [ ] `chrome.storage.local` 업로드 히스토리 (권장)

## Gate

`node scripts/check-goal-2.mjs` — `workers/` + `src/` 업로드·공유 코드
