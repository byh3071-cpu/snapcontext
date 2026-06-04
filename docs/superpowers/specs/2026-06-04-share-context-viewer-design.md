# 공유 링크 + 컨텍스트 뷰어 설계

- 날짜: 2026-06-04
- 상태: 승인됨 (구현 계획 대기)
- 관련: Cloudflare Worker 백엔드 `worker/` (`https://snapcontext-worker.byh3071-26a.workers.dev`)

## 목표

공유 링크를 "이미지 한 장"이 아니라 **"이미지 + 컨텍스트(소스 URL·핀 메모·메타)" 뷰어**로 확장한다.
SnapContext의 차별점은 *컨텍스트 공유*이므로, 받는 사람이 링크만 열어도 어떤 화면을 왜 캡처했는지 맥락까지 본다.

## 비목표 (YAGNI)

- 사용자 인증 / 비공개 공유 / 만료 기간 사용자 설정 → 안 함 (익명 공개·고정 7일).
- 업로드 이력 관리 UI / 삭제 버튼 → 안 함 (7일 자동 만료로 충분).
- `debugLogs`, `project`(AI 선호도) 공유 → **명시적으로 제외** (민감정보 유출 방지).

## 핵심 결정 사항

1. **7일 만료는 worker가 강제한다 (lazy expiry).** R2 객체의 `uploaded` 시각 + 7일이 지나면 `GET /i/{id}`·`GET /s/{id}` 모두 410을 반환한다. R2 lifecycle 규칙(실제 저장소 삭제)은 운영 위생용으로 별도 추가 가능하나, 링크 차단의 보증은 worker 코드가 한다.
2. **만료 예정일은 `obj.uploaded + 7일`로 계산** → 컨텍스트 JSON 유무와 무관하게(이미지-only 공유 포함) 표시 가능.
3. **공유 컨텍스트 JSON은 전용 최소 shape**를 쓴다. 기존 `ContextPack`을 통째로 올리지 않는다 (debugLogs·project 누출 방지).
4. **뷰어는 모든 사용자 입력 문자열을 HTML 이스케이프**하고, 소스 URL 링크는 `http`/`https` 스킴만 허용한다 (`javascript:` 등 차단).
5. **컨텍스트 포함 토글 기본값은 OFF (안전).** 사용자가 의도적으로 켜야 컨텍스트가 동봉된다.
6. **엔드포인트는 `.env`의 `VITE_UPLOAD_ENDPOINT`로 분리** (빌드 타임 인라인).

## 데이터 모델

### 공유 컨텍스트 JSON (`SharedContext`)

업로드 시 `context` 파트에 직렬화되는 최소 shape. 새 타입으로 정의(`src/types`).

```ts
type SharedContext = {
  v: 1
  sourceUrl: string        // captureSnapshot.sourceUrl
  sourceTitle: string      // captureSnapshot.sourceTitle
  captureType: CaptureType // captureSnapshot.captureType
  capturedAt: string       // currentHistoryTimestamp (ISO)
  viewport: { width: number; height: number }
  pins: Array<{ id: number; memo: string }>  // pin.memo만 (좌표 불필요: 뷰어는 목록만 표시)
}
```

- `debugLogs`, `project`, `userAgent`, 좌표(x/y)는 **제외**.
- 핀은 메모가 있는 것만 포함하거나 전부 포함(메모 빈 핀도 번호는 의미) → **전부 포함, 메모는 빈 문자열 허용**.

### R2 저장 키

- `{id}` → PNG 바이트 (`contentType: image/png`)
- `{id}.json` → `SharedContext` JSON (`contentType: application/json`), 컨텍스트 포함 ON일 때만 존재

## 백엔드 설계 (`worker/src/index.ts`)

상수: `const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000`

### `POST /upload` — multipart/form-data

- `formData.get('image')`: `File`/`Blob` 필수. 없으면 400.
- `formData.get('context')`: 문자열(선택). 있으면 JSON으로 R2 `{id}.json` 저장.
- `id = crypto.randomUUID()`.
- `BUCKET.put(id, imageBytes, { httpMetadata: { contentType: 'image/png' } })`.
- context 있으면 `BUCKET.put(`${id}.json`, contextStr, { httpMetadata: { contentType: 'application/json' } })`.
- 응답: `{ id, url: `${origin}/s/${id}` }` (CORS 헤더 유지).

### `GET /i/{id}` — raw 이미지 (신규)

