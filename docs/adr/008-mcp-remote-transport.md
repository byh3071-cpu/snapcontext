---
id: ADR-008
date: 2026-07-18
tags: [mcp, transport, cloudflare, agents-sdk, v0.3.0]
---

# ADR-008: 원격 MCP transport = Streamable HTTP + agents SDK `createMcpHandler`

## 상태

승인 (Phase 0 리서치 R1 기반 — `docs/research/phase0-transport-clients.md`)

## 맥락

0.3.0은 기존 Cloudflare Worker를 원격 MCP 서버로 확장한다(PRD 확정 결정 1). 어떤 transport 표준·어떤 Cloudflare 스택을 쓸지가 미해결 질문 A였다.

## 결정

1. **Transport = Streamable HTTP, 단일 `/mcp` 엔드포인트.** 현행 MCP 스펙(2025-11-25)의 원격 표준. HTTP+SSE는 2025-03-26 개정에서 폐기(legacy 호환 전용) — SSE 라우트 만들지 않는다.
2. **스택 = Cloudflare `agents` SDK의 `createMcpHandler()`** (`agents/mcp`). 무상태 read-only 툴 2종에는 세션 상태가 없으므로 Durable Objects 불필요·최소 구성. `McpAgent`(DO 필수)는 과설계라 배제. `workers-mcp`는 폐기된 패키지 — 사용 금지.
3. **요청마다 `McpServer` 인스턴스 신규 생성** — MCP SDK 1.26.0의 응답 누출(cross-client) 수정 준수.
4. Streamable HTTP 요건 준수: Origin 헤더 검증(불일치 403), `MCP-Protocol-Version` 헤더 처리.

## 결과

- Phase 1: 기존 worker fetch 핸들러에 `/mcp` 분기 추가만으로 시작. wrangler에 DO 바인딩·마이그레이션 불필요. `nodejs_compat` 요구 여부는 `wrangler dev`로 확인(R1 UNKNOWN 항목).
- 클라이언트(질문 B): Claude Code·Cursor 모두 원격 HTTP 네이티브 연결 — `mcp-remote` 브리지 불필요. Claude Code `.mcp.json` 직접 작성 시 `type: "http"` 필수(누락 시 서버 스킵 함정).
- ⚠️ **2026-07-28 차기 MCP 스펙 확정 예정**(무상태 코어·`Mcp-Method`/`Mcp-Name` 헤더). 무상태 설계라 방향 일치 — Phase 1 착수 시 agents SDK changelog 재확인.
- 관련: `snap_capture`는 질문 C 리서치(원격→MV3 확장 트리거 E2E 사례 미발견) 근거로 **0.3.0 드랍** — `docs/research/phase0-capture-trigger.md`.

## 출처

근거 표·확인일(2026-07-18) 전체는 `docs/research/phase0-transport-clients.md`.
