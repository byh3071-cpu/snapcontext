---
id: architecture-snapcontext
date: 2026-05-07
tags: [architecture, messaging, context-pack]
---

# SnapContext — Architecture

## 모듈 구조

```
┌─────────────────────────────────────────────────┐
│                  Side Panel UI                   │
│  ┌──────────┐ ┌─────────┐ ┌──────────────────┐  │
│  │ Toolbar  │ │ Preview │ │ ContextPackPanel │  │
│  │(캡쳐)    │ │+ 핀     │ │ 생성·복사·PNG     │  │
│  └──────────┘ └─────────┘ └──────────────────┘  │
└─────────────────────┬───────────────────────────┘
                      │ chrome.runtime.sendMessage
                      ▼
┌─────────────────────────────────────────────────┐
│         Background (Service Worker)            │
│  메시지 라우터 · captureVisibleTab · crop       │
│  탭 메타 + GET_PAGE_META 조합                  │
└─────────────────────┬───────────────────────────┘
                      │ chrome.tabs.sendMessage
                      ▼
┌─────────────────────────────────────────────────┐
│              Content Script                     │
│  Element 오버레이 · Document 영역 탐지          │
│  GET_PAGE_META 응답(PAGE_META)                │
└─────────────────────────────────────────────────┘
```

## 메시지 허브 규칙

- Side Panel ↔ Content Script **직접 통신 없음**. Background가 중계한다.
- 타입 정의는 `src/types/index.ts`, 전송 래퍼는 `src/utils/messaging.ts`.

## 메시지 흐름

### Visible Capture

1. Side Panel → `{ type: "CAPTURE_VISIBLE" }` → Background  
2. Background: 활성 탭 `tabs.get` → URL/title  
3. Background → 탭에 `{ type: "GET_PAGE_META" }` → Content → `sendResponse` 또는 동등 payload로 viewport·UA  
4. Background: `captureVisibleTab` → PNG, 픽셀 크기 산출  
5. Background → Side Panel / 브로드캐스트: **`CAPTURE_RESULT`** (`imageData`, `captureType`, `sourceUrl`, `sourceTitle`, `viewport`, `userAgent`, `imageWidth`, `imageHeight`)

### Element Capture

1. Side Panel → `START_ELEMENT_SELECT` → Background → `ENABLE_SELECTOR` → Content  
2. 사용자 클릭 → Content → `ELEMENT_SELECTED`(rect, selector, devicePixelRatio, **viewport, userAgent**) → Background  
3. Background: `captureVisibleTab` → 전체 PNG → **crop** → **`CAPTURE_RESULT`** (+ 탭 URL/title, 메타 필드)

### Document Capture

1. Side Panel → `CAPTURE_DOCUMENT` → Background → `ENABLE_DOCUMENT_SELECTOR` → Content  
2. Content: 본문 영역 탐색 → `DOCUMENT_AREA_FOUND`(rect, selector, dpr, **viewport, userAgent**) 또는 `DOCUMENT_AREA_NOT_FOUND`  
3. Background: crop 후 **`CAPTURE_RESULT`** 브로드캐스트 (document 유형)

### Context Pack (클라이언트 전용)

1. Side Panel이 마지막 `CAPTURE_RESULT` 메타 + 현재 핀 상태를 보관  
2. **생성:** `generateContextPack` → JSON 객체  
3. **프롬프트:** `buildPrompt` → Markdown → 클립보드  
4. **PNG:** `annotated-image.ts`에서 Canvas에 핀 그린 뒤 `chrome.downloads.download` (fallback: `<a download>`)

## 데이터 흐름

```
캡쳐 PNG (data URL)
       ↓
핀 배열 · 선택 셀렉터(요소 캡쳐 시)
       ↓
탭 메타 (URL, title, viewport, UA) + 이미지 크기
       ↓
ContextPack (JSON 스키마: docs/CONTEXT-PACK-SPEC.md)
       ↓
 ┌─────────────┬──────────────┬────────────────┐
 │ Markdown 복사 │ JSON 복사    │ 핀 포함 PNG     │
 └─────────────┴──────────────┴────────────────┘
```

## 저장소 (chrome.storage) — 계획 / 후속

| 키 | 용도 | storage 타입 |
|----|------|----------------|
| `notionApiKey` | Notion Integration Token | sync |
| `notionDatabaseId` | Context Inbox DB ID | sync |
| `recentCaptures` | 최근 캡쳐 히스토리 (최대 20) | local |
| `settings` | 테마, 기본 프롬프트 템플릿 등 | sync |

v0.1에서는 필수 UX가 아니면 미연결일 수 있다.

## 보안·권한

- **host_permissions:** `<all_urls>` — 캡쳐·메시징·탭 접근에 사용. 내부 배포·스토어 설명에 명시 권장.
- Content Script는 선택·하이라이트·메타 응답 중심이며, 본문 데이터 외부 전송은 Context Pack 사용자 액션(복사·다운로드)에 따름.

## 관련 문서

| 문서 | 내용 |
|------|------|
| `docs/adr/001-sidepanel-over-popup.md` | Side Panel 채택 |
| `docs/adr/002-host-permissions-over-activetab.md` | activeTab 제거 |
| `docs/adr/003-capture-metadata-and-get-page-meta.md` | 메타 수집 설계 |
| `docs/CONTEXT-PACK-SPEC.md` | Pack JSON 스키마 |
