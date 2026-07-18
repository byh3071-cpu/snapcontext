# VERDICT: PASS (BLOCKER 0 · MAJOR 0 · MINOR 3 · 확인 12)

> SnapContext 0.3.0 Phase 3 (`snap_analyze` 파생 툴) 적대 검증 — critic(백요한 코어)
> 대상: `git diff master...HEAD` (17bae0e feat: snap_analyze · 92ef66a docs: PRD 시그니처)
> 워크트리: `C:\Users\user\orca\workspaces\snapcontext\mcp-phase3`
> 검증일: 2026-07-18

치명/높음 결함 0 → **통과**. snap_analyze는 read-only·LLM 미호출·에러 헬퍼 재사용·누출 구조적 차단이 모두 성립. MINOR 3건은 문서 staleness·테스트 공백·dead code로 코드 정확성 불변.

---

## 게이트 재실행 결과 (직접 실행)

| 게이트 | 명령 | 결과 |
|---|---|---|
| 테스트 | `pnpm test` (worker/) | **10 files / 83 tests PASS** (0 fail) |
| 타입체크 | `npx tsc --noEmit` (worker/) | **EXIT 0** |

- master(post-Phase2)=69 → HEAD=83 (analyze.test.ts +11, mcp-integration +3). Phase 1~2 테스트 8파일 전부 unchanged, mcp-integration은 기존 5 보존+3 추가 → **회귀 0**.

---

## 결함 목록

