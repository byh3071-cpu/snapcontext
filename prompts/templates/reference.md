---
id: prompt-template-reference
date: 2026-05-10
tags: [prompt, template]
---

# 📐 레퍼런스 참고 구현

## 레퍼런스 출처
- URL: {{source.url}}
- 페이지: {{source.title}}

## 스크린샷
[첨부 이미지 참고]

{{#if pins}}
## 핀 주석
{{#each pins}}
- **핀 {{id}}** ({{x}}%, {{y}}%): {{memo}}
{{/each}}
{{/if}}

## 요청
위 스크린샷을 레퍼런스로 참고하여 구현해주세요.

1. 핀으로 표시한 부분의 **디자인 패턴/구조 분석**
2. 우리 프로젝트에 적용할 때의 **변환 포인트** (그대로 vs 변형)
3. **구현 코드** (해당 컴포넌트/스타일)
4. 원본과 다르게 가져가야 할 부분이 있으면 이유와 함께

{{#if context.userNote}}
## 추가 메모
{{context.userNote}}
{{/if}}
