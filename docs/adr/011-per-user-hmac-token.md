---
id: ADR-011
date: 2026-07-23
tags: [auth, token, hmac, multitenancy, v0.4.0]
---

# ADR-011: per-user 접근 토큰 = 서버 발급 무상태 HMAC 서명 토큰

## 상태

승인 (0.4.0 트랙 D P1 구현 — `worker/src/token.ts`·`worker/src/index.ts` `/token` 핸들러. 이 문서는 구현된 결정의 사후 문서화)

## 맥락

0.3.0 은 단일 admin bearer 토큰(`SNAPCONTEXT_BEARER_TOKEN`, ADR-010) 하나로 `/mcp` 를 게이트했다. 이건 요한 셀프호스트용 "개인 접근 게이트"였지 사용자 식별이 아니어서, 스토어 실사용자가 각자 자기 캡처만 조회하는 멀티테넌시가 불가능했다.

0.4.0 은 실사용자에게 per-user 토큰을 열어야 했다. 설계 질문 두 가지:

1. 토큰을 **형식만 검증**할 것인가(클라 생성), **서버 발급**할 것인가.
2. 서버가 발급 대장을 **저장**할 것인가(상태), **무상태**로 갈 것인가.

critic 적대 검증에서 ①형식만 보는 토큰 = 아무나 `sc_...` 를 만들어 owner 네임스페이스를 무한 생성하는 무인증 DoS·오염 표면임이 지적됐다(0.4.0 PRD 확정결정). 그래서 서버 발급 + 서명 검증으로 격상했다.

## 결정

1. **서버 발급 HMAC 서명 토큰**. `POST /token` 이 서버 시크릿(`TOKEN_SIGNING_SECRET`)으로 서명한 토큰을 발급한다. 형식:
   `sc_<base64url(rand 16B)>.<base64url(HMAC-SHA256(secret, rand) 앞 16B)>` (`worker/src/token.ts:95`, `generateUserToken`).
2. **무상태 검증**. 서버는 발급 대장을 저장하지 않는다. 검증(`verifyUserToken`, `token.ts:110`)은 body 의 rand 로 HMAC 을 **재계산**해 서명과 timing-safe 비교한다. 발급-검증이 시크릿만 공유하면 되므로 D1 조회·상태가 없다.
3. **발급 게이트 3중** (`worker/src/index.ts` `/token` 핸들러):
   - **Origin = `chrome-extension://` 필수** — 아니면 403 (`index.ts:100-102`). 브라우저가 자동으로 붙이는 forbidden header 라 위조가 어렵다. `/upload` 에는 이 검증이 없다(공개 익명 업로드 계약 유지).
   - **시크릿 미설정 = 500 fail-closed** (`index.ts:104-108`). 조용히 익명 발급하지 않는다.
   - **IP 기반 rate-limit** — `allowTokenRequest(ip)` 초과 시 429 (`index.ts:114-116`). 발급 남용·owner 파편화 방어.
4. **base64url 정규형 강제** (`token.ts:61` 주석 + 검증). base64url 끝 문자에 미사용 비트가 남아 같은 바이트열에 표현이 여럿 존재 → 디코드 후 재인코딩 대조로 정규형만 통과시킨다. 안 하면 토큰 1개당 유효 변형 255개가 각각 다른 owner 로 갈린다(0.4.0 머지 전 실측·수정, `fix/0.4.0-token-canonical`).
5. **admin 과 네임스페이스 분리**. admin 토큰은 `sc_` 접두 금지(운영 규칙, ADR-012). user 토큰은 항상 `sc_` 시작이라 두 스코프가 코드에서 갈린다.
6. **WebCrypto 만 사용** — `node:crypto` 금지(`token.ts:1`). Workers 런타임 제약.

## 결과

- `/token` 은 확장이 업로드 직전 lazy 로 부른다(확장 `src/utils/token.ts`, F007). 발급 실패(500/429/네트워크)는 익명 업로드로 graceful degrade — 토큰은 선택 기능이라 필수 경로를 막지 않는다.
- `TOKEN_SIGNING_SECRET` 주입은 **사람 게이트**(`wrangler secret put`). 미주입이면 `/token` 이 500 이라 전 사용자가 익명으로 내려간다(기능은 안 깨지나 owner 격리 미동작).
- owner 파생·admin 우선순위는 ADR-012 로 분리.

## 출처

구현: `worker/src/token.ts`(발급·검증) · `worker/src/index.ts` `/token` 핸들러(Origin·rate-limit·fail-closed). 정규형 결함 실측은 0.4.0 P1~P2 세션 로그.
