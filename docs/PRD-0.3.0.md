---
id: prd-0.3.0
date: 2026-07-18
tags: [prd, mcp, worker, v0.3.0]
---

# SnapContext 0.3.0 PRD — MCP 서버화

> 실행 계획·단계·에이전트 매핑은 [로드맵](./로드맵.md) 참조. 이 문서는 **무엇을/왜**, 로드맵은 **언제/어떻게**.

## 한 줄 정의

AI 에이전트(Claude Code·Cursor)가 SnapContext가 캡처한 Context Pack을 **MCP로 직접 조회**하게 만든다 — 확장 프로그램을 "에이전트의 브라우저 지각 계층"으로 확장.

## 배경 (v0.2 완료 상태)

- v0.2.0 릴리즈·태그 완료. 익명 공유 백엔드(Cloudflare Worker + R2)가 프로덕션에 배포·가동 중이다.
- 확장은 캡처 이미지 + 축약 컨텍스트(`SharedContext`)를 `POST /upload` 로 올리고, `/s/{id}` HTML 뷰어 링크를 만든다. R2 객체는 업로드 후 7일에 코드 차단(410) + lifecycle 자동 삭제된다.
- 지금은 **사람이 뷰어 링크로 보는** 단계다. AI가 이 데이터를 프로그램적으로 읽는 경로는 없다 → 0.3.0이 이 공백을 채운다.

## 목표

- 기존 Worker를 **원격(HTTP) MCP 서버**로 확장해, 이미 R2에 쌓인 캡처를 에이전트가 조회하게 한다.
- 최소 툴 2종(`snap_history`·`snap_pack`)을 Claude Code/Cursor에서 **실호출 → Context Pack JSON 반환**까지 굴린다(= DoD).
- 신규 인프라 최소화: R2(기존) + 경량 JSON 인덱스만 추가. 고정 외부비용 $0 유지.

## 비목표 (0.3.0에서 명시적 배제)

- **스위스 UI 이식**(0.2.x 잔여) — 로드맵 트랙 A로 분리.
- **스토어 스크린샷·제출**(0.2.x 잔여) — 로드맵 트랙 A.
- **Debug Pack · before/after 비교 · 화살표/블러/형광펜 주석** — 0.4+ 이월(트랙 C).
- **Turso** 도입 — 보류(R2 + JSON 인덱스로 시작).
- **과금·Pro 게이팅·OAuth 풀 인증** — 보류(단일 개발자·독푸딩 단계, 최소 토큰 인증만).

## 확정 결정 5건

| # | 항목 | 결정 | 배제/보류 |
|---|------|------|-----------|
| 1 | Transport | Cloudflare Worker **원격(HTTP) MCP 서버** | Native Messaging 로컬앱 기각 |
| 2 | Storage | **R2(기존) + 경량 JSON 인덱스** | Turso 보류 |
| 3 | 인증/과금 | **보류** — 단일 개발자용 최소 토큰만 | Pro 게이팅·OAuth 풀 인증 배제 |
| 4 | MCP 툴 | 4종 계획: `snap_capture`·`snap_analyze`·`snap_history`·`snap_pack` | `snap_capture`는 조건부(아래) |
| 5 | DoD | Claude Code/Cursor에서 `snap_history`·`snap_pack` 실호출 → Context Pack JSON 반환 | — |

## MCP 툴 4종 스펙

> 입력 스키마·출력 형태는 **의도 수준 초안**이다. 실제 필드/시그니처는 Phase 0(인덱스 저장소 D·인증 E 확정) 이후 고정하고, 확정 후에는 시그니처 안정성을 지킨다.

### snap_history — 캡처 히스토리 목록 (MVP 코어)

- **목적**: 저장된 캡처를 최신순으로 나열해 에이전트가 무엇이 있는지 파악.
- **입력**: `limit`(선택, 기본값 Phase 0 확정), `url`/`tag` 필터(선택), `cursor`(선택, 페이지네이션).
- **출력**: 인덱스 엔트리 배열 — `id`, `createdAt`, `url`, `title`, `captureType`, `pinCount`(데이터 모델의 인덱스 스키마와 일치).
- **비고**: 인덱스를 읽는다(R2 `list` vs KV vs D1 = 질문 D). read-only, 부작용 없음.

### snap_pack — 단일 Context Pack 조회 (MVP 코어)

- **목적**: `id`로 특정 캡처의 Context Pack 전체를 반환 — 에이전트가 실제 맥락을 소비.
- **입력**: `id`(필수), `includeImage`(선택 — base64 인라인 vs 이미지 URL 참조, Phase 0 확정).
- **출력**: Context Pack JSON. 현재 R2에 저장된 축약 `SharedContext`만으로는 원본 스펙(핀 x/y·userNote·tags)이 비므로, **반환 형태 = "현재 저장분"인지 "확장 수집분"인지 Phase 2 수집 파이프라인 설계와 함께 확정**(데이터 모델 참조).
- **비고**: 만료(7일)·없는 `id`는 명시적 에러 반환(조용한 빈 반환 금지). read-only.

