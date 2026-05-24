---
id: pattern-storage-large-payload-budget
date: 2026-05-24
tags: [pattern, storage, quota, chrome-extension]
---

# 큰 payload 저장 budget pruning

- 패턴명: 큰 payload 저장 budget pruning
- 카테고리: state
- 증상: 캡처 이미지나 첨부 데이터가 몇 개만 쌓여도 로컬 히스토리 저장이 실패하거나 조용히 누락된다.
- 원인: `chrome.storage.local`은 로컬 저장소지만 큰 base64 payload를 무제한 저장하기에 적합하지 않다.
- 해결: 원본 payload는 개별 byte 제한 이하일 때만 저장하고, 항상 썸네일 fallback을 저장한다. 전체 히스토리 JSON 크기도 budget 안에 들어올 때까지 오래된 원본 payload부터 제거한다.
- 적용조건: 브라우저 확장/클라이언트 앱에서 이미지, 녹화, 로그 번들 등 큰 base64 문자열을 히스토리에 저장한다.
- 출처프로젝트: SnapContext
- 태그: storage, quota, base64, history
- 발견일: 2026-05-24
- 출처DevLog: docs/devlog/2026-05-24-snapcontext-review-fixes.md
