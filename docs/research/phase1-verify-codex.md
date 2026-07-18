VERDICT: FAIL(BLOCKER 2건)

# SnapContext 0.3.0 Phase 1 적대 검증

- 검증 대상: `git diff master...HEAD` 중 커밋 `4e270e5`, `635c425`, `b1aaa8a`
- 기준: ADR-008/009/010, `docs/PRD-0.3.0.md` DoD·리스크, `.vhk/mission.json`
- 방식: 전체 변경 파일 정적 검토, 기준 문서 대조, root/worker 테스트·typecheck 실행, Cloudflare 공식 R2 API 응답 스키마 교차 확인

## 발견 목록

### BLOCKER-1 — backfill이 R2 1,000개 초과 페이지를 영구 누락한다

- 위치: `scripts/backfill-d1.mjs:36-49`, `scripts/backfill-d1.mjs:52-69`
- 근거: `cf()`는 Cloudflare 응답에서 `body.result`만 반환한다. R2 List Objects의 페이지 커서는 `body.result_info.cursor`에 있는데, `listAllR2Keys()`는 이미 배열만 남은 `result.cursor`를 읽는다. 따라서 첫 응답이 1,000개로 잘려도 `next`는 항상 `undefined`이고 즉시 종료한다. 공식 스키마: <https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/list>
- 재현/반례: R2에 `{id}.json`이 1,001개 있고 첫 API 응답이 `result: [1000개]`, `result_info: { is_truncated: true, cursor: "next" }`이면 두 번째 요청이 발생하지 않아 마지막 1개가 D1에 적재되지 않는다. 실행 결과도 `scanned=1000 inserted=1000`으로 성공처럼 보인다.
- 영향: ADR-009의 1회 초기 적재 및 PRD DoD #1의 history 완전성이 깨진다. 누락 사실도 보고되지 않아 재실행으로 회복되지 않는다.
- 수정 지시: `cf()`가 envelope의 `result`와 `result_info`를 함께 보존하게 하고 `result_info.is_truncated/cursor`로 반복한다. 실행 스크립트의 list 함수를 테스트 가능하게 분리한 뒤 2페이지(1000+1) API 응답 테스트를 추가한다.

### BLOCKER-2 — mission scope 밖 `pnpm-lock.yaml`을 변경했고 현재 mission check는 이를 놓친다

- 위치: `.vhk/mission.json:4-14`, `pnpm-lock.yaml:33`
- 근거: mission 허용 범위는 `worker/**`, `docs/**`, `scripts/**`, `.vhk/mission.json`뿐이다. 그런데 `git diff master...HEAD --stat`에 루트 `pnpm-lock.yaml` 2,431줄 변경이 포함된다. `vhk mission check`는 현재 working tree의 미커밋 변경만 보고 `변경 파일 0개`로 green을 냈으며, 검토 대상 커밋 diff는 검사하지 않았다.
- 재현/반례: `git diff --name-only master...HEAD` 결과를 mission glob으로 필터링하면 `pnpm-lock.yaml`이 유일한 범위 밖 파일로 남는다. 반면 같은 상태에서 `vhk mission check`는 위반 0을 출력한다.
- 영향: 절대 스코프 규칙과 PRD DoD #4(`vhk mission check` 위반 0)를 만족하지 않는다. 현재 green은 커밋된 변경을 검사하지 않는 가짜 green이다.
- 수정 지시: 의존성 잠금 파일 변경이 필요하면 먼저 mission scope에 루트 lockfile을 명시적으로 포함시키고 재승인하거나, worker 범위 안의 단일 패키지 매니저/lockfile 전략으로 정리한다. CI/검증은 working tree뿐 아니라 `master...HEAD` 경로도 mission glob과 대조해야 한다.

### MAJOR-1 — `/mcp`의 전역 OPTIONS 분기가 Origin·bearer 게이트보다 먼저 실행된다

