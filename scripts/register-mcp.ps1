# SnapContext MCP 서버를 Claude Code에 등록 (토큰 자동 주입 — 사람 실행용)
$ErrorActionPreference = "Stop"
$tokenFile = "C:\Users\Public\dev\products\snapcontext\worker\.secret-bearer-token.txt"
if (-not (Test-Path $tokenFile)) { Write-Host "토큰 파일 없음: $tokenFile" -ForegroundColor Red; exit 1 }
$t = (Get-Content $tokenFile -Raw).Trim()
claude mcp add --scope user --transport http snapcontext "https://snapcontext-worker.byh3071-26a.workers.dev/mcp" --header "Authorization: Bearer $t"
Write-Host ""
Write-Host "=== 등록 완료. 확인: ===" -ForegroundColor Green
claude mcp list
