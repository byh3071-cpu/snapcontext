---
id: adr-007-lightbox-width-based-zoom
date: 2026-05-10
tags: [adr, lightbox, performance, gpu, image-rendering]
---

# ADR 007 — Lightbox 줌은 transform: scale 가 아닌 img.width 직접 변경

## 컨텍스트

`ImageLightbox` 의 휠 줌 / 드래그 팬 구현. 직관적 첫 구현은 `transform: scale(N) translate(X, Y)` 를 부모 컨테이너에 적용 — GPU 가속, 60fps 부드러운 애니메이션, 코드 간결.

하지만 실제 사용 시 **휠 한 번에 텍스트가 ghosted/blurry 해지는 심각한 품질 문제** 발생.

## 진단 — 4단계 시행착오

| 단계 | 시도 | 결과 |
|---|---|---|
| 1 | `image-rendering: pixelated` 라이트박스 전체 적용 | 매우 긴 캡처(16500px) fit 시 노이즈 패턴 (heavy downscale + nearest-neighbor) |
| 2 | `--zoomed` 클래스로 scale > 1 일 때만 pixelated | 휠 한 번에 GPU 합성으로 ghosting (image-rendering 무시됨) |
| 3 | 디스플레이 비율 기반 스마트 토글 (≥0.5 면 pixelated) | 원리상 맞지만 transform: scale 자체가 GPU bilinear 강제 → 토글 의미 없음 |
| 4 | **transform: scale 폐기**, img.style.width 직접 변경 + native scroll pan | ✅ 해결 |

## 근본 원인

`transform: scale()` (또는 `translate()`, `rotate()` 등 모든 transform 함수) 이 적용되면 브라우저는 해당 요소를 **GPU 컴포지팅 레이어** 로 승격. 이후 스케일 / 변환은 GPU 의 텍스처 샘플러로 수행되며, **GPU 의 bilinear 보간이 강제 적용**됨.

CSS `image-rendering: pixelated/crisp-edges` 힌트는 elemnt 의 **초기 래스터화** 단계에 적용되지만, GPU 컴포지팅 단계의 텍스처 샘플링에는 영향 없음.

→ transform: scale 로 줌하면 image-rendering 이 어떤 값이든 **항상 GPU bilinear 로 흐릿**.

추가로 `will-change: transform` 은 브라우저에게 "이 요소를 미리 컴포지팅 레이어로 캐시" 라고 힌트 주는데, 이 캐시가 종종 원본보다 낮은 해상도로 만들어져 더 흐림.

## 결정

**줌은 `img.style.width / height` 직접 변경, pan 은 `viewport.scrollLeft/scrollTop` 네이티브 스크롤** 로 구현.

- `pinContainer.style.transform = scale(N)` → ❌
- `pinContainer.style.transform = translate(X, Y)` → ❌
- `img.style.width = ${fitW * scale}px` → ✅
- `viewport.scrollLeft -= dx` (드래그 팬) → ✅

이렇게 하면 GPU 컴포지팅 레이어가 만들어지지 않고, 브라우저가 새 너비에 맞춰 직접 래스터화 → `image-rendering: pixelated` 가 정확히 적용 → 줌해도 픽셀 또렷.

### 트레이드오프

- 단점: GPU 가속 부드러움 일부 손실. 매우 큰 이미지 줌 시 부분적으로 끊김 가능.
- 장점: 픽셀 단위 정확도 보장. UI 캡처 (텍스트 위주) 에 결정적.

## 코드

[ImageLightbox.ts](../../src/sidepanel/components/ImageLightbox.ts):

```ts
let scale = 1
let fitW = 0  // 이미지가 viewport 에 fit 했을 때 너비
let fitH = 0

const computeFit = (): void => {
  const sx = viewport.clientWidth / img.naturalWidth
  const sy = viewport.clientHeight / img.naturalHeight
  const fitScale = Math.min(sx, sy, 1)
  fitW = Math.round(img.naturalWidth * fitScale)
  fitH = Math.round(img.naturalHeight * fitScale)
}

const applySize = (): void => {
  img.style.width = `${Math.round(fitW * scale)}px`
  img.style.height = `${Math.round(fitH * scale)}px`
}

// 휠 줌 — 커서 위치 앵커 보존
const onWheel = (ev: WheelEvent) => {
  const factor = ev.deltaY < 0 ? 1.2 : 1 / 1.2
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor))
  const ratio = newScale / scale
  scale = newScale
  applySize()
  // 줌 후 같은 이미지 좌표가 커서 아래에 오도록 scroll 보정
  viewport.scrollLeft = imgX * ratio - cursorViewportX
  viewport.scrollTop = imgY * ratio - cursorViewportY
}

// 드래그 팬 — native scroll 변경
const onPointerMove = (ev: PointerEvent) => {
  viewport.scrollLeft = dragStartScrollLeft - dx
  viewport.scrollTop = dragStartScrollTop - dy
}
```

[global.css](../../src/sidepanel/styles/global.css):

```css
.image-lightbox__viewport {
  overflow: auto;  /* native scroll for pan */
}
.image-lightbox__pin-container {
  /* will-change: transform 제거 — GPU 캐시 우회 */
  image-rendering: pixelated;
}
```

## 결과

휠 줌 시 텍스트가 또렷하게 유지됨. 사용자 검증 통과. 회귀 프로브 (`coverage.mjs`) 의 #14, #15, #16 (lightbox open/close + 원본 src 검증) + 휠 줌 sharpness 시각 검증 통과.
