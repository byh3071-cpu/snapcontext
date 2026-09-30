---
id: claude-md-root
date: 2026-05-07
tags: [process, documentation]
---

@AGENTS.md

# 규칙

1. 무조건 한국어로 해라. 필요한 기술 용어는 영어 허락 하되 , 영어 남발 금지.

# SnapContext

## 📋 프로젝트 개요

- Chrome/Whale 확장 프로그램 — 화면 캡처 + AI 프롬프트 생성
- 스택: TypeScript, Manifest V3, Chrome Extensions API
- 버전 SoT: `manifest.json`(확장) · worker `serverInfo`(서버) — ADR-014 2트랙. 이 문서에 버전 숫자를 박지 않는다.
- 단축키: Alt+Shift+V(영역)/E(요소)/M(문서)/G(풀페이지)/P(프롬프트)

## 🧭 현재 국면 (2026-08-29 갱신 — 최신값은 git·vhk·orca로 재측정)

- 마지막 릴리즈: 0.4.4(worker, tag v0.4.4) · 확장은 0.4.3. 0.4.5 = 요한 결재 대기(`docs/PRD-0.4.5.md`). **진행 중 = 0.4.6 프롬프트 UX 다듬기(ext-only, worker 무변경)**.
- 진입점 순서: `goals/6-046-ux-polish-plan.md`(구현 계획 영수증·승인 상태) → `docs/PRD-0.4.6.md`(스펙 SoT) → `.vhk/mission.json`(스코프 계약) → `docs/state/next-task.md`.
- 규칙 SoT = `RULES.md`. 경로별 보조 규칙 = `.claude/rules/`(src·worker·docs 포인터 — 본문 복제 금지). 라우팅 카드 = 아래 관리형 블록(yohan-brain 전파).
- 독푸딩 원장 = `docs/dogfood/2026-08-29-orchestration-ledger.md` — 도구·스킬·에이전트 마찰은 정본을 고치지 말고 여기에 append, 작업 종료 시 보고서로 정리.

## 🔗 Notion MCP 연동

Dev Log 주입 시 아래 정보 사용:

- DB: 바이브코딩 Dev Log
- 필수 속성: 이름(title), 실행일(date), 프로젝트(select:SnapContext),
  유형(select), 결과(select), 교훈(text), 메모(text),
  관련 파일(text), 역전파 상태(select:미처리), 태그(multi_select)
- SoT Key 형식: [날짜] 유형-번호: 제목

## ⚡ SnapContext 고유 주의사항

- captureVisibleTab 연속 호출 시 510ms 이상 delay 필수
- CSS 확대는 transform: scale 금지 → width 직접 변경
- onFocus 핸들러에서 풀 재렌더 금지 (focus loop)
- chrome.commands 단축키 등록 전 타겟 브라우저 예약키 확인

## ⚙️ 작업 가드 (3원칙 · DoD)

> RULES.md(SoT)의 미러. vhk sync 가 CLAUDE.md 에는 「코딩 규칙」 섹션을 전파하지 않아 사용자 섹션으로 둠(sync 시 보존됨).

**작업 3원칙 (절대 — 모든 작업 전):**
1. **스코프 고정** — `.vhk/mission.json` scope/forbidden 위반 금지. 요청 안 한 파일·기능·리팩토링 임의 변경 금지.
2. **fallback 금지** — 조용한 우회·빈 catch·더미 반환·가짜 성공 금지. 실패는 드러내고 근본 원인 수정.
3. **test-first** — 구현 전 실패하는 테스트 먼저 작성.

**DoD (완료 판정 3게이트):** ① `pnpm test` green ② `vhk mission check` 위반 0(스코프 내 변경만) ③ `tsc --noEmit` + `vite build` 통과.

<!-- vhk:rules:start -->
> ⚡ 아래 규칙 섹션은 RULES.md에서 자동 생성됨 (vhk sync). 직접 수정 금지.

## 기술 스택 (변경 시 ADR 필수)
- Manifest V3
- Vite + @crxjs/vite-plugin
- TypeScript strict (any 금지, as 최소화)
- Vanilla TS + CSS (React/Preact 사용 금지)
- Side Panel API (chrome.sidePanel)
- CSS 변수 기반 dark productive 테마

## 기록 규칙
- 새 라이브러리/API/패턴 선택 → docs/adr/ 에 ADR (YAML 프론트매터: id, date, tags)
- 기능 완성 → docs/log/YYYY-MM-DD-{작업명}.md (세션·마일스톤 로그)
- 에러 해결 → docs/troubleshooting/ (재현·원인·해결)
- 새로 배운 것 → docs/til.md 에 한 줄
- 스키마/타입 변경 → docs/changelog.md 에 기록

<!-- vhk:rules:end -->
