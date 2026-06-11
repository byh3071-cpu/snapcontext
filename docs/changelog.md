---
id: changelog-root
date: 2026-05-07
tags: [changelog]
---

# Changelog

## 0.2.0 — 2026-06-06

### 익명 공유 기능 정식 마감

- **익명 컨텍스트 공유:** 캡처 이미지를 익명 업로드 → `/s/{id}` HTML 뷰어 공유 링크 생성(클립보드 자동 복사). 원본 이미지는 `/i/{id}` 가 `image/png` 로 직접 반환. 업로드는 PNG 매직 검증 + 10MB 제한.
- **공유 링크 7일 후 접근 차단:** 업로드 후 7일(`MAX_AGE_MS`) 경과 시 코드 레벨에서 차단 — 만료·없는 키는 `410` + 안내 메시지(`/i` GONE_MSG, `/s` 만료 페이지)로 응답, 빈 화면 없음. (R2 객체는 버킷 lifecycle 규칙 `auto-delete-7d`로 7일 후 실제 자동 삭제 — 2026-06-07 라이브 버킷 `wrangler r2 bucket lifecycle list`로 확인. 초판의 "v0.3 백로그" 표기는 wrangler.jsonc만 보고 쓴 오기재였음.)
- **보안 — 누출 차단:** 컨텍스트 토글 기본 **OFF** + 최초 1회 공유 동의(취소 시 업로드 차단). 전송 페이로드는 `SharedContext` 화이트리스트만(`debugLogs`·`project` 제외), 토큰/쿠키/localStorage 미사용(`chrome.storage.local` 만). 뷰어는 모든 동적 필드 `escapeHtml()` + URL `sanitizeHttpUrl()` 로 XSS 차단.
- **변경 — 사이드패널/오버레이 UI 리파인:** 디자인 토큰 시스템 도입(그라데이션 제거), 아이콘 `lucide` 통일, 빈 상태·마이크로카피 보강, 영문 툴팁·하드코딩 정리(i18n).

### 인프라

- **버전 동기화 게이트:** `package.json` · `manifest.json` · `package-lock.json`(top · packages) 4값 일치를 빌드 전 검사(`scripts/check-version-sync.mjs`), 불일치 시 빌드 실패.

### 검증

- `npm run build` — 버전 동기화 게이트 green(0.2.0 4값 일치), 무경고, `dist/manifest.json` version 0.2.0
- vitest: root 14 + worker 26 = **40 passed**
- 공유 플로우 자동 스모크 `upload-share.mjs` **10/10** (확장 로드·공유 토글·동의·누출 회귀 — `captureVisibleTab` 은 mock 주입, 실제 캡처→R2 E2E 아님)
- 실제 캡처→공유→링크 육안 확인은 외부 독푸딩(수동)에서

## 0.1.3 — 2026-05-24

### Store Candidate

- **버전 동기화:** `package.json`, `package-lock.json`, `manifest.json`, 사이드패널 UI 표시를 `0.1.3`으로 통일.
- **전체 캡처 단축키 확정:** 풀페이지 캡처 기본 단축키를 `Alt+Shift+G`로 문서 SoT에 반영.
- **문서 정리:** Full Page Capture를 v0.1 포함 기능으로 PRD에 반영하고, Phase 2 스토어 제출 체크리스트 추가.

### 검증

- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run test:e2e:all`

## 0.1.2 — 2026-05-10

### 신규 기능

- **프로그레시브 공개 UI:** 캡처 전엔 핀 메모 / AI 디버그 팩 섹션 숨김. 첫 캡처 후 노출.
- **캡쳐 버튼 2×2 그리드:** 화면/문서/요소/전체 캡쳐 4개를 한눈에.
- **전체 캡쳐 (Full Page Capture, `Alt+Shift+G`):** 스크롤 전체 페이지를 한 장 PNG 로 stitch. 최대 15000px, 초과 시 truncated 토스트.
- **이미지 확대 라이트박스 (🔍):** 미리보기 우하단 버튼 → 풀스크린 원본 보기 + 마우스 휠 줌 (0.5×~16×) + 드래그 팬 + 핀 추가/삭제.

### 버그 수정 및 UX 개선

- **단축키 충돌:** `Alt+Shift+D` 가 Whale 의 다크모드 토글과 충돌하여 캡처 안 되던 문제. 문서 캡쳐 단축키를 `Alt+Shift+M` 으로 변경.
- **핀 메모 입력 불가:** textarea focus 이벤트가 풀 재렌더를 트리거해 textarea 가 destroy/재생성되며 입력이 사라지던 버그. "활성 핀 변경" 과 "구조 변경" 분리.
- **라이트박스 핀 클릭 시 새 핀 추가:** `setPointerCapture` 로 인해 `ev.target` 이 viewport 로 고정. `document.elementFromPoint` 로 실제 요소 조회.
- **라이트박스 확대 시 텍스트 ghosting:** `transform: scale()` GPU 합성이 image-rendering 힌트 무시. **줌을 img.width 직접 변경 + native scroll pan 으로 리팩토링**해 GPU 합성 우회.
- **히스토리 무한 누적:** `pack.id` 기반 dedup → URL 기반 dedup 으로 변경 + 각 row 에 ❌ 삭제 버튼 추가.
- **히스토리 로드 후 추가 핀이 프롬프트 누락:** `tryBuildPack` 의 `loadedPack` short-circuit 제거. 라이브 캡처 입력 있으면 항상 fresh 생성.
- **viewport 0×0 / UA 공란:** YouTube 등 SPA 에서 콘텐츠 스크립트 응답 실패 시 `chrome.scripting.executeScript` 인라인 폴백 추가.
- **빈 핀 섹션 헤더 출력:** 핀 0개일 때 `## 핀 주석` 만 떠 있던 문제. 3개 템플릿 모두 `{{#if pins}}` 로 감쌈.
- **캡쳐 라벨:** 전체 캡쳐가 "문서 캡쳐" 로 표시되던 문제. `CaptureType` 에 `'full-page'` 추가, 모든 분기 보강.
- **두 번 클릭 삭제:** 핀 배지 첫 클릭 = 선택, 같은 핀 두 번째 클릭 = 삭제 토글. `lastClickedPinId` 상태로 auto-active 와 user-clicked 구분.
- **앱 아이콘:** 마스터 PNG 의 네이비 배경을 픽셀 임계치로 투명화, 코랄 심볼만 96% 채움 → 툴바에서 시각적 크기 향상.
- **한국어화 마무리:** "Capture history", "Settings / Help: Shortcuts", "Saved Context Pack..." 등 영문 잔재 모두 한국어로.

