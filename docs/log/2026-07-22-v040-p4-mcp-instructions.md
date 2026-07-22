---
id: log-2026-07-22-v040-p4
date: 2026-07-22
tags: [v0.4.0, mcp, instructions, P4]
---

# 0.4.0 P4 — MCP 자발 사용 문구 (서버 instructions + 툴 트리거 description)

## 왜

0.3.0 에서 `/mcp` 원격 서버와 툴 3종을 붙였지만, **에이전트가 툴을 스스로 꺼내지 않았다.** 사용자가 "스냅컨텍스트로 봐줘" 처럼 툴 이름을 직접 부르거나 프로젝트 규칙에 사용법을 적어둬야 동작했다. `worker/src/mcp.ts` 가 `new McpServer({name, version})` 만 넘겨서 **서버 `instructions` 가 아예 없었던 것**이 원인이다.

목표는 lazyweb·playwright 처럼 "손에 도구를 쥐여주면 알아서 쓰는" 상태다.

## 무엇을

| 항목 | 이전 | 이후 |
|------|------|------|
| 서버 `instructions` | 없음 | 신설 — 언제 툴을 쓰는지 + `snap_history` → `snap_analyze` 흐름 |
| 툴 `description` 3종 | 기능 설명("List stored captures newest-first") | 트리거 문구("Use this whenever the user refers to a recent capture…") |
| `annotations` | 없음 | `readOnlyHint: true`, `openWorldHint: false` (3종 전부 읽기 전용) |
| `serverInfo.version` | `0.3.0` | `0.4.0` |

문구 원문 SoT 는 `docs/PRD-0.4.0.md` 의 "MCP instructions·description 원문" 절이다. 코드에 그대로 옮겼고, `snap_analyze` 의 모드 목록만 `ANALYZE_MODES` 에서 보간해 allowlist 가 바뀌면 문구가 따라가게 했다(현재 값은 PRD 원문과 글자 단위로 동일).

## SDK 지원 확인 (T4.2-a — CLOSED)

착수 전 `@modelcontextprotocol/sdk@1.29.0` 실물 소스로 검증했다. PRD 리스크 표에 "UNVERIFIED" 로 걸려 있던 항목이다.

- `ServerOptions.instructions?: string` — `dist/esm/server/index.d.ts:15` 의 정식 필드
- `McpServer(serverInfo, options)` 가 options 를 가공 없이 하위 `Server` 로 전달 — `server/mcp.js` 의 constructor
- `Server` 가 저장해 initialize 응답에 삽입 — `server/index.js:50`, `:279`
- `agents@0.17.4` 의 `createMcpHandler` 는 이 경로를 건드리지 않는다. SDK 를 캐럿 없이 `1.29.0` 정확 핀 → 버전 스큐 없음
- 툴 `description` 은 `tools/list` 에 가공·절삭 없이 실린다

**함정**: 삽입이 truthy 가드(`...(this._instructions && { instructions: this._instructions })`)라 **빈 문자열이면 필드가 통째로 빠진다.** 그래서 테스트가 값 내용이 아니라 *존재*부터 검증한다.

## 남은 것 — T4.2-b (사람 개입, 아직 미실행)

**클라이언트가 instructions 를 실제로 시스템 프롬프트에 넣는지는 코드로 증명할 수 없다.** MCP 스펙이 `MAY` 로 규정하기 때문이다(`sdk/dist/esm/types.js` 의 InitializeResult 주석: "this information MAY be added to the system prompt"). 실접속 스모크로만 판정된다.

### 절차

```shell
cd worker && npx wrangler dev
# 다른 터미널에서
claude mcp add --transport http snapcontext-local http://localhost:8787/mcp \
  --header "Authorization: Bearer <SNAPCONTEXT_BEARER_TOKEN>"
```

**규칙·지침을 넣지 않은 새 세션**에서 아래 3개를 던진다.

1. "내가 방금 캡처한 페이지 좀 봐줘"
2. "아까 공유한 스크린샷에서 버튼 깨진 거 확인해줘"
3. "최근 스냅 목록 보여줘"

### 판정

3개 중 **1회 이상** `snap_history`/`snap_analyze`/`snap_pack` 을 자발 호출하면 `효능 확인`, 0회면 `효능 미확인`. 어느 쪽이든 결과를 이 문서에 追記한다.

**효능이 없어도 P4 코드는 롤백하지 않는다.** instructions 는 무해하고 스펙상 클라이언트 재량이라 "안 먹었다"가 곧 결함은 아니다. 미확인이면 P6 온보딩에서 사용자 규칙 안내를 보강하는 쪽으로 넘긴다.

Codex 쪽 스모크는 이번 범위 밖이다(PRD 가 Claude Code 실주입만 요구). Codex 지원 여부는 P6 온보딩에서 다룬다.

## 검증

- worker vitest **192 green** (unit 186 + test-d1 6), `tsc --noEmit` 0
- 신규 테스트 5건 전부 **red-first**: instructions 존재(`undefined` → 실패) · 흐름 지시 문구 · `version` (`0.3.0` → 실패) · description 트리거 문구(옛 문구 → 실패) · annotations (`undefined` → 실패)
- 확장(`src/**`) 변경 0 — 스토어 재제출 불요
