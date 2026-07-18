---
id: ADR-010
date: 2026-07-18
tags: [auth, bearer, upload, security, v0.3.0]
---

# ADR-010: 수집 경로 = 기존 `/upload` 확장, 최소 인증 = bearer 토큰

## 상태

승인 (Phase 0 리서치 R3 기반 — `docs/research/phase0-storage-auth-limits.md`. 구현은 Phase 2)

## 맥락

확장→저장소 수집 경로(직접 presigned PUT vs Worker 경유)와 "내 데이터만" 조회용 최소 인증이 미해결 질문 E였다.

## 결정

1. **수집 = 기존 `POST /upload` 엔드포인트 확장** (Worker 경유). 이미 10MB 제한·PNG magic 검증·UUID·R2 저장이 중앙화돼 있어 재사용. R2 binding이라 확장에 R2 자격증명 불필요.
2. **presigned PUT(aws4fetch) 배제** — 확장 번들에 장기 자격증명을 넣는 형태는 금지(CWE-798). Worker body proxy가 실측 병목이 될 때만 server-side URL 발급+complete 프로토콜로 재검토.
3. **최소 인증 = 단일 bearer 토큰**:
   - 256-bit 난수 토큰을 Worker secret(`SNAPCONTEXT_BEARER_TOKEN`)에 저장 — `wrangler secret put`은 **사람 게이트**.
   - 검증 = 헤더 전체·기대값 각각 SHA-256 digest 후 `crypto.subtle.timingSafeEqual()` 비교. 단순 `===`·길이 조기 반환 금지.
   - secret 미설정 = 500 **fail closed**. 불일치 = 401 + `WWW-Authenticate: Bearer`.
   - 적용 라우트: `/upload`(Phase 2)·`/mcp`(snap_history·snap_pack, Phase 1). 기존 `/i/{id}`·`/s/{id}`는 **의도적 공유 링크로 무인증 유지** — "bearer 보유자만 조회" 정책의 명시적 예외.
4. CORS: `chrome-extension://<id>` origin으로 좁히고 `Allow-Headers`에 `Authorization` 추가(Phase 2). CORS는 인증 수단이 아님 — bearer 검증은 항상 별도.
5. 이 토큰은 **개인용 접근 게이트**이지 사용자 신원 증명이 아니다. 다중 사용자 전환 시 OAuth/Cloudflare Access + `owner_id` 매핑으로 교체(0.3.0 비목표).

## 결과

- Phase 1: `/mcp` 라우트에 bearer 게이트 먼저 적용(읽기 보호가 우선 — 인증 없이 원격 노출 금지, PRD 리스크 표).
- Phase 2: `/upload`에 동일 게이트 + D1 INSERT 추가. 저장 범위 확장 필드는 기존 동의 범위 내 + `/s` 뷰어 신규 필드 미노출 확인(로드맵 완료 기준).
- Workers Free 100K req/day 초과는 Error 1027 hard stop — 보안 라우트는 fail closed 유지(질문 F).

## 출처

경로 비교표·검증 패턴·확인일(2026-07-18)은 `docs/research/phase0-storage-auth-limits.md`.
