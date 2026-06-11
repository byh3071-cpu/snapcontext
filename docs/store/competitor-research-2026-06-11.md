# 경쟁사 스토어 listing 리서치 (2026-06-11)

> Chrome Web Store listing 5건 직접 fetch. 수치는 2026-06-11 스토어 표기값.
> 목적: `listing-0.2.0-draft.md` 카피 구조 개선 근거.

## 경쟁사별 요약

### 1. GoFullPage — 11M 사용자 · 4.9★ (84K 리뷰) — 카테고리 1위
- 한 줄 설명: "Capture a screenshot of your current page in entirety and reliably—**without requesting any extra permissions!**" → 기능보다 **신뢰(권한 최소주의)를 태그라인에 전면 배치**.
- 첫 문단에 사용법+단축키 즉시 제시: "Click on the extension icon (or press **Alt+Shift+P**)" — 훅에서 10초 안에 쓰는 법을 알게 함.
- 형식: 이모지·헤더 전무, 순수 문단 ~400단어. 강조는 별표(*No bloat, no ads*)만. 1위 listing이 가장 미니멀.
- 유료 티어는 본문 중간에 "NEW: …premium editor" 한 줄로만 — 무료 가치 먼저, 업셀은 절제.
- 클로징: 문제 시 support flag 아이콘으로 신고 유도 — 리뷰 대신 지원 채널.
- 약점: 본문 하단 v0.0.1부터의 체인지로그 ~2,400단어 덤프 → 핵심이 묻힘.

### 2. Awesome Screenshot & Screen Recorder — 4M 사용자 · 4.7★ (29.2K)
- 한 줄 설명: "The best screen recorder and screen capture & screenshot tool to record screen." → 전형적 **키워드 스터핑**, 베네핏 없음 (피할 것).
- 본문 훅은 질문형(사용 상황으로 시작) → **"10 reasons to choose" 숫자 리스트** → 녹화 → 캡처 → 연락처. ~650단어.
- 형식: 이모지 헤비(🔟1️⃣👍🎦) + ▸ 불릿 + ALL-CAPS 헤더.
- 사회적 증거를 리스트 안에 내장: "stable service for more than 10 years", "3 millions users".
- 클로징: 피드백 버튼/이메일 + 감사 인사. 프라이버시 카피는 한 줄 수준으로 약함.

### 3. FireShot — 3M 사용자 · 4.8★ (50.8K)
- 한 줄 설명: 동사+출력 포맷 나열형 (FULL webpage screenshots → PDF/JPEG/GIF/PNG…).
- 구조: 가치 제안 → **프라이버시 보증(상단 배치)** → PCMag 수상 → 7 reasons(1️⃣~7️⃣) → Pro ✓ 리스트. ~350단어 컴팩트.
- **프라이버시 카피 카테고리 최고**: "stored locally. It never leaves your computer, so it's 100% safe" — 민감 권한 우려를 본문 초반에 선제 해소.
- 사회적 증거: PCMag "The Best Free Google Chrome Extension" 제3자 인용 1개를 굵게.
- 유스케이스 불릿이 기능이 아니라 **유저의 일**로 서술 ("Save receipts, tickets, and order confirmations").
- 약점: 마지막 줄이 CTA 없이 기능 항목으로 뚝 끊김.

### 4. Scribe (AI Documentation) — 1M 사용자 · 4.8★ (832)
- 한 줄 설명: "**Document any workflow automatically. Share beautiful step-by-step guides in seconds.**" — 기능 0개, 순수 결과/시간 베네핏. 카테고리 내 최고 태그라인.
- 구조: ALL-CAPS 섹션 5개, 특히 **SEE HOW IT WORKS(1️⃣2️⃣3️⃣ 3단계)** + CTA 전용 섹션.
- ✅ 수치 불릿("12x faster", "63% faster") + 사회적 증거 물량전(Fortune 500·Editor's Pick·Forbes·G2).
- 약점: B2B SaaS 톤 과함, 스토어 실평점 표본(832)과 본문 거대 수치의 괴리 = 과장감.

### 5. Lightshot — 2M 사용자 · 4.4★ (7K) — 그룹 내 최저 평점
- 별표 불릿 6개 ~280단어가 전부. 단축키·사용법·프라이버시·CTA 전무.
- "upload it to the server"라면서 보관 기간·공개 범위·삭제 정책 무설명 — 공유 도구로서 신뢰 카피 부재.
- **"설명을 안 다듬으면 어떻게 되는가"의 대조군.**

## 공통 구조 패턴 (상위 listing 골격)

1. **태그라인 = 차별점 1개 선언** — 기능 카탈로그 아님 (GoFullPage "추가 권한 없음", Scribe "자동+초 단위").
2. **훅(첫 1-3문장)**: 무엇 + 어떻게 시작(아이콘/단축키) 즉시 제시.
3. **본문 골격**: 훅 → (프라이버시) → 숫자 리스트형 이유(7~10) → 사용법 3단계 → 유스케이스 → 무료/Pro → 지원 클로징.
4. **프라이버시는 캡처 카테고리 필수 섹션** — 상위권일수록 상단 1/3 배치, "로컬 처리/미전송/미수집" 명시 문장.
5. **숫자 매긴 리스트**가 스캔성 표준 (이모지는 선택 — 1위는 이모지 0개).
6. **사회적 증거 = 제3자 + 숫자 조합** (수상·운영 연수·사용자 수).
7. **클로징 = 피드백 채널 안내** — 부정 리뷰를 지원 티켓으로 전환.
8. 실효 본문 350~650단어. 그 이상은 잉여.

## SnapContext 적용 권고 7

1. **태그라인 = [자동+결과물] + [익명/무계정] 2요소만** — 키워드 나열 금지.
2. **첫 문단에 대표 단축키 1개** (Alt+Shift+V) — 5개 전부는 훅에 넣지 않음.
3. **프라이버시 블록 상단 1/3** + 7일 자동 삭제를 비용이 아닌 **프라이버시 자산으로 재프레임** (Lightshot이 비워둔 신뢰 공백을 정확히 메우는 자리).
4. **"이렇게 동작합니다" 1️⃣2️⃣3️⃣ 3단계 섹션** (캡처 → AI 컨텍스트 생성 → 공유/복사).
5. **유스케이스 불릿(상황 주어)을 기능 리스트보다 앞에** — 'AI에게 화면을 전달하는 도구'로 포지셔닝.
6. **단축키 5개 전체 표 섹션** — 조사 5개 listing 중 전체 표 제공처 없음 = 차별 섹션.
7. **클로징 피드백 유도** — "리뷰보다 먼저 알려주세요" + 채널 링크.

## 안티패턴 3 (금지)

1. **키워드 스터핑 태그라인** (Awesome Screenshot식).
2. **본문 체인지로그 덤프** (GoFullPage식) — 변경 이력은 GitHub Release 링크로 분리.
3. **신뢰 카피 공백** (Lightshot식) — 업로드 수반 기능은 보관·삭제·접근 정책 명시 필수. 검증 불가 통계 모방도 금지(인디 확장은 스토어 수치와 본문 주장 괴리 = 즉시 과장으로 읽힘).

---
조사 대상 ID: GoFullPage(fdpohaocaechififmbbbbbknoalclacl) · Awesome Screenshot(nlipoenfbbikpbjkfpfillcgkoblgpmj) · FireShot(mcbpblocgmgfnpjjppndjkmgjaogfceg) · Scribe(okfkdaglfjjjfefdcppliegebpoegaii) · Lightshot(mbniclmhobmnbdlbpiphghaielnnpgdp)
