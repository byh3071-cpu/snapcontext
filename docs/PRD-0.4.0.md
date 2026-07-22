---
id: prd-0.4.0
date: 2026-07-19
tags: [prd, mcp, worker, token, multitenant, v0.4.0]
---

# SnapContext 0.4.0 PRD — per-user 토큰 · MCP 자발 사용 · 만료 파라미터화

> 이 문서는 **무엇을/왜**. 실행 순서·에이전트 매핑은 아래 Phase·티켓 표에 통합. 모든 결정은 Plan 설계 + critic 적대 검증(H1~H3·M1~M7·L1~L4) 반영으로 이미 확정 — 본 문서는 스펙 정리만 한다(신규 결정 없음).

## 한 줄 정의

**실사용자가 확장만 깔면 MCP까지 쉽게.** per-user 토큰 멀티테넌시 + MCP 자발 사용(서버 instructions) + 공유 만료 파라미터화(1/7/30일).

## 배경 (0.3.0 완료 상태)

- 0.3.0: 원격(HTTP) MCP 서버(`/mcp`, 툴 3종 read-only) + 익명 `/upload` + 단일 공유 bearer(`SNAPCONTEXT_BEARER_TOKEN`, /mcp 전용). 스토어 심사 대기 중.
- 문제 3가지:
  - ① **실사용자가 MCP를 못 씀** — 단일 토큰은 운영자 전용이고, 캡처에 소유자 개념이 없다.
  - ② **에이전트가 자발적으로 툴을 안 꺼냄** — 서버 `instructions` 부재(현재 `worker/src/mcp.ts:22` name/version만).
  - ③ **만료 7일 고정** — 파라미터화 부재.

## 목표

- **per-user 토큰**: 서버 발급 HMAC 서명 토큰으로 캡처에 소유자(owner)를 부여, 사용자별 MCP 조회 격리.
- **MCP 자발 사용**: 서버 `instructions` + 툴 description 트리거 문구로 사용자 규칙 없이 툴을 꺼내게 유도.
- **만료 파라미터화**: 업로드 시 1/7/30일 선택, allowlist 코드 대조.
- **온보딩**: 확장 설정 패널에서 토큰 표시·복사·붙여넣기 + Claude/Codex 복붙 명령 제공.

## 비목표 (0.4.0에서 명시적 배제)

- 계정 로그인 / `chrome.storage.sync`(토큰=시크릿, local 전용).
- `snap_capture` 구현 — 별도 리서치 트랙 R(Web Push PoC). 재검토 3조건: `docs/research/phase0-capture-trigger.md:99`.
- 토큰 revoke·재생성 UI / `owners` 테이블(D1 발급 대장).
- **UPLOAD_AUTH required 전환** — /upload는 영구 optional(익명 공유 계약 유지).

## 확정 결정 (전부 스펙에 반영)

