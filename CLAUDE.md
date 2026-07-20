---
id: claude-md-root
date: 2026-05-07
tags: [process, documentation]
---

# 규칙

1. 무조건 한국어로 해라. 필요한 기술 용어는 영어 허락 하되 , 영어 남발 금지.

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

<!-- YOHAN-ROSTER-CARD:BEGIN (managed by yohan-brain ops/propagation ??SoT瑜?怨좎퀜?? 吏곸젒?섏젙 湲덉?) -->
## 상시 지휘자 — 라우팅 카드 (yohan ecosystem)

> SoT: yohan-brain `memory/core/agent-roster.yaml` `conductor_always_on` (v0.4+, status=active면 obey).
> 이 레포 자체 규칙(RULES/CLAUDE LIVE)이 있으면 그게 우선(precedence).

- 모든 태스크: 해법 구상 **전에** 크기 판정 → `라우팅: S|M|L — 계획 1줄 (근거: 파일수/신규설계/리스크)` 선언 후 진행. 키워드("풀개발") 불필요, 항상.
- **S**(≤2파일·신규설계 없음·≤15분): 지휘자 단독. 서브에이전트·orca 금지(오버헤드).
- **M**(3~6파일·부분 신규): 서브에이전트 티어링 — 탐색 haiku → 계획 opus(승인) → 구현 sonnet → 적대검증 opus/fable 루프.
- **L**(≥7파일·신규 모듈·다레포·릴리즈급): /goal orca 풀파이프라인 — Scout→Plan승인★→worktree fanout→타벤더 적대검증→머지게이트★. "풀개발"=L 강제.
- 하드 트리거(분류 생략): 스키마 마이그레이션·인증/결제/보안·크로스레포·릴리즈 = 무조건 **L** · 오타·문서/주석만 = **S**.
- 애매하면 작은 쪽 시작 → 검증 실패(테스트/tsc/critic) 시 **재선언 후 승급**(몰래 계속 금지).
- 동시 작업 = worktree만. 같은 레포·같은 브랜치 2에이전트 금지.
- Antigravity(agy) = 보조·초안 전용(메인 지휘 금지) — 산출물은 상위 티어 검증 필수.
- 배포·시크릿·npm publish·main 직push = 사람 게이트(불변).
<!-- YOHAN-ROSTER-CARD:END -->
