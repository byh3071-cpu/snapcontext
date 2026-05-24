---
id: log-2026-05-24-v013-store-candidate
date: 2026-05-24
tags: [release, store-candidate, v0.1.3]
---

# SnapContext v0.1.3 Store Candidate

## 목표

`v0.1.3`은 Phase 2 스토어 제출 준비용 패치 릴리스다. 기능 확장은 하지 않고, 배포 전 버전/문서 SoT와 풀페이지 캡처 단축키 기준을 고정한다.

## 포함

- 확장 버전 `0.1.3` 동기화
- UI 표시 버전 `v0.1.3` 동기화
- 풀페이지 캡처 기본 단축키 `Alt+Shift+G` 확정
- Full Page Capture를 v0.1 포함 기능으로 PRD 반영
- Phase 2 스토어 제출 체크리스트 작성

## 제외

- Supabase Storage
- Notion image embed 및 DB save
- Debug Pack
- Obsidian Markdown export
- Lazyweb MCP, Prompt Vault fork, vhk recap 연동

## Phase 2 스토어 제출 체크리스트

- [x] GitHub repo 정리 및 push — https://github.com/byh3071-cpu/SnapContext
- [x] Chrome Web Store 스크린샷 5장 준비 (`1280x800`) — `docs/store/chrome-web-store/screenshots/`
- [x] Chrome Web Store 제출 — 검토 대기 중 (2026-05-24)
- [x] Whale Store 제출 — 리뷰 요청 (2026-05-24)
- [x] 빌드/제출 로그 — `docs/log/2026-05-24-v013-store-submission.md`

## 수동 확인 (2026-05-24 완료)

- [x] Chrome `chrome://extensions/shortcuts` — V/E/M/G
- [x] Whale `whale://extensions/shortcuts` — V/E/M/G (수동 등록)
- [x] 긴 페이지 전체 캡처 — visible보다 긴 결과 확인
- [x] 4캡처 모드 + PNG 동작 확인
