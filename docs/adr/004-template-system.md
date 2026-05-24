---
id: adr-004-template-system
date: 2026-05-10
tags: [adr, prompt, template, context-pack]
---

# ADR 004: Mustache-Lite 템플릿 시스템 도입

## 상태

Accepted

## 컨텍스트

v0.1.0에서 `buildPrompt()`는 버그 리포트 전용 프롬프트를 문자열 결합으로 하드코딩하고 있었다. 리팩토링·레퍼런스 등 새 프롬프트 유형이 필요해졌고, 하드코딩 방식으로는 유형이 추가될 때마다 TypeScript 소스를 수정·빌드해야 하므로 확장성이 없었다.

## 결정

1. **Mustache-lite 템플릿 엔진** (`src/context-pack/template-engine.ts`) 을 자체 구현한다.
   - `{{var}}` 변수 치환, `{{#if key}}…{{/if}}` 조건부, `{{#each list}}…{{/each}}` 반복만 지원.
   - Handlebars(~77 kB gzip) 같은 외부 라이브러리는 확장 프로그램 번들에 과도하다고 판단.
2. **프롬프트 템플릿 3종**을 `prompts/templates/*.md`에 Markdown 파일로 관리한다.
   - `bug-report.md` — 🐛 버그 리포트
   - `refactor.md` — 🔧 리팩토링
   - `reference.md` — 📐 레퍼런스
   - Vite `?raw` import로 빌드 시 문자열로 번들에 포함.
3. **ContextPackPanel 드롭다운**으로 템플릿을 선택한다.
   - 선택 값은 `chrome.storage.local`에 `promptTemplate` 키로 유지.
   - 기존 모드 핍(pip) UI를 제거하고 드롭다운 셀렉트로 통합.
4. **레거시 prompt 빌더**(문자열 결합 `buildPrompt`)를 완전 제거하고, `buildTemplatePrompt(pack, templateId, extras)` 하나로 대체한다.

## 대안 검토

| 대안 | 판단 |
|---|---|
| **Handlebars / Mustache.js** | 번들 크기 증가(~77 kB gzip). 확장에서 사용하는 기능은 `if`, `each`, 변수 치환뿐이라 자체 구현이 충분. |
| **하드코딩 유지 + 분기** | 템플릿 추가마다 TS 수정·빌드 필요. 비개발자 기여 불가. |
| **사용자 커스텀 템플릿 에디터** | v0.1 범위 초과. 향후 확장 가능하도록 엔진은 범용으로 설계. |

## 결과

- 레거시 `buildPrompt` 함수 및 관련 테스트 완전 제거.
- 번들 크기 약 **9.5% 감소** (레거시 문자열 결합 코드 + 미사용 모드 분기 제거 효과).
- 새 프롬프트 유형 추가 시 `prompts/templates/`에 `.md` 파일 1개 + `prompt-builder.ts`의 import·map에 1줄씩만 추가하면 완료.
- 템플릿 엔진은 `renderTemplate(template, ctx)` 시그니처로 Context Pack 외 다른 용도에도 재사용 가능.
