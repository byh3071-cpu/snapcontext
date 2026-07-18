# Phase 4 E2E 스모크 — 배포본 대상 (사람 실행용). 결과는 화면 + worker\e2e-results.txt
$ErrorActionPreference = "Continue"
Set-Location "C:\Users\Public\dev\products\snapcontext\worker"
$U = "https://snapcontext-worker.byh3071-26a.workers.dev"
$TOK = (Get-Content ".secret-bearer-token.txt" -Raw).Trim()
$R = @()
function Log($s) { $script:R += $s; Write-Host $s }

# ── negative (토큰 무관) ──
$c = curl.exe -s -o NUL -w "%{http_code}" -X POST "$U/mcp" -H "Content-Type: application/json" -d '{\"jsonrpc\":\"2.0\",\"id\":0,\"method\":\"ping\"}'
Log ("N1 no-bearer POST /mcp -> " + $c + " (기대 401)")
$c = curl.exe -s -o NUL -w "%{http_code}" -X POST "$U/mcp" -H "Authorization: Bearer wrong" -H "Content-Type: application/json" -d '{\"jsonrpc\":\"2.0\",\"id\":0,\"method\":\"ping\"}'
Log ("N2 wrong-bearer -> " + $c + " (기대 401)")
$c = curl.exe -s -o NUL -w "%{http_code}" -X OPTIONS "$U/mcp" -H "Origin: https://evil.example"
Log ("N3 evil-Origin OPTIONS -> " + $c + " (기대 403)")

# ── 테스트 캡처 업로드 (1x1 PNG) ──
$png = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
[IO.File]::WriteAllBytes("$PWD\e2e-test.png", $png)
$ctx = '{"v":1,"sourceUrl":"https://example.com/e2e","sourceTitle":"E2E smoke","captureType":"visible","capturedAt":"2026-07-18T12:00:00.000Z","viewport":{"width":1,"height":1},"pins":[{"id":"p1","memo":"e2e pin"}]}'
[IO.File]::WriteAllText("$PWD\e2e-ctx.json", $ctx)
$up = curl.exe -s -X POST "$U/upload" -F "image=@e2e-test.png;type=image/png" -F "context=<e2e-ctx.json" | ConvertFrom-Json
$id = $up.id
Log ("UP upload -> id=" + $id)

# ── MCP 본 스모크 ──
function Mcp($body) {
  return (curl.exe -s -X POST "$U/mcp" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d $body)
}
$init = Mcp '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-11-25\",\"capabilities\":{},\"clientInfo\":{\"name\":\"e2e\",\"version\":\"0\"}}}'
Log ("M1 initialize -> " + $init.Substring(0, [Math]::Min(200, $init.Length)))
$tl = Mcp '{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}'
Log ("M2 tools/list -> " + ($tl -match "snap_history") + "/" + ($tl -match "snap_pack") + "/" + ($tl -match "snap_analyze") + " (기대 True x3)")
$h = Mcp '{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"snap_history\",\"arguments\":{\"limit\":5}}}'
Log ("M3 snap_history 에 업로드 id 포함 -> " + ($h -match [regex]::Escape($id)) + " (기대 True)")
$pk = Mcp ('{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"snap_pack\",\"arguments\":{\"id\":\"' + $id + '\"}}}')
Log ("M4 snap_pack -> sourceUrl 포함=" + ($pk -match "example.com/e2e") + " isError=" + ($pk -match '\"isError\":true'))
$an = Mcp ('{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"snap_analyze\",\"arguments\":{\"id\":\"' + $id + '\",\"mode\":\"bug-report\"}}}')
Log ("M5 snap_analyze -> 핀 메모 포함=" + ($an -match "e2e pin") + " isError=" + ($an -match '\"isError\":true'))
$neg = Mcp '{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"snap_pack\",\"arguments\":{\"id\":\"00000000-0000-0000-0000-000000000000\"}}}'
Log ("M6 없는 id snap_pack -> isError=" + ($neg -match '\"isError\":true') + " NOT_FOUND=" + ($neg -match "NOT_FOUND") + " (기대 True/True — DoD 3)")
$bad = Mcp ('{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"tools/call\",\"params\":{\"name\":\"snap_analyze\",\"arguments\":{\"id\":\"' + $id + '\",\"mode\":\"Evil-Mode\"}}}')
Log ("M7 mode allowlist 위반 -> isError=" + ($bad -match '\"isError\":true') + " (기대 True)")

[IO.File]::WriteAllLines("$PWD\e2e-results.txt", $R)
Remove-Item "$PWD\e2e-test.png","$PWD\e2e-ctx.json" -Force -ErrorAction SilentlyContinue
Write-Host "=== E2E 완료 — 결과 저장: worker\e2e-results.txt ===" -ForegroundColor Green