### snap_analyze — Context Pack 분석 (Phase 3 파생 툴 · DoD 밖)

- **목적**: 특정 캡처를 요약/이슈 추출 형태로 가공해 에이전트가 바로 쓰게. **MVP 코어(`snap_history`+`snap_pack`)와 분리 — DoD 범위 밖.**
- **스펙**: `snap_pack` 위에서 요약/이슈 추출. 입력(`id` + mode 등)·분석 위치(Worker vs 클라이언트 에이전트)·출력 시그니처는 Phase 3 확정.

### snap_capture — 지금 이 탭 캡처 (조건부 — Phase 0 판단)

- **목적**: 에이전트 요청 즉시 사용자 브라우저의 현재 탭을 캡처.
- **구조적 문제**: 원격 Worker는 사용자 브라우저 확장을 직접 제어할 수 없다. "지금 캡처"를 실현하려면 원격 서버 → 클라이언트(확장) 트리거 패턴(long-polling / job queue / WebSocket / Durable Objects 등)이 필요 → 복잡도·타당성 미검증(질문 C).
- **판단**: **Phase 0 리서치 결과에 따라 0.3.0 MVP 포함 또는 0.4+ 드랍**. 기본 방향은 "이미 저장된 팩 읽기(history·pack)에 집중, capture는 근거 확보 전까지 배제".
- **비고**: 이 툴만 read-only가 아니다(부작용 = 캡처 생성). MVP 확정 전까지 시그니처 미정.

## 아키텍처

```
┌─────────────────────────┐      ①캡처+수집(PUT)      ┌──────────────────────────────┐
│  SnapContext 확장 (MV3)  │ ───────────────────────▶ │  Cloudflare Worker            │
│  캡처·핀·Context Pack     │      토큰 인증(최소)        │  ┌────────────────────────┐  │
└─────────────────────────┘                           │  │ 공유 라우트(v0.2)        │  │
                                                       │  │  /upload /i/{id} /s/{id} │  │
                                                       │  ├────────────────────────┤  │
┌─────────────────────────┐   ②MCP(HTTP) 조회          │  │ MCP 라우트(v0.3 신규)    │  │
│  AI 에이전트              │ ◀──────────────────────▶ │  │  snap_history/pack/...   │  │
│  Claude Code · Cursor    │   Context Pack JSON 반환   │  └────────────────────────┘  │
└─────────────────────────┘                           └──────────────┬───────────────┘
                                                                      │ R2 get/list
                                                       ┌──────────────▼───────────────┐
                                                       │  R2  snapcontext-uploads      │
                                                       │  {id}=PNG · {id}.json=팩       │
                                                       │  index.json(신규·경량)         │
                                                       │  7일 lifecycle 자동 삭제        │
                                                       └───────────────────────────────┘
```

- ① 확장이 캡처를 R2/인덱스에 넣는 경로(직접 PUT vs Worker 엔드포인트 경유) = 질문 E, Phase 2.
- ② 에이전트가 원격 HTTP MCP로 조회. 원격 transport 표준(Streamable HTTP 등)과 클라이언트 연결 방식(네이티브 vs `mcp-remote` 브리지) = 질문 A·B, Phase 0.

## 데이터 모델

### R2 키 구조 (현행 + 신규)

| 키 | 내용 | 상태 |
|----|------|------|
| `{id}` | 캡처 PNG (`image/png`) | 현행(v0.2). `id = crypto.randomUUID()` — R2 오브젝트 키. 팩 내부 id(`snap_{ts}_{rand}`)와 별개 |
| `{id}.json` | 축약 `SharedContext`(아래) | 현행(v0.2) |
| `index.json` | 캡처 목록 경량 인덱스(아래) | **신규(0.3.0)** — 저장소는 질문 D에서 확정 |

> 주의: 현행 `{id}.json`은 공유용 **화이트리스트 축약본**이라 원본 Context Pack보다 필드가 적다 — `imageBase64`·핀 `x`/`y`·`userNote`·`tags`·`userAgent` 없음, `pins`는 `{id, memo}`만. `snap_pack`이 원본 스펙 수준을 반환하려면 Phase 2 수집 파이프라인에서 저장 범위를 넓혀야 한다.

### 현행 SharedContext (worker/src/lib.ts, `v:1`)

```
sourceUrl · sourceTitle · captureType · capturedAt
viewport{width,height} · pins[{id, memo}]
```

