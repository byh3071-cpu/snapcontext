---
id: trouble-009-full-page-shortcut-alt-shift-f
date: 2026-05-24
tags: [troubleshooting, chrome-commands, shortcut, full-page-capture]
---

# 전체 캡처 단축키 Alt+Shift+F 미동작

## 증상

- 전체 캡처 버튼은 동작하지만 기본 단축키 `Alt+Shift+F`로는 전체 캡처가 시작되지 않는 것으로 보임.
- `chrome.commands.getAll()` 기준 명령은 등록되어 있어도 실제 키 입력이 `chrome.commands.onCommand`까지 도달하지 않을 수 있음.

## 재현

1. 확장 로드 후 일반 웹 페이지를 연다.
2. `Alt+Shift+F` 입력.
3. 전체 캡처 결과가 생성되지 않음.

## 원인

1. `Alt+Shift+F`는 Chromium/Windows에서 `Alt+F` 브라우저 메뉴 계열과 충돌할 가능성이 있다. 브라우저가 먼저 처리하면 확장의 `chrome.commands.onCommand`가 발동하지 않는다.
2. 코드상 전체 캡처 명령 경로만 `chrome.commands.onCommand`가 넘겨준 `tab` fallback을 사용하지 않았다. 단축키로 사이드패널을 여는 동안 포커스가 바뀌면 active tab 탐색이 실패할 수 있었다.
3. 전체 캡처는 명령 실행 결과를 pending payload로 저장하지 않아, 사이드패널이 늦게 열리는 경우 결과 broadcast를 놓칠 수 있었다.

## 해결

- 기본 전체 캡처 단축키를 `Alt+Shift+G`로 변경.
- `CAPTURE_FULL_PAGE` 라우팅에서 `fallbackTab`과 `storePendingResult`를 전체 캡처 경로에도 전달.
- `runFullPageCapture` 성공 시 명령 실행 결과를 pending payload로 저장하고 `ELEMENT_CAPTURE_PENDING_READY`를 broadcast.
- `tests/e2e/full-page-shortcut.mjs` 추가:
  - `chrome.commands.getAll()`로 `Alt+Shift+G` 등록 확인
  - 실제 HTTP 페이지에서 `CAPTURE_FULL_PAGE` 명령 경로가 full-page 결과를 생성하는지 확인

## 교훈

브라우저 단축키 충돌은 매니페스트 등록 성공만으로 판단하면 안 된다. `chrome.commands.getAll()`로 등록 상태를 확인하고, 브라우저 예약키 가능성이 있는 조합은 피해야 한다. 또한 단축키 실행 경로는 버튼 실행 경로와 달리 포커스가 흔들리므로 `chrome.commands.onCommand`의 `tab` 인자를 끝까지 전달해야 한다.
