---
id: devlog-2026-05-24-snapcontext-review-fixes
date: 2026-05-24
tags: [devlog, review, storage, e2e]
---

# [2026-05-24] 개선-001: 프로젝트 리뷰 후 핵심 안정성 수정

- 프로젝트: SnapContext
- 유형: 개선
- 결과: 성공
- 관련 파일: `src/background/service-worker.ts`, `src/storage/history.ts`, `src/sidepanel/App.ts`, `src/sidepanel/components/HistoryList.ts`, `tests/e2e/loaded-pack-pin.mjs`
- 역전파 상태: 미반영

## 메모

프로젝트 리뷰에서 확인한 배포 전 리스크를 우선 수정했다.

- 모든 페이지 로드마다 MAIN world 디버그 collector를 주입하던 `tabs.onUpdated` 경로 제거
- `captureVisibleTab` 호출을 공통 throttle 큐로 직렬화
- 캡처 히스토리 원본 이미지 저장량 제한 및 전체 storage budget pruning 추가
- 핀/메모 변경 시 캡처 히스토리의 `contextPack`과 `pinsCount` 갱신
- 히스토리 스와이프 삭제 직후 row click이 실행되는 충돌 방지
- 패키지/UI 버전을 `0.1.2`로 동기화
- 히스토리 로드 후 추가한 핀/메모가 reload 뒤에도 복원되는 E2E 검증 추가
- 후속 확인: 전체 캡처 기본 단축키를 `Alt+Shift+F`에서 `Alt+Shift+G`로 변경하고, 단축키 명령 경로의 fallback tab/pending payload 처리 보강

## 검증

- `npm.cmd test` 통과: 7/7
- `npm.cmd run build` 통과
- `npm.cmd run test:e2e:all` 통과: smoke 10/10, pin-flow 6/6, loaded-pack-pin 8/8, pin-delete 9/9, coverage 17/17, full-page-shortcut 3/3

## 교훈

Chrome 확장에서 `chrome.storage.local`은 로컬이라도 무제한 저장소가 아니다. 원본 캡처 이미지처럼 큰 payload는 개별 크기 제한과 전체 budget pruning을 같이 두고, 히스토리에는 썸네일 fallback을 유지해야 조용한 저장 실패를 줄일 수 있다.

캡처 API처럼 브라우저 quota가 있는 API는 기능별로 따로 delay를 넣지 말고 service worker의 단일 큐에서 직렬화해야 단축키/버튼 연타와 풀페이지 캡처가 같은 제한을 공유한다.

브라우저 단축키는 매니페스트 등록 성공과 실제 키 입력 전달이 다를 수 있다. 예약키 가능성이 있는 조합은 피하고, 단축키 경로에서는 `chrome.commands.onCommand`가 넘겨준 `tab`을 실제 작업 경로 끝까지 전달해야 한다.
