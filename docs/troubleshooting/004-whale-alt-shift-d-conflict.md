---
id: trouble-004-whale-alt-shift-d-conflict
date: 2026-05-10
tags: [troubleshooting, shortcut, whale, manifest]
---

# 004 — Whale 의 다크모드 단축키와 Alt+Shift+D 충돌

## 재현

1. v0.1.1 빌드를 Whale 에 로드
2. 아무 페이지에서 `Alt+Shift+D` 누름
3. **기대**: 문서 캡처 실행
4. **실제**: Whale 의 다크모드 토글만 발동, 캡처 안 됨

`whale://extensions/shortcuts` 에서는 SnapContext 의 "Document Capture" 항목에 `Alt+Shift+D` 가 정상 등록된 것으로 보임 — 충돌이 silent.

## 원인

Whale 브라우저가 `Alt+Shift+D` 를 다크모드 토글로 자체 사용. 브라우저 레벨 단축키가 확장 단축키보다 우선이라 확장의 `chrome.commands.onCommand` 가 발동 안 됨.

Chrome 에서는 같은 단축키가 비어 있어 충돌 없음 — Whale 특유의 이슈.

## 잘못된 진단 (선행 시도)

직전 fix 로그에 "패널이 열리면서 탭 포커스가 변동되어 `getActiveWebTabForSidePanel` 호출 실패 → `fallbackTab` 옵션 추가" 라고 적혀 있었으나, 실제 사용자 보고에 따르면 **단축키 자체가 다크모드를 발동시키므로** `chrome.commands.onCommand` 핸들러까지 도달하지 못하는 것이 확인됨. fallbackTab 보강은 별개 이슈.

## 해결

`capture-document` 의 default suggested_key 를 `Alt+Shift+D` → `Alt+Shift+M` (M = Main 본문) 으로 변경.

### 변경 파일

- [manifest.json](../../manifest.json) — `commands.capture-document.suggested_key.default`
- [src/sidepanel/components/CaptureToolbar.ts](../../src/sidepanel/components/CaptureToolbar.ts) — tooltip 텍스트
- [src/sidepanel/components/ShortcutsHelp.ts](../../src/sidepanel/components/ShortcutsHelp.ts) — 도움말 표

## 일반화된 교훈

브라우저별 예약 단축키 목록이 표준화되어 있지 않음. 가능하면 안전한 영문자 (A/M/L/J 등 사용 빈도 낮은 글자) 로 default 잡고, 사용자 수동 rebind 안내 (`whale://extensions/shortcuts`).
