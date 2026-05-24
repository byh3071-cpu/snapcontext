---
id: prompt-template-refactor
date: 2026-05-10
tags: [prompt, template]
---

# 🔧 리팩토링 요청

## 대상 페이지
- URL: {{source.url}}
- 캡쳐 영역: {{source.captureType}}

## 스크린샷
[첨부 이미지 참고]

{{#if pins}}
## 핀 주석
{{#each pins}}
- **핀 {{id}}** ({{x}}%, {{y}}%): {{memo}}
{{/each}}
{{/if}}

## 요청
위 스크린샷의 UI/코드를 개선해주세요.

1. 각 핀 위치에서 지적한 부분의 **현재 문제점**
2. 개선 방향 제안 (UX / 코드 구조 / 성능)
3. **리팩토링 코드** (before → after)
4. 변경 시 영향 범위 (사이드이펙트 체크)

{{#if context.userNote}}
## 추가 메모
{{context.userNote}}
{{/if}}
