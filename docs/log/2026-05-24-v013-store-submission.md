---
id: log-2026-05-24-v013-store-submission
date: 2026-05-24
tags: [release, store-submission, v0.1.3, chrome, whale]
---

# SnapContext v0.1.3 — 빌드·스토어 제출 로그

## 요약

| 스토어 | 상태 | 비고 |
|--------|------|------|
| GitHub | ✅ push | https://github.com/byh3071-cpu/SnapContext |
| Chrome Web Store | ✅ 제출 · 검토 대기 | 비판매자, MV3, `<all_urls>` (심사 지연 가능) |
| Whale Store | ✅ 리뷰 요청 | 한국어 listing, 개발자 Yohan Studio |

## 빌드·검증

```text
npm run build
npm test                    # 7/7
npm run test:e2e:all        # 43/43
npm run store:screenshots   # 1280×800 × 5
```

- 업로드 ZIP: `snapcontext-v0.1.3.zip` (`dist/*` 루트에 `manifest.json`)
- Whale 500 업로드 오류 시: `dist` 내용만 ZIP, Whale 브라우저·재시도

## 제출물 SoT

| 항목 | 값 |
|------|-----|
| 버전 | `0.1.3` |
| Privacy | https://github.com/byh3071-cpu/SnapContext/blob/master/docs/PRIVACY.md |
| 스크린샷 | `docs/store/chrome-web-store/screenshots/` 01~05 |
| 연락 | byh3071@gmail.com |

## 수동 확인 (Step 1)

- Chrome·Whale 단축키 V/E/M/G (Whale은 shortcuts에 수동 등록)
- 긴 페이지 풀페이지 캡처 > visible 높이
- 4캡처 + PNG 복사/다운로드

## Chrome Web Store 메모

- 개발자: 비판매자
- Privacy practices: 단일 목적, 권한별 근거, 원격 코드 **아니요**, 웹사이트 콘텐츠(로컬)
- 호스트 권한: 광범위 → **검토 지연** 안내 수신 (ADR 002 의도, activeTab 미전환)
- 프로모 동영상·타일: 미제록

## Whale Store 메모

- listing: 한국어 (상세 설명·키워드·생산성 분류)
- MV2 경고: 무시 (실제 `manifest_version: 3`)
- 공개: 리뷰 요청 시 **공개**

## 다음

- [ ] CWS 승인/거절 메일 확인
- [ ] Whale 심사 결과 확인
- [ ] 승인 후 스토어 URL README·changelog 반영
- [ ] 거절 시 사유별 대응 (호스트 권한 / Privacy 보완)
