---
id: session-2026-05-08-sidepanel-korean-i18n
date: 2026-05-08
tags: [log, i18n, sidepanel, error-handling, chrome-extension]
---

# 작업 로그 — 사이드 패널 영어/한국어 혼용 이슈 해결

> 노션 핸드오프용 단일 문서. 이 문서만 읽어도 무엇을, 왜, 어떻게 고쳤는지 파악되도록 정리.

## 1. 배경 / 보고된 증상

- 사이드 패널이 처음에는 한국어로 보이다가, 캡처 모드 전환·캡처 버튼을 누르면 영어로 바뀐다.
- 사용자 요청: "전부 다 어떤 경우에 있어서도 전부 한국어로 변환해."
- 스크린샷에서 확인된 영어 표기
  - 라벨: `Visible Capture`, `Element Capture`, `Document Capture`, `AI Debug Pack`, `Bug Report`, `Context Pack`, `Symptom or request for AI`, `Expected behavior`
  - 토스트: `Extension context invalidated.`

## 2. 근본 원인 (두 가지가 겹침)

### (A) 사이드 패널이 옛 번들을 계속 들고 있음

- `chrome://extensions`에서 확장을 새로고침해도, 이미 열려 있던 사이드 패널은 **이전 번들 그대로** 유지된다.
- 그래서 옛 빌드의 영어 라벨이 화면에 남고, 캡처 시 `chrome.runtime.sendMessage`가 `Extension context invalidated.`를 던진다.
- 현재 소스/빌드의 화면 라벨은 이미 모두 한국어였음 → 스크린샷의 영어 라벨은 캐시 잔상.

### (B) Chrome 네이티브 영문 에러가 토스트로 그대로 노출됨

- `src/utils/messaging.ts`의 catch가 `e.message`를 그대로 `{ type: 'ERROR', message }`로 흘려보내고, App.ts가 그것을 `showToast()`에 그대로 전달.
- `service-worker.ts`, `utils/{image,crop,annotated-image}.ts`, `capture/visible.ts`, `notion/api.ts` 등에 `throw new Error('English …')` 코드가 다수 남아 있어, 예외 발생 시 영문이 그대로 토스트로 노출됨.

## 3. 적용한 수정

### 3-1. 한국어 에러 번역기 신설

`src/utils/messaging.ts`에 `toKoreanErrorMessage(input: unknown): string` 추가.

매핑하는 Chrome 네이티브 패턴:

| 패턴(정규식, case-insensitive) | 한국어 메시지 |
|---|---|
| `extension context (invalidated\|was invalidated)` | 확장 프로그램이 다시 로드되었습니다. 사이드 패널을 닫았다가 다시 열어주세요. |
| `could not establish connection\|receiving end does not exist` | 콘텐츠 스크립트에 연결할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요. |
| `message port closed` | 백그라운드 응답이 끊겼습니다. 잠시 후 다시 시도해주세요. |
| `no tab with id\|no window with id\|tab .* (was )?closed` | 대상 탭 또는 창을 찾을 수 없습니다. |
| `cannot access\|cannot be scripted\|chrome:\/\/\|chrome-extension:\/\/` | 이 페이지에서는 캡처할 수 없습니다. 일반 웹 페이지에서 다시 시도해주세요. |
| `user did not approve\|user denied\|permission denied` | 권한이 거부되었습니다. |
| `network\|fetch\|failed to fetch` | 네트워크 오류가 발생했습니다. |

추가 규칙:

- 한글이 포함된 메시지는 그대로 통과.
- 알 수 없는 영문은 `console.warn('[SnapContext] 번역되지 않은 오류:', text)`로 남기고, 사용자에게는 `예기치 않은 오류가 발생했습니다.` 표시.

`sendToBackground`가 catch와 ERROR 응답을 모두 이 함수를 거치도록 변경.

### 3-2. 내부 `throw new Error` 메시지 한국어화