- 위치: `worker/src/index.ts:58-68`
- 근거: 모든 `OPTIONS` 요청이 58~60행에서 즉시 `200` + `Access-Control-Allow-Origin: *`로 반환되어 63행 이후 `/mcp` Origin/bearer 검증에 도달하지 않는다. ADR-008은 Origin 불일치 403을 요구하고 ADR-010은 `/mcp` bearer 게이트를 요구한다.
- 재현/반례: `OPTIONS /mcp`에 `Origin: https://evil.example`을 넣고 Authorization을 생략해도 200과 wildcard ACAO가 반환된다. 같은 Origin의 `POST /mcp`만 403이다.
- 영향: 데이터 툴 호출 자체가 열리지는 않지만, ADR의 "Origin 헤더가 있는 HTTP 요청 검증"과 라우트 게이트 불변식이 깨지고 공격자 Origin에 preflight 성공을 광고한다.
- 수정 지시: `/mcp` 분기를 전역 OPTIONS보다 먼저 두고 Origin을 우선 검증한다. 브라우저 preflight에는 bearer 값이 실리지 않으므로 OPTIONS 인증 정책은 명시적으로 정하되, 적어도 불일치 Origin은 403으로 거부하고 실제 MCP 메서드는 항상 bearer를 통과시킨다. 이 순서를 worker fetch 통합 테스트로 고정한다.

### MAJOR-2 — backfill의 `expires_at`이 R2 업로드 시각이 아니라 신뢰할 수 없는 `capturedAt`에서 계산된다

- 위치: `scripts/backfill-d1.mjs:61-65`, `scripts/lib/backfill-d1.mjs:19-35`, `scripts/lib/backfill-d1.mjs:52-54`
- 근거: R2 lifecycle은 오브젝트 업로드 시각 기준 7일인데, 스크립트는 List Objects가 주는 `last_modified` 메타데이터를 버리고 클라이언트 JSON의 `capturedAt + 7일`을 `expires_at`으로 쓴다.
- 재현/반례: 2026-07-17에 업로드된 객체의 `capturedAt`이 2026-01-01이면 D1에는 2026-01-08 만료로 들어가 즉시 history에서 사라지지만 R2 객체는 2026-07-24까지 존재한다. 반대로 미래로 틀어진 클라이언트 시각이면 R2 삭제 후에도 history에 오래 잔존한다.
- 영향: ADR-009/PRD 리스크 표의 R2↔D1 만료 정합성을 직접 깨뜨린다.
- 수정 지시: list 응답의 실제 객체 `last_modified`(또는 동등한 R2 업로드 메타데이터)를 행까지 전달해 그 시각 + 7일로 `expires_at`을 계산한다. 과거/미래 client clock 반례를 테스트한다.

### MAJOR-3 — R2 이미지가 없는 orphan pack을 성공으로 반환한다

- 위치: `worker/src/pack.ts:32-59`, `worker/src/history.ts:33-42`, `worker/test/pack.test.ts:38-70`
- 근거: `getSnapPack()`은 `${id}.json`만 `get()`하고 본체 `{id}`에 `head()`를 하지 않는다. 테스트 fixture는 이미지 객체도 넣지만 구현이 이를 조회했는지는 검증하지 않는다. PRD 리스크 표는 조회 시 R2 `head`로 실재 확인을 대응책으로 명시한다.
- 재현/반례: bucket에 fresh `orphan.json`만 두고 `includeImage=true`로 호출하면 `isError` 없이 `/i/orphan` URL을 반환하지만 그 URL은 410이다. D1에 unexpired 행만 남고 R2가 조기 삭제된 경우 `snap_history`도 존재하지 않는 캡처를 계속 나열한다.
- 영향: "없는 id는 명시적 MCP 에러"라는 DoD #3과 인덱스/R2 정합 대응이 orphan 상태에서 무너진다.
- 수정 지시: 최소한 `snap_pack`에서 `{id}`의 `head()` 실재·만료를 확인한 뒤 JSON을 반환하고, 없으면 명시적 `NOT_FOUND/EXPIRED` MCP error로 변환한다. history의 orphan 정책도 ADR대로 확정하고 실제 R2 binding 테스트를 추가한다.

### MAJOR-4 — 테스트 green이 Phase 1 핵심 MCP 정상 경로를 한 번도 실행하지 않는다

