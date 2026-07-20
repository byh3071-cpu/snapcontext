# SnapContext — AGENTS.md (에이전트 작동 규약)

> ⚡ 이 파일은 RULES.md에서 자동 생성됨 (vhk sync). 직접 수정 금지.
> 빠른 시작(토큰 절감): `docs/context/agent-compact.md` 를 먼저 읽으세요.

## Loop Protocol
- 루프: `context → goal next → 작업 → goal check → goal done`
- 작업 시작 시 `.vhk/HARD_STOP` 확인 — 있으면 모든 자동화 즉시 중단.
- active goal 만 작업. `docs/state`(next-task/blockers)는 append-only.
- 교훈·결정·실패·성공은 `vhk memory`(memory v2 4버킷, 단일 출처).
- 게이트(tsc / test:run / build) 통과해야만 `vhk goal done`.

## 기술 스택 (변경 시 ADR 필수)
- Manifest V3
- Vite + @crxjs/vite-plugin
- TypeScript strict (any 금지, as 최소화)
- Vanilla TS + CSS (React/Preact 사용 금지)
- Side Panel API (chrome.sidePanel)
- CSS 변수 기반 dark productive 테마

## 아키텍처 규칙
### 메시지 흐름 (절대 규칙)
- SidePanel → Background → Content Script (단방향 허브)
- SidePanel ↔ Content Script 직접 통신 금지
- 모든 메시지는 src/utils/messaging.ts 타입-세이프 래퍼 사용
- 새 메시지 타입 추가 시 src/types/index.ts에 먼저 정의

### 모듈 책임
- background/ → 메시지 라우팅, captureVisibleTab, 확장 lifecycle
- sidepanel/ → UI 렌더링, 사용자 인터랙션, 상태 관리
- content/ → DOM 접근, 요소 선택 오버레이 (읽기 전용, DOM 수정 최소화)
- capture/ → 캡처 로직 (visible/element/document)
- context-pack/ → Pack 생성, 프롬프트 빌드 (순수 함수)
- storage/ → chrome.storage 래퍼 (유일한 스토리지 접근점)
- utils/ → 메시지, 이미지 처리 공통 유틸

### 금지 사항
- 모듈 간 순환 참조 금지
- background에서 DOM API 사용 금지 (Service Worker 환경)
- content script에서 chrome.storage 직접 접근 금지 (background 경유)
- src/ 외부 파일에서 런타임 코드 import 금지

## 코딩 규칙
### 작업 3원칙 (절대 — 모든 작업 전 적용)
1. **스코프 고정** — 작업은 선언된 scope 안에서만. `.vhk/mission.json` 의 `scope`/`forbidden` 위반 금지.
   요청하지 않은 파일·기능·리팩토링을 임의로 건드리지 않는다.
2. **fallback 금지** — 에러·실패를 조용히 우회하는 fallback·임시 회피 금지.
   빈 catch, 더미 반환값, 가짜 성공(success) 금지. 실패는 드러내고 근본 원인을 고친다.
3. **test-first** — 구현 전 테스트 먼저. 기능·버그픽스는 실패하는 테스트를 먼저 작성한 뒤 구현한다.

### DoD (Definition of Done — 완료 판정 3게이트)
- ✅ **테스트 green** — `pnpm test` 전부 통과.
- ✅ **스코프 내 변경만** — `vhk mission check` 위반 0 (scope 밖 / forbidden 변경 없음).
- ✅ **tsc + build 통과** — `tsc --noEmit` 에러 0 + `vite build` 성공.

### 언어
- 모든 응답·코드 주석·커밋 메시지 한국어. 기술 용어는 영어 허용하되 남발 금지.

### TypeScript
- strict: true, any 금지
- 타입은 src/types/index.ts에 중앙 관리
- 인터페이스 > type alias (확장 가능성)
- enum 대신 const object + typeof 패턴 사용

