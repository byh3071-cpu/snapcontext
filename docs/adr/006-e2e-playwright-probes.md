---
id: adr-006-e2e-playwright-probes
date: 2026-05-10
tags: [adr, testing, qa, playwright, e2e]
---

# ADR 006 — Playwright 기반 E2E 자동 회귀 프로브

## 컨텍스트

v0.1.1 에 기능과 버그 수정이 누적되며 정적 UI 회귀 (한국어 누락, 레이아웃 깨짐, 컴포넌트 마운트 누락, 상태 토글 깨짐) 가 자주 발생. 매번 수동으로 30개 항목 체크리스트를 돌리는 비용이 높아짐.

## 결정

**Playwright 헤디드 Chromium 으로 dist 확장 로드 → `chrome-extension://<id>/src/sidepanel/index.html` 직접 탭으로 열어 검증.**

확장 사이드패널 자체를 Playwright 가 직접 띄울 수는 없지만 (Chrome 의 user gesture 제약), 동일한 HTML 을 일반 탭으로 로드하면 chrome.* API 가 정상 동작하므로 정적 UI + 일부 인터랙션 회귀 검증 가능.

### 5개 프로브 분담

| 프로브 | 검증 영역 | 체크 수 |
|---|---|---|
| `tests/e2e/smoke.mjs` | 사이드패널 정적 UI: 4 캡처 버튼, 한국어 라벨, 2×2 그리드, 빈 미리보기 문구, 핀 메모/AI 디버그 팩/프로젝트 프로필 숨김, 캡처 기록/단축키 도움말 한국어 | 10 |
| `tests/e2e/pin-flow.mjs` | 가짜 캡처 주입 → 핀 추가 → 메모 입력 → 입력 보존 검증 | 6 |
| `tests/e2e/loaded-pack-pin.mjs` | 히스토리 로드 → 새 핀 추가 → AI 프롬프트 복사 → 클립보드 텍스트에 핀 섹션 포함 검증 (회귀: tryBuildPack short-circuit 버그) | 6 |
| `tests/e2e/pin-delete.mjs` | X 버튼 즉시 삭제, 라이트박스 핀 클릭 삭제, 메인뷰 두 번 클릭 삭제 | 9 |
| `tests/e2e/coverage.mjs` | 템플릿 전환/storage 영속, 라이트박스 open/ESC/backdrop, PNG 복사(clipboard ImageItem)/저장(chrome.downloads), JSON 복사, 프롬프트+JSON 복사, 다중 히스토리, 'full-page' 라벨 | 17 |

**총 48개 자동 검증.**

### 가짜 캡처 주입 패턴

확장의 service worker 는 Playwright `context.serviceWorkers()[0]` 으로 접근 가능. 거기서 `chrome.runtime.sendMessage(payload)` 로 `CAPTURE_RESULT` 메시지를 broadcast 하면 사이드패널의 `chrome.runtime.onMessage` 리스너가 트리거되어 `applyCapturePayload` 가 실행됨 → 실제 캡처 없이 캡처 후 상태 모킹.

이미지 데이터는 `sharp` 로 200×200 dummy PNG 를 만들어 base64 data URL 로 주입 (1×1 너무 작아서 클릭 영역 미스).

### 클립보드 검증

`context.grantPermissions(['clipboard-read', 'clipboard-write'])` 후 page.evaluate 안에서 `navigator.clipboard.readText()` (텍스트) 또는 `navigator.clipboard.read()` → `ClipboardItem.getType('image/png')` (이미지) 로 검증.

### 다운로드 검증

`chrome.downloads.download` 를 page.evaluate 로 stub 처리해서 호출 인자 캡처 → 실제 파일 다운로드 발생 안 하면서도 검증.

### 미커버 영역

| 영역 | 이유 |
|---|---|
| 실제 `chrome.tabs.captureVisibleTab` | 활성 탭 + user gesture 필요. 자동화 어려움 |
| 키보드 단축키 (`Alt+Shift+V/E/M/F`) | 브라우저 레벨 명령. Playwright 키 입력은 페이지 컨텍스트로 가서 트리거 안 됨 |
| Whale 전용 동작 | Whale 는 Playwright 표준 타겟 아님. Chromium 검증으로 근사 |
| Full Page Capture 실제 스크롤+stitch | 위와 동일 |

→ 체크리스트 #7-11, #28-29 는 수동 5분 (위키백과 긴 글 1번 등).

## 패키지/스크립트

```json
"devDependencies": { "playwright": "^1.59.1" },
"scripts": {
  "test:e2e": "node tests/e2e/smoke.mjs",
  "test:e2e:all": "node tests/e2e/smoke.mjs && node tests/e2e/pin-flow.mjs && node tests/e2e/loaded-pack-pin.mjs && node tests/e2e/pin-delete.mjs && node tests/e2e/coverage.mjs"
}
```

`npx playwright install chromium` 으로 헤디드 바이너리 ~150MB 다운로드 (글로벌 캐시, 한 번만).

## 결과

48/48 자동 통과 시 빌드 + 출시 준비 완료로 간주. 수동은 위키백과로 8개 항목 5분 체크.

추후 GitHub Actions 통합 시 headless 옵션 검토 (Chromium extension support in headless 는 `--headless=new` 가 필요).
