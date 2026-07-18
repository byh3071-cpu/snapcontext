VERDICT: PASS

# SnapContext 0.3.0 Phase 1 재검증 라운드 2

- 검토 범위: `git diff b1aaa8a...HEAD`
- 수정 커밋: `6c61b65`, `6ac64fe`, `a57ad7c`
- 재검증 대상: 1차 보고서의 BLOCKER 2건·MAJOR 5건·MINOR 1건
- 잔여: 0건

## 항목별 해소 여부

| # | 기존 지적 | 판정 | 파일:라인 및 검증 근거 |
|---|---|---|---|
| 1 | BLOCKER-1 — R2 1,000개 초과 backfill 누락 | 해소 | `scripts/backfill-d1.mjs:36-61`이 CF envelope를 보존하고, `scripts/lib/backfill-d1.mjs:46-89`가 `result_info.is_truncated/cursor`로 다음 페이지를 반복한다. `worker/test/backfill-d1.test.ts:81-116`은 1000+1개 2페이지, cursor 전달, 총 1,001개를 검증한다. Cloudflare 공식 List Objects 스키마의 `result_info.cursor`, `is_truncated`, 최대 `per_page=1000`과 일치한다. |
| 2 | BLOCKER-2 — mission scope 밖 `pnpm-lock.yaml` 변경·가짜 scope green | 해소 | `.vhk/mission.json:4-10`에 `pnpm-lock.yaml`이 명시적으로 추가됐다. `git diff --name-only b1aaa8a...HEAD`를 갱신된 scope/forbidden과 대조한 결과 범위 밖 파일과 forbidden 파일은 0개다. `vhk mission check`도 통과했다. |
| 3 | MAJOR-1 — `/mcp` OPTIONS가 Origin·bearer 게이트보다 먼저 실행 | 해소 | `worker/src/index.ts:58-74`에서 `/mcp` 분기가 전역 OPTIONS보다 먼저 실행되고 Origin을 우선 검사한다. 동일 Origin preflight만 200으로 허용하고 실제 MCP 메서드는 `worker/src/index.ts:68-73`에서 bearer 후 handler로 간다. `worker/test/mcp-route.test.ts:76-114`가 evil Origin OPTIONS 403, same-origin OPTIONS 200, 기존 비-MCP OPTIONS 200을 검증한다. |
| 4 | MAJOR-2 — `expires_at`을 client `capturedAt`으로 계산 | 해소 | `scripts/lib/backfill-d1.mjs:32-39`가 R2 `last_modified + 7일`을 계산하고, `scripts/lib/backfill-d1.mjs:98-115`가 누락/비정상 `last_modified`를 fail-closed 처리한다. `worker/test/backfill-d1.test.ts:119-149`가 과거·미래 client clock 반례를 검증한다. 공식 R2 응답 필드도 `last_modified` date-time임을 재확인했다. |
| 5 | MAJOR-3 — 이미지 없는 orphan pack을 성공 반환 | 해소 | `worker/src/pack.ts:25-64`가 JSON 조회 전에 `bucket.head(id)`로 이미지 실재·만료를 확인하고 orphan을 `NOT_FOUND`, 만료를 `EXPIRED`로 반환한다. `worker/test/pack.test.ts:104-119`가 JSON만 있는 orphan의 `NOT_FOUND`를 검증한다. |
| 6 | MAJOR-4 — 핵심 MCP 정상 경로·요청별 server 생성이 가짜 green | 해소(폴백) | `worker/test/mcp-integration.test.ts:17-28`은 `agents/mcp` transport만 MCP SDK `WebStandardStreamableHTTPServerTransport`로 대체한다. `worker/test/mcp-integration.test.ts:82-194`가 initialize→tools/list→`snap_history`→`snap_pack` 정상 경로를 실행하고, `worker/test/mcp-integration.test.ts:196-219`가 missing pack 오류 응답을 검증한다. `worker/src/mcp.ts:14-19`는 호출마다 실제 `new McpServer`를 만들며 `worker/test/mcp-integration.test.ts:221-262`가 두 연속 요청에서 생성 횟수 1→2를 확인한다. 실제 pool-workers는 아니지만 요청에서 허용한 폴백 기준에는 부합한다. |
| 7 | MAJOR-5 — worker npm lockfile과 pnpm lockfile 불일치 | 해소 | 커밋 `6c61b65`에서 `worker/package-lock.json`을 삭제하고 pnpm 단일 lockfile로 정리했다. `pnpm-lock.yaml:33-43`의 worker importer에 `@modelcontextprotocol/sdk`, `agents`, `zod`가 모두 존재하며 worker 테스트/typecheck에서 정상 해석됐다. |
| 8 | MINOR-1 — backfill 중간 실패의 부분 적재 상태 미보고 | 해소 | `scripts/lib/backfill-d1.mjs:123-141`이 실패 시 `inserted`, `failedId`, `scanned`, 재실행 안내를 담아 throw하고, `scripts/backfill-d1.mjs:130-139`가 checkpoint와 재실행 명령을 출력한다. `worker/test/backfill-d1.test.ts:152-169`가 두 번째 행 실패 시 `inserted=1`, `failedId=b`, `scanned=3`을 검증한다. `INSERT OR REPLACE` 멱등 재실행 정책도 유지된다. |

## 수정으로 인한 새 결함·모순 확인

- `b1aaa8a...HEAD` 변경 파일 전체를 기존 8건의 수정 범위에서 검토했다.
- lockfile 삭제와 mission scope 추가는 서로 일치하고, worker runtime 의존성은 pnpm lockfile에 남아 있다.
- `/mcp` 분기 우선화 후에도 비-MCP OPTIONS 동작은 보존됐다.
- pagination은 Cloudflare 공식 envelope와 일치하며 `last_modified` 메타데이터가 만료 계산까지 손실 없이 전달된다.
- `snap_pack`의 head 선검사로 missing/expired/orphan 오류 의미가 서로 모순되지 않는다.
- 기존 지적을 고치는 과정에서 명백한 BLOCKER급 신규 회귀는 발견하지 못했다. 요청에 따라 비-BLOCKER 신규 트집은 확장하지 않았다.

## 실행 검증

- worker: `pnpm.cmd exec vitest run --configLoader runner` — 8 files, 62 tests 통과.
- worker: `pnpm.cmd typecheck` — 통과.
- root: `pnpm.cmd exec vitest run --configLoader runner` — 2 files, 14 tests 통과.
- root: `pnpm.cmd exec tsc --noEmit` — 통과.
- `vhk mission check` — 통과.
- `git diff --check b1aaa8a...HEAD` — 오류 없음.
- build는 산출물 변경을 만들 수 있어 "보고서 파일만 작성" 조건에 따라 실행하지 않았다.

