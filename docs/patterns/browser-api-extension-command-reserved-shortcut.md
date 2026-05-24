---
id: pattern-browser-api-extension-command-reserved-shortcut
date: 2026-05-24
tags: [pattern, browser-api, chrome-extension, shortcut]
---

# 확장 단축키 예약키 충돌 회피

- 패턴명: 확장 단축키 예약키 충돌 회피
- 카테고리: browser-api
- 증상: `manifest.json`의 `commands.suggested_key`에 단축키가 등록되어도 실제 키 입력 시 `chrome.commands.onCommand`가 호출되지 않는다.
- 원인: 브라우저/OS 예약 단축키가 확장 단축키보다 우선 처리된다. 등록 성공과 실제 이벤트 전달은 별개다.
- 해결: `chrome.commands.getAll()`로 등록 상태를 확인하고, 브라우저 메뉴/검색/개발자도구와 겹칠 가능성이 있는 조합을 피한다. 단축키 실행 코드에서는 `onCommand`가 넘긴 `tab` 인자를 작업 경로까지 전달해 포커스 변동에 대비한다.
- 적용조건: Chrome/Whale/Chromium MV3 확장에서 `chrome.commands` 기본 단축키를 제공한다.
- 출처프로젝트: SnapContext
- 태그: chrome-extension, mv3, commands, shortcut
- 발견일: 2026-05-24
- 출처DevLog: docs/devlog/2026-05-24-snapcontext-review-fixes.md
