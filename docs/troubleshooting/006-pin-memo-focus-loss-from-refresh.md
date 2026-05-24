---
id: trouble-006-pin-memo-focus-loss-from-refresh
date: 2026-05-10
tags: [troubleshooting, pin-memo, dom, focus, render]
---

# 006 — 핀 메모 textarea 가 입력을 받지 못함

## 재현

1. 캡처
2. 이미지 클릭으로 핀 추가
3. 핀 메모 영역의 textarea 클릭
4. 키보드로 글자 입력
5. **기대**: 입력한 글자가 textarea 에 보임
6. **실제**: 클릭하면 잠깐 포커스 됐다 사라지고, 입력이 안 됨. 다시 클릭해도 동일.

E2E 프로브 (`tests/e2e/pin-flow.mjs`) 로 자동 재현 가능 — `await textarea.type('테스트')` → `inputValue()` 가 빈 문자열.

## 원인

[src/sidepanel/App.ts](../../src/sidepanel/App.ts) 의 `onFocusPin` 핸들러가 `refreshPins()` 를 호출:

```ts
onFocusPin: (pinId) => {
  activePinId = pinId
  refreshPins()  // ← 풀 재렌더
  memoList.highlightRow(pinId)
}
```

`refreshPins()` 는 [PinMemoList.ts](../../src/sidepanel/components/PinMemoList.ts) 의 `render` 를 호출하고, render 는 첫 줄에서:

```ts
listRoot.innerHTML = ''  // ← textarea 통째로 destroy
```

이후 textarea 를 새로 만듦. **destroy 되는 순간 포커스 소실** + 사용자가 입력하던 키 입력이 새 textarea 로 가지 않음.

매 focus 마다 사이클 발생:
1. 사용자 클릭 → textarea 포커스
2. focus 이벤트 → onFocusPin → refreshPins → memoList.render
3. 옛 textarea destroy, 새 textarea 생성 → 포커스 소실

## 해결

"활성 핀 변경" 과 "구조 변경" 을 분리.

- **구조 변경 (핀 add/delete)**: 풀 재렌더 OK — `memoList.render(pins, activePinId)` 호출.
- **활성 핀 변경 (선택, 포커스)**: textarea 보존 필수 — `pinLayerMain.render(pins, activePinId)` (배지만 재렌더) + `memoList.highlightRow(pinId)` (CSS 클래스만 토글).

```ts
// AS-IS
onFocusPin: (pinId) => {
  activePinId = pinId
  refreshPins()  // ❌
  memoList.highlightRow(pinId)
}

// TO-BE
onFocusPin: (pinId) => {
  activePinId = pinId
  pinLayerMain.render(pins, activePinId)  // 배지(포커스 입력 아님) 만 재렌더
  memoList.highlightRow(pinId)             // textarea 보존, CSS 만 토글
  preview.refreshImageLightbox()
}
```

`onSelectPin` 도 같은 패턴 적용.

[src/sidepanel/App.ts:115-156](../../src/sidepanel/App.ts#L115-L156)

## 회귀 테스트

`tests/e2e/pin-flow.mjs` 에 textarea 입력 후 inputValue 검증 추가. 6/6 통과 확인.

## 일반화된 교훈

DOM 자식의 포커스/선택 상태는 부모의 innerHTML clear 시 사라진다. 이벤트 핸들러에서 풀 재렌더를 호출할 땐 **그 이벤트가 트리거하는 상태 변경의 종류가 정말 구조 변경인지** 점검 — 단순 활성 상태 변경이면 클래스 토글로 충분.
