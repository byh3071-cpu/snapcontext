---
id: phase0-capture-trigger
date: 2026-07-18
tags: [research, phase0, snap_capture, mv3, mcp]
question: C
---

# Phase 0 R2 — 질문 C: 원격 MCP → 확장 즉시 캡처 트리거

## 권고

**`snap_capture` 를 0.3.0 MVP에서 드랍 (0.4+ 재검토).**

근거: 원격 Cloudflare Worker(MCP)가 사용자 브라우저의 MV3 확장을 “즉시” 깨워 `captureVisibleTab`을 실행하는 **검증된 프로덕션 패턴이 부족**하다. Chrome이 공식적으로 제시하는 원격→확장 경로(Web Push / WebSocket / `chrome.gcm`)는 각각 SW 수명·권한 경고·keepalive·비동기 결과 브리징 비용이 있고, 실제로 에이전트가 브라우저를 제어하는 MCP 사례는 **로컬 Native Messaging 브리지**가 주류다. PRD 기본 방향(“근거 없으면 드랍”)과 DoD(`snap_history`·`snap_pack` read-only)와도 일치한다.

## 3줄 요약

1. 원격→확장 “즉시 캡처”는 기술적으로 불가능하진 않으나, MVP에 넣기엔 **인프라·SW 수명·권한·레이턴시·비동기 MCP 응답**이 한꺼번에 붙는다.
2. 폴링은 ≥30s 바닥, SSE는 공식 권장 목록 밖·offscreen 의존, WS+DO는 keepalive+과금, Web Push는 가장 유망하나 `notifications` 권한·FCM·구독 수명 관리가 필요.
3. 브라우저 MCP 실사례는 **로컬 native host** 중심 — SnapContext 0.3.0의 **원격 HTTP MCP** 전제와 경로가 다르다.

---

## PRD 앵커 (읽기)

- `docs/PRD-0.3.0.md` § snap_capture: 원격 Worker는 확장을 직접 제어 불가 → 트리거 패턴 복잡도·타당성 = 질문 C. 기본 방향은 history/pack 집중, capture는 근거 확보 전까지 배제.
- 미해결 질문 C (P0): 원격 MCP → 클라이언트(확장) 액션 트리거 존재 여부·복잡도 → MVP 포함/드랍.
- 리스크 표: `snap_capture` 원격 트리거가 WebSocket/DO로 과도하면 Phase 0에서 근거 없으면 드랍.

조사일: **2026-07-18** (아래 출처는 모두 이 날짜에 재확인).

---

## 패턴 비교 표