| # | 항목 | 결정 |
|---|------|------|
| 1 | 토큰 형식 | 서버 발급 HMAC 서명. `sc_<base64url(rand 16B)>.<base64url(HMAC-SHA256(TOKEN_SIGNING_SECRET, rand) 앞 16B)>`. 검증 = HMAC 재계산(무상태, DB 조회 없음). 자작 형식 토큰 차단(critic H2 해소). **base64url 정규형 강제** — 디코드 후 재인코딩이 원본과 다르면 거부(PAT-002: 끝 문자 미사용 비트로 같은 바이트열에 표현이 여럿 생겨 owner 가 파편화됨) |
| 2 | 발급 | 확장 최초 실행 시 `POST /token` — Origin(chrome-extension) 필터 + rate-limit. `chrome.storage.local`에만 저장(sync 금지, 시크릿) |
| 3 | owner | `SHA-256(토큰 전문)` hex 64자. 마이그레이션 `0002_captures_owner.sql`: `owner TEXT`(nullable) + `(owner, created_at DESC)` 복합 인덱스. 기존 행 백필 없음(TTL 7일 자연 소멸) |
| 4 | /upload | **영구 optional**(critic H3). Authorization 있으면 HMAC 검증→owner 스탬프, 없으면 owner NULL(익명 공유 유지). malformed 헤더만 401 |
| 5 | /mcp 인증 | admin(`SNAPCONTEXT_BEARER_TOKEN`) **정확일치 우선 검사** → 아니면 HMAC user 스코프. admin=전체 조회(NULL 레거시 포함). admin 토큰 `sc_` 접두 금지. `snap_history`만 owner 필터. `snap_pack`·`snap_analyze`는 owner 검사 없음(id=공유 링크 `/s/{id}`와 동일한 public-by-design UUID) |
| 6 | rate-limit | `/token`·`/mcp`에 필수(Workers 무료 100K req/day hard-stop 보호). 방식(CF Rate Limiting rule vs 코드 레벨)은 구현 Phase 결정 — PRD엔 요구사항만 |
| 7 | 만료(C5) | form 필드 `expiresInDays`, 서버 allowlist `{1,7,30}` 코드 대조(PAT-001, 위반=400, 부재=7). 만료 SoT = R2 customMetadata `expiresAt`(ISO), 레거시 fallback = uploaded+7일. 단일 헬퍼 `readExpiry(head)`로 전 판정 통일 |
| 8 | R2 lifecycle | 버킷 전역 `auto-delete-7d` → **30일 상향 필수**(사람 게이트, `wrangler r2 bucket lifecycle`). 안 하면 30일 캡처가 7일에 물리 삭제되는 모순(critic H1). 1/7일은 코드 차단으로 강제. 비용 = R2 무료 10GB 내 미미 |
| 9 | MCP 자발 사용 | `new McpServer(meta, { instructions })` + 툴 description 3종 트리거 문구(아래 원문). 효능 = UNVERIFIED → T4.2로 검증 |
| 10 | 온보딩 | 설정 패널(ShortcutsHelp 확장): 토큰 마스킹+복사 / 다른 기기 토큰 붙여넣기(기기별 local 토큰 = 현업 표준) / Claude·Codex 복붙 명령 / 만료 기본값 select 1/7/30(storage 키 `shareExpiryDays`) |
| 11 | 문서 정합 | PRIVACY.md 개정(owner=pseudonymous 링크 식별자 신설 고지) + "7일" 하드 문구 전수 갱신 + 스토어 Privacy practices 재확인(critic M1·M7) |
| 12 | 요한 이관 | 확장 설정 sc_ 토큰 복사 → `scripts/register-mcp.ps1`을 sc_ 등록으로 개정. admin은 운영 예비 유지 |

### C5 만료 개정 지점 전수 (누락 = 회귀)

`worker/src/ingest.ts:27` · `pack.ts:44,62` · `index.ts:28(GONE_MSG),164,170,181,186` · `lib.ts:50-52,54-55(formatExpiryKST — 뷰어 "만료 예정" 라벨도 readExpiry 기반으로),77,85` · 확장 `src/sidepanel/components/ImageActions.ts:17(업로드 동의 문구 — 선택 만료일 반영 필수, 아니면 사실과 다른 동의),76,86,93,96,185,194` — 전부 `shareExpiryDays` 선택값 기반 동적 렌더. `/i/` Cache-Control = 잔여초, 만료 후 no-store. `readExpiry(head)` 통일 대상은 만료 **판정**뿐 아니라 만료 **표시** 계산 포함.

## MCP instructions·description 원문 (구현 SoT)

**서버 instructions:**
> "SnapContext stores the user's annotated web screenshots: page captures with numbered pin memos marking specific UI elements. Whenever the user mentions a screenshot, capture, snap, pin memo, or refers to something they 'just captured' or 'shared a link to', use these tools instead of asking them to paste an image. Typical flow: call snap_history to find the capture id, then snap_analyze (preferred, returns an analysis-ready digest) or snap_pack (raw structured context). Digests include an image URL — fetch it to view the screenshot."

**툴 description:**
- `snap_history`: "List the user's recent SnapContext screenshot captures, newest first. Use this whenever the user refers to a recent capture, screenshot, or snap (e.g. 'the page I just captured') to find its id before calling snap_pack or snap_analyze."
- `snap_pack`: "Fetch the full Context Pack for one capture id: source URL, title, viewport, and the numbered pin memos exactly as the user annotated them. Use after snap_history when you need raw structured context rather than a prepared digest."
- `snap_analyze`: "Build an analysis-ready markdown digest (page metadata + pin memos + mode instructions + image URL) for a capture. Preferred entry point when the user asks to debug, review, refactor, or implement something from a screenshot. Modes: bug-report | refactor | reference."