### 품질 인프라

- **E2E 자동 회귀** Playwright 기반 5개 프로브 (smoke / pin-flow / loaded-pack-pin / pin-delete / coverage), 총 **48개 자동 검증**.
- `npm run test:e2e:all` 한 번으로 전체 검증.
- 체크리스트 #1-30 중 22개 자동, 8개 수동 (실제 captureVisibleTab + 키보드 단축키 필요).

## 0.1.1 — 2026-05-10

### 신규 기능

- **PNG 복사 / 저장 (ImageActions):** 핀 주석 포함 PNG 를 클립보드 복사 또는 파일 저장.
- **캡쳐 히스토리:** 최근 50개 캡쳐 자동 저장 + 썸네일 리스트 + 스와이프/X 삭제 + 클릭 시 이미지·핀 복원.
- **프롬프트 템플릿 3종:** 🐛 버그 리포트 · 🔧 리팩토링 · 📐 레퍼런스. Mustache-lite 엔진 (`{{var}}`, `{{#if}}`, `{{#each}}`) 으로 렌더. 선택 상태 `chrome.storage.local` 영속.
- **키보드 단축키:** `Alt+Shift+V` 화면, `Alt+Shift+E` 요소, `Alt+Shift+D` 문서. (PNG 복사는 단축키 슬롯 4개 제한으로 수동 바인딩.) `Alt+Shift+D` 는 v0.1.2 에서 Whale 충돌로 `Alt+Shift+M` 으로 변경됨.

### 통합 / 리팩토링

- **App.ts 머지 통합:** 모드 핍(visible/element/document) 별도 UI 제거 → ContextPackPanel 드롭다운으로 통합. `CAPTURE_RESULT` 수신 시 자동 히스토리 저장 + Context Pack 자동 생성.
- **레거시 prompt 빌더 제거:** 하드코딩 `buildPrompt()` 함수 완전 삭제, 템플릿 기반 `buildTemplatePrompt` 로 교체. 관련 테스트(`tests/context-pack.test.ts`) 재작성.
- **번들 사이드패널 JS −9.3%** (47.5 → 43.1 kB) — 레거시 빌더 제거 효과.

## 0.1.0 — 2026-05-07

### 제품

- Manifest V3 · Vite · `@crxjs/vite-plugin` · TypeScript strict · Side Panel UI.
- **캡쳐:** Visible / Element(오버레이 선택·crop) / Document(본문 영역 탐색·crop).
- **미리보기:** 빈 상태 placeholder, 캡쳐 이미지 표시.
- **핀 주석:** 번호 핀·메모 목록·삭제·재번호·이미지 좌표(%).
- **Context Pack:** 생성(`generator`)·AI 프롬프트 Markdown(`buildPrompt`)·JSON 클립보드·핀 포함 PNG 다운로드(`annotated-image` + `downloads`).
- **메타데이터:** `CAPTURE_RESULT`에 URL·title·viewport·UA·이미지 크기; Visible은 `GET_PAGE_META` / Element·Document는 메시지에 viewport·UA 포함.

### 인프라·권한

- `activeTab` 제거, `host_permissions: <all_urls>` 기반 캡쳐.
- `permissions`: sidePanel, storage, scripting, downloads, tabs, windows 등.

### 문서

- ADR: Side Panel, host permissions, 메타데이터 수집.
- 작업 로그: 초기 세팅, v0.1 완료.
