# 핸드오프: 스위스 패널 → src/sidepanel 소스 이식

> 작성 2026-06-11. CLI 새 세션에서 이 문서 하나로 이식 작업 시작 가능.
> 아래 "붙여넣기용 프롬프트"를 그대로 첫 메시지로 사용해도 됨.

---

## 붙여넣기용 프롬프트

```text
SnapContext 스위스 패널 디자인을 실제 확장 소스로 이식해줘.

- 핸드오프 문서: docs/ui-audit/swiss/HANDOFF-PORT.md 먼저 읽고 시작.
- 디자인 SoT(최종 확정 mockup): docs/ui-audit/swiss/snapcontext.html — 이 렌더가 정답.
- 이식 대상: src/sidepanel/ (App.ts, components/*.ts, styles/global.css).
- 디자인 리뷰 5라운드 완료(R5 "이식 GO"), 잔여 P1은 이식하면서 토큰/규칙으로 마감.
- 매 단계 pnpm build + pnpm test + pnpm test:e2e:all 그린 유지.
- 검증은 코드 읽기로 끝내지 말고 Playwright 390px 실폭 렌더 스크린샷을 mockup과 육안 대조
  (docs/ui-audit/swiss/_segshot.mjs 재사용).
```

---

## 1. 현재 상태 스냅샷 (2026-06-11 실측)

| 항목 | 상태 |
|------|------|
| 브랜치 | `release/v0.2.0` (HEAD `374f746` — v0.2.0 익명 공유 마감) |
| 빌드 | PASS — 버전 4값 일치 · tsc --noEmit 클린 · vite 891ms |
| 단위테스트 | 14/14 PASS (upload 7 + context-pack 7) |
| E2E | 63/63 PASS — smoke 10 · pin-flow 6 · loaded-pack 8 · pin-delete 9 · coverage 17 · full-shortcut 3 · upload-share 10 |
| src/sidepanel | v0.2.0 커밋 그대로 (HEAD 대비 diff 0) — 이식 미착수 |
| 디자인 mockup | R5까지 수렴 완료, 최종본 6/7 15:30 |

## 2. 미션

`docs/ui-audit/swiss/snapcontext.html`(스위스 디자인 최종 mockup, 390px 기준)을
실제 확장 사이드패널 소스로 이식한다. **mockup이 SoT — 렌더 결과가 mockup과 시각적으로 동등해야 함.**

- 대상: `src/sidepanel/App.ts`, `src/sidepanel/components/*.ts`(9개), `src/sidepanel/styles/global.css`
- 기존 디자인 토큰 시스템 있음(커밋 `019c748`) → 토큰 값 교체부터 시작하면 충돌 최소

## 3. 디자인 평결 요약 (왜 이 디자인인가)

