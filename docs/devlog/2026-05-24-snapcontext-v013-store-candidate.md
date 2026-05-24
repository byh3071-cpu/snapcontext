---
id: devlog-2026-05-24-snapcontext-v013-store-candidate
date: 2026-05-24
tags: [devlog, release, store-candidate, version]
---

# [2026-05-24] 릴리스-001: v0.1.3 Store Candidate 승격

- 프로젝트: SnapContext
- 유형: 릴리스
- 결과: 성공
- 관련 파일: `package.json`, `package-lock.json`, `manifest.json`, `src/sidepanel/App.ts`, `AGENTS.md`, `CLAUDE.md`, `docs/PRD.MD`, `docs/changelog.md`, `docs/log/2026-05-24-v013-store-candidate.md`
- 역전파 상태: 반영완료
- Notion Dev Log: https://www.notion.so/36a9740ab0728162a40ef84ce018782c

## 메모

Phase 2 스토어 제출 준비를 위해 현재 안정화 변경분을 `v0.1.3 Store Candidate`로 승격했다.

- 패키지, 매니페스트, UI 표시 버전을 `0.1.3`으로 통일
- 프로젝트 운영 문서의 현재 버전과 단축키 SoT 갱신
- Full Page Capture를 v0.1 포함 기능으로 PRD 반영
- Phase 2 스토어 제출 체크리스트 문서화

## 검증

- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run test:e2e:all`

## 교훈

배포 후보 승격은 코드 버전만 올리면 충분하지 않다. 확장 매니페스트, UI 표시, 에이전트 운영 문서, PRD, changelog가 서로 다른 버전을 말하면 이후 스토어 제출과 자동화 에이전트 작업에서 기준이 흔들린다.