### 에러 처리
- 모든 chrome API 호출은 try-catch
- 에러는 Side Panel에 toast로 표시
- console.error는 개발 중만. 프로덕션 빌드에서 제거
- 절대 에러를 삼키지 않음 (빈 catch 금지 — 3원칙 fallback 금지와 동일)

### 이미지 처리
- v0.1: base64 (data:image/png;base64,...)
- v0.2: Storage URL로 교체 예정
- crop 시 devicePixelRatio 반드시 고려
- Service Worker에서는 OffscreenCanvas 또는 chrome.offscreen API 사용

### CSS
- CSS 변수로 테마 토큰 관리 (global.css)
- BEM 네이밍 또는 컴포넌트별 프리픽스
- !important 사용 금지 (content script 오버레이 제외)
- Side Panel 최소 너비 300px 반응형

## 커밋 컨벤션
- feat: 새 기능 / fix: 버그 수정 / refactor: 리팩토링 / docs: 문서 변경 / chore: 빌드·설정 변경
- 예: `feat: add element capture with overlay`

## 기술 스택 (변경 시 ADR 필수)
- Manifest V3
- Vite + @crxjs/vite-plugin
- TypeScript strict (any 금지, as 최소화)
- Vanilla TS + CSS (React/Preact 사용 금지)
- Side Panel API (chrome.sidePanel)
- CSS 변수 기반 dark productive 테마

## 기록 규칙
- 새 라이브러리/API/패턴 선택 → docs/adr/ 에 ADR (YAML 프론트매터: id, date, tags)
- 기능 완성 → docs/log/YYYY-MM-DD-{작업명}.md (세션·마일스톤 로그)
- 에러 해결 → docs/troubleshooting/ (재현·원인·해결)
- 새로 배운 것 → docs/til.md 에 한 줄
- 스키마/타입 변경 → docs/changelog.md 에 기록

<!-- YOHAN-ROSTER-CARD:BEGIN (managed by yohan-brain ops/propagation ??SoT瑜?怨좎퀜?? 吏곸젒?섏젙 湲덉?) -->
## 상시 지휘자 — 라우팅 카드 (yohan ecosystem)

> SoT: yohan-brain `memory/core/agent-roster.yaml` `conductor_always_on` (v0.4+, status=active면 obey).
> 이 레포 자체 규칙(RULES/CLAUDE LIVE)이 있으면 그게 우선(precedence).

- 모든 태스크: 해법 구상 **전에** 크기 판정 → `라우팅: S|M|L — 계획 1줄 (근거: 파일수/신규설계/리스크)` 선언 후 진행. 키워드("풀개발") 불필요, 항상.
- **S**(≤2파일·신규설계 없음·≤15분): 지휘자 단독. 서브에이전트·orca 금지(오버헤드).
- **M**(3~6파일·부분 신규): 서브에이전트 티어링 — 탐색 haiku → 계획 opus(승인) → 구현 sonnet → 적대검증 opus/fable 루프.
- **L**(≥7파일·신규 모듈·다레포·릴리즈급): /goal orca 풀파이프라인 — Scout→Plan승인★→worktree fanout→타벤더 적대검증→머지게이트★. "풀개발"=L 강제.
- 하드 트리거(분류 생략): 스키마 마이그레이션·인증/결제/보안·크로스레포·릴리즈 = 무조건 **L** · 오타·문서/주석만 = **S**.
- 애매하면 작은 쪽 시작 → 검증 실패(테스트/tsc/critic) 시 **재선언 후 승급**(몰래 계속 금지).
- 동시 작업 = worktree만. 같은 레포·같은 브랜치 2에이전트 금지.
- Antigravity(agy) = 보조·초안 전용(메인 지휘 금지) — 산출물은 상위 티어 검증 필수.
- 배포·시크릿·npm publish·main 직push = 사람 게이트(불변).
<!-- YOHAN-ROSTER-CARD:END -->
