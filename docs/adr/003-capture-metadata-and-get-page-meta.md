---

## id: adr-003-capture-metadata-get-page-meta
date: 2026-05-07
tags: [adr, messaging, context-pack, metadata]

# ADR 003: 캡쳐 메타데이터 수집과 `GET_PAGE_META` 패턴

## 상태

Accepted

## 컨텍스트

Context Pack과 AI 프롬프트에 **URL, title, viewport, User-Agent, 이미지 픽셀 크기**가 필요하다. Service Worker는 페이지 DOM에 접근할 수 없고, Content Script는 DOM·`window`에 접근 가능하다.

## 결정

1. `**CAPTURE_RESULT`(브로드캐스트 및 Side Panel 응답)** 에 다음을 포함한다:
  `sourceUrl`, `sourceTitle`, `viewport`, `userAgent`, `imageWidth`, `imageHeight`(그 외 기존 필드 유지).
2. **Visible Capture:** Background가 활성 탭에 대해 `chrome.tabs.get`으로 URL/title을 읽고, 같은 탭에 `**GET_PAGE_META`** 를 보내 Content Script가 `**PAGE_META**` 로 `viewport`·`userAgent`를 반환한다.
3. **Element / Document Capture:** 선택 시점에 Content Script가 이미 알고 있는 값을 `**ELEMENT_SELECTED` / `DOCUMENT_AREA_FOUND`** 메시지에 `viewport`·`userAgent`로 함께 실어 보낸다.
4. 이미지 가로·세로는 Visible은 PNG 디코드로 측정하고, crop 경로는 crop 결과의 픽셀 크기를 사용한다.

## 결과

- 단일 메시지 타입으로 Side Panel이 메타를 저장하고 Context Pack 생성 시 추가 네트워크 왕복이 줄어든다.
- `chrome://` 등 Content Script가 동작하지 않는 페이지에서는 `GET_PAGE_META`가 실패할 수 있어 viewport/UA는 빈 값·0으로 떨어질 수 있다(허용된 degrade).