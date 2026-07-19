# SnapContext MCP 서버를 Claude Code + Codex에 등록 (토큰 자동 주입 — 사람 실행용)
$ErrorActionPreference = "Stop"
$tokenFile = "C:\Users\Public\dev\products\snapcontext\worker\.secret-bearer-token.txt"
if (-not (Test-Path $tokenFile)) { Write-Host "토큰 파일 없음: $tokenFile" -ForegroundColor Red; exit 1 }
$t = (Get-Content $tokenFile -Raw).Trim()
$url = "https://snapcontext-worker.byh3071-26a.workers.dev/mcp"

# 1) Claude Code (user 스코프 — 전 프로젝트, 토큰은 헤더에 직접)
claude mcp add --scope user --transport http snapcontext $url --header "Authorization: Bearer $t"

# 2) Codex (전역 — 토큰은 env var 경유, config.toml에 평문 미저장)
setx SNAPCONTEXT_MCP_TOKEN $t | Out-Null
codex mcp add snapcontext --url $url --bearer-token-env-var SNAPCONTEXT_MCP_TOKEN

Write-Host ""
Write-Host "=== 등록 완료. 확인: ===" -ForegroundColor Green
claude mcp list
codex mcp list
Write-Host ""
Write-Host "주의: setx 이후 새 터미널/VSCode 재시작해야 Codex가 토큰을 읽음 (실행 중 프로세스 소급 안 됨)" -ForegroundColor Yellow
