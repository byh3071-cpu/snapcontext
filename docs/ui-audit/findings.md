# SnapContext 사이드패널 UI 감사 — findings

- **브랜치**: `feat/ui-polish` (master 기반)
- **방법**: 코드-우선 감사 (브라우저 MCP 미연결 → `global.css` 정독 + 컴포넌트 13개 병렬 감사). 렌더 증거는 `preview.html` 하네스로 사용자가 직접 캡처.
- **날짜**: 2026-06-04
- **목표**: "AI가 찍어낸 느낌" → "사람이 공들인 느낌". **다크 브랜드(네이비+코랄) 유지하고 정돈**. 동작/로직 변경 0, 백엔드 영역 무침범.
- **스코프**: `src/sidepanel/**`, `src/content/**`. 금지: `src/storage|background|notion`, `**/*.env`, `App.ts`(공유버튼 주입부) 가급적 손대지 않음.

---

## 0. 한눈 요약

| 영역 | 현재 | 판정 |
|---|---|---|
| 디자인 토큰 | `:root`에 변수 11개(색 7·radius 1·font 1·아이콘색 2). **스페이싱·타입·그림자·모션 토큰 전무** | 🔴 |
| 그라데이션 | 코랄→보라 `135deg` primary 버튼 **3곳 리터럴 중복** + body 배경 그라데이션 | 🔴 |
| 라디우스 | 토큰은 `12px` 1종인데 실제 `12/10/9/8/7/6/50%/999px` 혼용 | 🔴 |
| 타이포 | font-size **15종+**(0.68~1.4rem), 스케일 없음 | 🔴 |
| 스페이싱 | `14/9/7/22/10px` 등 4/8 그리드 이탈 다수 | 🟠 |
| 그림자 | `0 20px 60px` 등 5종 제각각, 작은 배지에도 과한 blur | 🟠 |
| 아이콘 | lucide SVG + 이모지(🐛🔧📐🔍) + `×` 글리프 + 숫자 라벨 **4종 혼재** | 🔴 |
| 포커스/모션 | `:focus-visible` 링 3곳뿐, hover는 `filter:brightness` 일변도 | 🟠 |
| i18n | 한국어 대체로 일관하나 **영문 툴팁 잔류**(ImageActions) + `whale://` 하드코딩 + em-dash | 🟠 |
| 빈 상태/카피 | 빈 상태 = 회색 한 줄, 일러스트/CTA 없음. placeholder를 설명문 대용 | 🟠 |

핵심 한 줄: **토큰 시스템이 없어서 모든 디테일이 "그때그때 박은 매직값"이고, 그 위에 그라데이션·이모지·과한 그림자가 얹혀 AI 느낌을 만든다.** PHASE 3 토큰화가 임팩트 90%.

---

## A. 디자인 토큰 부재 — 근본 원인 (global.css:1–13)

```css
:root {
  --bg-gradient-start: #1a1a2e;  --bg-gradient-end: #16213e;  /* 보라→네이비 */
  --surface: #0f3460;  --accent: #e94560;  --accent-secondary: #533483;
  --text: #eee;  --text-muted: #aaa;
  --radius: 12px;                 /* 라디우스 단일값 */
  --font: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --panel-icon-coral: #ff6b6b;  --panel-icon-coral-hover: #ff8f8f;
}
```

- 색을 빼면 **스페이싱·타입·라디우스 스케일·그림자·모션 토큰이 0개**. → 컴포넌트 CSS가 전부 raw `px`/`rem`/`rgba()`를 직접 박음(파일 전체에 `rgba(255,255,255,0.06~0.18)`, `rgba(8/10/15,..)`, `rgba(233,69,96,..)` 수백 회).
- `--panel-icon-coral: #ff6b6b`는 `--accent: #e94560`와 또 다른 코랄 → 액센트 색이 사실상 2~3종.
- **개선**: PHASE 3에서 `--space-*`, `--text-*`+`--lh-*`, `--radius-sm/md/lg`, `--shadow-sm/md/lg`, `--dur/--ease`, 중립 grayscale 9단 + 액센트 1색 + semantic(success/warn/danger/info) 토큰 정의. 컴포넌트는 토큰만 참조.

## B. 의미 없는 그라데이션 (AI 1순위 흔적)

