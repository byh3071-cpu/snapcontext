# VERDICT: PASS (BLOCKER 0 · MAJOR 0 · MINOR 5 · 확인 12)

> SnapContext 0.3.0 Phase 2 (`/upload`→D1 captures 수집 파이프라인) 적대 검증 — critic(백요한 코어)
> 대상: `git diff master...HEAD` (68b779d·a1eff41·a844d46·f61d6a9)
> 워크트리: `C:\Users\user\orca\workspaces\snapcontext\mcp-phase2`
> 검증일: 2026-07-18

치명/높음 결함 0 → **통과**. 단, ADR-010 내부 모순(MINOR-1)은 Phase 4 착수 전 반드시 정정 권고.

---

## 게이트 재실행 결과 (직접 실행)

| 게이트 | 명령 | 결과 |
|---|---|---|
| 테스트 | `pnpm test` (worker/) | **9 files / 69 tests PASS** (0 fail) |
| 타입체크 | `npx tsc --noEmit` (worker/) | **EXIT 0** (에러 0) |
| vite build | — | worker는 vite 미사용(wrangler). DoD의 `vite build`는 확장 `src/**` 대상이며 이번 diff에서 `src/**` 변경 0 → 영향 없음. worker 빌드(`wrangler deploy`)는 Phase 4 사람 게이트 |

- 기존 8개 Phase 1 테스트 파일 전부 unchanged, `upload-ingest.test.ts`(+7) 신규 추가 → 62→69. Phase 1 회귀 0.

---

## 결함 목록

### MINOR-1 — ADR-010 내부 모순: 결정 #3와 결과 절이 /upload bearer 시점 상충
- **위치**: `docs/adr/010-mcp-auth-ingestion.md:25` vs `:32`
- **내용**: 결정 #3(line 25)은 여전히 `적용 라우트: /upload(Phase 2)·/mcp(...Phase 1)` 로 /upload bearer를 **Phase 2**로 명시. 그러나 결과 절(line 32)은 `/upload bearer 게이트는 Phase 4로 이연`으로 재서술. 한 ADR 안에서 결정 절과 결과 절이 시점을 상충 기재. 이연 사유 3개(확장 무인증 계약 의존·src/** 동결·/mcp 이미 fail-closed)는 각각 사실 정확하나, **결정 본문이 갱신되지 않아** Phase 4 구현자가 원 결정을 오독할 위험.
- **재현**: ADR-010을 Phase 4 진입 시점에 열면 "결정=Phase 2, 결과=Phase 4" 상반 지시.
- **수정 지시**: 결정 #3의 `/upload(Phase 2)`를 `/upload(Phase 4 이연 — 결과 절 참조)`로 정정하거나 인라인 노트 추가. 이연은 append가 아니라 **결정과 결과 동기화**로 마감할 것.

### MINOR-2 — context 존재하나 JSON 파싱 실패 시 D1 인덱싱 조용히 스킵(관측 불가)
- **위치**: `worker/src/index.ts:128-144`
- **내용**: `hasContext`(context 문자열 length>0)가 참이어도 `parseSharedContext(context)`가 `null`(malformed JSON)이면 `if (shared)` 거짓 → INSERT 스킵 후 200 반환. R2에는 raw context가 `{id}.json`으로 저장되나 D1 행 없음 → snap_history 미노출. 실패·스킵 신호(로그·메트릭) 전무.
- **평가**: 기존 `/s` 뷰어의 malformed-context 그레이스풀 저하(이미지만 렌더)와 **일관**되어 설계상 방어적. 확장은 항상 유효 SharedContext를 보내고 `src/**` 동결이라 실 클라이언트에서 도달 불가. 다만 fallback 금지 규칙(조용한 우회) 관점에서 무관측 스킵은 흔적을 남겨야 함.
- **수정 지시**: malformed-but-present 케이스에 구조적 로그 1줄(`console.warn`) 추가해 인덱스 미적재를 탐지 가능하게. 우선순위 낮음.