- `obj = BUCKET.get(id)`. 없으면 410 (한국어 만료 안내).
- `obj.uploaded`(Date) + `MAX_AGE_MS` < now → 410.
- 반환: 이미지 바이트, `Content-Type: image/png`, `Cache-Control: public, max-age=604800`, CORS.

### `GET /s/{id}` — HTML 뷰어 (변경)

- `head = BUCKET.head(id)`. 없으면 410 페이지.
- 만료 검사(`head.uploaded` + 7일). 만료면 410 페이지.
- `ctxObj = BUCKET.get(`${id}.json`)`; 있으면 `JSON.parse`(try/catch, 실패 시 컨텍스트 없는 것으로 취급).
- 만료 예정일 = `head.uploaded + 7일` (KST 표기).
- HTML 렌더:
  - `<img src="/i/{id}">` (상대경로).
  - 컨텍스트 있으면: 소스 제목, 소스 URL(스킴 검증된 `<a>`), 핀 메모 목록(번호+텍스트), 캡처 시각, 뷰포트, captureType.
  - 상·하단 안내: "익명 공유 · 업로드 후 7일 자동 만료 (만료 예정: {날짜})".
  - 컨텍스트 없으면 이미지만 + 만료 안내.
  - 인라인 CSS, 외부 의존성 0, 모바일 반응형.
- **이스케이프 헬퍼**: 모든 동적 문자열은 `escapeHtml()` 통과. 소스 URL은 `new URL()` 파싱 후 `http:`/`https:`만 링크화, 그 외엔 텍스트로만 표시.

### `GET /{기타}` → 404 (기존 유지)

## 프론트엔드 설계 (`src/`)

### `src/utils/upload.ts` (신규)

```ts
export async function uploadShare(imageBlob: Blob, context?: SharedContext): Promise<string>
```

- `const endpoint = import.meta.env.VITE_UPLOAD_ENDPOINT` — 없으면 `throw new Error('업로드 엔드포인트가 설정되지 않았습니다.')`.
- `FormData`: `image`(blob), context 있으면 `context`(JSON.stringify).
- `fetch(`${endpoint}/upload`, { method: 'POST', body: form })`.
- `!res.ok` → `throw new Error('업로드 실패 (' + res.status + ')')`.
- `{ url }` 파싱 후 반환. 네트워크 실패는 호출부에서 `toKoreanErrorMessage`로 변환.

### 환경 변수 배선

- `src/vite-env.d.ts`: `ImportMetaEnv`에 `readonly VITE_UPLOAD_ENDPOINT: string` 추가.
- `.env.example`: `VITE_UPLOAD_ENDPOINT=https://snapcontext-worker.byh3071-26a.workers.dev` 추가.
- `.env`(로컬, gitignore됨): 동일 값. 빌드 전 존재해야 함.

### `src/sidepanel/components/ImageActions.ts` (변경)

- deps 확장: `getContext: () => SharedContext | null` 추가.
- 새 버튼 `☁️ 공유 링크` (variant default; `PNG 복사`가 primary 유지).
- 새 토글 `🧩 컨텍스트 포함`: 네이티브 `<input type=checkbox>` + 라벨. 상태는 `chrome.storage.local` 키 `snapcontext.shareIncludeContext`(기본 false)에서 로드/저장.
- 공유 클릭 핸들러:
  1. `getImage()` 없으면 에러 토스트.
  2. 동의 확인: `getStorageItem<boolean>('snapcontext.uploadConsent')`. false면 `showConfirm('공개 링크로 업로드됩니다. 링크를 아는 누구나 볼 수 있고 7일 후 삭제됩니다. 민감한 화면은 주의하세요.')`. 취소 시 중단, 동의 시 플래그 저장.
  3. 인플라이트: 버튼 disable + 라벨 "업로드 중…".
  4. `renderAnnotatedPngBlob(img, pins)` → blob.
  5. 토글 ON이면 `getContext()`로 `SharedContext` 구성, OFF면 undefined.
  6. `uploadShare(blob, ctx)` → url.
  7. `navigator.clipboard.writeText(url)` + 토스트 "공유 링크 복사됨 · 7일 후 만료".
  8. 에러 → `toKoreanErrorMessage(e)` 토스트.
  9. `finally`에서 버튼 복구.
- `sync()`: 캡처 없으면 공유 버튼 disable(기존 copy/save와 동일).