| 위치 | 코드 |
|---|---|
| body 배경 | `linear-gradient(160deg, #1a1a2e, #16213e)` |
| `.toolbar-btn--primary` | `linear-gradient(135deg, rgba(233,69,96,.95), rgba(83,52,131,.85))` |
| `.context-pack-panel__btn--primary` | 동일 `135deg` 코랄→보라 |
| `.snap-confirm__btn--primary` | 동일 `135deg` 코랄→보라 |
| `.preview-stage` | 체커보드 4겹 그라데이션 + 코랄 radial glow |
| `.capture-history__thumb` | `135deg` 흰색 오버레이 |

- **동일한 코랄→보라 대각 그라데이션이 3개 primary 버튼에 리터럴 복붙**. 단색 강조로 충분.
- **개선(브랜드 유지)**: body는 플랫 다크(또는 아주 미묘한 단색 vignette)로, primary 버튼은 **단색 코랄**(`--accent`) + 살짝 어두운 코랄 보더로. 보라(`--accent-secondary`)는 그라데이션에서만 쓰였으니 제거 또는 최소화. `preview-stage` 체커보드는 유지하되 코랄 glow는 톤 다운.

## C. 라디우스 & 그림자

- **라디우스 동물원**: `var(--radius)`(12) · `10`(버튼/인풋/토스트) · `9`(zoom/select/delete) · `8`(glyph/close/thumb) · `7`(list 버튼/kbd) · `6`(kbd/lightbox img) · `50%`(close 원형) · `999px`(pin-badge).
- **과한 그림자**: `pin-badge`(24px 작은 배지)에 `0 4px 12px rgba(0,0,0,.35)`; lightbox `0 20px 60px`, `0 16px 48px`, confirm `0 12px 40px`.
- **개선**: `--radius-sm:6 / -md:8 / -lg:12 / -pill:999`. **컨트롤(버튼·인풋·칩)=md(8), 카드·패널·다이얼로그=lg(12)**, pill/원형은 의미상 유지. 그림자 3단 토큰화, 작은 요소엔 `--shadow-sm`.

## D. 타이포 & 스페이싱

- **font-size 15종+**: `1.4 / 1.35 / 1.15 / 1.1 / 1 / 0.95 / 0.92 / 0.9 / 0.88 / 0.86 / 0.85 / 0.82 / 0.8 / 0.78 / 0.74 / 0.72 / 0.7 / 0.68 rem`. + `CaptureToolbar`는 부제에 인라인 `style.fontSize='0.78rem'`까지.
- **line-height**: `1.2 / 1.35 / 1.4 / 1.45 / 1` 혼재.
- **스페이싱 4/8 이탈**: `14`(app-shell padding) · `9`(item gap) · `7`(row padding) · `22`(empty padding) · `10`(다수) 등.
- **개선**: 타입 스케일 ~6단(`--text-2xs/xs/sm/base/md/lg`)으로 압축, `--lh-tight/normal/relaxed`. 스페이싱 `4/8/12/16/24/32/48` 그리드로 매핑(10→8/12, 9→8, 7→8, 14→12/16, 22→24).

## E. 아이콘 일관성 (🔴 4종 혼재)

| 표현 | 사용처 |
|---|---|
| lucide SVG | 툴바·히스토리·context-pack·image-actions 버튼 (정상) |
| **이모지** | `ContextPackPanel` 템플릿 셀렉트 `🐛 버그 / 🔧 리팩토링 / 📐 레퍼런스`; `Preview` 확대 버튼 `🔍` |
| **`×` 글리프(U+00D7)** | 모든 닫기/삭제: pin-lightbox·image-lightbox close, context-pack history-delete, PinMemoList delete |
| **숫자/대괄호** | pin-badge 숫자, PinMemoList 라벨 `[1]` |

- 이모지는 플랫폼·폰트마다 렌더가 달라 **픽셀 정렬·색 토큰화 불가**. `×`는 폰트 baseline이 안 맞아 버튼 중앙에서 떠 보임. `[1]` 대괄호 id는 디버그 느낌.
- `CaptureToolbar` 화면버튼만 12px 아이콘 2개(Monitor+Camera), 나머지는 18px 1개 → 같은 28×28 glyph 박스 안 광학 크기 불일치. 아이콘 size가 TS 매직넘버(12/15/18)로 흩어짐.
- **개선**: 이모지·`×` → lucide SVG로 통일(닫기=X, 삭제=Trash2/X, 확대=Maximize/ZoomIn). 템플릿 셀렉트는 이모지 제거하거나 옵션 앞 lucide. 아이콘 size 토큰화. 핀 라벨 `[1]`→`1`. **단, 아이콘 교체는 DOM 생성 코드(TS) 변경이라 "보이는 것만" 원칙과 충돌 가능 → 사용자 확인 후 진행**(아래 §회귀 주의 참조).