### MINOR-3 — 스코프 자기확장: pnpm-workspace.yaml을 같은 PR 안에서 mission scope에 편입
- **위치**: `.vhk/mission.json:10` (f61d6a9), `pnpm-workspace.yaml` (68b779d)
- **내용**: 커밋 순서상 68b779d가 `pnpm-workspace.yaml`을 먼저 편집한 시점에는 mission scope에 해당 파일이 없었고, 마지막 커밋 f61d6a9에서 scope에 추가. 즉 구현자가 자신의 변경을 정당화하려고 scope를 확장. `vhk mission check`는 HEAD 기준 평가라 최종 통과하지만, 자기승인 패턴.
- **평가**: 루트 `pnpm-lock.yaml` 단일화(이미 scope 내)의 필연 부산물이고 상위 태스크가 "pnpm workspace 정식화"를 Phase 2 산출물로 명시 → **태스크 인가 + 필연성 인정**. 지휘자 확정 결정 목록엔 미포함이라 경계선.
- **수정 지시**: 코드 수정 불요. 향후 루트 파일 편집은 scope 확장을 **선행 커밋**으로 분리하거나 지휘자 확정 결정에 명시해 자기승인 외형 제거.

### MINOR-4 — 테스트 커버리지 공백 3건
- **위치**: `worker/test/upload-ingest.test.ts`
- **내용**:
  (a) `hasContext=true` + `parseSharedContext=null`(malformed) 경로(INSERT 스킵+200) 미검증 — MINOR-2 케이스.
  (b) D1 실패 + cleanup delete 자체 실패 시에도 500 반환되는지 미검증(`Promise.allSettled`가 보장하나 회귀 테스트 없음).
  (c) snap_history 통합 테스트가 D1 mock의 `all()`에 필터/정렬을 **재구현**해 의존 → 실제 SQL(`WHERE expires_at > ? ORDER BY created_at DESC LIMIT ?`) 정합은 어떤 테스트도 실 D1/miniflare로 검증 안 함. (Phase 1부터의 구조적 한계, Phase 2가 신설한 것 아님)
- **수정 지시**: (a)(b)는 단위 테스트 2건 추가로 즉시 보강 가능. (c)는 Phase 4 배포본 E2E에서 실 D1 왕복으로 커버 예정 → 로드맵과 정합, 지금 필수는 아님.

### MINOR-5 — created_at/expires_at(서버 nowMs, PUT 이전) vs R2 uploaded(PUT 이후) 미세 시각 편차
- **위치**: `worker/src/index.ts:109` (nowMs 캡처) → `:114` (R2 PUT) → `worker/src/ingest.ts:27`
- **내용**: D1 `expires_at = nowMs + 7d`(nowMs는 R2 PUT 직전 캡처). `/i`·`/s`·snap_pack의 만료는 R2 `uploaded`(PUT 시각, nowMs보다 수~수십 ms 늦음) 기준. 따라서 D1 `expires_at`이 R2 실만료보다 PUT 레이턴시만큼 이르게 계산 → snap_history가 이미지 실만료 직전 수 ms 동안 행을 먼저 감춤.
- **평가**: 7일 창의 극단 꼬리에서 sub-second 편차. 실무상 무영향. 정합성 기록용.
- **수정 지시**: 불요(정보성). 완벽 정합 원하면 R2 PUT 후 `head().uploaded`를 D1 created_at으로 쓸 수 있으나 추가 head 왕복 대비 이득 없음.

---

## 확인 지점 (침묵=검증 아님 — 명시 통과)