- 5렌즈 적대 리뷰 5라운드: **6.3 → 7.4 → 7.52 → … → 전 렌즈 7.4~8.0 수렴**
- R2에서 "이식 차단 P0 0건", R5 평결 **"이식 GO · 수렴 진입"** — 남은 흠은 px 튜닝이 아니라 폴리시
- 근거 문서: `DESIGN-REVIEW.md`(R1) → `DESIGN-REVIEW-R2.md` → `REREVIEW-R3~R5.html`
- 핵심 디자인 원칙(리뷰에서 확정된 것):
  - **레드는 2곳만** (SNAP 워드마크 + §05 CTA) — 그 외 전부 블랙/무채색. 레드 재등장 = 회귀
  - 좌측 섹션번호 척추(01~05)가 전 구간 정렬축 — 폼 구간 포함
  - 그레이 중간톤(#6E6E6E 텍스트 · #ECEAE4 면)으로 쉬는 구간
  - 비-스위스 장식 금지: 해치·드롭섀도·육각형 등

## 4. 이식하며 닫을 잔여 P1 (R5 명시)

1. **레드 하단 재등장 방지** — 하단 구간에 레드 회귀 없는지 토큰 레벨로 잠금
2. **래핑 제거** — 의도치 않은 줄바꿈 정리
3. **비율** — 마스트헤드/섹션 비율 미세 조정
4. (선택) 마스트헤드 폴리시 중 **톱니·SNAP 80은 R5가 "육안 검증 불가·체감 0.1 미만" 진단** → 스킵 가능, hero 1줄만 반영

R5 결론: "P1들은 이식과 동시에 토큰/규칙으로 닫는 게 정석 = 이식이 곧 다음 스텝."

## 5. ⚠️ 제약·함정

### E2E가 현 UI에 결합돼 있음 (가장 큰 함정)

smoke 등이 기존 카피·구조를 검증한다. 이식하면 **깨지는 게 정상** — 디자인을 옛 테스트에 맞추지 말고
테스트 기대값을 새 디자인에 의도적으로 동기화할 것:
- placeholder 문구 `"위 버튼으로 캡처를 시작하세요"`
- 히스토리 제목 `"캡처 기록"`, 도움말 summary `"설정 / 도움말: 단축키"`
- 캡처 버튼 4개 · 2열 그리드 검증
- 300px 가로 오버플로 금지 체크 (이건 새 디자인도 통과해야 함)

### SnapContext 고유 규칙 (CLAUDE.md)

- CSS 확대에 `transform: scale` 금지 → width 직접 변경
- onFocus 핸들러에서 풀 재렌더 금지 (focus loop)
- captureVisibleTab 연속 호출 510ms delay (이식과 무관하나 건드리지 말 것)

### 기타

- 의존성 추가 금지 가정 — mockup은 순수 HTML/CSS, 웹폰트(JetBrains Mono 등) 쓰면 확장 번들에 로컬 동봉 필요(CSP·오프라인). 시스템 폰트 폴백 우선 검토
- 한글 폴백 스택 유지 (R1 지적 사항: 한글이 라틴에 밀리면 안 됨)

## 6. 검증 루프 (매 단계)

```powershell
pnpm build
pnpm test
pnpm test:e2e:all
```

(PowerShell 5.1에는 `&&` 없음 — 줄 단위 실행)

렌더 검증 — 두 종류를 구분할 것:

1. **mockup 렌더(기준 이미지)**: `node docs/ui-audit/swiss/_segshot.mjs docs/ui-audit/swiss/snapcontext.html <출력prefix>`
   — _segshot.mjs는 **파일 경로 인자 필수**(file:// 로딩 전용). 기존 기준 렌더는 `review/dr-00~03.png`.
2. **실제 패널 렌더(검증 대상)**: _segshot.mjs로는 못 찍음(확장은 chrome-extension:// 컨텍스트).
   `tests/e2e/smoke.mjs`의 확장 로드 하네스(persistent context + dist 로드, 뷰포트 400×900)를 참조해
   390px 세그먼트 캡처 스크립트를 만들거나, smoke가 저장하는 `tests/e2e/screenshots/01-initial.png`를 활용.

렌더 검증 규칙: **코드 읽기로 "됐다" 판정 금지.** 실패널 스크린샷을 mockup 렌더와 육안 대조.
다른 점 있으면 수정 → 재렌더 반복.

## 7. Definition of Done

- [ ] 빌드 + 단위 14 + E2E 전체 그린 (기대값 동기화 포함)
- [ ] 390px 렌더가 mockup과 시각 동등 (세그먼트별 대조)
- [ ] 300px 가로 오버플로 없음
- [ ] 잔여 P1 1~3 마감 (레드 잠금·래핑·비율)
- [ ] 커밋 (스타일/마크업 변경과 E2E 동기화 분리 커밋 권장)

⚠️ 커밋 주의: 작업트리에 이식과 무관한 미커밋 변경 2건 존재 — `docs/PRIVACY.md`(v0.2.0 공유 반영 갱신)와
`docs/CHANGELOG.md`(R2 lifecycle 오기재 수정), 둘 다 2026-06-11 스토어 준비 작업. `git add -A` 금지,
이식 커밋에 섞지 말고 별도 docs 커밋으로 분리할 것.

## 8. 이식 완료 후 다음 단계 (이 세션 범위 밖)

1. 스토어 listing: 카피 v2 완료(2026-06-11, 경쟁사 5사 리서치 반영 — `docs/store/listing-0.2.0-draft.md` + `competitor-research-2026-06-11.md`). 이미지 자산만 PARKED
2. 스크린샷 생성: `pnpm store:screenshots` 스크립트 이미 존재 (`scripts/generate-store-screenshots.mjs`) — 새 UI 기준으로 재생성
3. 프로모 타일 440×280 + 마퀴 1400×560
4. untracked 문서 커밋 정리: `docs/ui-audit/swiss/`, `docs/ui-audit/hermes/`(폐기 탐색안 — 삭제 검토), `docs/store/`, `docs/release-0.2.0-vs-0.1.3.html`
5. Chrome Web Store + 웨일 스토어 제출
