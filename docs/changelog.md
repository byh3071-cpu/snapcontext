---
id: changelog-root
date: 2026-05-07
tags: [changelog]
---

# Changelog

## 0.4.0 — 미출시 (P5 진행 중)

### 확장 ↔ worker 배선 (P5) — 사용자가 실제로 쓰는 부분

- **per-user 토큰 자동 발급:** 확장이 공유 업로드 직전에 `POST /token` 으로 토큰을 받아 `chrome.storage.local` 에 저장하고 이후 재사용한다. 토큰은 시크릿이라 **`storage.sync` 에 올리지 않는다**(기기별 토큰 = 계정 없는 제품의 현업 표준). 동시 호출이 발급을 두 번 보내지 않도록 in-flight 가드를 뒀다 — worker 분당 10회 rate-limit 을 아끼고 owner 파편화를 막는다.
- **업로드에 `Authorization: Bearer` 동봉:** 토큰이 있으면 실어 보내 서버가 owner 를 찍고, `snap_history` 가 본인 캡처만 돌려준다. **토큰이 없으면 헤더 키 자체를 만들지 않는다** — 빈 값을 보내면 worker 가 401 이라 익명 업로드가 깨진다. 발급 실패(시크릿 미주입 500·rate-limit 429·네트워크)는 익명 업로드로 조용히 내려가고, 사유는 `console.warn` 으로 남는다.
- **보관 기간 선택 UI:** 설정 패널(기어)에서 1·7·30일 선택, `shareExpiryDays` 키에 저장(기본 7). 선택값은 업로드 시 `expiresInDays` 로 전송된다. 미지정 경로도 유지 — 부재는 서버가 기본 7일로 받는다.
- **만료 문구 동적화:** 사이드패널 7곳("업로드 후 7일" 동의 문구·섹션 aside·발행 캡션·버튼 title/라벨·성공 토스트·복원)이 선택한 기간을 따라간다. **동의 문구가 특히 중요** — "7일 후 삭제"로 동의받고 30일로 저장하면 사실과 다른 동의가 되므로, 업로드 진입 시 기간을 한 번 고정해 동의·전송·토스트가 같은 값을 쓴다.

**신규 storage 키 2종**: `snapcontextToken`(서버 발급 토큰) · `shareExpiryDays`(1|7|30, 기본 7). 둘 다 `chrome.storage.local` 전용.

### 공유 만료 파라미터화 (1/7/30일)

- **`/upload` `expiresInDays` 파라미터:** 보관 기간을 1·7·30일 중에서 선택(allowlist, 미지정 = 기존과 같은 7일). 형식·allowlist 위반은 400 + 부작용 0(R2 put·D1 insert 모두 없음). 빈 문자열도 400 — "부재=7"은 필드가 없을 때의 규칙이라 빈 값을 7로 흡수하지 않는다. `Number()`만 쓰면 통과하는 `'0x7'`·`'7e0'`·`' 7 '`·`'7.0'`은 정규식 `^\d+$`로 차단.
- **만료 SoT = R2 `customMetadata.expiresAt`(절대시각):** 업로드 시 만료 문자열을 1회 계산해 **이미지 put · `{id}.json` put · D1 `expires_at` 세 곳에 같은 값**으로 배포. 저장소는 합치지 않고 값만 봉인한다. `{id}.json`에도 반드시 심는 이유는 `snap_pack`이 이미지와 컨텍스트를 각각 판정하기 때문(이미지에만 심으면 30일 캡처가 8일째에 MCP 툴만 죽는 split-brain). 메타 없는 기존 객체는 `uploaded + 7일` 레거시 경로로 하위호환, 메타가 깨졌으면 조용히 7일로 되돌리지 않고 만료 처리한다.
- **`/i/` Cache-Control 잔여초:** 고정 `max-age=604800` → 잔여 수명(`expiresAtMs - now`)만큼만 캐시. 만료 후 클라 캐시가 유령 서빙하는 창을 없앤다. 잔여 1초 미만은 `no-store`. `/i/` 410에도 `Cache-Control: no-store`(RFC 9111 상 410은 heuristic cacheable).
- **만료 문구 탈-7일:** `/i/` 410 텍스트와 `/s/` 만료 페이지에서 "업로드 후 7일" 제거 → "공유 링크는 선택한 보관 기간이 지나면 자동 삭제됩니다". 만료 문구에 실제 보관일수를 붙이지 않는 이유는 물리 삭제된 객체의 일수를 알 수 없고, 아는 경우에만 붙이면 존재 오라클이 되기 때문.

