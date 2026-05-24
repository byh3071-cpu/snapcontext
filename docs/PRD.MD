# SnapContext — Product Requirements Document

## 한 줄 정의
웹에서 발견한 UI 문제/에러/레퍼런스를 딸깍으로 캡쳐하고, AI가 바로 이해하는 Context Pack으로 변환하는 브라우저 확장 프로그램.

## 문제
바이브코딩 중 발견한 UI 이슈나 레퍼런스를 AI에게 전달하려면:
1. 스크린샷 캡쳐
2. 이미지 편집 도구에서 주석 추가
3. Notion에 정리
4. AI에게 "이 스크린샷은 ~이고, 여기서 ~가 문제야" 라고 텍스트로 설명
5. 맥락이 빠지면 다시 설명

→ 매번 5단계 수작업. 맥락이 전달 과정에서 유실됨.

## 해결
캡쳐 → 주석 → Context Pack 생성 → AI/Notion 전달을 **한 번에**.

## 타겟 유저
- 바이브코더 (AI 코딩 에이전트 사용자)
- 프론트엔드 개발자 (UI 버그 리포트)
- 프로덕트 디자이너 (레퍼런스 수집)

## v0.1 범위 (Week 1 — MVP)
| 기능 | 설명 | 우선순위 |
|------|------|----------|
| Side Panel UI | 확장 아이콘 클릭 → 사이드 패널. dark productive 테마 | P0 |
| Visible Capture | 현재 보이는 화면 캡쳐 (chrome.tabs.captureVisibleTab) | P0 |
| Element Capture | 페이지 요소 클릭 선택 → 해당 영역 크롭 | P0 |
| Document Capture | article/main 태그 자동 감지 → 해당 영역 캡쳐 | P1 |
| Full Page Capture | 스크롤 전체 페이지 stitch 캡쳐. 기본 단축키 `Alt+Shift+G` | P1 |
| 캡쳐 미리보기 | Side Panel에 캡쳐 이미지 표시 | P0 |
| 번호 핀 주석 | 이미지 위 클릭으로 핀 추가, 각 핀에 메모 | P0 |
| Context Pack 생성 | JSON + Markdown 포맷 (CONTEXT-PACK-SPEC.md 참조) | P0 |
| AI 프롬프트 생성 | Context Pack 기반 Markdown → 클립보드 복사 | P0 |
| PNG 다운로드 | 주석 포함 이미지 로컬 저장 | P1 |
| Notion DB 저장 | 텍스트 + 이미지 URL placeholder | P2 |

## v0.1 제외 (v0.2+)
- Supabase 이미지 업로드
- console.error 자동 수집 (Debug Pack)
- before/after 비교 캡쳐
- 화살표, 블러, 형광펜 주석
- vhk recap 연동

## 기술 스택
- Naver Whale (Chromium 기반) + Chrome 호환
- Manifest V3
- Vite + @crxjs/vite-plugin
- TypeScript (strict)
- Vanilla TS + CSS (프레임워크 없음)
- Side Panel API (chrome.sidePanel)

## 성공 기준
- 캡쳐 → Context Pack 복사까지 10초 이내
- Cursor/Claude/ChatGPT에 붙여넣기했을 때 AI가 추가 질문 없이 맥락 파악

## 생태계 위치
- VHK (CLI) = 프로젝트 생애주기
- SnapContext (Extension) = 실행 중 맥락 캡쳐
- 연결: vhk recap ← Context Pack 자동 수집 (v0.3)
