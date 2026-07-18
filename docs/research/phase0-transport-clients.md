---
id: phase0-transport-clients
date: 2026-07-18
tags: [research, phase0, mcp, transport, claude-code, cursor, cloudflare]
questions: [A, B]
---

# Phase 0 리서치 R1 — 질문 A(transport·Cloudflare 스택) · B(클라이언트 연결)

> 확인일: 전부 **2026-07-18**. 기억이 아니라 공식 스펙·공식 문서·저장소 직접 조회 결과만 기재.

## A 결론 (두괄식)

- 현행 MCP 스펙 = **2025-11-25**. 표준 transport는 **stdio + Streamable HTTP 2종뿐**. HTTP+SSE는 2025-03-26 개정에서 Streamable HTTP로 대체·폐기(legacy 호환 전용). **원격 서버 = Streamable HTTP 단일 `/mcp` 엔드포인트**가 정답.
- Cloudflare 공식 스택 = **`agents` SDK**. `workers-mcp`는 폐기(README가 remote-mcp-server 가이드로 리다이렉트). 신규·무상태 서버 권장 = **`createMcpHandler()`(agents/mcp, Durable Objects 불필요)** — SnapContext read-only 2툴에 최적. 세션 상태 필요 시에만 `McpAgent`(DO 필수). `workers-oauth-provider`는 OAuth 풀 인증용 → 0.3.0(bearer 최소 인증)에는 불필요.
- 주의: **2026-07-28 차기 스펙이 10일 뒤 확정**(무상태 코어·`Mcp-Method`/`Mcp-Name` 헤더 필수화·서버발 SSE 스트림 제거). Phase 1은 현행 2025-11-25 + agents SDK로 가되, SDK 업데이트 추종을 전제로 무상태 설계(createMcpHandler)를 택하면 차기 스펙과도 방향이 일치한다.

## B 결론 (두괄식)

- **Claude Code·Cursor 모두 원격 HTTP MCP 네이티브 연결 가능 — `mcp-remote` 브리지 불필요.** 브리지는 stdio 전용 구형 클라이언트나 OAuth 미지원 클라이언트에서만 필요(우리 DoD 경로엔 해당 없음).
- Claude Code: `claude mcp add --transport http snapcontext https://<worker>/mcp --header "Authorization: Bearer <token>"` — HTTP가 공식 권장, SSE는 deprecated 명시. JSON 설정 시 `type: "http"`(`streamable-http` alias 허용) 필수 — `url`만 있고 `type` 없으면 설정 오류로 스킵된다.
- Cursor: `mcp.json`에 `{"mcpServers": {"snapcontext": {"url": "https://<worker>/mcp", "headers": {"Authorization": "Bearer ${env:SNAP_TOKEN}"}}}}` — url 방식이면 Streamable HTTP 자동, `${env:VAR}` 보간 지원. 버전 조건: Claude Code v1.0.27+(2025-06, `--transport http` 도입), Cursor 0.48.0+(Streamable HTTP 지원) — 2026-07 현행 버전은 양쪽 모두 충족.

---

## 근거 표