## F. 인터랙션 · 포커스 · 모션 · 접근성

- `:focus-visible` 링은 `template-select`·`zoom-btn`에만. **대부분의 버튼/인풋/행이 키보드 포커스 시 표시 없음** → WCAG 2.4.7 위반 소지.
- hover가 거의 전부 `filter: brightness(1.06~1.08)` — 색/상태 변화 없는 단조 반응. `pin-badge:hover scale(1.2)`는 과함.
- 모션: transition `0.12/0.15/0.18s` 산재, `prefers-reduced-motion` 미대응.
- `confirm-dialog` 포커스 트랩 없음(Tab으로 모달 밖 이탈 가능). `toast` `aria-live` 없음(스크린리더 알림 누락).
- **개선**: 전역 `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`, hover/active 토큰 모션(`--dur-fast`+`--ease`), `prefers-reduced-motion` 가드.

## G. i18n — 한영 혼용 / 영문 잔류

- 🔴 **`ImageActions` 툴팁이 영어**: 버튼 라벨 `PNG 복사`/`PNG 저장`인데 `title="PNG copy (Alt+Shift+P)"`/`"PNG save"` → 스크린리더가 영어로 읽음. 한국어로 통일 필요.
- 🟠 `ShortcutsHelp` 안내문에 `whale://extensions/shortcuts` 하드코딩 → **Chrome에서 깨짐**. `chrome://`/`whale://` 분기 또는 일반 문구 필요. dd 컬럼에 실제 키(`Alt+Shift+V`)와 비-키 문구(`직접 지정`/`버튼만 제공`) 혼재.
- 🟠 `ImageLightbox`/`PinAnnotation` title에 em-dash `—`(`핀 1 — 클릭하면 삭제`). 한국어 UI엔 콜론/괄호가 자연스러움.
- 🟠 `content-script` raw 영문 시스템 에러가 토스트로 노출 가능.
- 🟡 코드 주석 영문 잔류(`ContextPackPanel`, `ImageLightbox`) — CLAUDE.md "주석 한국어" 위반(비노출, 우선순위 낮음).

## H. 빈 상태 · 마이크로카피

- 빈 상태가 전부 **회색 한 줄**: `저장된 캡처가 아직 없습니다.`(History) / `이미지를 클릭하여 핀을 추가하세요`(PinMemo) / `아직 저장된 팩이 없습니다.`(Pack). 일러스트·아이콘·CTA 없음 → 자동생성 골격 특유.
- `Preview` eyebrow `캡처됨` + 제목 `캡처 미리보기` = 같은 단어 중복 위계.
- `ContextPackPanel` intent textarea의 placeholder를 **설명문 대용**으로 사용(`증상 또는 AI에게 요청할 내용 (추가 메모로...)`) — UX 안티패턴.
- `HistoryList` 메타가 raw 파이프 `6월 04 14:32 | 영역 | 핀 3` — 칩/점(·) 위계 없음.
- **개선**: 빈 상태에 절제된 lucide 아이콘 + 한 줄 안내 + (가능시) 행동 유도. eyebrow/제목 중복 정리. 메타는 `·` 또는 미묘한 칩.

## I. 컴포넌트별 핵심 이슈

