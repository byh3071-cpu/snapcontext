---
id: ADR-012
date: 2026-07-23
tags: [auth, owner, mcp, multitenancy, privacy, v0.4.0]
---

# ADR-012: 무상태 owner = SHA-256(토큰), admin 우선 → user HMAC 시맨틱

## 상태

승인 (0.4.0 트랙 D P1·P2 구현 — `worker/src/token.ts` `ownerFromToken` · `worker/src/auth.ts` `resolveMcpAuth`. 사후 문서화)

## 맥락

ADR-011 이 per-user 토큰을 열었다. 남은 질문: 그 토큰으로 **캡처 소유권(owner)을 어떻게 표현**하고, 요한의 운영용 admin 전체조회와 실사용자 격리를 **한 엔드포인트(`/mcp`)에서 어떻게 공존**시킬 것인가.

제약: 서버는 토큰을 저장하지 않는다(ADR-011 무상태). 그러니 owner 도 대장 조회 없이 토큰에서 **파생**돼야 한다.

## 결정

1. **owner = `SHA-256(토큰 전문)` hex 64자** (`worker/src/token.ts:129` `ownerFromToken`). 업로드 시 이 값을 D1 `captures.owner` 에 스탬프한다(마이그레이션 `0002`, nullable). 토큰이 없으면 owner NULL(익명).
   - 단방향 해시라 owner 에서 토큰·신원을 되돌릴 수 없다 → PRIVACY 상 pseudonymous 식별자로 고지(계정·이메일·실명 아님).
   - 서버 저장 대장이 없어도 같은 토큰은 항상 같은 owner 로 결정론적 매핑된다.
2. **`/mcp` 인증 우선순위** (`worker/src/auth.ts:96` `resolveMcpAuth`):
   - **① admin 정확일치 우선** — `SNAPCONTEXT_BEARER_TOKEN` 과 timing-safe 일치하면 `scope: admin`(전체 조회). admin 은 `sc_` 접두 금지(user 네임스페이스와 분리, `auth.ts:91` 주석).
   - **② user HMAC** — `sc_` 시작 + `verifyUserToken` 통과면 `scope: user` + `owner = ownerFromToken(raw)`.
   - **③ admin 시크릿 미설정 → 500 fail-closed** (ADR-010 하위호환).
   - **④ 그 외 → 401** + `WWW-Authenticate: Bearer`.
   admin 을 먼저 보는 이유: 요한 운영 토큰이 user 형식 검사에 걸려 격리되면 안 되고, 정확일치가 형식검사보다 저렴·명확하다.
3. **owner 필터는 조회에만, scope 로 분기**. `snap_history` 등에서 `scope === 'user'` 면 `WHERE owner = ?` 로 좁히고, admin 이면 필터 없음(`worker/src/mcp.ts`). 두 user 토큰이 서로의 캡처를 조회하면 결과 0(격리 테스트로 고정).

## 결과

- 멀티기기: owner 가 토큰에서 파생되므로 **토큰이 기기 간 같으면 owner 도 같다**. 확장은 토큰을 `chrome.storage.local`(sync 금지)에 두므로 기본은 기기별로 갈리고, 사용자가 P6 온보딩 UI 의 "다른 기기 토큰 붙여넣기"로 명시적으로 통합한다(F008).
- admin 은 운영 예비로 유지되고(`scripts/register-mcp.ps1` 도 sc_ 우선·admin 예비로 개정, ADR-011 연동), 실사용자·요한 모두 sc_ 토큰으로 자기 격리를 실제로 쓴다.
- owner 정의(`SHA-256(토큰 전문)`)는 토큰 정규형(ADR-011 결정4)을 전제한다 — 정규형이 없으면 같은 사용자가 255개 owner 로 파편화됐다.

## 출처

구현: `worker/src/token.ts`(`ownerFromToken`) · `worker/src/auth.ts`(`resolveMcpAuth`, 우선순위) · `worker/src/index.ts:85`(호출) · `worker/src/mcp.ts`(owner 필터). PRIVACY 고지 = `docs/PRIVACY.md` '소유자 격리' 절.
