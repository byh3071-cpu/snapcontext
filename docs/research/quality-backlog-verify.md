# VERDICT: PASS (BLOCKER 0 · MAJOR 0 · MINOR 0 · 정보성 3)

> SnapContext 0.3.x 품질 백로그(B1–B5) 적대 검증 — critic(백요한 코어)
> 대상: `git diff master...HEAD` (cbf3c0f · 246줄, 대부분 테스트)
> 워크트리: `C:\Users\user\orca\workspaces\snapcontext\quality-backlog`
> 검증일: 2026-07-18

이번 라운드는 내가 Phase 2/3 보고서에서 지적한 MINOR들의 **해소 검증**. 5개 항목 전부 실효적으로 해소됨(가짜 통과·약한 assert·mock 재탕 없음). 치명/높음 0 → **통과**.

---

## 게이트 재실행 결과 (직접 실행)

| 게이트 | 명령 | 결과 |
|---|---|---|
| 본 스위트 | `vitest run` | **10 files / 86 tests PASS** |
| D1 왕복 | `vitest run --config vitest.d1.config.mts` | **1 file / 1 test PASS** (pool-workers/miniflare) |
| 통합 | `pnpm test` (위 둘 `&&`) | **전부 PASS** |
| 타입체크 | `npx tsc --noEmit` | **EXIT 0** |

- master(post-0.3.0)=83 → HEAD 본 86 (analyze +1, upload-ingest +2) + test-d1 1. 기존 83 전부 보존, 삭제 0 → **회귀 0**.

---

## 항목별 판정

### B1 — analyze 누출-회귀 테스트 → 해소 (강한 assert 확인)
- **위치**: `worker/test/analyze.test.ts:123-152`
- **검증**: `leaky` fixture에 `userNote:'SECRET_NOTE'`·`tags:['SECRET_TAG']`·`userAgent:'SECRET_UA'`·`pins:[{id,memo,x:99,y:88}]` 주입 후 실제 `snapAnalyze` 호출. assert: `핀메모OK`·`/i/leak` **포함** + `SECRET_NOTE`·`SECRET_TAG`·`SECRET_UA`·`userNote`·`userAgent` **미포함** + `\b99\b`·`\b88\b`(pin x/y) **미매치**. 값+키+좌표 3층 검증이라 우회 불가.
- **반례 시도**: fixture(viewport 1280×720·pin id 1·capturedAt 2026-07-10)에 99/88이 타 필드로 등장할 여지 없음 → x/y assert가 진짜로 x/y 누출만 잡음. `buildAnalyzeDigest`는 여전히 명시필드 pick(스프레드 없음)이라 구조적 clean + 이제 회귀 그물까지 확보. **약한 assert 아님.** ✔

### B2 — /upload malformed context console.warn → 해소 (동작 불변 확인)
- **위치**: `worker/src/index.ts:145-149`(warn), `worker/test/upload-ingest.test.ts:234-254`(테스트)
- **검증**: `hasContext && shared===null` 경로에 `console.warn('[upload] context present but JSON parse failed; D1 index skipped', { id })` 추가. **로그는 id(UUID)만** — malformed 본문·PII 미기록(로그 누출 없음). 업로드는 그대로 200 반환(fall-through). 테스트가 200·id·R2 이미지+json 잔존·`inserts.length===0`·warn 정확 인자(`{ id }`)까지 검증.
- **동작 불변**: warn은 관측만 추가, 분기·응답·저장 동작 변화 0. ✔

### B3 — cleanup 실패에도 500 유지 → 해소 (테스트 실효성 확인)
- **위치**: `worker/test/upload-ingest.test.ts:219-232`
- **검증**: `makeUploadEnv({ d1Fail:true, cleanupFail:true })`로 `bucket.delete`가 throw하도록. `cleanupUploadObjects`는 `Promise.allSettled`라 delete 예외를 삼킴 → 핸들러는 명시적 `textResponse(...,500)` 반환. assert: status **정확히 500**·본문 길이>0·`objects.size>0`(orphan 잔존 허용).
- **실효성**: cleanup가 만약 `Promise.all`이었다면 catch 내 await가 reject→`worker.fetch` 거부→`await postUpload` throw→테스트 실패. **테스트 통과 자체가 allSettled best-effort 보장을 증명**. 조용한 성공 경로 없음. ✔

