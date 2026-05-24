---
id: troubleshoot-001-activetab-side-panel
date: 2026-05-07
tags: [troubleshooting, activeTab, sidePanel, permissions]
---

# activeTab 권한이 유효하지 않다는 경고 (Side Panel)

## 증상

확장 Side Panel을 연 직후 개발자 도구나 콘솔에 다음과 유사한 메시지가 보인다.

- `The 'activeTab' permission is not in effect because this extension has not been invoked …`

## 원인

`activeTab`은 사용자가 **확장 UI(예: 브라우저 액션)** 로 명시적으로 실행했을 때 한시적으로 부여되는 권한 모델에 가깝다. **Side Panel만** 열었을 때는 “호출(invoked)”로 인정되지 않는 경우가 있다.

## 해결

- manifest에서 **`activeTab`을 제거**하고, 캡쳐에 필요한 접근은 **`host_permissions`(예: `<all_urls>`)** 로 충당한다.
- SnapContext v0.1은 이 방식을 채택했다. 자세한 결정은 [ADR 002](../adr/002-host-permissions-over-activetab.md) 참고.

## 확인

- `dist`를 다시 로드한 뒤 동일 시나리오로 재현 시도.
- 여전히 다른 경고가 나오면 메시지 전문과 재현 단계를 로그에 남긴다.
