# SnapContext MCP 서버를 Claude Code + Codex 에 등록 (사람 실행용)
#
# 0.4.0 개정(ADR-011·012): 기본 경로 = per-user sc_ 토큰. 확장 설정 패널 온보딩에서
# "내 토큰 복사"로 얻은 sc_ 토큰을 -Token 인자로 넘긴다. admin(전체조회)은 운영 예비.
#
# 사용:
#   .\register-mcp.ps1 -Token "sc_xxxx.yyyy"          # 실사용자·요한 자기 격리 (권장)
#   .\register-mcp.ps1 -Admin                          # 운영 예비: admin 전체조회 토큰 파일 사용
param(
  [string]$Token,
  [switch]$Admin
)
$ErrorActionPreference = "Stop"
$url = "https://snapcontext-worker.byh3071-26a.workers.dev/mcp"

if ($Admin) {
  # 운영 예비 경로 — admin bearer(전체 owner 조회). sc_ 접두 금지(user 네임스페이스와 분리).
  $tokenFile = "C:\Users\Public\dev\products\snapcontext\worker\.secret-bearer-token.txt"
  if (-not (Test-Path $tokenFile)) {
    Write-Host "admin 토큰 파일 없음: $tokenFile" -ForegroundColor Red; exit 1
  }
  $t = (Get-Content $tokenFile -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($t)) {
    Write-Host "admin 토큰 파일이 비어 있습니다: $tokenFile" -ForegroundColor Red; exit 1
  }
  if ($t.StartsWith("sc_")) {
    # admin 은 sc_ 접두 금지(운영 규칙, ADR-012). user 토큰을 admin 경로로 등록하면
    # '전체조회'라고 안내하면서 실제로는 격리된 owner 로 붙는 오등록이 된다.
    Write-Host "admin 토큰이 sc_ 로 시작합니다 — user 토큰을 admin 경로로 등록하려는 것 같습니다. 개인 토큰은 -Token 을 쓰세요." -ForegroundColor Red; exit 1
  }
  Write-Host "admin(전체조회) 토큰으로 등록합니다 — 운영 예비 경로." -ForegroundColor Yellow
}
else {
  # 기본 경로 — per-user sc_ 토큰(자기 캡처만 조회, owner 격리).
  if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Host "sc_ 토큰이 필요합니다. 확장 설정 패널 '내 토큰 복사'로 얻어 -Token 으로 넘기세요." -ForegroundColor Red
    Write-Host "  예: .\register-mcp.ps1 -Token `"sc_xxxx.yyyy`"" -ForegroundColor DarkGray
    Write-Host "  (운영 전체조회가 필요하면: .\register-mcp.ps1 -Admin)" -ForegroundColor DarkGray
    exit 1
  }
  $t = $Token.Trim()
  if (-not $t.StartsWith("sc_")) {
    Write-Host "user 토큰은 sc_ 로 시작해야 합니다. admin 전체조회는 -Admin 을 쓰세요." -ForegroundColor Red
    exit 1
  }
}

# 1) Claude Code (user 스코프 — 전 프로젝트, 토큰은 헤더에 직접)
claude mcp add --scope user --transport http snapcontext $url --header "Authorization: Bearer $t"

# 2) Codex (전역 — 토큰은 env var 경유, config.toml 에 평문 미저장)
setx SNAPCONTEXT_MCP_TOKEN $t | Out-Null
codex mcp add snapcontext --url $url --bearer-token-env-var SNAPCONTEXT_MCP_TOKEN

Write-Host ""
Write-Host "=== 등록 완료. 확인: ===" -ForegroundColor Green
claude mcp list
codex mcp list
Write-Host ""
Write-Host "주의: setx 이후 새 터미널/VSCode 재시작해야 Codex 가 토큰을 읽음 (실행 중 프로세스 소급 안 됨)" -ForegroundColor Yellow