| 패턴 | MV3 SW 충돌 | 인프라 복잡도 | 레이턴시 | 실제 구현 사례 | 출처 URL | 확인 날짜 |
|------|-------------|---------------|----------|----------------|----------|-----------|
| **(1) 확장 폴링** (`chrome.alarms` + job queue / 짧은 fetch) | **부분 충돌**. `setInterval`은 SW 종료 시 소멸 → `chrome.alarms` 필수. 최소 주기 **30초**(Chrome 120+). `fetch()` 응답이 **30초 초과**면 SW 종료(long-poll 단독은 위험). | **낮음~중간**. Worker에 pending job 큐(KV/R2/D1)만 있으면 됨. DO 불필요. | **나쁨** (최악 ≥30s, 평균 ~15s). “즉시 캡처” 제품 의도 불충족. | Tap 확장: HTTP long-poll + alarms keepalive 사례 보고. Chrome alarms 샘플. | https://developer.chrome.com/docs/extensions/reference/api/alarms · https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle · https://taprun.dev/blog/building-mv3-extension-git-log-retrospective.html · https://developer.chrome.com/docs/extensions/whats-new (Chrome 120: 30s alarm) | 2026-07-18 |
| **(2) SSE 스트리밍** | **충돌 큼**. Chrome 공식 Real-time 가이드는 Push / gcm / WebSocket만 열거(SSE 미등재). SW에서 `EventSource` 미지원·지속 연결은 offscreen+alarms 재기동 필요. 커뮤니티 가이드만 존재. | **중간~높음**. Worker SSE 엔드포인트 + offscreen 문서 + CWS reason 정당화. | 연결 유지 시 **낮음**, 단 SW/offscreen 끊기면 재연결 공백. | 공식 Chrome SSE 샘플 **없음**(UNVERIFIED beyond community blogs). | https://developer.chrome.com/docs/extensions/develop/concepts/real-time · https://developer.chrome.com/docs/extensions/reference/api/offscreen · https://bestchromeextensions.com/docs/patterns/streaming-sse-patterns/ (커뮤니티, 1차 출처 아님) | 2026-07-18 |
| **(3) WebSocket + Durable Objects** | **조건부 OK (Chrome 116+)**. WS 송수신이 idle 타이머 리셋. 단 **20s keepalive** 필수. Chrome이 “서버가 WS로 확장을 깨우진 못함”(연결이 이미 살아 있어야 함). | **높음**. DO 네임스페이스 + hibernation WS + 확장 상시 연결. **DO 과금**: Free 100k req/day·13k GB-s/day; Paid 포함 한도 후 req $0.15/M·duration $12.50/M GB-s. `accept()`만 쓰면 duration 과금 → **Hibernation API 권장**. | 연결 중 **매우 낮음**(ms~sub-s). 브라우저/확장 오프라인·SW 재시작 시 재연결 지연. | Chrome 공식 WS 튜토리얼·샘플. CF DO WebSocket 문서. **원격 MCP→캡처 완결 사례는 미발견**. (로컬 MCP↔확장 WS: Kapture 등 — 원격 CF와 별개) | https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets · https://developer.chrome.com/docs/extensions/develop/concepts/real-time · https://developers.cloudflare.com/durable-objects/best-practices/websockets/ · https://developers.cloudflare.com/durable-objects/platform/pricing/ · https://github.com/williamkapke/kapture | 2026-07-18 |
| **(4) Web Push** | **충돌 낮음(권장 경로)**. Push가 suspended SW를 **깨움**. Chrome 121+ `userVisibleOnly: false`로 silent push 가능. 단 manifest `notifications` 권한 → **설치 경고**·기존 설치 비활성 후 재승인. | **중간**. VAPID + Push provider(또는 self-host `web-push`) + Chrome 쪽 FCM 라우팅 + 디바이스별 subscription 저장. DO 필수 아님. | **중~낮음**(초 단위 가능). OS/브라우저/네트워크에 따라 가변. “즉시” UX는 보장 불가. | Chrome 공식 Web Push 가이드·샘플. silent push PSA. **MCP 툴→Push→캡처→결과 반환 E2E 공개 사례는 미발견**. | https://developer.chrome.com/docs/extensions/how-to/integrate/web-push · https://developer.chrome.com/docs/extensions/develop/concepts/real-time · https://groups.google.com/a/chromium.org/g/chromium-extensions/c/F1OOx-8b8BE | 2026-07-18 |
| **(5a) chrome.gcm (레거시)** | Push와 유사(메시지 시 SW 기동). | FCM 레거시 HTTP 의존. Chrome은 웹표준 Push 우선 권장. | Push와 유사. | 장기 지원 문서상 존재. 신규 비권장. | https://developer.chrome.com/docs/extensions/develop/concepts/real-time | 2026-07-18 |
| **(5b) Native Messaging / 로컬 MCP 브리지** | `connectNative`가 SW를 유지(Chrome 105+). **원격 Worker가 아님**. | 로컬 Node/native host + 확장. SnapContext 0.3.0 “원격 HTTP MCP on CF” 아키텍처와 **불일치**. | **매우 낮음**(로컬). | webpage-mcp, chrome-mcp-server, Kapture 등 — 에이전트↔브라우저 제어의 **주류 패턴**. | https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle · https://github.com/mcpland/webpage-mcp · https://github.com/syedazharmbnr1/chrome-mcp-server · https://github.com/williamkapke/kapture | 2026-07-18 |

---

## 패턴별 상세

### (1) 확장 측 폴링 (`chrome.alarms` + job queue)

- **동작**: MCP `snap_capture`가 Worker에 job을 enqueue → 확장이 alarms마다 `GET /jobs/pending` → 캡처 → R2 PUT → job complete. MCP는 job 완료까지 HTTP long-wait 또는 폴링.
- **MV3**: alarms 최소 **0.5분(30초)** (공식). unpack 디버그에서는 제한 완화되나 프로덕션은 30초 바닥. `fetch` 응답 >30초면 SW 종료 → long-poll을 SW에 기대는 설계는 위험.
- **복잡도**: 서버는 단순. UX·레이턴시는 “즉시”가 아님.
- **사례**: Tap 블로그(alarms+HTTP poll로 데몬 연동). 공식 alarms 예제.

### (2) SSE

- Chrome Real-time 문서에 **SSE 옵션 없음**. 커뮤니티는 offscreen + `EventSource` 또는 fetch stream을 제안하나, offscreen은 reason/CWS 심사·단일 문서 제한·SW 사망 시 동반 종료 이슈.
- **현행성**: 2026-07-18 기준 공식 1급 가이드 부재 → MVP 채택 근거로 부적절.

### (3) WebSocket + Durable Objects

- 확장↔DO 상시 WS + 20s keepalive로 “온라인” 상태의 명령 푸시 가능.
- **과금**: DO는 Free/Paid 모두 존재. Free는 일일 한도 초과 시 실패. Paid는 Workers 최소 요금+$ 초과분. Hibernation 미사용 시 duration 과금이 커질 수 있음(공식 pricing 예제).
- **한계**: 확장이 연결되어 있지 않으면(브라우저 종료·SW 미기동·재연결 전) MCP 호출은 대기/타임아웃. “원격이 확장을 깨우는” 것이 아니라 “이미 깨어 있는 연결로 보냄”.
- **사례 갭**: CF DO+확장 일반 가이드는 있으나, **원격 MCP 툴 1회 호출 = 캡처 1장 반환** 공개 레퍼런스 없음.

