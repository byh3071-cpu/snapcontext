---
id: adr-001-sidepanel-over-popup
date: 2026-05-07
tags: [extension, mv3, ux]
---

# ADR 001: Side Panel 대신 Popup을 쓰지 않기

## 상태

Accepted

## 컨텍스트

웹 페이지 위 컨텍스트를 캡쳐하고 미리보기·주석·Context Pack까지 한 흐름으로 두려면 제한된 팝업 창보다 지속적으로 열린 패널이 유리하다.

## 결정

Chrome/웨일 Manifest V3 `sidePanel` API를 사용하고, 확장 아이콘 클릭 시 Side Panel이 열리도록 `setPanelBehavior({ openPanelOnActionClick: true })`를 적용한다.

## 결과

- 캡쳐 미리보기와 후속 단계(핀·팩) UI를 넓게 유지할 수 있다.
- Popup 대비 구현 복잡도는 증가하지만 워크플로 일관성이 좋다.