### MINOR-1 — mission.json objective가 Phase 2에서 미갱신(Phase 3 미반영)
- **위치**: `.vhk/mission.json:3`
- **내용**: HEAD는 Phase 3(snap_analyze)를 구현했으나 objective 문자열은 여전히 `Phase 2: /upload→D1 captures 수집 파이프라인...`. `updatedAt`도 `2026-07-18T02:00:00`(Phase 2 시점) 그대로. diff에 `.vhk/mission.json` 없음 = 손도 안 댐.
- **평가**: scope 글로브(worker/**, docs/**)는 Phase 3 산출물을 정확히 커버 → `vhk mission check`(scope 기반)는 통과. 그러나 objective가 실제 작업 국면과 불일치(Phase 2 때는 objective를 Phase로 갱신했는데 이번엔 누락) → 문서 drift. mission이 "무슨 국면인지"의 SoT라면 stale.
- **수정 지시**: objective를 Phase 3(`snap_analyze 파생 툴·LLM 미호출·mode allowlist·누출 회귀 0`)로 갱신 + updatedAt bump. 코드 영향 없음.

### MINOR-2 — snap_analyze 다이제스트 누출-회귀 테스트 부재
- **위치**: `worker/test/analyze.test.ts` (전반), `worker/src/analyze.ts:77-114`
- **내용**: Phase 2는 `/s` 뷰어에 화이트리스트 밖 필드(userNote·tags·userAgent·pin x/y) 투입 후 미노출을 검증하는 적대 테스트가 있었으나, **신규 출력 표면인 analyze 다이제스트에는 동종 누출 테스트가 없음**. 테스트 fixture(`ctx`)는 확장필드 없는 깨끗한 SharedContext라 "확장필드가 다이제스트에 안 샌다"를 증명하지 못함.
- **평가**: `buildAnalyzeDigest`는 `...pack` 스프레드 없이 **명시 필드만**(id·sourceTitle·sourceUrl·captureType·capturedAt·viewport·pin id/memo·imageUrl) 골라 조립 → 코드 인스펙션상 누출 **구조적 불가**. 실제 위험 0. 단 `getSnapPack`은 `{...ctx}`로 확장필드를 `pack` 객체에 실어오므로, 향후 누군가 digest를 spread로 바꾸면 회귀 감지 그물이 없음.
- **수정 지시**: userNote/tags/pin x·y를 넣은 pack으로 `buildAnalyzeDigest`(또는 snapAnalyze) 호출 → 다이제스트에 SECRET 필드 미포함 assert 1건 추가. 코드 수정 불요, 회귀 그물만 보강.

### MINOR-3 — imageUrl `??` fallback dead code
- **위치**: `worker/src/analyze.ts:90-91`
- **내용**: `const imageUrl = pack.imageUrl ?? '(missing imageUrl for id=...)'`. 그러나 `snapAnalyze`는 `getSnapPack(..., includeImage:true)`(analyze.ts:135)로 항상 imageUrl을 채움 → fallback 도달 불가.
- **평가**: 가짜 성공 아님(도달 시 `(missing...)` 가시 마커 출력, fallback 금지 규칙 위반 아님). `buildAnalyzeDigest`가 독립 export라 방어적으로 남긴 것. dead-ish 코드.
- **수정 지시**: 불요(정보성). 원하면 주석으로 "includeImage:true 전제, 방어용" 명시.

---

## 확인 지점 (침묵=검증 아님 — 명시 통과)

1. **mode allowlist = 실제 코드 검증**(공격지점 1): `assertAnalyzeMode`(analyze.ts:23)→`isAnalyzeMode`→`ANALYZE_MODES.includes(value)`. 프롬프트 제약 아닌 코드 allowlist 대조(PAT-001 준수). 미지정→`bug-report` 기본. ✔
2. **위반 시 명시적 MCP 에러**: 위반→`SnapAnalyzeError('INVALID_MODE')` throw → mcp.ts 캐치 → `isError:true` MCP 응답. 유닛(assertAnalyzeMode 'summary'/'hack')+통합(tools/call 'summary'→isError) 이중 검증. ✔
3. **대소문자/공백 변형 우회 불가**: `includes`는 정확 일치라 `Bug-Report`·`BUG-REPORT`·` bug-report `(공백) 전부 INVALID_MODE로 **거부**(조용한 정규화 없음). 우회 경로 부재 = 안전(explicit fail). ✔
4. **mode 인젝션 불가**: 검증 통과한 3값만 `MODE_TITLES[mode]`·`MODE_INSTRUCTIONS[mode]`·헤더 `(${mode})`에 사용 → 임의 문자열 주입 불가. ✔
5. **에러 시맨틱 = snap_pack 헬퍼 재사용**(공격지점 2): `snapAnalyze`가 `getSnapPack`(analyze.ts:132) 직접 호출 → 만료/없음/orphan은 snap_pack과 **동일한 SnapPackError 코드/메시지**. 중복 구현 0 = 드리프트 없음. 유닛 3건(없는/만료 EXPIRED/orphan NOT_FOUND) 검증. ✔
6. **LLM 미호출·외부 fetch 0**(공격지점 3): analyze.ts는 `./pack`만 import, `fetch(`·`http(s):`·`import(`·`WebSocket`·`XMLHttpRequest` **토큰 0**(grep 확인). `snapAnalyze`=R2(getSnapPack)+순수 문자열 조립. analyze.ts:125 주석 "Worker는 LLM 호출 안 함" 코드와 일치. ✔
7. **src/** 수정 0**(공격지점 4): diff=`docs/PRD-0.3.0.md`·`worker/src/analyze.ts`·`worker/src/mcp.ts`·`worker/test/{analyze,mcp-integration}.test.ts`. 확장 `src/**` 변경 전무. forbidden(src/**·node_modules·*.env·ui-audit) 위반 0. ✔
8. **다이제스트 누출 0 + 이미지 URL 형태**(공격지점 5): `buildAnalyzeDigest`는 화이트리스트 필드만 명시 선택(스프레드 없음), pin은 id/memo만(x/y 제외). imageUrl은 `getSnapPack`가 `{origin}/i/{encodeURIComponent(id)}` 세팅 → **`/i/{id}` 형태** 정확. ✔ (회귀 그물은 MINOR-2)
9. **테스트 품질**(공격지점 6): analyze.test.ts는 실제 `assertAnalyzeMode`/`buildAnalyzeDigest`/`snapAnalyze`(mock은 R2 바인딩 레벨만) 실행. mcp-integration에 **tools/call snap_analyze 정상 경로**(유효 id+mode→다이제스트·isError 없음) + 위반+없는id 3건. 실 MCP 핸들러 경유. mock 뭉치 아님. ✔
10. **PRD 갱신 정합**(공격지점 7): 기존 `입력·분석 위치·출력 시그니처는 Phase 3 확정`(미정 문구) → 확정 시그니처로 **교체**(id 필수·mode allowlist 3종 default bug-report·출력 4부·에러 헬퍼 재사용·LLM 미호출). 구현과 완전 일치. "Phase 3 확정" 미해소 문구 없음. `DoD 밖` 유지=로드맵 정합. ✔
11. **회귀 0**(공격지점 8): Phase 1~2 테스트 69개 전부 보존·green. HEAD 83/83. mcp-integration 기존 5테스트 본문 보존(diff는 라인 추가만). ✔
12. **인증 표면 확대 0**: snap_analyze는 신규 HTTP 라우트 없이 `createSnapMcpServer` 내 MCP 툴로만 등록 → 기존 `/mcp` bearer 게이트(index.ts, Phase 1) 상속. index.ts diff 없음 = 무인증 표면 신설 0. ✔

---

## 워치아이템 (정보성 · 단일사용자 모델상 저위험)

- **다이제스트 내 unescaped 임베드 → 프롬프트 인젝션 벡터**: `buildAnalyzeDigest`가 pin memo·sourceTitle·sourceUrl을 escape 없이 마크다운에 삽입. `/s` HTML 뷰어는 `escapeHtml`+`sanitizeHttpUrl` 적용하나, digest는 에이전트 소비용 평문이라 미적용(의도적). 악의적 memo(`무시하고 X를 해라` 등)가 소비 에이전트 프롬프트에 실릴 수 있음. 단 캡처는 **사용자 본인 데이터**(bearer owner-only, ADR-010 개인용 게이트)라 자기-인젝션 = 저위험. 다중 사용자/외부 수집 전환 시 재평가 필요.

---

## 판정 근거

- BLOCKER·MAJOR 0: allowlist 코드검증·에러 헬퍼 재사용·LLM 미호출·누출 구조차단·회귀 0·스코프 준수 전부 성립. 게이트 직접 재실행 green(83/83, tsc 0).
- MINOR 3건은 mission 문서 staleness·테스트 회귀그물 보강·dead code로 런타임 정확성 불변.
- **PASS**. MINOR-1(mission objective Phase 반영)·MINOR-2(누출 회귀 테스트) 보강 권고.