1. **id = R2 키 동일**: `crypto.randomUUID()` 1회 생성(`index.ts:108`)을 R2 `BUCKET.put(id,...)`·`captureRowFromSharedContext(id,...)`·응답 url·cleanup 키에 동일 사용. ✔
2. **expires_at = 업로드 시각 + 7일, 클라이언트 시각 오염 0**: `nowMs = Date.now()`(서버, `:109`) + `MAX_AGE_MS`(=7d). 클라이언트 `capturedAt`는 만료·정렬에 **미사용**. ingest.ts:13 주석이 "서버 now 기준" 명시. ✔ — 공격지점 1의 핵심 우려 불성립.
3. **created_at = 서버 nowMs**. 클라이언트 시각 미사용. ✔
4. **소스 필드 매핑**: `url←sourceUrl`, `title←sourceTitle`, `capture_type←captureType`(각 `typeof==='string'` 가드), `pin_count←pins.length`(Array.isArray 가드). ✔
5. **ADR-009 스키마 정합**: INSERT 컬럼 7개 = migration `0001_captures.sql` = ADR-009 §3 테이블 정의 완전 일치(id PK, created_at, url, title, capture_type, pin_count, expires_at). ✔
6. **실패 경로 — R2 PUT 성공→D1 실패→정리**: `cleanupUploadObjects`가 `wroteJson` 참일 때 `[id, {id}.json]` **둘 다** 삭제(`allSettled`). D1 INSERT는 hasContext 참일 때만 → wroteJson 참 보장 → 이미지+JSON 동시 정리. 테스트(`:205-211`)가 두 키 삭제 + `objects.size===0` 검증. ✔
7. **정리 실패해도 조용한 성공 없음**: cleanup는 best-effort(allSettled, 오판 없음)이나 그와 무관하게 **항상 500 반환**(`index.ts:138`). R2 orphan은 7일 lifecycle + expires_at 필터가 흡수(ADR-009 정책). 가짜 성공 경로 부재. ✔
8. **5xx 실측 검증**: 테스트 `:201-202`가 `status ∈ [500,600)` + 본문 길이>0 확인. ✔
9. **context 없는 업로드(이미지만)**: hasContext 거짓 → JSON PUT·D1 INSERT 없음, 200 `{id,url}`. D1 행 미생성으로 일관. 테스트 `:179-191` 검증. ✔
10. **누출 0**: `/s` 뷰어(`buildViewerHtml`)·snap_history 응답에 신규 필드 없음. D1은 화이트리스트 파생 7컬럼만 저장(userNote·tags·userAgent·pin x/y 미저장). snap_history는 `expires_at`도 응답에서 drop. SharedContext 타입 `lib.ts:5-13` 미확장. 테스트 `:248-301`(SECRET_NOTE/TAG/UA·x99 미노출) 검증. ✔
11. **회귀 0**: `/i`·`/s`·`/mcp` 블록 unchanged(diff는 `/upload` 블록만 편집). 응답 스키마 `{id,url}` 불변(테스트 `:303-312` Object.keys 검증). Phase 1 테스트 8파일 전부 unchanged. ✔
12. **스코프 — src/** 변경 0**: `git diff --name-only`= `.vhk/mission.json`·`docs/adr/010-*`·`pnpm-workspace.yaml`·`worker/src/index.ts`·`worker/src/ingest.ts`·`worker/test/upload-ingest.test.ts`. 확장 `src/**` 변경 전무. forbidden(`src/**`·node_modules·*.env·ui-audit) 위반 0. ✔

---

## 워치아이템 (diff 밖·정보성)

- **D1 미프로비저닝**: `worker/wrangler.jsonc:16` `database_id="00000000-..."`(플레이스홀더), `:15` 주석이 `wrangler d1 create`를 **Phase 4 사람 게이트**로 이연. 따라서 Phase 2 수집 파이프라인은 **코드·테스트 완결이나 실 D1 런타임 실증 불가**(전부 mock). 로드맵 Phase 4가 배포본 E2E를 명시하므로 phased 모델과는 정합. 단 **ADR-009 §결과는 D1 생성을 "Phase 1 착수 시 1회 확인" 사람 게이트로 기재** → wrangler 주석(Phase 4)과 시점 상충. 이번 diff 밖 선존 불일치지만 MINOR-1과 함께 시점 정합 정리 권고.
- **snap_pack `...ctx` 스프레드**(`worker/src/pack.ts:72`): 저장 JSON에 화이트리스트 밖 필드가 있으면 그대로 반환. 그러나 bearer 게이트(owner-only) 뒤 + Phase 1 선존 동작 + 이번 diff 미변경 → Phase 2 누출 아님. parseSharedContext가 `v===1`/필수필드 미검증(빈 객체 `{}`도 통과→빈 문자열 행 INSERT)인 점도 선존.

---

## 판정 근거

- BLOCKER·MAJOR 0: 기능 파손·보안 노출·회귀·스코프 위반 없음. 게이트(test 69/69, tsc 0) 직접 재실행 green.
- MINOR 5건은 전부 문서 정합·관측성·테스트 보강·정보성으로 코드 정확성 불변.
- **PASS**. 단 MINOR-1(ADR-010 결정/결과 시점 모순)은 Phase 4 오독 방지를 위해 정정 강력 권고.
