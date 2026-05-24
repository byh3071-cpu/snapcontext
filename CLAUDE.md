---
id: claude-md-root
date: 2026-05-07
tags: [process, documentation]
---

# SnapContext

## 📋 프로젝트 개요

- Chrome/Whale 확장 프로그램 — 화면 캡처 + AI 프롬프트 생성
- 스택: TypeScript, Manifest V3, Chrome Extensions API
- 현재 버전: v0.1.3 (Store Candidate)
- 단축키: Alt+Shift+V(영역)/E(요소)/M(문서)/G(풀페이지)/P(프롬프트)

## 🔗 Notion MCP 연동

Dev Log 주입 시 아래 정보 사용:

- DB: 바이브코딩 Dev Log
- 필수 속성: 이름(title), 실행일(date), 프로젝트(select:SnapContext),
  유형(select), 결과(select), 교훈(text), 메모(text),
  관련 파일(text), 역전파 상태(select:미반영), 태그(multi_select)
- SoT Key 형식: [날짜] 유형-번호: 제목

## 📝 기록 규칙

- 기술 선택·변경 → `docs/adr/` (YAML 프론트매터: id, date, tags)
- 주요 기능 완료 → `docs/log/` (세션·마일스톤 로그)
- 에러 해결 → `docs/troubleshooting/` (재현·원인·해결)
- 학습 메모 → `docs/til.md`

## ⚡ SnapContext 고유 주의사항

- captureVisibleTab 연속 호출 시 510ms 이상 delay 필수
- CSS 확대는 transform: scale 금지 → width 직접 변경
- onFocus 핸들러에서 풀 재렌더 금지 (focus loop)
- chrome.commands 단축키 등록 전 타겟 브라우저 예약키 확인