### B4 — 실 D1 왕복 → 해소 (진짜 pool-workers, mock 재탕 아님)
- **위치**: `worker/vitest.d1.config.mts`·`worker/test-d1/apply-migrations.ts`·`worker/test-d1/d1-roundtrip.test.ts`
- **검증 — 실 D1 증거 3중**:
  1. 테스트가 `import { env } from 'cloudflare:workers'`·`applyD1Migrations` from `'cloudflare:test'` 사용 — **가상 모듈은 pool-workers 런타임에서만 resolve**. node 환경이면 import 실패로 로드 불가. 1 passed = 워커/miniflare 런타임에서 실행됨.
  2. setup(`apply-migrations.ts`)가 `readD1Migrations(worker/migrations)`로 **실 `0001_captures.sql`**을 miniflare D1(SQLite)에 적용.
  3. 테스트가 실 `insertCapture`(prepared INSERT) 3행 → 실 `listCaptures`(SELECT WHERE expires_at>? ORDER BY created_at DESC LIMIT ?) → 만료행 제외·DESC 정렬을 **실 SQLite가 판정**. mock이 재구현하던 필터/정렬(Phase 2 MINOR-4c 공백)이 실 SQL로 대체됨.
- **격리**: 단일 파일·단일 테스트, 신규 miniflare D1 per run. `toEqual(['alive-new','alive-old'])`가 통과 = 잔여행 없음(격리 clean). mock 재탕이면 `cloudflare:workers` env를 안 쓸 것 → 재탕 아님. ✔
- **exclude 회귀 없음**: `vitest.config.ts` include=`test/**` + exclude=`test-d1/**`. D1 테스트는 test-d1/라 본 스위트에 애초 미포함 + exclude로 이중 차단. 본 86/86 green = 기존 스위트 무손상. ✔

### B5 — analyze.ts dead code 제거 → 해소 (부작용 없음)
- **위치**: `worker/src/analyze.ts:90`(제거), `:108`(직접 사용)
- **검증**: `pack.imageUrl ?? '(missing...)'` 제거하고 `pack.imageUrl` 직접 사용 + "includeImage:true가 항상 채움" 주석. `snapAnalyze`가 유일 호출자이며 항상 `includeImage:true` → imageUrl 불변 존재. tsc EXIT 0(타입 안전), analyze 12/12 green. 부작용 0.
- **정보성**: `buildAnalyzeDigest`는 독립 export라, imageUrl 없는 pack을 **직접** 넘기는 외부 호출자에겐 ④섹션이 빈 문자열(join이 undefined 드롭)이 됨(구 마커 `(missing)` 소실). 현재 호출자 없음 + 주석이 불변 명시라 실질 무영향. (해당 제거는 P3에서 내가 dead code로 지적한 것의 이행)

### B6 — 회귀·스코프
- **회귀 0**: master 83 테스트(analyze 11·auth 8·backfill 9·history 3·index 6·lib 20·mcp-integration 8·mcp-route 6·pack 5·upload-ingest 7) 전부 HEAD 보존. 증가분은 analyze 11→12·upload-ingest 7→9뿐. ✔
- **src/** 변경 0**: diff = `docs/research/quality-backlog-notes.md`·`pnpm-lock.yaml`·`worker/package.json`·`worker/src/{analyze,index}.ts`·`worker/test-d1/*`·`worker/test/*`·`worker/vitest*`. 확장 `src/**` 전무. forbidden 위반 0. ✔
- **mission scope**: 전 변경 파일이 scope(worker/**·docs/**·pnpm-lock.yaml) 내. objective는 상류(릴리즈 커밋)에서 이미 `Phase 3 완료 · 다음=Phase 4 릴리즈 게이트`로 갱신됨(P3 MINOR-1 해소 확인). ✔

---

## 정보성 (통과 무관 · 나중 다듬기)

1. **`.vhk/mission.json:19` updatedAt 미bump**: objective 내용은 Phase 3로 갱신됐으나 updatedAt은 `2026-07-18T02:00:00`(Phase 2 시점) 그대로. 이번 diff 밖(상류)이라 여기서 손댈 것 없음. Phase 4 갱신 시 타임스탬프도 bump 권고.
2. **B1 assert의 fixture 결합**: `\b99\b`/`\b88\b` 부재 검사는 fixture에 99/88이 pin x/y로만 등장한다는 전제에 결합. 견고하나, `not.toContain('tags')`(키명) 미검(값 `SECRET_TAG`는 검증됨). 실질 누출 그물엔 충분.
3. **B5 직접-호출자 방어 소실**: 위 B5 정보성 참조. 현 호출자 없어 무영향.

---

## 판정 근거

- B1~B5 전부 **실효적 해소**: 강한 누출 assert·관측 로그(본문 미기록)·allSettled 500 보장 테스트·진짜 pool-workers D1 왕복(실 마이그레이션+실 SQL)·부작용 없는 dead code 제거.
- 게이트 직접 재실행 green: 본 86/86 + D1 1/1 + tsc 0. 회귀 0·src/** 0·mission scope 준수.
- BLOCKER·MAJOR·MINOR 0. **PASS**.