- 위치: `worker/test/mcp-route.test.ts:34-74`, `worker/src/index.ts:70-72`, `worker/test/history.test.ts:14-43`, `worker/test/pack.test.ts:74-102`, `worker/test/backfill-d1.test.ts:44-69`
- 근거:
  - MCP route 테스트는 401/500/403의 사전 차단만 호출한다. 올바른 bearer 요청이 없어 동적 import, `createMcpHandler`, initialize, tools/list, tools/call은 전혀 실행되지 않는다.
  - missing/expired pack 테스트는 helper가 throw하는지만 보고, MCP tool 결과의 `isError: true`를 실제 JSON-RPC 응답에서 확인하지 않는다.
  - history mock이 자체적으로 filter/sort/slice를 수행해 실제 D1/migration/SQLite 동작을 검증하지 않는다.
  - backfill 테스트는 helper에 완성된 key 배열을 주므로 REST 응답 파싱, pagination, D1 INSERT, 중간 실패를 모두 건너뛴다.
  - Node 24에서 `typeof crypto.subtle.timingSafeEqual`은 `undefined`여서 auth 단위 테스트는 production timingSafeEqual 분기가 아니라 XOR fallback만 실행한다.
- 재현/반례: `handleMcpRequest()`가 항상 throw하도록 가정해도 현재 세 개 route 테스트는 모두 그대로 통과한다. 실제로 worker 48개 테스트는 green이지만 BLOCKER-1을 검출하지 못했다.
- 영향: PRD DoD #1~#3과 SDK 요청별 server 생성/응답 누출 방지를 테스트 결과로 주장할 수 없다.
- 수정 지시: `@cloudflare/vitest-pool-workers` 또는 동등한 Worker runtime에서 실제 migration/D1/R2 binding을 사용해 initialize → tools/list → `snap_history`/`snap_pack` tools/call을 통과시킨다. valid/missing/expired/orphan, 두 연속 요청의 신규 `McpServer`, 실제 `timingSafeEqual` 호출, 2페이지 backfill을 검증한다.

### MAJOR-5 — worker의 npm lockfile이 새 runtime 의존성과 불일치한다

- 위치: `worker/package.json:17-20`, `worker/package-lock.json:6-15`, `pnpm-lock.yaml:33-43`
- 근거: `worker/package.json`에는 `agents`, `@modelcontextprotocol/sdk`, `zod`가 추가됐지만 추적 중인 `worker/package-lock.json`의 root package에는 세 의존성이 모두 없다. 반면 루트 pnpm lockfile에만 worker importer가 갱신됐다.
- 재현/반례: 두 JSON을 기계 비교하면 세 항목 모두 `package=... / lock=MISSING`이다. worker 디렉터리의 기존 npm 기반 설치·배포 절차를 따르면 lockfile 재현성이 깨진다.
- 영향: 사용하는 패키지 매니저에 따라 서로 다른 dependency graph가 생기며, 독립 worker 배포/CI가 실패하거나 오래된 tree를 사용할 수 있다.
- 수정 지시: 프로젝트의 권위 있는 패키지 매니저를 하나로 고정한다. pnpm workspace가 권위라면 문서·CI·배포를 pnpm frozen-lockfile로 통일하고 mission scope를 수정한다. worker 독립 npm 흐름을 유지한다면 `worker/package-lock.json`을 새 의존성과 동기화한다.

### MINOR-1 — backfill 중간 실패는 부분 커밋을 남기지만 진행 상태를 보고하지 않는다

- 위치: `scripts/backfill-d1.mjs:96-118`, `scripts/backfill-d1.mjs:143-147`
- 근거: 각 행을 별도 D1 요청으로 커밋하므로 N번째 INSERT 실패 시 앞 N-1개는 남는다. top-level catch는 오류 문자열만 출력하고 이미 적재된 수/실패 id/checkpoint를 남기지 않는다.
- 재현/반례: 세 행 중 두 번째 `cf()`를 실패시키면 첫 행은 저장된 채 프로세스가 exit 1이지만 운영자는 부분 적재 범위를 알 수 없다.
- 영향: `INSERT OR REPLACE` 덕분에 동일 입력 재실행은 결과상 멱등이지만, 장애 진단·정확한 재개·동시 변경 보호가 약하다.
- 수정 지시: batch/transaction 또는 명시적 checkpoint를 사용하고 실패 시 `inserted`, 실패 id, 재실행 방법을 출력한다. N번째 실패 후 재실행 테스트를 추가한다. 기존 데이터를 덮어쓰지 않아야 한다면 `OR REPLACE` 대신 충돌 정책을 명시한다.

