---
id: vhk-dogfooding-findings
date: 2026-06-06
tags: [vhk, dogfooding, harness, tooling]
---

# vhk 독푸딩 발견 로그 (배포본 v2.3.2)

런북 §0(vhk 셋업) 실행 중 발견. 작업 폴더: SnapContext. vhk = `@byh3071/vhk` v2.3.2.

## ✅ 안전 가드 PASS (버그 아님)

`vhk sync` 첫 실행 시 기존 파일 백업 후 생성 안내 출력:

```
🛟 첫 sync — 기존 파일을 백업한 뒤 생성합니다.
🤖 비대화형(CI/에이전트) — 3개 백업 후 진행. 복원: vhk restore 2026-06-06T13-05-12-317Z
```

→ 런북 §0 step-6 가드 체크 통과. 복원: `vhk restore 2026-06-06T13-05-12-317Z` (백업: `.vhk/backups/`).

---

## 발견 #1 — `vhk init` 이 기존 규칙을 adopt 하지 않음 (중)

- **기대(런북):** `vhk init` → 기존 `.cursorrules`/`AGENTS.md`/`CLAUDE.md` → RULES.md 로 adopt.
- **실제:** 기존 규칙 파일은 "건너뜀" 처리, RULES.md 는 빈 **템플릿**으로 신규 생성. 기존 상세 규칙(메시지 흐름·모듈 책임·금지사항·이미지 처리·Notion 적재) 누락.
- **영향:** init 직후 바로 sync 하면 thin 템플릿이 SoT 가 되어, 다음 sync 가 알맹이 있는 `.cursorrules`(6.4KB)·`CLAUDE.md` 를 빈약하게 덮어씀(백업서 복구는 가능).
- **우회:** sync 전에 기존 `.cursorrules` + `CLAUDE.md` 규칙을 RULES.md 로 수동 통합.
- **vhk 개선안:** init 시 기존 규칙 파일 감지 → RULES.md 로 자동 병합(adopt) 또는 최소한 "thin RULES.md 로 sync 시 손실 위험" 경고.

## 발견 #2 — `vhk sync` 표준 제목 섹션만 전파, 커스텀 섹션 제외 (중)

- **실제:** RULES.md 에서 표준 제목(`코딩 규칙`/`기술 스택`/`커밋`/`기록 규칙`/`아키텍처 규칙`)만 타깃으로 매핑. 커스텀 H2(`0. 작업 3원칙`, `DoD`, `프로젝트 정체성`, `필수 참조 문서`, `고유 주의사항`, `Notion 자동 적재`)는 산출물서 제외, RULES.md 에만 보존.
- **영향:** 런북 핵심인 **3원칙·DoD 가 도구 config 로 전파 안 됨**.
- **우회:** 3원칙·DoD·언어 규칙을 매핑되는 `## 코딩 규칙` 하위 `###` 서브섹션으로 이동 → 전파 확인됨.
- **vhk 개선안:** 미매핑 커스텀 섹션도 전파하는 옵션(예: 「기타 규칙」 버킷) 또는 매핑 가능한 표준 제목 목록 문서화.

## 발견 #3 — (오경보) CLAUDE.md H1 사용자 규칙 보존됨

- **우려:** sync 가 마커 밖 H1(`# 규칙` / "무조건 한국어")을 떨굴까.
- **실제:** 보존됨 ✅. vhk 가 마커(`<!-- vhk:rules:start/end -->`) 밖 사용자 섹션(H1 포함)을 안전 유지. 버그 아님.

## 발견 #4 — `vhk sync` 가 CLAUDE.md 타깃에만 섹션 누락 (중)

- **실제:** `스코프 고정`(3원칙)이 전파된 타깃 = .cursorrules / .windsurfrules / copilot-instructions / .agents / AGENTS.md / GEMINI.md / .clinerules **7개**. **CLAUDE.md 만 누락** — CLAUDE.md 자동생성 블록엔 `기술 스택` + `기록 규칙`만 들어가고 `코딩 규칙`(3원칙·DoD 포함)·`커밋`·`아키텍처`는 빠짐.
- **영향:** 정작 Claude Code 의 주 규칙 파일(CLAUDE.md)이 핵심 가드를 못 봄. 독푸딩 관점 치명적.
- **우회:** CLAUDE.md 에 마커-밖 사용자 섹션 `## ⚙️ 작업 가드 (3원칙·DoD)` 추가(sync 보존 확인됨, dry-run "동일").
- **vhk 개선안:** CLAUDE.md 타깃 섹션 매핑을 .cursorrules·AGENTS.md 수준으로 통일(또는 타깃별 매핑을 RULES.md frontmatter 로 설정 가능하게).

## 부수 관찰 (경미)

- AGENTS.md 에 `## 기술 스택` 섹션이 중복 출력(line 13, 87).

---

## §0 완료 기준 대비

- `.vhk/` 생성 ✅ (mission.json·README·context.md·backups·.gitignore)
- RULES.md 에 기존 규칙 + 3원칙 + DoD ✅
- `vhk sync` 정상(안전 가드 PASS) ✅, 발견 #1·#2·#4 우회 적용 + 로그 기록 ✅