| 컴포넌트 | 핵심 이슈 | 인라인 스타일/스코프 메모 |
|---|---|---|
| `App.ts` | `v0.1.3` 버전 헤더 노출, selection-banner innerHTML 직접 주입, 빈 상태 디자인 부재 | **수정 금지**(공유버튼 주입부). CSS/카피만 간접 개선 |
| `CaptureToolbar` | primary 그라데이션, 부제 인라인 `fontSize`, 화면버튼 이중 아이콘 광학 불일치, 더블라인 카드버튼 밀도 | TS 인라인 1곳(fontSize) |
| `HistoryList` | 빈 상태 빈약, 메타 파이프, 썸네일 없는 항목=빈 박스, 스와이프 매직넘버(-76/-72) | 스와이프 `transform` 인라인(동작) |
| `ContextPackPanel` | 🐛🔧📐 이모지, `×` 글리프, primary 그라데이션, 이중 아이콘, placeholder 설명문 대용 | 인라인 스타일 0, 아이콘 size 상수 |
| `Preview` | `🔍` 이모지, `×` close, eyebrow 중복, **`transform:scale` (CLAUDE.md 규칙 위반)**, 140px 매직 | scale 인라인(동작·아래 주의) |
| `ImageLightbox` | `×` close, em-dash title, 핀 라벨 숫자 직박 | width/height/좌표 인라인(동작) |
| `ImageActions` | **영문 툴팁**, 외부 패널 클래스 의존 | 아이콘 size=18 상수 |
| `PinAnnotation` | (CSS) pin-badge 999px+과한 그림자+하드코딩 `#e94560` | 좌표 인라인(정당) |
| `PinMemoList` | `×` delete, 라벨 `[1]`, `…` 줄임표, autoGrow 강제 리플로우 | textarea height 인라인(동작) |
| `ShortcutsHelp` | `whale://` 하드코딩, kbd 시맨틱/키캡 부재, dd 혼재 | 인라인 0 |
| `confirm-dialog` | (CSS) primary 그라데이션·radius 불일치, 포커스 트랩 없음 | 인라인 0 |
| `toast` | info/error 색 의미 약함(보더만), radius 10, 타이밍 불일치(220 vs 180ms), `aria-live` 없음 | 인라인 0 |
| `content-script` | 전부 인라인 스타일, 하드코딩 색(`#e94560`/`#16161f`/`#eee`), 과한 그림자, z-index 매직 | 전부 인라인(오버레이) |

---

## ⚠️ 회귀 주의 / 스코프 경계

1. **`Preview.ts`의 `transform: scale`** — CLAUDE.md 프로젝트 규칙 "CSS 확대는 transform: scale 금지 → width 직접 변경" 위반(텍스트 고스팅 유발). 같은 코드베이스 `ImageLightbox`는 width 직접 변경으로 올바름. → **이건 동작/렌더 로직 이슈**라 "보이는 것만" 순수 시각 패스의 범위를 넘는다. **발견만 기록**, 수정은 별도 결정 필요.
2. **아이콘 교체(이모지/`×` → lucide)** 는 TS DOM 생성부 변경 → "클래스/스타일만 교체" 원칙과 부분 충돌. CSS 토큰화(PHASE 3~4)와 분리해, 사용자 승인 후 별도 커밋.
3. **content-script 인라인 스타일**은 페이지 주입 특성상 일부 인라인이 불가피. 색/그림자/radius만 공통 상수로 정돈하되 DOM 동작 불변.

## 다음 단계 (PHASE 3 토큰 설계 미리보기)

```css
:root {
  /* 스페이싱 4px 그리드 */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-5:24px; --space-6:32px; --space-8:48px;
  /* 타입 스케일 */
  --text-2xs:.6875rem; --text-xs:.75rem; --text-sm:.8125rem;
  --text-base:.875rem; --text-md:.9375rem; --text-lg:1.0625rem;
  --lh-tight:1.25; --lh-normal:1.45; --lh-relaxed:1.6;
  /* 라디우스 */
  --radius-sm:6px; --radius-md:8px; --radius-lg:12px; --radius-pill:999px;
  /* 그림자(미묘하게) */
  --shadow-sm:0 1px 2px rgba(0,0,0,.3);
  --shadow-md:0 6px 18px rgba(0,0,0,.32);
  --shadow-lg:0 16px 40px rgba(0,0,0,.4);
  /* 모션 */
  --dur-fast:120ms; --dur:160ms; --ease:cubic-bezier(.2,0,0,1);
  /* 색 — 다크 브랜드 유지(네이비 surface + 코랄 액센트), 그라데이션 제거 */
  --bg:#11141f; --surface-1:#0f3460; --surface-2:#16213e;
  --border:rgba(255,255,255,.08); --border-strong:rgba(255,255,255,.14);
  --text:#ececf0; --text-muted:#9aa3b2;
  --accent:#e94560; --accent-strong:#d63450;
  --danger:#e94560; --success:#3fb27f; --warn:#d9a23b; --info:#5b8def;
  --focus:0 0 0 2px var(--bg), 0 0 0 4px rgba(233,69,96,.7);
}
```

> 검증 게이트: `pnpm build && pnpm test --run && vhk mission check` (pre-commit 훅에 연결됨). 시각 비교는 `preview.html` before/after.
