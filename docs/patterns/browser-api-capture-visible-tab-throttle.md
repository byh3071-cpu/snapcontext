---
id: pattern-browser-api-capture-visible-tab-throttle
date: 2026-05-24
tags: [pattern, browser-api, chrome-extension, throttle]
---

# captureVisibleTab 공통 throttle 큐

- 패턴명: captureVisibleTab 공통 throttle 큐
- 카테고리: browser-api
- 증상: 버튼/단축키 반복 입력이나 풀페이지 캡처 중 `chrome.tabs.captureVisibleTab` quota 오류가 간헐적으로 발생한다.
- 원인: 기능별로 delay를 따로 두면 visible/element/document/full-page 캡처가 같은 브라우저 quota를 공유한다는 사실을 놓친다.
- 해결: service worker에 단일 `captureVisibleTab` wrapper를 만들고, 마지막 호출 시각 기준으로 510ms 이상 간격을 보장하며 Promise queue로 직렬화한다.
- 적용조건: MV3 확장에서 `chrome.tabs.captureVisibleTab`을 둘 이상의 경로에서 호출한다.
- 출처프로젝트: SnapContext
- 태그: chrome-extension, mv3, capture, throttle
- 발견일: 2026-05-24
- 출처DevLog: docs/devlog/2026-05-24-snapcontext-review-fixes.md