### `src/sidepanel/App.ts` (변경)

- `mountImageActions(...)` deps(약 271행)에 `getContext` 추가:
  ```ts
  getContext: () => captureSnapshot ? {
    v: 1,
    sourceUrl: captureSnapshot.sourceUrl,
    sourceTitle: captureSnapshot.sourceTitle,
    captureType: captureSnapshot.captureType,
    capturedAt: currentHistoryTimestamp,
    viewport: captureSnapshot.viewport,
    pins: pins.map(p => ({ id: p.id, memo: p.memo }))
  } : null
  ```

### 스타일

- `src/sidepanel/styles`에 공유 버튼·토글 클래스 추가 (기존 `image-actions` 스타일 옆).

## 데이터 흐름

캡처 dataURL + pins → (토글 ON 시 SharedContext) → `renderAnnotatedPngBlob` → FormData → `POST /upload` → R2(`{id}`, `{id}.json`) → `{url}` → 클립보드.
링크 열람 → `GET /s/{id}` → worker가 head+만료검사 → HTML(이스케이프) + `<img src=/i/{id}>` → `GET /i/{id}`(만료검사) → 이미지.

## 에러 / 엣지 케이스

- 엔드포인트 미설정: 업로드 시 명확한 한국어 에러 토스트.
- 만료(7일 초과): 이미지·뷰어 모두 410 + 한국어 안내.
- 잘못된 id: 410.
- `{id}.json` 파싱 실패: 컨텍스트 없는 이미지-only 뷰어로 폴백.
- 컨텍스트 OFF: `{id}.json` 미생성, 뷰어는 이미지만.
- XSS: 모든 동적 문자열 이스케이프 + URL 스킴 화이트리스트.
- 클립보드 권한 거부: 업로드는 성공했으므로 url을 토스트에 노출(복사 실패 안내).

## 테스트 전략

### 유닛 (`tests/upload.test.ts`, vitest)

- `uploadShare`: fetch mock으로 성공 시 url 반환, 비200 시 에러, 엔드포인트 없으면 에러.
- (가능 시) `SharedContext`에 debugLogs/project가 절대 포함되지 않음 검증.

### E2E (`tests/e2e/upload-share.mjs`, playwright)

- `window.fetch` mock으로 `/upload`을 가로채 가짜 `{url}` 반환 (실제 worker 안 때림).
- 페이크 캡처 주입 → 공유 버튼 노출 확인.
- 토글 OFF: 업로드 시 FormData에 `context` 없음 확인.
- 토글 ON: `context` 포함 + debugLogs 없음 확인.
- 최초 동의 다이얼로그 → 동의 → 클립보드에 url 복사 + 토스트 확인.
- 2회차: 동의 다이얼로그 안 뜸 확인.
- `package.json`의 `test:e2e:all`에 추가.

### 뷰어 렌더 (worker 단위 또는 E2E)

- HTML 응답에 이스케이프된 제목/메모 포함, `<script>` 미주입 확인.
- 만료(uploaded 조작 불가하므로 단위 테스트로 만료 분기 검증 권장) → worker 로직을 순수 함수로 분리해 테스트 가능하게.

### 회귀

- 기존 E2E 6파일 + `context-pack.test.ts` 전부 통과.
- `npm run build` (tsc --noEmit + vite build) 통과.

## 게이트

위 구현 완료 + 전체 E2E·빌드 통과 전에는 스토어(Phase 5) 제출 금지.

## 영향 파일 요약

| 파일 | 변경 |
|---|---|
| `worker/src/index.ts` | multipart 업로드, `/i/{id}`, HTML 뷰어, 7일 만료 |
| `src/utils/upload.ts` | 신규 — `uploadShare` |
| `src/types/index.ts` | `SharedContext` 타입 추가 |
| `src/vite-env.d.ts` | `VITE_UPLOAD_ENDPOINT` 타입 |
| `.env.example` / `.env` | 엔드포인트 변수 |
| `src/sidepanel/components/ImageActions.ts` | 공유 버튼 + 컨텍스트 토글 + 핸들러 |
| `src/sidepanel/App.ts` | `getContext` deps 추가 |
| `src/sidepanel/styles/*` | 공유 UI 스타일 |
| `tests/upload.test.ts` | 신규 유닛 |
| `tests/e2e/upload-share.mjs` | 신규 E2E |
| `package.json` | `test:e2e:all`에 신규 E2E 추가 |