### (4) Web Push

- 공식: suspended SW를 Push가 깨움 → 원격 트리거에 **가장 정합**.
- Chrome 121+ silent push(`userVisibleOnly: false`).
- **비용**: `notifications` 권한 경고; subscription·VAPID·FCM 경로; silent push 엣지 버그 보고(커뮤니티).
- **MCP 시맨틱**: 툴 호출 스레드가 Push→캡처→업로드→결과 조회를 기다려야 함(타임아웃·어느 탭·브라우저 오프라인). 구현량 ≫ read-only 2툴 MVP.
- **사례 갭**: Push로 확장 커맨드 수신 가이드는 있음. **원격 MCP `snap_capture` 완결 사례 UNVERIFIED/미발견**.

### (5) 기타 — Native Messaging (실무 주류, 그러나 원격 CF와 불일치)

- webpage-mcp / chrome-mcp-server / Kapture: AI 클라이언트 → **로컬** MCP(stdio/localhost) → native host → 확장.
- SnapContext 0.3.0 목표 아키텍처(에이전트 → **원격** CF Worker MCP → R2 조회)와 다른 축. 이 패턴을 쓰면 “원격 MCP” DoD가 아니라 “로컬 브라우저 MCP” 제품이 됨.

### 캡처 API 자체 (부수 제약)

- SnapContext는 이미 `host_permissions: ["<all_urls>"]` → `captureVisibleTab`에 **activeTab 사용자 제스처 필수는 아님**(호스트 권한으로 가능). 트리거만 해결되면 캡처 API 자체는 호출 가능.
- 출처: MDN `tabs.captureVisibleTab`; 현행 `manifest.json` (워크트리, 2026-07-18).

---

## 결론 매트릭스 (MVP)

| 기준 | 판정 |
|------|------|
| “즉시” 레이턴시 달성 가능성 | 폴링 ❌ / SSE 불확실 / WS·Push △(조건부) |
| MV3 공식 지원·문서 충분성 | Push·WS ✅ / alarms ✅ / SSE ❌ |
| CF Worker+DO 추가 복잡도·과금 | WS+DO 높음 / Push 중간 / 폴링 낮음 |
| 원격 MCP→확장 캡처 E2E 공개 사례 | **미발견** |
| PRD 기본 방향·DoD 정합 | history/pack only → **드랍** |

**최종: 0.3.0 MVP에서 `snap_capture` 드랍.**  
재검토 조건(0.4+): (a) Web Push silent + subscription 수명 PoC, (b) MCP 툴이 비동기 캡처 결과를 ≤N초 내 반환하는 프로토콜 확정, (c) 탭 선택·브라우저 오프라인 에러 시맨틱 ADR.

---

## 출처 목록 (확인일 2026-07-18)

| # | URL | 비고 |
|---|-----|------|
| 1 | https://developer.chrome.com/docs/extensions/develop/concepts/real-time | 공식: Push / gcm / WebSocket |
| 2 | https://developer.chrome.com/docs/extensions/how-to/integrate/web-push | Web Push + silent(Chrome 121+) |
| 3 | https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets | WS keepalive (Chrome 116+) |
| 4 | https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle | 30s idle / fetch 30s / alarms 30s(Chrome 120) / native messaging |
| 5 | https://developer.chrome.com/docs/extensions/reference/api/alarms | 최소 30초 |
| 6 | https://developer.chrome.com/docs/extensions/whats-new | Chrome 120 alarm 30s 고지 |
| 7 | https://developers.cloudflare.com/durable-objects/platform/pricing/ | DO Free/Paid·hibernation·duration |
| 8 | https://developers.cloudflare.com/durable-objects/best-practices/websockets/ | DO Hibernation WebSocket |
| 9 | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/captureVisibleTab | host vs activeTab |
| 10 | https://github.com/mcpland/webpage-mcp | Native Messaging MCP 사례 |
| 11 | https://github.com/syedazharmbnr1/chrome-mcp-server | 로컬 TCP+native host |
| 12 | https://github.com/williamkapke/kapture | 로컬 WS 브리지 MCP |
| 13 | https://taprun.dev/blog/building-mv3-extension-git-log-retrospective.html | alarms+HTTP poll 실무기 |
| 14 | https://groups.google.com/a/chromium.org/g/chromium-extensions/c/F1OOx-8b8BE | silent push PSA |

1년 이상 경과 자료(예: 2022 StackOverflow activeTab 이슈)는 2026-07-18에 공식 MDN/Chrome 문서·현행 manifest로 재확인함.