| 파일 | Before | After |
|---|---|---|
| `src/background/service-worker.ts` | `'Tab window not found'` | `'탭 창을 찾을 수 없습니다.'` |
| `src/background/service-worker.ts` | `'Crop region is empty'` | `'잘라낼 영역이 비어 있습니다.'` |
| `src/background/service-worker.ts` | `'Missing tab for selection'` | `'선택할 대상 탭을 찾을 수 없습니다.'` |
| `src/background/service-worker.ts` | `'Missing tab for document region'` | `'본문 영역을 검사할 탭을 찾을 수 없습니다.'` |
| `src/background/service-worker.ts` | `'Unhandled extension message'` | `'처리되지 않은 메시지입니다.'` |
| `src/utils/messaging.ts` | `'Empty response from background'` | `'백그라운드 응답이 비어 있습니다.'` |
| `src/utils/image.ts` | `'Failed to decode image'` | `'이미지를 디코딩하지 못했습니다.'` |
| `src/utils/crop.ts` | `'Failed to read image blob'` | `'이미지 데이터를 읽지 못했습니다.'` |
| `src/utils/crop.ts` | `'Could not get 2d context'` | `'Canvas 2D 컨텍스트를 가져오지 못했습니다.'` |
| `src/utils/annotated-image.ts` | `'Failed to load image'` | `'이미지를 불러오지 못했습니다.'` |
| `src/utils/annotated-image.ts` | `'Canvas 2D context unavailable'` | `'Canvas 2D 컨텍스트를 사용할 수 없습니다.'` |
| `src/utils/annotated-image.ts` | `'PNG blob unavailable'` | `'PNG 데이터를 만들지 못했습니다.'` |
| `src/capture/visible.ts` | `'Unable to resolve current window'` | `'현재 창을 확인할 수 없습니다.'` |
| `src/notion/api.ts` | `'Notion export is not implemented yet'` | `'Notion 내보내기는 아직 지원하지 않습니다.'` |

### 3-3. ContextPackPanel catch 한국어화

`src/sidepanel/components/ContextPackPanel.ts`의 클립보드 복사 / PNG 다운로드 catch 블록을 `toKoreanErrorMessage(e)`로 감쌈.

### 3-4. 빌드 & 검증

- `npm run build` 성공 (vite 6.4.2, 1737 modules, 823ms).
- 새 번들: `dist/assets/index.html-Vr8QK8Dx.js`, `dist/assets/service-worker.ts-CjXcR0ht.js`.
- 검증 grep 결과
  - `dist/`에서 옛 영어 라벨(`Visible Capture` 등) **0건**.
  - `dist/`에서 옛 영어 에러 문자열(`Failed to load image` 등) **0건**.
  - `dist/`에서 한국어 번역기 문구(`확장 프로그램이 다시 로드`) **존재 확인**.

## 4. 변경된 파일

```
src/utils/messaging.ts                              (번역기 신설 + sendToBackground 래핑)
src/background/service-worker.ts                    (영문 5곳 한국어화)
src/utils/image.ts                                  (영문 1곳)
src/utils/crop.ts                                   (영문 2곳)
src/utils/annotated-image.ts                        (영문 3곳)
src/capture/visible.ts                              (영문 1곳)
src/notion/api.ts                                   (영문 1곳)
src/sidepanel/components/ContextPackPanel.ts        (catch 두 곳을 번역기로)
docs/troubleshooting/003-side-panel-english-leak-after-reload.md  (신규)
docs/log/2026-05-08-sidepanel-korean-i18n.md        (이 문서)
```

## 5. 사용자 측 적용 절차

1. `chrome://extensions`에서 SnapContext 새로고침(↻).
2. **열려 있던 사이드 패널을 닫았다가 다시 열기** — 이걸 안 하면 옛 번들이 그대로 떠서 또 영어가 보임.

## 6. 남은/후속 과제

- 새로운 영문 Chrome 에러가 또 발견되면, `toKoreanErrorMessage`의 매핑 테이블에 한 줄만 추가하면 됨.
- 알 수 없는 영문 메시지는 `console.warn('[SnapContext] 번역되지 않은 오류:', text)`로 콘솔에 남으므로, DevTools에서 모니터링하다가 누락 패턴을 보강.
- 화면 라벨(toolbar, ContextPackPanel 등)은 이미 이전 빌드에서 한국어화되어 있었으므로 별도 작업 없음.

## 7. 핵심 학습 포인트

- 확장을 재로드해도 사이드 패널 인스턴스는 자동 재생성되지 않는다 → "다시 열기" 안내가 UX적으로 필수.
- Chrome runtime API 예외 메시지는 영문 고정이므로, 한국어 UI 일관성을 보장하려면 **catch 지점에 번역 레이어**가 반드시 있어야 한다.
- 토스트에 `e.message`를 그대로 노출하는 패턴은 다국어 제품에서 영문 누수의 1순위 원인.

## 8. 관련 문서

- 트러블슈팅: `docs/troubleshooting/003-side-panel-english-leak-after-reload.md`
- 직전 마일스톤: `docs/log/2026-05-07-v0.1-complete.md`