### 시그니처 변경 (worker 내부 API)

| 심볼 | 이전 | 이후 |
|---|---|---|
| `captureRowFromSharedContext` | `(id, ctx, nowMs, owner?)` 위치 인자 | `({ id, ctx, nowMs, expiresAtIso, owner })` 옵션 객체 — `expiresAtIso` **필수**(누락 = 컴파일 에러) |
| `buildViewerHtml` | `(id, ctx, expiryLabel: string)` | `(id, ctx, expiry: ExpiryInfo)` — 라벨·일수를 구조체에서 함께 생성 |
| `formatExpiryKST` | `(uploaded: Date)` + 내부 7일 가산 | `(expiresAtMs: number)` — 만료 절대시각을 그대로 포맷 |

`isExpired(uploaded, now)`는 삭제되고 `readExpiry(obj) → ExpiryInfo` + `isExpiredAt(expiresAtMs, now)`로 대체. `MAX_AGE_MS`는 이름을 유지하되 의미가 "레거시 fallback + 기본 보관창"으로 축소되고, `worker/src` 안에서의 참조가 `lib.ts` 한 파일로 좁혀졌다. D1 마이그레이션 추가 없음(`expires_at` 절대시각으로 충분).

### 배포 선행 조건 (사람 게이트)

- **R2 버킷 lifecycle `auto-delete-7d` → 30일 상향이 배포보다 먼저**여야 한다. 안 하면 30일 캡처가 7일에 물리 삭제되고, `max-age`를 길게 내보낸 탓에 클라 캐시가 최대 30일 유령 서빙한다. `/upload`는 공개 엔드포인트라 배포 즉시 누구나 30일을 요청할 수 있으므로 lifecycle 상향과 배포는 같은 창에서 처리한다.
- **개인정보 문서 갱신도 배포 선행 조건이다.** `docs/PRIVACY.md`가 아직 "7일 후 영구 삭제"를 사실로 단언하고 있어, 30일 옵션이 열리는 순간 공개된 개인정보처리방침이 부정확해진다. `scripts/check-goal-3.mjs`가 PRIVACY에 `'7일'`이 있는지 하드 assert하므로 두 파일과 스토어 카피(`scripts/generate-store-screenshots.mjs`)를 **한 묶음으로** 고쳐야 한다(P6-T6.2).
- R2 쓰기는 **Workers 바인딩 경유만** — S3 호환 API로 쓰면 커스텀 메타 키가 소문자화(`expiresat`)돼 메타가 없는 것으로 읽힌다.
- **`wrangler secret put TOKEN_SIGNING_SECRET`** — 미주입이면 `/token`이 500이라 확장이 전원 익명으로 내려간다(기능은 안 깨지지만 owner 격리가 동작하지 않는다).
- **시크릿 주입 후 실 워커 스모크 1회** — `POST /token`의 Origin 검증(`chrome-extension://` 아니면 403)은 e2e가 `/token`을 mock하면서 자동 테스트에서 빠졌다. 실패 증상이 "조용히 전원 익명"이라 아무 테스트도 red가 되지 않는다.

### 검증

- worker vitest **192 passed** (unit 186 + test-d1 6), 확장 vitest **48 passed**(14 → 48), `tsc --noEmit` 0, `pnpm build` 통과
- **e2e upload-share 13/13** — 토큰 동봉·보관 기간 전송·발급 1회를 실제 브라우저에서 검증
- 적대 검증 뮤테이션 12/12 killed(P5 구간)

