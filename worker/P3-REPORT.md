# P3 완료 보고 — 공유 만료 파라미터화 (0.4.0 트랙 D)

상세 기록은 **[docs/log/2026-07-22-v040-p3-expiry.md](../docs/log/2026-07-22-v040-p3-expiry.md)** 에 있다. 이 파일은 DoD 확인용 요약이다.

## 게이트 (실측)

| 항목 | 결과 |
|------|------|
| `cd worker && npm test` | **183 green** (unit 178 / 16 files + test-d1 5 / 2 files) |
| `npx tsc --noEmit` | exit 0 |
| 베이스라인(master `896345e`) | 125 (unit 121 + d1 4) → **+58** |
| `vhk mission check` | scope 밖 0 (변경은 `worker/**` + `docs/**` + `.vhk/mission.json` 뿐) |
| 루트 `pnpm test` / `pnpm build` | 메인 체크아웃 머지 시뮬에서 14 green + vite build 통과 |

## 티켓별 커밋

| 티켓 | 커밋 | 내용 |
|------|------|------|
| T3.1 | `29b583a` | 만료 판정·표시를 `readExpiry` 단일 헬퍼로 통일 |
| T3.2 | `3427c14` | 만료 파라미터화 1/7/30일 — allowlist + R2 `customMetadata` SoT |
| T3.3 | `30abbfc` | `/i/` Cache-Control 잔여초 + 만료 문구 탈-7일 |
| T3.4 | `26b661b` | 세션 로그 + changelog |
| — | `3ede45f` | mission objective 를 0.4.0 P3 스코프로 갱신 |

## 적대 검증

claude critic 이 40여 종의 우회 입력(`'0x7'`·`'7e0'`·전각숫자·`'1e400'`·`Infinity` 등)을 실제로 실행해 검증했다. **BLOCKER 0**. PRD 금지 4항목(`src/**` 변경 · D1 마이그레이션 추가 · `backfill-d1.mjs` 변경 · `/upload` 응답 키 추가) 전부 무위반.

non-blocker 관찰은 세션 로그의 "적대 검증에서 나온 관찰" 절에, 배포 전 함께 고쳐야 할 "7일" 문서 3곳은 "남은 것" 절에 기록했다.

## 배포 선행 조건 (사람 게이트)

R2 버킷 lifecycle `auto-delete-7d` → **30일 상향**. `/upload` 가 공개 엔드포인트라 배포 즉시 누구나 `expiresInDays=30` 을 보낼 수 있으므로 lifecycle 상향과 배포는 같은 창에서 처리해야 한다. 자세한 사유는 세션 로그 참조.
