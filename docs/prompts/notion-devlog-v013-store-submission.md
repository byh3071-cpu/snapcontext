---
id: prompt-notion-devlog-v013-store
date: 2026-05-24
tags: [notion, devlog, prompt]
---

# Notion Dev Log 적재 프롬프트 — v0.1.3 스토어 제출

아래를 Cursor/Claude에 붙여넣고 Notion MCP로 **바이브코딩 Dev Log** DB에 항목을 생성한다.

---

## 프롬프트 (복사용)

```
바이브코딩 Dev Log DB에 SnapContext 마일스톤 1건을 생성해줘.

SoT Key: [2026-05-24] 마일스톤-001: v0.1.3 Chrome·Whale 스토어 제출

속성:
- 이름(title): [2026-05-24] 마일스톤-001: v0.1.3 Chrome·Whale 스토어 제출
- 실행일(date): 2026-05-24
- 프로젝트(select): SnapContext
- 유형(select): 마일스톤
- 결과(select): 성공
- 교훈(text): 스토어 제출은 ZIP·Privacy·권한 설명·이메일 인증이 한 세트. host_permissions는 ADR 002상 필요하나 CWS 심사 지연 가능.
- 메모(text): GitHub 공개, E2E 43/43, CWS 검토 대기, Whale 리뷰 요청. 여정 HTML: docs/store/yohan-studio/snapcontext-v013-journey.html
- 관련 파일(text): docs/log/2026-05-24-v013-store-submission.md, docs/store/yohan-studio/snapcontext-v013-journey.html
- 역전파 상태(select): 반영완료
- 태그(multi_select): Chrome Extension, TypeScript, 배포, manifest, sidePanel

본문(content)에는 타임라인·검증 수치·다음 단계(심사 대기)를 Notion 마크다운으로 요약해줘.
```

---

## DB

- 이름: 바이브코딩 Dev Log
- data_source_id: `f8e79e6c-db2c-476e-a8c0-85f25dd2399f`

## 역전파 상태 옵션

스키마 기준: `미처리` | `반영완료` | `스킵` (AGENTS.md의 "미반영"은 `미처리`에 해당)
