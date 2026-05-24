---
id: til-root
date: 2026-05-07
tags: [til]
---

# Today I Learned

- MV3 Side Panel은 `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`로 아이콘 클릭 UX를 고정할 수 있다.
- `getBoundingClientRect`는 CSS 픽셀이고 `captureVisibleTab` 이미지는 디바이스 픽셀이라 crop 시 `devicePixelRatio`를 곱해야 맞는다.
- Side Panel만으로는 `activeTab` 제스처가 성립하지 않을 수 있어, `<all_urls>` host permission으로 캡쳐 권한을 확보하고 manifest에서 `activeTab`을 제거했다.
- Context Pack은 캡쳐 PNG의 물리 크기와 탭 메타(URL/title/viewport/UA)를 묶어 AI 프롬프트·JSON·주석 PNG로 내보낼 수 있다.
- [2026-05-10] `chrome.commands`는 `Ctrl+Alt` 조합을 지원하지 않는다. 등록 자체가 무시되므로, 커스텀 단축키는 `Alt+Shift`를 사용해야 한다.
- [2026-05-10] `navigator.clipboard.write()`(Blob 기반 클립보드 쓰기)는 MV3 Side Panel에서 `clipboardWrite` 권한 추가 없이 동작한다. Side Panel이 포커스를 가진 상태에서 호출하면 user gesture로 인정된다.
- [2026-05-10] `chrome.sidePanel.open()`은 user gesture 토큰이 살아 있는 동안(=`await` 이전)에 호출해야 한다. `await` 후에는 gesture가 소실되어 호출이 실패한다.
- [2026-05-10] `image-rendering: pixelated`는 아주 작은 아이콘에는 유용하나, 확대 시 계단 현상이 발생하므로 텍스트가 포함된 문서 캡쳐를 확대할 때는 기본값(bilinear)을 유지하는 것이 훨씬 가독성이 좋다.
- **[2026-05-10 정정]** 위 항목은 `transform: scale()` 기반 줌일 때만 사실. `transform: scale` 은 GPU 컴포지팅 레이어를 만들고 거기서 GPU bilinear 보간을 강제 → CSS `image-rendering` 힌트 무시되어 어떤 값도 의미 없음. **줌을 `img.style.width/height` 직접 변경**으로 구현하면 GPU 합성을 우회하고 `image-rendering: pixelated` 가 정확히 적용되어 UI 캡처가 또렷함. 결론: pixelated 자체가 문제가 아니라 transform: scale 와의 결합이 문제.
- [2026-05-10] `setPointerCapture(pointerId)` 가 활성화되면 후속 pointer 이벤트의 `ev.target` 이 캡처 대상 요소로 고정됨. 실제 커서 아래 요소를 알아내려면 `document.elementFromPoint(ev.clientX, ev.clientY)` 로 따로 조회해야 함.
- [2026-05-10] `chrome.commands` 의 `suggested_key` 는 한 확장당 최대 4개. 5번째 추가하면 manifest 로드 실패. 수동 바인딩(`whale://extensions/shortcuts`) 으로 우회.
- [2026-05-10] Whale 의 `Alt+Shift+D` 는 다크모드 토글로 예약됨. 확장이 같은 단축키를 등록해도 Whale 가 우선이라 동작 안 함. 단축키 충돌 회피는 default 값 변경이 가장 확실 (사용자에게 수동 rebind 요구는 UX 부담).
- [2026-05-10] DOM 변경(`innerHTML = ''` 후 재생성) 은 자식의 포커스를 destroy. focus 이벤트 핸들러에서 풀 재렌더 호출하면 무한 사이클 ↔ 사용자가 textarea 에 입력 못함. **상태 변경의 종류(구조 vs 활성)** 에 따라 재렌더 범위를 분리하는 원칙이 필요.
- [2026-05-10] `OffscreenCanvas` 는 service worker (MV3) 에서도 사용 가능. `createImageBitmap(blob)` 으로 이미지 디코딩 후 `ctx.drawImage(bitmap, x, y)` 로 stitch, `canvas.convertToBlob()` 으로 export. Full Page Capture 의 청크 합성에 활용.
- [2026-05-10] `chrome.tabs.captureVisibleTab` 은 ~2회/초 rate limit. 510ms 쓰로틀로 안전하게 호출 가능 (그 이하는 quota exceeded).
- [2026-05-10] 콘텐츠 스크립트가 등록되어 있어도 SPA 에서는 적시 응답 보장 못 함. 폴백으로 `chrome.scripting.executeScript({ target, func })` 인라인 함수 주입으로 콘텐츠 스크립트 의존 없이 페이지 메타 조회 가능.
- [2026-05-10] Playwright 헤디드 Chromium 으로 `chrome-extension://<id>/...` URL 을 직접 탭으로 열면 chrome.* API 사용 가능한 상태로 사이드패널 정적 검증 가능. 사이드패널 자체를 자동으로 띄우는 건 아직 어렵지만, HTML 직접 로드만으로도 UI 회귀의 약 70% 자동 검증 가능.
