---
vhk_format: 1
type: goal
id: 3
title: Phase 3 — PRIVACY.md + 안내 문구
status: NOT_STARTED
priority: P1
version: v0.2
---

# Mission

클라우드 업로드 개인정보·만료 정책을 문서·UI에 반영.

## Done when

- [ ] `docs/PRIVACY.md` 클라우드 섹션 (익명 UUID, 7일 삭제, 계정 미수집)
- [ ] Side Panel 히스토리 D-n 뱃지
- [ ] 설정 페이지 개인정보 안내

## Gate

`node scripts/check-goal-3.mjs` — `docs/PRIVACY.md` (7일·Cloudflare·익명)