## 확인했으나 추가 결함을 찾지 못한 지점

- 인증 정상 분기: exact `/mcp`의 비-OPTIONS 요청은 Origin 검사 후 bearer 검사로 들어간다. secret 미설정/빈 문자열은 500 fail-closed, 불일치는 401 + `WWW-Authenticate: Bearer`다.
- timing 비교: production Workers 타입에는 `crypto.subtle.timingSafeEqual()`이 있고 구현은 SHA-256 고정 길이 digest 두 개를 해당 메서드로 비교한다. 원문 token의 직접 `===` 비교는 없다. 단, 현재 Node 테스트가 이 production 분기를 검증하지 않는 문제는 MAJOR-4에 기록했다.
- Origin 일반 요청: Origin이 있으면 request URL origin과 정확히 비교하고 불일치는 403이다. Origin이 없는 비브라우저 MCP client는 허용한다. 우회는 전역 OPTIONS 순서에서만 확인됐다.
- 기존 v0.2 라우트: `master...HEAD`의 `/upload`, `/i/{id}`, `/s/{id}` 본문 로직 변화는 변수명 변경과 fetch의 `ctx` 인자 추가뿐이다. CORS Allow-Headers에 `Authorization`이 추가됐다. 기존 `/i`, `/s` 회귀 테스트는 통과했으나 `/upload` Worker fetch 회귀 테스트는 없다.
- D1: migration의 7개 컬럼·PK·`created_at DESC` 인덱스는 ADR-009와 일치한다. history는 `expires_at > ?`, `ORDER BY created_at DESC`, `LIMIT ?`를 사용하고 값은 `.bind()`로 전달해 확인 범위에서 SQL injection 문자열 조립은 없다. MCP 입력 limit은 1~100 정수로 제한된다.
- `snap_pack` 오류 변환: helper의 missing/expired는 `SnapPackError`를 throw하고 tool callback은 `isError: true`로 변환한다. 실제 MCP 응답 검증 부재는 MAJOR-4에 기록했다.
- 요청별 server: `worker/src/mcp-route.ts:11-16`에서 요청마다 `createSnapMcpServer()`를 호출한 뒤 handler를 생성하므로 SDK 응답 누출 방지 방향을 준수한다. 이를 두 요청으로 증명하는 테스트는 없다.
- backfill SQL: 값은 `params` 배열로 바인딩되어 SQL injection 조립은 없고, `id` PK + `INSERT OR REPLACE`라 동일 입력 반복 시 중복 행은 생기지 않는다.
- scope: `src/**`, `worker/node_modules/**`, `**/*.env`, `docs/ui-audit/**` 변경은 diff에서 발견되지 않았다. 범위 밖 변경은 BLOCKER-2의 `pnpm-lock.yaml` 1개다.

## 실행 검증 결과

- `pnpm.cmd exec vitest run --configLoader runner` (root): 2 files, 14 tests 통과.
- `pnpm.cmd exec vitest run --configLoader runner` (worker): 7 files, 48 tests 통과.
- root `tsc --noEmit`: 통과.
- worker `tsc --noEmit`: 통과.
- 기본 `pnpm test`와 `wrangler dev`는 이 검증 sandbox가 상위 디렉터리 read와 사용자 홈의 Wrangler/npm log/cache write를 차단해 실행 환경 오류가 났다. config loader를 runner로 바꾼 테스트 결과는 위와 같다. 배포 Worker 실호출 성공으로 해석하지 않았다.
- `vite build`/worker build는 산출물 변경을 만들 수 있어 "보고서 1개만" 제약에 따라 실행하지 않았다.

