---
id: troubleshoot-003-side-panel-english-leak-after-reload
date: 2026-05-08
tags: [troubleshooting, sidepanel, i18n, chrome-extension, error-handling]
---

# 캡처 버튼을 누르면 사이드 패널 토스트가 영어("Extension context invalidated.")로 바뀌는 문제

## 증상

- 사이드 패널이 처음에는 한국어로 보이지만, 캡처 버튼을 누르거나 캡처 모드를 전환하면 영어 메시지가 표시된다.
- 대표 메시지: `Extension context invalidated.`
- 일부 화면 라벨도 영어("Visible Capture", "AI Debug Pack" 등)로 보일 수 있다.

## 재현

1. `chrome://extensions`에서 SnapContext를 다시 로드한다.
2. **이전부터 열려 있던 사이드 패널**을 그대로 두고 캡처 버튼을 클릭한다.
3. 토스트에 `Extension context invalidated.`가 표시된다.

## 원인

두 가지가 겹쳐 영어가 노출된다.

1. **확장이 재로드되면 기존 사이드 패널은 옛 인스턴스에 묶여 있다.**
   - 화면 라벨은 옛 빌드의 영어 문자열이 그대로 보인다.
   - 캡처 시 `chrome.runtime.sendMessage`가 Chrome 네이티브 에러
     `"Extension context invalidated."`를 던진다.
2. **`src/utils/messaging.ts`의 catch가 Chrome의 영문 메시지를 그대로 토스트로 흘려보냈다.**
   - `service-worker.ts`, `utils/{image,crop,annotated-image}.ts`, `capture/visible.ts`,
     `notion/api.ts` 등에도 `throw new Error('English ...')` 코드가 남아 있어
     예외가 발생하면 토스트에 영문이 그대로 노출되었다.

## 해결

1. `src/utils/messaging.ts`에 `toKoreanErrorMessage()` 헬퍼 추가.
   - Chrome 네이티브 에러(예: `Extension context invalidated`,
     `Could not establish connection`, `message port closed`,
     `No tab with id`, `cannot access chrome://`, …)를
     한국어 문구로 매핑.
   - 한글이 포함된 메시지는 통과시키고, 알 수 없는 영문 메시지는
     `console.warn`으로 남기되 사용자에게는 `예기치 않은 오류가 발생했습니다.`로 표시.
2. `sendToBackground`가 응답·예외 모두 `toKoreanErrorMessage`를 거치도록 수정.
3. 모든 내부 `throw new Error('...')` 메시지를 한국어로 교체.
4. `ContextPackPanel.ts`의 catch도 `toKoreanErrorMessage`로 감쌈.
5. `npm run build`로 dist 갱신.

## 사용자 측 해결 절차 (반드시 함께 안내)

확장을 다시 로드한 뒤에는 **사이드 패널을 닫았다가 다시 열어야** 새 빌드가 적용된다.
열려 있던 사이드 패널은 옛 번들을 계속 사용하므로 영어 라벨/토스트가 남는다.

## 참고

- 영어 라벨이 포함된 화면 캡처는 옛 사이드 패널 인스턴스가 살아 있다는 신호.
- 이후 새 영문 에러가 발견되면 `toKoreanErrorMessage`의 매핑 테이블만 늘리면 된다.