### 인덱스 스키마 초안 (index.json — Phase 0/1 확정 대상)

```
{
  "version": 1,
  "entries": [
    {
      "id": "…",            // R2 키 = 캡처 식별자
      "createdAt": "ISO",   // 정렬 키
      "url": "…",           // source.url
      "title": "…",         // source.title
      "captureType": "visible|element|document|full-page",
      "pinCount": 0
    }
  ]
}
```

- `snap_history` 출력 = `entries` 그대로. `snap_pack`은 `id`로 R2 원본을 가져온다.
- 인덱스를 별도 `index.json`으로 둘지, R2 `list()`로 대체할지, KV/D1로 뺄지 = 질문 D. 초안은 최소 형태만 잡아둔 것.
- **질문 D 결정 ↔ DoD #1 시연 연결**: `index.json`을 택할 경우 Phase 1 시연을 위해 기존 R2 객체를 1회 **백필**해야 한다(R2 `list()` 직접 열거를 택하면 백필 불요).

## 미해결 질문 A~F (Phase 0에서 답 확정)

> 아래는 리서치 **브리프**의 질문 목록이며 답은 아직 없다. 근거(출처·날짜) 확보 후 Phase 0에서 결론을 고정하고 ADR로 남긴다. 여기서 답을 지어내지 않는다.

| ID | 우선 | 질문 요지 | 결론 상태 |
|----|------|-----------|-----------|
| A | P0 | 2025–2026 원격 MCP 표준 transport(stdio/SSE/Streamable HTTP 중 권장·폐기)와 Cloudflare 공식 원격 MCP 스택(`agents` SDK `McpAgent`·`workers-mcp`·`workers-oauth-provider` 중 무엇). Worker에서 MCP 서버 띄우는 최소 셋업 | Phase 0 |
| B | P0 | Claude Desktop/Code·Cursor가 원격 HTTP MCP에 네이티브 연결 가능한가, `mcp-remote` 브리지 필요한가 + 클라이언트별 실제 등록 config | Phase 0 (DoD 직결) |
| C | P0 | 원격 MCP 서버가 클라이언트(확장) 액션을 트리거하는 패턴 존재 여부·복잡도 → `snap_capture` MVP 포함/드랍 판단 | Phase 0 |
| D | P1 | 메타데이터 인덱스: R2(objects+list) vs KV vs D1 — 프리티어·정합성·조회 제약 비교 후 택1 | Phase 0 |
| E | P1 | 확장→R2/인덱스 수집 경로(직접 PUT presigned/aws4fetch vs Worker 엔드포인트 경유) + "내 데이터만" 반환용 최소 인증(bearer 등) | Phase 0/2 |
| F | P2 | Workers 프리티어 계정당 한도(예: 100K req/day)·초과 과금 구조 현재 수치 확인(출처·날짜) | Phase 0 |

## DoD (완료 판정)

1. Claude Code **또는** Cursor에서 원격 MCP 서버 등록 → `snap_history` 호출 → 인덱스 엔트리 목록 반환.
2. 같은 클라이언트에서 `snap_pack` 호출(유효 `id`) → Context Pack JSON 반환.
3. 만료·없는 `id` 호출 시 조용한 빈 반환이 아니라 **명시적 에러** 반환.
4. `pnpm test`(root+worker) green, `tsc --noEmit` + `vite build`(확장) + worker 빌드 통과, `vhk mission check` 위반 0.
5. ADR(transport·인덱스 저장소·인증 결정) + changelog 0.3.0 기록.

## 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| MCP/Cloudflare 스택이 2025년 급변 — 오래된 정보로 잘못된 SDK 채택 | 재작업 | 질문 A/B는 출처·날짜 필수, 1년 이상 자료는 현행성 재확인(Phase 0 게이트) |
| `snap_capture` 원격 트리거가 과도한 복잡도(WebSocket/DO)로 판명 | 일정 지연 | Phase 0에서 근거 없으면 드랍, read-only 2툴로 MVP 확정 |
| 저장 축약본(SharedContext)이 원본 Context Pack보다 빈약 → `snap_pack` 반환이 얕음 | DoD 품질 저하 | 데이터 모델의 수집 범위 확장을 Phase 2에서 결정, 초기엔 "현재 저장분 반환"으로 명시 |
| 인증 없이 원격 MCP 노출 시 타인 조회 가능 | 데이터 노출 | 최소 bearer 토큰(질문 E) 없이는 조회 라우트 미공개 |
| 인덱스와 R2 객체(7일 만료) 정합성 어긋남 — 만료된 id가 인덱스에 잔존 | 오류 응답 | 만료 검사(`isExpired`) 재사용 + 조회 시 R2 head로 실재 확인 |
