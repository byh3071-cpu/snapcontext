---
id: ADR-013
date: 2026-07-22
tags: [expiry, r2, metadata, d1, sot, v0.4.0]
---

# ADR-013: 만료 SoT = R2 `customMetadata.expiresAt`, 표시·판정은 단일 헬퍼

## 상태

승인 (0.4.0 P3 에서 구현 — `docs/log/2026-07-22-v040-p3-expiry.md`)

## 맥락

0.3.0 까지 공유 만료는 `worker/src/lib.ts` 의 `MAX_AGE_MS = 7일` 상수 하나에 고정돼 있었다. 0.4.0 이 보관 기간을 사용자 선택(1/7/30일)으로 바꾸면서, 만료 시각을 **어디에 저장하고 무엇을 정본으로 볼 것인지**를 정해야 했다.

기존 판정 소스가 이미 둘로 갈려 있었다는 게 문제를 키웠다.

| 표면 | 판정 근거 |
|------|-----------|
| `/i/{id}` · `/s/{id}` · `snap_pack` · `snap_analyze` | R2 객체의 `uploaded` + 7일(코드 상수) |
| `snap_history` | D1 `captures.expires_at`(INSERT 시각 + 7일) |

보관 기간이 고정 7일일 때는 두 값이 사실상 같아서 드러나지 않았지만, 기간이 갈라지는 순간 **같은 캡처가 어떤 표면에서는 살아 있고 다른 표면에서는 죽는** 상태가 된다.

## 결정

1. **만료 SoT = R2 `customMetadata.expiresAt` (ISO-8601 절대시각).** 보관 "일수"가 아니라 만료 "시각"을 저장한다. 일수를 저장하면 `uploaded` 와 조합해야 하는 계산이 판정 지점마다 반복되고, 그 계산이 어긋날 여지가 생긴다.

2. **레거시 fallback = `uploaded + 7일`.** 메타가 없는 기존 객체는 0.3.0 시절의 계약대로 동작한다. 백필하지 않는다 — 7일 TTL 이라 자연 소멸한다.

3. **손상된 메타는 fail-closed.** `expiresAt` 이 있는데 파싱되지 않으면 **만료로 간주**하고 `console.warn` 을 남긴다. 조용히 7일로 되돌리면 1일 캡처가 7일 사는 과보관이 되고, 그건 사용자가 선택한 보관 정책을 위반한다.

4. **판정과 표시를 단일 헬퍼로 통일.** `readExpiry(obj) → ExpiryInfo { expiresAtMs, retentionDays, source }` 하나가 절대 만료시각·보관일수·출처를 함께 반환하고, `isExpiredAt`·`formatExpiryKST`·`buildViewerHtml` 이 전부 이 구조체를 받는다. **판정과 표시가 같은 값을 본다는 것을 타입으로 강제**하기 위함이다. `formatExpiryKST` 는 파라미터를 `Date` → `number`(epoch ms)로 바꿔, 업로드 시각을 넘기던 옛 호출이 컴파일 단계에서 걸리게 했다.

5. **D1 `expires_at` 은 유지하되 파생이 아니라 복제로 취급한다.** `/upload` 가 `expiresAtIso` 를 **한 번만** 계산해서 이미지 put · `{id}.json` put · D1 insert 세 곳에 **같은 문자열(같은 객체 참조)** 을 배포한다. `captureRowFromSharedContext` 를 옵션 객체로 바꿔 `expiresAtIso` 를 필수 필드로 만들어, 누락이 컴파일 에러가 되게 했다.

6. **`{id}.json` 에도 메타를 심는다.** `pack.ts` 가 이미지 head 와 컨텍스트 JSON 을 **각각** 판정하므로, 이미지에만 심으면 30일 캡처가 8일째에 `snap_pack`·`snap_analyze` 만 죽고 `/s/`·`/i/` 는 사는 split-brain 이 된다.

7. **D1 스키마는 변경하지 않는다.** 보관일수 컬럼도, `expires_at` 인덱스도 추가하지 않는다. 절대시각만으로 `snap_history` 필터가 완전히 커버되고, 원격 마이그레이션은 되돌리기 어렵다.

## 결과

- `worker/src` 안에서 만료를 자체 계산하는 코드가 **`lib.ts` 하나로 좁혀졌다.** `ingest.ts` 의 `MAX_AGE_MS` import 와 재계산이 사라진 게 이 결정의 실질 신호다.
- 만료 정각 판정을 R2 쪽 의미(`expiresAtMs < now` — 정각은 아직 유효)로 통일했다. D1 SQL 도 같은 경계를 쓴다. 두 값이 같은 문자열이 된 이상 부등호 차이가 실제 불일치로 나타나기 때문이다.
- `/upload` 응답에는 `expiresAt` 를 **추가하지 않았다.** 소비자가 없고(확장 연동은 P5), 응답 키 화이트리스트 테스트가 누출 방지 앵커로 남아 있다. 나중에 추가는 additive 지만 제거는 breaking 이므로 늦게 넣는 쪽이 싸다.

### 제약 (운영)

- **R2 쓰기는 Workers 바인딩 경유만.** S3 호환 API 로 객체를 쓰면 커스텀 메타 키가 소문자화(`expiresat`)되어 `readExpiry` 가 메타 없는 레거시 객체로 읽는다. 그러면 30일 캡처가 조용히 7일로 떨어진다.
- **버킷 lifecycle 이 코드 정책의 상한이다.** lifecycle 이 7일인데 30일 옵션을 열면 객체가 7일에 물리 삭제되고, `/i/` 가 이미 최대 30일치 `max-age` 를 내보낸 뒤라 클라이언트 캐시가 최대 30일간 유령 서빙한다. lifecycle 상향(사람 게이트)과 배포는 같은 창에서 처리해야 한다.

## 대안 검토

- **D1 을 SoT 로** — 기각. D1 행이 없는 R2 객체가 존재한다(이미지만 업로드, 컨텍스트 JSON 파싱 실패). 그 객체들의 만료를 판정할 근거가 사라진다.
- **보관일수(`expiresInDays`)를 메타에 저장** — 기각. 반드시 일치해야 하는 사실이 둘(`uploaded` + 일수)이 되고, 갈라지면 무엇이 정본인지 모호해진다. 표시용 `retentionDays` 는 `expiresAt - uploaded` 에서 파생한다.
- **`expiresAt` 상한 검증** — 보류. 파싱만 되면 임의 미래시각을 신뢰하므로 이론상 영구 미만료가 가능하지만, 유일한 writer 인 `/upload` 가 서버 계산값만 쓰고 R2 직접 쓰기는 자격증명이 필요해 현재 도달 불가다. 상한을 걸면 "메타가 SoT" 라는 이 결정과 상충한다.
