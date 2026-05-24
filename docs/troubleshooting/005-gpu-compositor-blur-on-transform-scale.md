---
id: trouble-005-gpu-compositor-blur-on-transform-scale
date: 2026-05-10
tags: [troubleshooting, lightbox, performance, gpu, css]
---

# 005 — `transform: scale()` 으로 줌하면 텍스트가 흐려짐 (image-rendering 무시)

## 재현

1. SnapContext 사이드패널에서 페이지 캡처
2. 미리보기 우하단 🔍 버튼 클릭 → ImageLightbox 열림
3. 마우스 휠을 한 번만 위로 굴림 (확대)
4. **기대**: 텍스트 픽셀이 또렷
5. **실제**: 텍스트에 ghosting / 이중 잔상 / 흐림. 휠 줌이 진행될수록 더 심해짐.

CSS 에 `image-rendering: pixelated` 까지 적용했어도 동일.

## 원인

`transform: scale(N)` (또는 `translate`, `rotate` 등 모든 transform 함수) 적용 시 브라우저는 해당 요소를 **GPU 컴포지팅 레이어** 로 승격함. 이후 그 요소의 모든 시각적 변환은 GPU 의 텍스처 샘플러로 처리되며, **GPU 의 bilinear 보간이 강제 적용**됨.

CSS `image-rendering: pixelated/crisp-edges` 힌트는 element 의 **초기 래스터화** 단계에 적용되는 것이며, GPU 컴포지팅 단계의 텍스처 샘플링에는 영향 없음.

→ transform: scale 로 줌을 구현하면 image-rendering 어떤 값을 줘도 **항상 GPU bilinear 로 흐릿**.

추가로 `will-change: transform` 은 브라우저에게 "이 요소를 미리 컴포지팅 레이어로 캐시" 라고 힌트 주는데, 이 캐시가 종종 원본보다 낮은 해상도로 만들어져 더 흐릿.

## 해결 (4단계 시행착오 끝)

| 시도 | 결과 |
|---|---|
| 1. `image-rendering: pixelated` 만 적용 | 효과 거의 없음. 줌인은 약간 또렷해지지만 휠 한 번에 다시 흐릿 |
| 2. `--zoomed` 클래스로 scale > 1 일 때만 pixelated | 동일. transform: scale 자체가 문제이므로 클래스 토글이 무의미 |
| 3. 디스플레이 비율 기반 스마트 토글 (≥0.5 면 pixelated) | 토글 정확하지만 transform 한계로 효과 없음 |
| 4. **transform: scale 폐기 — img.style.width/height 직접 변경** + native scroll pan | ✅ 해결 |

자세한 설계 결정: [docs/adr/007-lightbox-width-based-zoom.md](../adr/007-lightbox-width-based-zoom.md)

## 코드

[src/sidepanel/components/ImageLightbox.ts](../../src/sidepanel/components/ImageLightbox.ts):

- 줌: `img.style.width = ${fitW * scale}px; img.style.height = ${fitH * scale}px`
- 팬: `viewport.scrollLeft = dragStartScrollLeft - dx`

[src/sidepanel/styles/global.css](../../src/sidepanel/styles/global.css):

```css
.image-lightbox__viewport { overflow: auto; }  /* native scroll for pan */
.image-lightbox__pin-container {
  /* will-change: transform 제거 */
  image-rendering: pixelated;
}
```

## 일반화된 교훈

CSS transform: scale 은 애니메이션에 적합하지만 **고정밀 줌이 필요한 UI 캡처** 에는 부적합. 픽셀 단위 정확도가 필요하면 width/height 직접 변경 + native scroll 로 우회.

이 교훈은 til.md 에 정정 항목으로 추가됨.