## 0.3.0 — 2026-07-18

### 원격 MCP 서버 — 에이전트의 브라우저 지각 계층

- **`/mcp` 원격 MCP 서버:** 기존 Cloudflare Worker에 Streamable HTTP 단일 엔드포인트 추가(`agents` SDK `createMcpHandler`, 무상태·DO 불필요, 요청당 새 `McpServer` — SDK 1.26.0 응답 누출 수정 준수). Claude Code·Cursor에서 네이티브 연결(`mcp-remote` 불필요).
- **MCP 툴 3종:** `snap_history`(D1 인덱스 최신순 목록) · `snap_pack`(Context Pack JSON, R2 `head()` 실재 확인) · `snap_analyze`(분석용 마크다운 다이제스트 — Worker LLM 미호출, mode allowlist 검증). 만료·없는 id·orphan은 명시적 에러(조용한 빈 반환 없음).
- **수집 파이프라인:** `/upload` 성공 시 D1 `captures` INSERT(공유 업로드분만 — 동의 모델 불변, 자동 전송 없음). D1 실패 시 R2 정리 후 명시적 500. `expires_at`은 서버 시각+7일.
- **보안:** `/mcp` bearer 인증(SHA-256 + `timingSafeEqual`, secret 미설정 = 500 fail-closed) + Origin 검증(OPTIONS 포함 403). D1엔 화이트리스트 파생 7컬럼만 — 핀 좌표·노트 미저장, `/s`·`/i` 응답 불변. `snap_capture`는 근거 리서치 후 0.4+ 드랍.
- **인프라:** D1 `snapcontext-captures` 생성(APAC)·마이그레이션·`wrangler deploy`(2026-07-18, 버전 4a91cc35). backfill 스크립트 동봉(기존 R2 데이터 0건 — 7일 lifecycle — 실행 불요). 확장(src/**) 코드 변경 0.
- **품질:** ADR 008~010, 리서치 노트 3건(질문 A~F 출처 확정), 멀티벤더 적대 검증 4라운드(codex R1 FAIL→PASS·claude P2/P3 PASS), worker vitest 83개, 배포본 E2E 스모크(negative 포함) PASS. PR #13·#14·#15.

## 0.2.0 — 2026-06-06

### 익명 공유 기능 정식 마감

- **익명 컨텍스트 공유:** 캡처 이미지를 익명 업로드 → `/s/{id}` HTML 뷰어 공유 링크 생성(클립보드 자동 복사). 원본 이미지는 `/i/{id}` 가 `image/png` 로 직접 반환. 업로드는 PNG 매직 검증 + 10MB 제한.
- **공유 링크 7일 후 접근 차단:** 업로드 후 7일(`MAX_AGE_MS`) 경과 시 코드 레벨에서 차단 — 만료·없는 키는 `410` + 안내 메시지(`/i` GONE_MSG, `/s` 만료 페이지)로 응답, 빈 화면 없음. (R2 객체는 버킷 lifecycle 규칙 `auto-delete-7d`로 7일 후 실제 자동 삭제 — 2026-06-07 라이브 버킷 `wrangler r2 bucket lifecycle list`로 확인. 초판의 "v0.3 백로그" 표기는 wrangler.jsonc만 보고 쓴 오기재였음.)
- **보안 — 누출 차단:** 컨텍스트 토글 기본 **OFF** + 최초 1회 공유 동의(취소 시 업로드 차단). 전송 페이로드는 `SharedContext` 화이트리스트만(`debugLogs`·`project` 제외), 토큰/쿠키/localStorage 미사용(`chrome.storage.local` 만). 뷰어는 모든 동적 필드 `escapeHtml()` + URL `sanitizeHttpUrl()` 로 XSS 차단.
- **변경 — 사이드패널/오버레이 UI 리파인:** 디자인 토큰 시스템 도입(그라데이션 제거), 아이콘 `lucide` 통일, 빈 상태·마이크로카피 보강, 영문 툴팁·하드코딩 정리(i18n).

### 인프라

- **버전 동기화 게이트:** `package.json` · `manifest.json` · `package-lock.json`(top · packages) 4값 일치를 빌드 전 검사(`scripts/check-version-sync.mjs`), 불일치 시 빌드 실패.

### 검증

- `npm run build` — 버전 동기화 게이트 green(0.2.0 4값 일치), 무경고, `dist/manifest.json` version 0.2.0
- vitest: root 14 + worker 26 = **40 passed**
- 공유 플로우 자동 스모크 `upload-share.mjs` **10/10** (확장 로드·공유 토글·동의·누출 회귀 — `captureVisibleTab` 은 mock 주입, 실제 캡처→R2 E2E 아님)
- 실제 캡처→공유→링크 육안 확인은 외부 독푸딩(수동)에서

## 0.1.3 — 2026-05-24

### Store Candidate

- **버전 동기화:** `package.json`, `package-lock.json`, `manifest.json`, 사이드패널 UI 표시를 `0.1.3`으로 통일.
- **전체 캡처 단축키 확정:** 풀페이지 캡처 기본 단축키를 `Alt+Shift+G`로 문서 SoT에 반영.
- **문서 정리:** Full Page Capture를 v0.1 포함 기능으로 PRD에 반영하고, Phase 2 스토어 제출 체크리스트 추가.

### 검증

- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run test:e2e:all`

## 0.1.2 — 2026-05-10

### 신규 기능

- **프로그레시브 공개 UI:** 캡처 전엔 핀 메모 / AI 디버그 팩 섹션 숨김. 첫 캡처 후 노출.
- **캡쳐 버튼 2×2 그리드:** 화면/문서/요소/전체 캡쳐 4개를 한눈에.
- **전체 캡쳐 (Full Page Capture, `Alt+Shift+G`):** 스크롤 전체 페이지를 한 장 PNG 로 stitch. 최대 15000px, 초과 시 truncated 토스트.
- **이미지 확대 라이트박스 (🔍):** 미리보기 우하단 버튼 → 풀스크린 원본 보기 + 마우스 휠 줌 (0.5×~16×) + 드래그 팬 + 핀 추가/삭제.

### 버그 수정 및 UX 개선

- **단축키 충돌:** `Alt+Shift+D` 가 Whale 의 다크모드 토글과 충돌하여 캡처 안 되던 문제. 문서 캡쳐 단축키를 `Alt+Shift+M` 으로 변경.
- **핀 메모 입력 불가:** textarea focus 이벤트가 풀 재렌더를 트리거해 textarea 가 destroy/재생성되며 입력이 사라지던 버그. "활성 핀 변경" 과 "구조 변경" 분리.
- **라이트박스 핀 클릭 시 새 핀 추가:** `setPointerCapture` 로 인해 `ev.target` 이 viewport 로 고정. `document.elementFromPoint` 로 실제 요소 조회.
- **라이트박스 확대 시 텍스트 ghosting:** `transform: scale()` GPU 합성이 image-rendering 힌트 무시. **줌을 img.width 직접 변경 + native scroll pan 으로 리팩토링**해 GPU 합성 우회.
- **히스토리 무한 누적:** `pack.id` 기반 dedup → URL 기반 dedup 으로 변경 + 각 row 에 ❌ 삭제 버튼 추가.
- **히스토리 로드 후 추가 핀이 프롬프트 누락:** `tryBuildPack` 의 `loadedPack` short-circuit 제거. 라이브 캡처 입력 있으면 항상 fresh 생성.
- **viewport 0×0 / UA 공란:** YouTube 등 SPA 에서 콘텐츠 스크립트 응답 실패 시 `chrome.scripting.executeScript` 인라인 폴백 추가.
- **빈 핀 섹션 헤더 출력:** 핀 0개일 때 `## 핀 주석` 만 떠 있던 문제. 3개 템플릿 모두 `{{#if pins}}` 로 감쌈.
- **캡쳐 라벨:** 전체 캡쳐가 "문서 캡쳐" 로 표시되던 문제. `CaptureType` 에 `'full-page'` 추가, 모든 분기 보강.
- **두 번 클릭 삭제:** 핀 배지 첫 클릭 = 선택, 같은 핀 두 번째 클릭 = 삭제 토글. `lastClickedPinId` 상태로 auto-active 와 user-clicked 구분.
- **앱 아이콘:** 마스터 PNG 의 네이비 배경을 픽셀 임계치로 투명화, 코랄 심볼만 96% 채움 → 툴바에서 시각적 크기 향상.
- **한국어화 마무리:** "Capture history", "Settings / Help: Shortcuts", "Saved Context Pack..." 등 영문 잔재 모두 한국어로.

### 품질 인프라

- **E2E 자동 회귀** Playwright 기반 5개 프로브 (smoke / pin-flow / loaded-pack-pin / pin-delete / coverage), 총 **48개 자동 검증**.
- `npm run test:e2e:all` 한 번으로 전체 검증.
- 체크리스트 #1-30 중 22개 자동, 8개 수동 (실제 captureVisibleTab + 키보드 단축키 필요).

## 0.1.1 — 2026-05-10

### 신규 기능

- **PNG 복사 / 저장 (ImageActions):** 핀 주석 포함 PNG 를 클립보드 복사 또는 파일 저장.
- **캡쳐 히스토리:** 최근 50개 캡쳐 자동 저장 + 썸네일 리스트 + 스와이프/X 삭제 + 클릭 시 이미지·핀 복원.
- **프롬프트 템플릿 3종:** 🐛 버그 리포트 · 🔧 리팩토링 · 📐 레퍼런스. Mustache-lite 엔진 (`{{var}}`, `{{#if}}`, `{{#each}}`) 으로 렌더. 선택 상태 `chrome.storage.local` 영속.
- **키보드 단축키:** `Alt+Shift+V` 화면, `Alt+Shift+E` 요소, `Alt+Shift+D` 문서. (PNG 복사는 단축키 슬롯 4개 제한으로 수동 바인딩.) `Alt+Shift+D` 는 v0.1.2 에서 Whale 충돌로 `Alt+Shift+M` 으로 변경됨.

### 통합 / 리팩토링

- **App.ts 머지 통합:** 모드 핍(visible/element/document) 별도 UI 제거 → ContextPackPanel 드롭다운으로 통합. `CAPTURE_RESULT` 수신 시 자동 히스토리 저장 + Context Pack 자동 생성.
- **레거시 prompt 빌더 제거:** 하드코딩 `buildPrompt()` 함수 완전 삭제, 템플릿 기반 `buildTemplatePrompt` 로 교체. 관련 테스트(`tests/context-pack.test.ts`) 재작성.
- **번들 사이드패널 JS −9.3%** (47.5 → 43.1 kB) — 레거시 빌더 제거 효과.

## 0.1.0 — 2026-05-07

### 제품

- Manifest V3 · Vite · `@crxjs/vite-plugin` · TypeScript strict · Side Panel UI.
- **캡쳐:** Visible / Element(오버레이 선택·crop) / Document(본문 영역 탐색·crop).
- **미리보기:** 빈 상태 placeholder, 캡쳐 이미지 표시.
- **핀 주석:** 번호 핀·메모 목록·삭제·재번호·이미지 좌표(%).
- **Context Pack:** 생성(`generator`)·AI 프롬프트 Markdown(`buildPrompt`)·JSON 클립보드·핀 포함 PNG 다운로드(`annotated-image` + `downloads`).
- **메타데이터:** `CAPTURE_RESULT`에 URL·title·viewport·UA·이미지 크기; Visible은 `GET_PAGE_META` / Element·Document는 메시지에 viewport·UA 포함.

### 인프라·권한

- `activeTab` 제거, `host_permissions: <all_urls>` 기반 캡쳐.
- `permissions`: sidePanel, storage, scripting, downloads, tabs, windows 등.

### 문서

- ADR: Side Panel, host permissions, 메타데이터 수집.
- 작업 로그: 초기 세팅, v0.1 완료.
