---
id: prompt-template-bug-report
date: 2026-05-10
tags: [prompt, template]
---

# 🐛 버그 리포트

## 환경
- URL: {{source.url}}
- 뷰포트: {{source.viewport.width}}×{{source.viewport.height}}
- UA: {{source.userAgent}}
- 캡쳐 방식: {{source.captureType}}

## 스크린샷
[첨부 이미지 참고]

{{#if pins}}
## 핀 주석
{{#each pins}}
- **핀 {{id}}** ({{x}}%, {{y}}%): {{memo}}
{{/each}}
{{/if}}

## 요청
위 스크린샷에서 표시된 핀 위치의 문제를 분석해주세요.

1. 각 핀 위치에서 발생한 버그의 **원인 추정**
2. 재현 조건 (어떤 상황에서 발생하는지)
3. **수정 코드** 제안 (해당 컴포넌트 기준)
4. 동일 패턴의 다른 위치에도 같은 문제가 있는지 점검

{{#if context.userNote}}
## 추가 메모
{{context.userNote}}
{{/if}}