## 온보딩 복붙 명령 (설정 패널 표시)

- **Claude Code (1줄)**: `claude mcp add --transport http snapcontext <URL>/mcp --header "Authorization: Bearer <token>"`
- **Codex (2줄)**: `setx SNAPCONTEXT_MCP_TOKEN <token>` → `codex mcp add snapcontext --url <URL>/mcp --bearer-token-env-var SNAPCONTEXT_MCP_TOKEN`
  - Codex는 인라인 토큰 옵션 없음(codex-cli 0.144 실확인) → env var 경유 필수.

## 아키텍처

```
┌─────────────────────────┐  ①POST /token (chrome-ext Origin+rate-limit)  ┌────────────────────────────┐
│  SnapContext 확장 (MV3)  │ ─────────────────────────────────────────────▶│  Cloudflare Worker          │
│  토큰=storage.local      │  ②POST /upload (Authorization optional)        │  ┌──────────────────────┐  │
│  설정 패널 온보딩         │      → owner 스탬프 or NULL                     │  │ 공유: /upload /i /s   │  │
└─────────────────────────┘                                                │  │ 발급: /token(신규)    │  │
                                                                           │  ├──────────────────────┤  │
┌─────────────────────────┐  ③/mcp (admin 우선 → HMAC user 스코프)         │  │ MCP: /mcp             │  │
│  AI 에이전트              │ ◀────────────────────────────────────────────▶│  │ +instructions(신규)   │  │
│  Claude Code · Codex     │  snap_history(owner 필터)/pack/analyze         │  └──────────┬───────────┘  │
└─────────────────────────┘                                                └─────────────┼──────────────┘
                                                                       R2 customMetadata expiresAt / D1 owner
```

- 토큰 검증은 무상태(HMAC 재계산). owner = SHA-256(토큰 전문), 서버 저장 대장 없음.
- admin bearer(`SNAPCONTEXT_BEARER_TOKEN`, 기존 `verifyBearer`)는 `sc_` 접두 금지 규칙으로 user 토큰과 네임스페이스 분리.

## 데이터 모델

### D1 `captures` (0002 마이그레이션 = owner 추가)

```sql
ALTER TABLE captures ADD COLUMN owner TEXT;              -- nullable, SHA-256(토큰) hex 64
CREATE INDEX idx_captures_owner ON captures(owner, created_at DESC);
```

- 기존 컬럼(id·created_at·url·title·capture_type·pin_count·expires_at) 불변. 백필 없음(레거시 행 owner=NULL, TTL 소멸).
- `snap_history`: user 스코프 = `WHERE owner = ?` + expires 필터. admin = owner 필터 없음(NULL 포함 전체).

### R2 키 구조 (현행 + 만료 SoT)

| 키 | 내용 | 0.4.0 변경 |
|----|------|-----------|
| `{id}` | 캡처 PNG | customMetadata `expiresAt`(ISO) 추가 = 만료 SoT |
| `{id}.json` | 축약 `SharedContext` | 변경 없음 |

- 만료 판정 단일 헬퍼 `readExpiry(head)`: customMetadata `expiresAt` 있으면 그것, 없으면(레거시) `uploaded + 7일`.

### 토큰 (확장 `chrome.storage.local`)

```
snapcontextToken : "sc_<...>.<...>"   // 발급/붙여넣기, sync 금지
shareExpiryDays  : 1 | 7 | 30         // 기본 7 — 업로드 시 form 필드 `expiresInDays`로 전달(이름 이원화 의도적: storage=설정, form=전송)
```

## 구현 표면 매핑 (기능ID ↔ 표면 ↔ 진입점)

