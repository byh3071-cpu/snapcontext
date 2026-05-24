---
id: adr-005-full-page-capture
date: 2026-05-10
tags: [adr, capture, full-page, service-worker, offscreen-canvas]
---

# ADR 005 — Full Page Capture (스크롤 + Stitch)

## 컨텍스트

기존 캡쳐 3종(visible/element/document) 은 모두 `chrome.tabs.captureVisibleTab` 한 번 호출로 끝나는 단일 프레임 캡쳐. 사용자가 긴 페이지 전체를 한 장의 이미지로 캡쳐하고 싶다는 니즈 발생.

## 결정

**백그라운드 service worker 에서 스크롤 → 부분 캡처 → 캔버스 stitch** 방식.

콘텐츠 스크립트 라운드트립 대신 `chrome.scripting.executeScript` 의 인라인 `func` 옵션으로 페이지 조작 (스크롤, fixed/sticky 숨김) 을 background 에서 직접 수행.

이미지 합성은 service worker 에서 사용 가능한 `OffscreenCanvas` + `createImageBitmap`.

### 흐름

1. 사이드패널 → background: `CAPTURE_FULL_PAGE` 메시지
2. background:
   1. `measureFullPage(tabId)` — `chrome.scripting.executeScript` 로 `document.scrollHeight`, `window.innerHeight`, `devicePixelRatio` 측정
   2. `preparePageForFullPageCapture(tabId)` — `scrollBehavior: 'auto'` 강제 + 원래 스타일 stash
   3. 루프: y = 0, vh, 2vh, …, capturedHeight
      - `scrollAndHideFixed(tabId, y, hideFixed)` — `window.scrollTo(0, y)` + 첫 프레임 이후 fixed/sticky 요소 visibility hidden
      - 250ms 안착 (lazy-load 대기)
      - `chrome.tabs.captureVisibleTab(windowId, { format: 'png' })`
      - 510ms 쓰로틀 (captureVisibleTab API ~2회/초 제한 회피)
      - 마지막 청크는 `cropPngDataUrlWithDpr` 로 잘라 중복 영역 제거
   4. `stitchChunks()` — `OffscreenCanvas(imageWidth, imageHeight)` 에 `createImageBitmap(blob)` → `ctx.drawImage(bitmap, 0, offsetY)` 반복 → `canvas.convertToBlob()`
   5. `restoreAfterFullPageCapture(tabId)` — 숨겼던 요소 + 스타일 복원, 스크롤 0,0 으로
3. background → 사이드패널: `CAPTURE_RESULT` (captureType: `'full-page'`)

### 제약

- 최대 높이 **15000 CSS px** (`FULL_PAGE_MAX_HEIGHT_PX`). 초과 시 `FULL_PAGE_CAPTURE_TRUNCATED` 메시지로 사이드패널에 알림.
- iframe 무시 (v0.3 예정).
- 일반 페이지 ~30-60초 소요 (네트워크 + 렌더 시간 + API 쓰로틀).
- 실패 시 `FULL_PAGE_CAPTURE_FAILED` 메시지 + 스타일 복원 best effort.

## 대안과 거부 이유

| 대안 | 이유 |
|---|---|
| chrome.debugger API + `Page.captureScreenshot` (full-page 옵션) | `debugger` 권한이 사용자에게 위협적인 경고로 노출됨. 일반 사용자 확장에 부적합 |
| 콘텐츠 스크립트가 모든 작업 + 메시지로 청크 전달 | 라운드트립 N번 → 느림. service worker 에서 chrome.scripting 으로 직접 페이지 조작 가능 |
| html2canvas / dom-to-image | 외부 의존성 + 픽셀 정확도 떨어짐 (CSS 렌더 재구현이라 한계). |

## 메시지 타입 추가

- `SidePanelToBackgroundMessage`: `{ type: 'CAPTURE_FULL_PAGE' }`
- `BackgroundToSidePanelMessage`: `FULL_PAGE_CAPTURE_FAILED`, `FULL_PAGE_CAPTURE_TRUNCATED`
- `SidePanelResponse`: `FULL_PAGE_CAPTURE_STARTED`
- `CaptureType` enum: `'full-page'` 추가 (라벨 분기, 토스트 분기, 히스토리 메타 분기)

## 결과

[service-worker.ts](../../src/background/service-worker.ts) 의 `runFullPageCapture` 등 함수군. 위키백과 긴 글에서 ~16500px (truncated 토스트 동작 확인). 일반 페이지 정상 stitch.
