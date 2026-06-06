# SnapContext — Rules

> 프로젝트 규칙의 단일 소스(SoT). 규칙 변경은 항상 이 파일에서만.
> `vhk sync` 가 Cursor·Claude·Windsurf·Copilot·Antigravity 규칙으로 전파합니다.
> ⚠️ 핵심 가드(작업 3원칙·DoD·언어)는 sync 전파를 위해 「코딩 규칙」 하위에 둠 — vhk sync 는 표준 제목 섹션만 전파하기 때문.

## 프로젝트 정체성

- 네이버 웨일 / Chrome 브라우저 확장 프로그램 (Manifest V3, Chromium 호환)
- 웹에서 캡처 → 주석 → Context Pack → AI/Notion 전달
- `chrome.*` 네임스페이스 사용. `whale.*` 사용 안 함.
- 단축키: Alt+Shift+V(영역)/E(요소)/M(문서)/G(풀페이지)/P(프롬프트)

## 필수 참조 문서 (작업 전 반드시 읽기)

- docs/PRD.md — 제품 범위, v0.1 IN/OUT
- docs/ARCHITECTURE.md — 메시지 흐름, 모듈 역할
- docs/CONTEXT-PACK-SPEC.md — Context Pack JSON/MD 스키마

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

## SnapContext 고유 주의사항

- captureVisibleTab 연속 호출 시 510ms 이상 delay 필수
- CSS 확대는 transform: scale 금지 → width 직접 변경
- onFocus 핸들러에서 풀 재렌더 금지 (focus loop)
- chrome.commands 단축키 등록 전 타겟 브라우저 예약키 확인

## 커밋 컨벤션

- feat: 새 기능 / fix: 버그 수정 / refactor: 리팩토링 / docs: 문서 변경 / chore: 빌드·설정 변경
- 예: `feat: add element capture with overlay`

## 기록 규칙

- 새 라이브러리/API/패턴 선택 → docs/adr/ 에 ADR (YAML 프론트매터: id, date, tags)
- 기능 완성 → docs/log/YYYY-MM-DD-{작업명}.md (세션·마일스톤 로그)
- 에러 해결 → docs/troubleshooting/ (재현·원인·해결)
- 새로 배운 것 → docs/til.md 에 한 줄
- 스키마/타입 변경 → docs/changelog.md 에 기록

## Notion 자동 적재 (MCP 연동)

- "정리해" 한마디 → docs/ 읽고 아래 규칙대로 Notion MCP Push
- 적재 대상: **바이브코딩 Dev Log DB** (전용 DB 1개로 통합)
- 제목 형식: `[YYYY-MM-DD] SnapContext — {내용}`, 프로젝트 select: `SnapContext`
- 유형 매핑: docs/log/*.md→세션로그 / docs/adr/*.md→ADR / docs/troubleshooting/*.md→에러 / docs/til.md→TIL / 전체요약→상태요약
- SoT Key = 파일 경로 (중복 적재 방지). 있으면 update, 없으면 create.

### 태그·링크 보존 (절대)
- frontmatter `tags` 필드를 최우선 소스로 사용. 없으면 기본값(Chrome Extension, TypeScript, Vite) + 본문 키워드.
- frontmatter `tags` 값을 임의로 변경·제거·추가하지 않음.
- `[text](url)` 링크, `docs/` 상대경로 링크, 외부 http(s) 링크, 코드블록 내 URL/경로 → 절대 변환 금지.
