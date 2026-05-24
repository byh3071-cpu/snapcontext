---
id: trouble-007-loaded-pack-pin-prompt-mismatch
date: 2026-05-10
tags: [troubleshooting, history, prompt, context-pack]
---

# 007 — 히스토리에서 불러온 팩에 추가한 핀이 프롬프트에 누락됨

## 재현

1. 페이지 캡처 (자동으로 히스토리 저장)
2. 사이드패널 닫았다가 다시 열기
3. "캡처 기록" 에서 위 항목 클릭 → 옛 팩 로드됨, 미리보기 + 메모 복원
4. 이미지 위에 새 핀 ❶ 추가
5. 핀 메모에 "이 사람 누구야?" 입력
6. 드롭다운에서 "📐 레퍼런스" 선택
7. "AI 프롬프트 복사" 클릭
8. 메모장 등에 붙여넣기

**기대**: 프롬프트에 `## 핀 주석\n- **핀 1** (X%, Y%): 이 사람 누구야?` 포함.
**실제**: `## 핀 주석` 섹션 자체가 통째로 누락됨.

화면(미리보기)에는 핀이 보이고 메모도 입력되어 있는데 프롬프트엔 없음 → 사용자 혼란.

## 원인

[src/sidepanel/components/ContextPackPanel.ts](../../src/sidepanel/components/ContextPackPanel.ts) 의 `tryBuildPack`:

```ts
const tryBuildPack = (): ContextPack | null => {
  if (loadedPack) return loadedPack   // ← short-circuit
  ...
  return generateContextPack({...})
}
```

히스토리 클릭으로 `loadedPack` 이 set 되면 이 short-circuit 으로 인해 항상 옛 팩 그대로 반환됨. 옛 팩의 `annotations` 는 저장 시점의 핀들 (현재 시나리오에서는 빈 배열).

→ 템플릿 렌더 시 `{{#if pins}}` 가 false → `## 핀 주석` 섹션 통째로 사라짐.

## 해결

라이브 캡처 입력이 있으면 **항상 fresh 생성**, `loadedPack` 은 라이브 캡처 부재 시에만 폴백으로:

```ts
const tryBuildPack = (): ContextPack | null => {
  // 라이브 캡처 + 현재 pins 로 항상 재생성. loadedPack 은 캡처 상태가
  // 정말 비어있을 때만 폴백으로.
  const base = deps.buildInput()
  if (base) {
    return generateContextPack({
      ...base,
      mode,
      projectProfile: currentProfile(base.sourceUrl)
    })
  }
  if (loadedPack) return loadedPack
  return null
}
```

[src/sidepanel/components/ContextPackPanel.ts:311](../../src/sidepanel/components/ContextPackPanel.ts#L311)

`buildInput()` 은 항상 현재 pins 배열을 closure 로 참조하므로, fresh generateContextPack 호출 시 새 핀이 자동 포함됨.

## 회귀 테스트

[tests/e2e/loaded-pack-pin.mjs](../../tests/e2e/loaded-pack-pin.mjs) — 시나리오 그대로 자동 재현:
1. 가짜 캡처 주입 → 자동 히스토리 저장
2. 페이지 reload (loadedPack 없는 상태)
3. 히스토리 항목 클릭 → loadedPack 설정
4. 새 핀 추가 + 메모 입력
5. AI 프롬프트 복사
6. 클립보드 텍스트에 `## 핀 주석` + 입력한 메모 포함 검증

6/6 통과 확인.

## 일반화된 교훈

캐시/메모이즈가 사용자가 보고 있는 라이브 상태와 어긋날 수 있는 경계를 항상 검토. **사용자가 변경할 수 있는 상태가 있으면 캐시 short-circuit 은 위험** — 라이브 입력 우선, 캐시는 폴백.