| ID | 기능 | 구현 표면 | 진입점 |
|----|------|-----------|--------|
| F001 | 토큰 발급·검증(HMAC 무상태) | `worker/src/token.ts` | `POST /token` |
| F002 | owner 스탬프(upload optional bearer) | `index.ts` /upload 분기 + `ingest.ts` | `POST /upload` |
| F003 | /mcp 인증 라우팅(admin 우선→user) | `resolveMcpAuth` (auth 확장) | `/mcp` |
| F004 | snap_history owner 필터 | `history.ts` listCaptures | MCP 툴 `snap_history` |
| F005 | 만료 파라미터화 + readExpiry | `lib.ts` readExpiry + 전수 교체 | `/upload`·`/i`·`/s` |
| F006 | MCP 자발 사용(instructions+desc) | `mcp.ts` createSnapMcpServer | `/mcp` 핸드셰이크 |
| F007 | 토큰 클라(발급·저장·in-flight 가드) | 확장 token 클라 | 확장 최초 실행 |
| F008 | 온보딩 UI(표시·복사·붙여넣기·만료 select) | 설정 패널(ShortcutsHelp 확장) | 사이드패널 톱니 |

정합성 self-check: 모든 F00x는 표면·진입점 연결됨. `snap_pack`·`snap_analyze`는 0.3.0 표면 유지(owner 무검사, 시그니처 안정). 고아 없음.

## Phase·티켓

| Phase | 티켓 | DoD |
|-------|------|-----|
| **P1** worker 토큰 기반 | T1.1 `token.ts`(HMAC 발급·검증, test-first) / T1.2 `POST /token`+rate-limit / T1.3 `0002` 마이그레이션+ingest owner | 기존 테스트 무수정 그린 + test-d1 |
| **P2** worker 인증 | T2.1 /upload optional bearer / T2.2 `resolveMcpAuth`(admin 우선→HMAC user) / T2.3 history owner 필터 | 격리·admin 전체조회·malformed 401 테스트 그린 |
| **P3** worker C5 만료 | T3.1 `readExpiry` 헬퍼+전수 교체 / T3.2 `expiresInDays` allowlist·customMetadata / T3.3 /i/ Cache-Control·문구 동적화 | 레거시 fallback 회귀 테스트 포함 그린 |
| **P4** MCP 문구 | T4.1 instructions·description+version 0.4.0 / T4.2 효능 스모크 | mcp-integration assert + 스모크 기록 |
| **P5** 확장 | T5.1 token 클라(발급·storage·in-flight 가드) / T5.2 `upload.ts` bearer+expiresInDays / T5.3 문구 동적화 | tsc strict + vitest + e2e upload-share |
| **P6** 온보딩·문서 | T6.1 설정 패널 / T6.2 PRIVACY 개정+7일 문구 전수 / T6.3 ADR 3건(011 per-user HMAC 토큰·발급 / 012 무상태 owner·admin 시맨틱 / 013 만료 파라미터화·R2 lifecycle SoT)+`register-mcp.ps1` 개정 / T6.4 스토어 킷 0.4.0 | e2e probe + 수동 QA 체크리스트 |

**운영(사람 게이트)**: R2 lifecycle 30일 상향 / `TOKEN_SIGNING_SECRET` 주입 / deploy / 0.3.0 심사 종료 확인 후 스토어 제출 / 머지 승인.

**핸드오프 규칙**: Phase 완료마다 `docs/log/` 세션 로그 + Dev Log 행(산출물 포인터). goal 실행 시 `.vhk/mission.json` 스코프 고정.

## DoD (완료 판정)

1. worker vitest(unit + test-d1) 그린.
2. 확장 tsc strict + vite build + vitest + e2e 그린.
3. **격리 시나리오**: 두 owner 교차 조회 결과 0 테스트 존재.
4. **레거시 회귀**: 토큰 없는 업로드·메타 없는 R2 객체 동작 불변 테스트.
5. PRIVACY·스토어 문구 정합(7일 하드 문구 전수 갱신, owner 고지 신설).

## 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| R2 lifecycle 30일 상향 누락(H1) | 30일 옵션이 7일에 물리 삭제되는 모순 | 사람 게이트 운영 체크, 1/7일은 코드 차단 |
| 스토어 0.3.0 심사 중 0.4.0 제출 가능 여부 | 제출 순서 리스크 | UNVERIFIED — 0.3.0 심사 종료 확인 후 제출 |
| MCP instructions 클라 주입 효능 | 자발 사용 미발동 | UNVERIFIED — T4.2 SDK 옵션 지원 확인 + Claude Code 실주입 스모크 |
| rate-limit 방식 미정 | 무료 한도 초과 노출 | 구현 Phase 결정(요구사항은 필수로 확정) |
| R2 30일 보관 비용 | 스토리지 증가 | 무료 10GB 한도 내 미미 |
