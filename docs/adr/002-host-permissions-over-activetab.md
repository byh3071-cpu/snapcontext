---

## id: adr-002-host-permissions-over-activetab
date: 2026-05-07
tags: [adr, manifest, permissions, mv3]

# ADR 002: `activeTab` 제거 및 `host_permissions`로 캡쳐 권한 확보

## 상태

Accepted

## 컨텍스트

Side Panel만으로 워크플로를 열면 브라우저 액션(user gesture)과 연결된 `activeTab` 권한이 **유효하지 않다**는 경고가 나올 수 있다. `captureVisibleTab` 등은 그 순간 제한적으로 동작한다.

## 결정

- `manifest.json`의 `permissions`에서 `**activeTab`을 제거**한다.
- 이미 선언된 `**"host_permissions": ["<all_urls>"]`** 로 탭 URL에 대한 지속적 접근을 두고, 캡쳐·crop·메타 수집은 이 권한 전제로 동작한다.

## 결과

- Side Panel 중심 UX에서도 캡쳐 API가 안정적으로 사용 가능하다.
- 사용자에게 더 넓은 사이트 접근 권한을 요청한다는 트레이드오프가 있다(스토어·내부 배포 시 설명 필요).

## 참고

- troubleshooting: `[001-activeTab-side-panel-warning.md](../troubleshooting/001-activeTab-side-panel-warning.md)`