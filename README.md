---
id: readme-root
date: 2026-05-24
tags: [readme, snapcontext]
---

# SnapContext

Chrome·Whale MV3 확장 — 화면 캡처, 핀 주석, AI용 Context Pack 생성 (v0.1.3 Store Candidate).

- **Repository:** https://github.com/byh3071-cpu/SnapContext
- **Privacy Policy:** https://github.com/byh3071-cpu/SnapContext/blob/master/docs/PRIVACY.md

## 주요 기능

| 기능 | 단축키 |
|------|--------|
| 화면 캡처 | `Alt+Shift+V` |
| 요소 캡처 | `Alt+Shift+E` |
| 문서 캡처 | `Alt+Shift+M` |
| 전체 캡처 | `Alt+Shift+G` |

## 요구 사항

- Node.js 18+
- npm

## 설치·빌드

```bash
npm install
npm run build
```

산출물은 `dist/`에 생성된다.

- Chrome: `chrome://extensions` → 개발자 모드 → 압축해제된 확장 프로그램 로드 → `dist` 선택
- Whale: `whale://extensions` → 동일

## 개발·테스트

```bash
npm run dev
npm test
npm run test:e2e:all
npm run store:screenshots
```

## 구조

주요 코드는 `src/` 아래이며, 메시지 허브는 `src/background/service-worker.ts`, 사이드 패널은 `src/sidepanel/`이다.

스토어 스크린샷(1280×800)은 `docs/store/chrome-web-store/screenshots/`에 있다.
