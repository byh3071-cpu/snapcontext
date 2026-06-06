---
vhk_format: 1
type: goal
id: 1
title: Phase 1 — R2 + Workers 환경 세팅
status: NOT_STARTED
priority: P0
version: v0.2
---

# Mission

`feat/v0.2-cloud` 브랜치, Cloudflare R2 버킷, Workers, 7일 lifecycle, `.env.local` / `.env.example`.

## Done when

- [ ] `git checkout -b feat/v0.2-cloud`
- [ ] R2 버킷 + API 토큰
- [ ] `wrangler` Workers 프로젝트
- [ ] R2 lifecycle 7일 삭제
- [ ] `.env.example`에 R2/Workers 변수 문서화

## Gate

`node scripts/check-goal-1.mjs` — `wrangler.toml` + `.env.example` `R2_*`
