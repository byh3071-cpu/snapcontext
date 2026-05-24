---
id: trouble-008-notion-mcp-401-vscode-env
date: 2026-05-10
tags: [troubleshooting, mcp, notion, vscode, env-var, windows]
---

# 008 — Notion MCP 토큰을 새로 발급해 등록했는데도 401 unauthorized

## 재현

1. Notion `Settings → Connections → Internal Integration` 에서 기존 토큰 폐기 후 새 토큰 발급
2. PowerShell 에서 새 토큰을 User-scope 환경변수로 저장:
   ```powershell
   [System.Environment]::SetEnvironmentVariable("NOTION_TOKEN", "ntn_새토큰", "User")
   ```
3. Claude Code 세션을 닫고 다시 열기 (사이드패널 재시작)
4. notion-mcp 재등록 (env-var 인계 방식 — `--token` 인자 사용 안 함):
   ```
   claude mcp remove notion-mcp
   claude mcp add notion-mcp -- npx -y @notionhq/notion-mcp-server
   ```
5. `claude mcp list` → `notion-mcp: ... ✓ Connected`
6. `mcp__notion-mcp__API-get-self` 호출
   - **기대:** 200 OK + 봇 정보(`Claude MCP`, workspace name 등)
   - **실제:** `{"status":401,"object":"error","code":"unauthorized","message":"API token is invalid."}`

## 원인

3중 진단으로 좁힘:

1. **레지스트리 직접 확인** — `[System.Environment]::GetEnvironmentVariable("NOTION_TOKEN", "User").Length` → `50`. **새 토큰은 정상 저장됨.**
2. **새 PowerShell 창에서 process-scope 확인** — `$env:NOTION_TOKEN.Length` → `50`. **신규 프로세스는 환경변수를 정상 상속.**
3. **Claude Code 가 spawn 한 셸에서 확인** — `$env:NOTION_TOKEN` → 빈 값. **Claude Code 의 자식 프로세스만 토큰을 못 받고 있음.**

근본 원인:

Claude Code 는 VSCode 확장으로 동작하고, **VSCode 자체가 환경변수 설정 이전에 시작**되어서 그 안의 모든 자식 프로세스(Claude Code 확장 → npx → notion-mcp 서버)가 토큰 없는 환경을 상속받음. Claude Code 세션만 새로 여는 것으로는 부모 VSCode 의 env snapshot 이 그대로 전파되어 해결되지 않음.

부수적 함정 — **MCP "Connected" ≠ "Authenticated"**:

`@notionhq/notion-mcp-server` 는 토큰 없이도 JSON-RPC 핸드셰이크는 성공시킨다. 그래서 `claude mcp list` 가 ✓ Connected 라고 보고하지만, **첫 Notion API 호출 시점에 비로소 401 이 드러난다**. 핸드셰이크 통과만 보고 인증 성공으로 오판하면 잘못된 방향으로 진단이 길어짐.

## 해결

VSCode 자체를 완전히 종료 후 재시작:

1. 모든 VSCode 창 닫기
2. 작업 관리자에서 잔여 `Code.exe` 프로세스 모두 종료 (백그라운드 인스턴스가 같은 env snapshot 을 상속함)
3. VSCode 재실행 → SnapContext 프로젝트 열기 → Claude Code 새 세션 시작
4. `mcp__notion-mcp__API-get-self` 재호출
   - 결과: `200 OK` + `Bot: Claude MCP / Workspace: 백요한의 Notion / Workspace ID: 6039740a-...`

새 VSCode 프로세스는 시작 시점의 시스템 환경변수를 상속받으므로 `NOTION_TOKEN` 이 정상 주입되고, spawn 된 npx 서브프로세스도 자동으로 받게 됨.

## 보안 권고

토큰을 `--token` CLI 인자로 전달하면 두 곳에 평문으로 노출됨:

1. `~/.claude.json` 의 `mcpServers.notion-mcp.args` 배열 (디스크 평문 저장)
2. `npx ... --token ntn_...` 프로세스 명령줄 (`ps` / 작업 관리자에서 다른 프로세스가 조회 가능)

대신 **환경변수 인계 방식**으로 등록하면 양쪽 모두 깔끔:

```bash
claude mcp add notion-mcp -- npx -y @notionhq/notion-mcp-server
```

(인자에 토큰 없음. 서버는 부모 환경의 `NOTION_TOKEN` 또는 `OPENAPI_MCP_HEADERS` 를 자동으로 읽음.)

만약 어느 한 곳에라도 토큰이 평문으로 노출된 적이 있다면, **즉시 Notion 에서 토큰 폐기 → 재발급** 후 환경변수 방식으로 다시 등록하는 것이 가장 확실. 노출된 평문을 사후에 지우는 것보다 토큰 자체를 무효화하는 편이 훨씬 단순.

## 일반화된 교훈

- **Windows User-scope 환경변수는 이미 실행 중인 프로세스에 소급 적용되지 않음.** Setter 호출 후 변수를 봐야 하는 모든 프로세스를 재시작해야 함.
- **VSCode 확장 환경에서 Claude Code 가 spawn 하는 자식들은 결국 VSCode 의 env snapshot 을 상속받는다.** Claude Code 세션 재시작 ≠ VSCode 재시작 — 환경변수 변경 시엔 후자가 필요.
- **MCP 의 "Connected" 상태는 핸드셰이크만 보장.** 다운스트림 서비스 인증은 별도 검증 필요 — 각 MCP 서버의 `get-self` / `whoami` / `health` 류 호출로 확인.
- **CLI 인자에 시크릿 넣지 말기.** 환경변수 + 부모 프로세스 상속이 평문 저장 + 프로세스 명령줄 노출을 동시에 해결.
