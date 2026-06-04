# SnapContext UI 리파인 — before / after

- **브랜치**: `worktree-feat+ui-craft` (master 기반 격리 worktree · 최종 PR명 `feat/ui-craft`)
- **방향**: 다크 브랜드(네이비 surface + 코랄 액센트) **유지**, AI스러움만 정돈. 동작/DOM 불변.
- **검증**: `pnpm build && pnpm test --run`(7/7) + `vhk mission check` 통과(pre-commit 게이트). 독립 코드리뷰 회귀 0.

## 렌더 비교 캡처 방법 (브라우저 MCP 미연결 → 수동)

```powershell
# AFTER (현재 브랜치) — preview.html 열기
start .\docs\ui-audit\preview.html      # 폭 320/380/460 토글로 각 상태 캡처

# BEFORE 와 비교하려면 토큰화 직전 CSS를 임시로 끼워 캡처
git show 019c748~1:src/sidepanel/styles/global.css > .\docs\ui-audit\_before.css
#   preview.html <link> 의 href 를 _before.css 로 잠깐 바꿔 캡처 → 원복
```

> 핵심 변화는 "값 → 토큰" 치환이라 아래 표가 before/after의 실체다. 스크린샷은 보조.

## 토큰 시스템 (신규)

| 그룹 | before | after |
|---|---|---|
| 스페이싱 | 없음 (`14/12/10/9/7/6px` 임의) | `--space-0..8` (4px 그리드) |
| 타이포 | font-size **15종+** | `--text-2xs..lg` + `--text-icon` (6+1단) · `--lh-*` 3단 |
| 라디우스 | `--radius:12px` 1종, 실제 8종 혼용 | `--radius-sm/md/lg/pill` (컨트롤 8 · 카드 12) |
| 그림자 | 5종 제각각(`0 20px 60px` 등) | `--shadow-sm/md/lg` (절제) |
| 모션 | `0.12/0.15/0.18s` 산재 | `--dur-fast/--dur` + `--ease` |
| 색 | 색만 7개, raw rgba 수백 회 | 중립/surface/border/accent/**semantic** 토큰 일원화 |

## 영역별 before → after

| 영역 | before (AI스멜) | after |
|---|---|---|
| **배경** | body `linear-gradient(160deg,#1a1a2e,#16213e)` 보라↔네이비 | 플랫 `--bg:#141a2b` |
| **Primary 버튼** | `135deg` 코랄→보라 그라데이션 **3곳 중복** | 단색 `--accent` + `--accent-strong` 보더, hover=accent-strong |
| **hover** | 거의 전부 `filter:brightness(1.06~1.08)` | 명시적 색전환(`--accent-soft` 배경 / 보더 강조 / 텍스트 반전) |
| **포커스** | `:focus-visible` 3곳뿐 | **전역** `:focus-visible` 액센트 outline (a11y) |
| **모션 접근성** | 없음 | `prefers-reduced-motion` 가드 |
| **라디우스** | 버튼 10·glyph 8·카드 12·select 9… | 컨트롤 `md(8)` · 카드 `lg(12)` 통일 |
| **타이포** | 0.68~1.4rem 난립 | 6단 스케일로 압축, 정렬된 위계 |
| **그림자** | pin-badge(24px)에 `0 4px 12px`, lightbox `0 20px 60px` | 배지 `--shadow-sm`, 패널 `--shadow-lg`로 절제 |
| **preview-stage** | 체커보드 4겹 + 코랄 radial glow(과함) | 플랫 `--surface-sunken` + 헤어라인 |
| **toast** | info/error 구분이 전체 보더색 한 줄 | 좌측 3px **semantic 보더**(info=파랑·error=코랄) + 그림자 토큰 |
| **핀 활성** | 라벨이 `--text`로만 밝아짐 | 활성 라벨 `--accent`(코랄) — 상태 명확 |
| **i18n** | `PNG copy/save` 영문 툴팁, `whale://` 하드코딩, em-dash | 한국어 툴팁, 브라우저 중립 문구, 괄호 |

## 자기 크리틱 — 아직 남은 "AI스러움" (다음 PASS 후보)

이번 PASS는 **CSS 토큰화 + 무위험 문자열**까지만(동작/DOM 불변 원칙). DOM 생성 코드를 건드려야 하는 아래 3가지는 **별도 커밋 + 사용자 승인** 대상으로 남김:

1. **아이콘 4종 혼재** — lucide SVG + 이모지(🐛🔧📐🔍) + `×` 글리프 + 숫자. → 닫기/삭제/확대/템플릿을 lucide로 통일하면 가장 큰 "프로 느낌" 상승. (TS DOM 변경 필요)
2. **빈 상태 빈약** — History/PinMemo/Pack 빈 상태가 회색 한 줄. → 절제된 lucide 아이콘 + 1줄 안내 + CTA. (DOM 추가)
3. **마이크로카피** — eyebrow `캡처됨`+제목 `캡처 미리보기` 중복, intent placeholder를 설명문 대용, 히스토리 메타 raw `|` 파이프. → 카피/구분자 정리. (텍스트/소폭 DOM)

> 1~3은 `findings.md §회귀 주의`에서 "보이는 것만/동작 불변" 경계와 충돌해 의도적으로 보류. 진행 시 컴포넌트 단위 커밋으로.
