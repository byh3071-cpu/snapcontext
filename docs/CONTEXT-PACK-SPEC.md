# Context Pack Specification v0.1

## 목적
Context Pack은 캡쳐한 화면 + 주석 + 메타데이터를 AI가 바로 이해할 수 있는 구조화된 패키지로 변환한 것이다.

## JSON Schema

​
{
"version": "0.1",
"id": "snap_1715050800000_abc12",
"createdAt": "2026-05-07T07:50:00+09:00",
"source": {
"url": "https://example.com/dashboard",
"title": "Dashboard — My App",
"viewport": { "width": 1920, "height": 1080 },
"userAgent": "Mozilla/5.0 ...",
"captureType": "visible | element | document"
},
"capture": {
"imageBase64": "data:image/png;base64,...",
"width": 1920,
"height": 1080,
"selectedElement": "div.card > .chart-container"
},
"pins": [
{
"id": 1,
"x": 45.2,
"y": 30.8,
"memo": "이 차트의 Y축 라벨이 잘림"
},
{
"id": 2,
"x": 72.1,
"y": 55.0,
"memo": "hover 시 툴팁이 뒤에 가려짐"
}
],
"context": {
"userNote": "대시보드 차트 영역 UI 이슈 2건",
"tags": ["ui-bug", "chart", "dashboard"]
}
}

## 필드 설명

### source
| 필드 | 타입 | 설명 |
|------|------|------|
| url | string | 캡쳐한 페이지 URL |
| title | string | 페이지 타이틀 |
| viewport | object | 브라우저 뷰포트 크기 |
| userAgent | string | 브라우저 UA 문자열 |
| captureType | enum | visible / element / document |

### capture
| 필드 | 타입 | 설명 |
|------|------|------|
| imageBase64 | string | 캡쳐 이미지 (base64 PNG) |
| width | number | 이미지 너비 (px) |
| height | number | 이미지 높이 (px) |
| selectedElement | string? | Element Capture일 때 CSS selector |

### pins
| 필드 | 타입 | 설명 |
|------|------|------|
| id | number | 핀 번호 (1부터 순차) |
| x | number | 이미지 내 상대 X 좌표 (%, 0-100) |
| y | number | 이미지 내 상대 Y 좌표 (%, 0-100) |
| memo | string | 사용자 메모 |

### context
| 필드 | 타입 | 설명 |
|------|------|------|
| userNote | string? | 전체 캡쳐에 대한 사용자 노트 |
| tags | string[]? | 수동 태그 (v0.3에서 자동 추천) |

## Markdown Export 포맷 (AI 프롬프트용)

​
SnapContext: Dashboard — My App
URL: https://example.com/dashboard
캡쳐 유형: visible
뷰포트: 1920 × 1080
캡쳐 시간: 2026-05-07 07:50 KST
주석
(45.2%, 30.8%) — 이 차트의 Y축 라벨이 잘림
(72.1%, 55.0%) — hover 시 툴팁이 뒤에 가려짐
노트
대시보드 차트 영역 UI 이슈 2건
요청
위 스크린샷과 주석을 참고하여, 표시된 UI 이슈들을 분석하고 수정 방안을 제안해주세요.
[스크린샷 이미지 첨부]

## ID 생성 규칙
`snap_{unixTimestamp}_{random4chars}`
- 예: `snap_1715050800000_x7k2`

## 확장 예정 (v0.2+)
- `debug` 필드: console.error 로그, network 에러
- `comparison` 필드: before/after 이미지 쌍
- `imageUrl` 필드: Supabase 업로드 후 외부 URL