| # | 주장 | 출처 URL | 확인일 | 비고 |
|---|------|----------|--------|------|
| A-1 | 현행 MCP 스펙 버전 = 2025-11-25 (Current) | https://modelcontextprotocol.io/specification/versioning | 2026-07-18 | 공식 스펙 원문 |
| A-2 | 표준 transport 2종 = stdio, Streamable HTTP. "Clients SHOULD support stdio whenever possible" | https://modelcontextprotocol.io/specification/2025-11-25/basic/transports | 2026-07-18 | 공식 스펙 원문 |
| A-3 | Streamable HTTP가 2024-11-05의 HTTP+SSE transport를 **대체**("This replaces the HTTP+SSE transport from protocol version 2024-11-05"). HTTP+SSE는 "deprecated" 명시, Backwards Compatibility 절에서 구클라이언트 호환 방법만 기술 | https://modelcontextprotocol.io/specification/2025-11-25/basic/transports | 2026-07-18 | 폐기 시점은 2025-03-26 개정 |
| A-4 | Streamable HTTP 요건: 단일 MCP 엔드포인트(POST+GET), Origin 헤더 검증 MUST(403), `MCP-Session-Id`(선택), `MCP-Protocol-Version` 헤더 | https://modelcontextprotocol.io/specification/2025-11-25/basic/transports | 2026-07-18 | Phase 1 구현 체크리스트 원천 |
| A-5 | 차기 스펙 2026-07-28 (RC 2026-05-21 lock, final 7/28): 무상태 코어(initialize 핸드셰이크·Mcp-Session-Id 제거), `Mcp-Method`/`Mcp-Name` 헤더 필수, 서버발 SSE 스트림 제거→Multi Round-Trip. "신규 서버는 2026-07-28 타깃 권고" | https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/ | 2026-07-18 | 공식 MCP 블로그. 릴리즈 전이므로 Phase 1 개발 중 SDK 추종 확인 필요 |
| A-6 | Cloudflare 원격 MCP = Streamable HTTP 표준·권장, SSE는 "deprecated in favor of Streamable HTTP"(legacy 호환만). `createMcpHandler`는 Streamable HTTP 전용이자 "recommended approach for new MCP servers" | https://developers.cloudflare.com/agents/model-context-protocol/transport/ | 2026-07-18 | 공식 docs |
| A-7 | `workers-mcp` 폐기 — README가 "You should start here instead — and build a remote MCP server"로 remote-mcp-server 가이드에 위임 | https://github.com/cloudflare/workers-mcp | 2026-07-18 | 채택 금지 |
| A-8 | 구현 3방식: ① `createMcpHandler()` 무상태·최속·**DO 불필요** ② `McpAgent` 세션별 DO·상태·elicitation·SSE 겸용 ③ raw `@modelcontextprotocol/sdk` WebStandardStreamableHTTPServerTransport. 템플릿: `npm create cloudflare@latest -- remote-mcp-server-authless --template=cloudflare/ai/demos/remote-mcp-authless` | https://developers.cloudflare.com/agents/guides/remote-mcp-server/ | 2026-07-18 | 공식 가이드 |
| A-9 | `createMcpHandler` import 경로 = `agents/mcp` (`import { createMcpHandler } from "agents/mcp"`), 옵션: route·enableJsonResponse·sessionIdGenerator·corsOptions·authContext | https://developers.cloudflare.com/agents/model-context-protocol/mcp-handler-api/ (+ https://github.com/cloudflare/agents/blob/main/docs/mcp-servers.md) | 2026-07-18 | API 레퍼런스. 정확한 시그니처는 Phase 1에서 examples/mcp-server 원문 재확인 |
| A-10 | authless 데모 현행 코드: `McpAgent` 상속 클래스 + `MyMCP.serve("/mcp")` 라우팅만 존재, **`/sse` 라우트 없음** | https://raw.githubusercontent.com/cloudflare/ai/main/demos/remote-mcp-authless/src/index.ts | 2026-07-18 | Cloudflare 데모도 SSE 엔드포인트 제거됨 |
| A-11 | authless 데모 wrangler: `main: src/index.ts`, DO 바인딩 `{name: MCP_OBJECT, class_name: MyMCP}`, migrations `new_sqlite_classes: ["MyMCP"]`, `nodejs_compat` 플래그 | https://raw.githubusercontent.com/cloudflare/ai/main/demos/remote-mcp-authless/wrangler.jsonc | 2026-07-18 | McpAgent 경로일 때만 DO 바인딩 필요 |
| A-12 | MCP SDK 1.26.0에 무상태 서버 breaking change — 서버/transport 인스턴스 공유 시 타 클라이언트로 응답 누출 취약점 수정 → **요청마다 인스턴스 생성** 필요 | https://github.com/cloudflare/agents/blob/main/docs/mcp-servers.md (검색 경유 [웹외부]) | 2026-07-18 | Phase 1에서 원문 재확인 후 준수 |
| B-1 | Claude Code 원격 HTTP 네이티브 지원 — "HTTP servers are the recommended option for connecting to remote MCP servers". 명령: `claude mcp add --transport http <name> <url>`, bearer는 `--header "Authorization: Bearer your-token"` | https://code.claude.com/docs/en/mcp | 2026-07-18 | 공식 docs 원문 |
| B-2 | Claude Code SSE transport deprecated — "The SSE (Server-Sent Events) transport is deprecated. Use HTTP servers instead" | https://code.claude.com/docs/en/mcp | 2026-07-18 | 공식 docs 원문 |
| B-3 | Claude Code JSON 설정: `type` 필드에 `http`(alias `streamable-http`) 사용. `url`만 있고 `type` 없으면 stdio로 해석→설정 오류로 서버 스킵 + 경고 | https://code.claude.com/docs/en/mcp | 2026-07-18 | `.mcp.json` 작성 시 함정 |
| B-4 | Claude Code `--transport http` 도입 버전 = v1.0.27 (2025-06, issue #1387 구현) | https://claudefa.st/blog/guide/changelog 등 (검색 경유 [웹외부]) | 2026-07-18 | 서드파티 출처 — 공식 changelog 원문 미확인이나 현행 버전(2.1.x) 지원은 B-1 공식 docs로 확정 |
| B-5 | Cursor 원격 HTTP/SSE 네이티브 지원, mcp.json `url` 키 방식. bearer: `"headers": {"Authorization": "Bearer ${env:TOKEN}"}`, `${env:VAR}` 보간 지원 | https://cursor.com/docs/context/mcp | 2026-07-18 | 공식 docs |
| B-6 | Cursor Streamable HTTP 지원 시작 ≈ 0.48.0+ | https://forum.cursor.com/t/please-implement-streamable-http-on-cursor-mcp/82984 등 (검색 경유 [웹외부]) | 2026-07-18 | 커뮤니티 출처 — 공식 changelog 원문 미확인이나 현행 버전 지원은 B-5 공식 docs로 확정 |
| B-7 | `mcp-remote` = stdio 전용/OAuth 미지원 클라이언트용 브리지("working proof-of-concept", experimental). 네이티브 지원 클라이언트에는 불필요 | https://github.com/geelen/mcp-remote | 2026-07-18 | README 자체가 임시 브리지로 자기규정 |

## Phase 1 최소 셋업 스니펫 개요 (검증된 것만)

### 권장 경로: 기존 worker에 `createMcpHandler` 라우트 추가 (무상태 · DO 불필요)

SnapContext 0.3.0은 read-only 2툴(`snap_history`·`snap_pack`)이라 세션 상태가 없다 → `McpAgent`(DO) 대신 `createMcpHandler`가 적합. 기존 v0.2 worker의 fetch 핸들러에 `/mcp` 분기만 추가하면 된다.

```bash
pnpm add agents @modelcontextprotocol/sdk zod   # worker 패키지에
```

```ts
// worker/src/index.ts 개요 — A-9 API 레퍼런스 기준. 정확한 시그니처는 Phase 1에서
// https://github.com/cloudflare/agents/tree/main/examples 원문 대조 후 고정할 것.
import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    if (url.pathname === "/mcp") {
      // 최소 bearer 검사 (질문 E 확정 전 임시 게이트)
      if (req.headers.get("Authorization") !== `Bearer ${env.MCP_TOKEN}`) {
        return new Response("Unauthorized", { status: 401 });
      }
      // A-12: 요청마다 새 인스턴스 (SDK 1.26.0 응답 누출 수정 준수)
      const server = new McpServer({ name: "snapcontext", version: "0.3.0" });
      server.tool("snap_history", { limit: z.number().optional() }, async (args) => {
        /* R2 인덱스 조회 → entries 반환 */
        return { content: [{ type: "text", text: JSON.stringify([]) }] };
      });
      server.tool("snap_pack", { id: z.string() }, async ({ id }) => {
        /* R2 get {id}.json — 만료/없음은 명시적 에러 throw (조용한 빈 반환 금지) */
        return { content: [{ type: "text", text: "{}" }] };
      });
      return createMcpHandler(server)(req, env, ctx);
    }
    // …기존 v0.2 라우트(/upload /i/{id} /s/{id})…
    return new Response("Not Found", { status: 404 });
  },
};
```

- wrangler 요점: createMcpHandler 경로는 **DO 바인딩·마이그레이션 불필요** — 기존 wrangler 설정에 라우트 코드만 추가. (`nodejs_compat` 플래그는 agents SDK 요구 여부를 Phase 1에서 확인 — authless 데모는 켜져 있음, A-11)
- 대안(참고): McpAgent 경로를 택하면 A-10/A-11 그대로 — `class MyMCP extends McpAgent` + `MyMCP.serve("/mcp")` + DO 바인딩 `MCP_OBJECT`/`new_sqlite_classes` 마이그레이션 필수. 0.3.0에는 과설계.

### 클라이언트 등록 (DoD 시연용 · 전부 공식 docs 검증)

```bash
# Claude Code (B-1)
claude mcp add --transport http snapcontext https://<worker-domain>/mcp \
  --header "Authorization: Bearer <token>"
```

```jsonc
// Cursor ~/.cursor/mcp.json 또는 프로젝트 .cursor/mcp.json (B-5)
{
  "mcpServers": {
    "snapcontext": {
      "url": "https://<worker-domain>/mcp",
      "headers": { "Authorization": "Bearer ${env:SNAPCONTEXT_MCP_TOKEN}" }
    }
  }
}
```

```jsonc
// Claude Code .mcp.json 직접 작성 시 (B-3 함정 주의 — type 필수)
{
  "mcpServers": {
    "snapcontext": {
      "type": "http",
      "url": "https://<worker-domain>/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

## UNKNOWN / Phase 1 이월 확인 항목

| 항목 | 상태 |
|------|------|
| `createMcpHandler(server)` 정확한 호출 시그니처(옵션 객체 형태·반환 핸들러의 인자 순서) | 개요만 확인(A-9). Phase 1에서 cloudflare/agents examples 원문 대조 후 고정 |
| agents SDK가 `nodejs_compat` 플래그를 createMcpHandler 경로에서도 요구하는지 | UNKNOWN — Phase 1 로컬 `wrangler dev`로 확인 |
| Claude Code v1.0.27·Cursor 0.48.0 도입 버전의 공식 changelog 원문 | 서드파티 출처만(B-4·B-6). 현행 버전 지원은 공식 docs로 확정이라 DoD에는 영향 없음 |
| 2026-07-28 스펙 확정 후 agents SDK의 `Mcp-Method`/`Mcp-Name` 헤더 대응 시점 | 릴리즈 전(A-5). Phase 1 착수 시 SDK changelog 재확인 |
