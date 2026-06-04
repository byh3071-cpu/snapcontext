# 공유 링크 + 컨텍스트 뷰어 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 캡처 이미지+컨텍스트를 Cloudflare Worker로 업로드하고 공개 뷰어 링크를 생성하는 "공유 링크" 기능을 SnapContext 확장에 추가한다.

**Architecture:** worker는 multipart 업로드(이미지 필수+크기/매직바이트 방어), `/i/{id}` raw 이미지, `/s/{id}` HTML 뷰어를 제공하고 `obj.uploaded` 기준 7일 lazy expiry를 강제한다. 확장은 `ImageActions`에 공유 버튼+컨텍스트 포함 토글(기본 OFF)+최초 1회 동의를 추가하고, 화이트리스트 방식의 최소 `SharedContext`만 동봉한다.

**Tech Stack:** TypeScript, Cloudflare Workers + R2, Wrangler 4.x, Vite + @crxjs, vitest(유닛), Playwright(E2E).

**Branch:** `feat/share-context-viewer` (이미 생성됨).

**Spec:** `docs/superpowers/specs/2026-06-04-share-context-viewer-design.md`

---

## 파일 구조

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `worker/src/lib.ts` | 부수효과 없는 순수 로직: 이스케이프·URL검증·매직바이트·만료판정·만료일포맷·뷰어 HTML 빌드·상수·SharedContext 타입 | 신규 |
| `worker/src/index.ts` | fetch 핸들러: `/upload`(multipart+방어), `/i/{id}`, `/s/{id}` | 수정(전면) |
| `worker/vitest.config.ts` | worker 유닛 테스트 설정 | 신규 |
| `worker/test/lib.test.ts` | `lib.ts` 순수 함수 테스트 | 신규 |
| `worker/package.json` | vitest devDep + test 스크립트 | 수정 |
| `src/types/index.ts` | `SharedContext` 타입 추가 | 수정 |
| `src/vite-env.d.ts` | `VITE_UPLOAD_ENDPOINT` 타입 | 수정 |
| `.env.example` / `.env` | 엔드포인트 변수 | 수정/신규 |
| `src/utils/upload.ts` | `uploadShare(blob, ctx?)` | 신규 |
| `tests/upload.test.ts` | `uploadShare` 유닛 테스트 | 신규 |
| `src/sidepanel/components/ImageActions.ts` | 공유 버튼 + 컨텍스트 토글 + 동의 + 핸들러 | 수정 |
| `src/sidepanel/App.ts` | `getContext` deps 추가 | 수정 |
| `src/sidepanel/styles/global.css` | 공유 UI 스타일 | 수정 |
| `tests/e2e/upload-share.mjs` | 업로드/뷰어 E2E (fetch mock) | 신규 |
| `package.json` | `test:e2e:all`에 신규 E2E 추가 | 수정 |

---

## Task 1: worker 순수 로직 lib + vitest 셋업 (TDD)

**Files:**
- Create: `worker/src/lib.ts`
- Create: `worker/vitest.config.ts`
- Create: `worker/test/lib.test.ts`
- Modify: `worker/package.json`

- [ ] **Step 1: worker에 vitest 설치**

Run (PowerShell, `worker/`에서):
```powershell
cd worker
npm install -D vitest
```
Expected: vitest devDependency 추가됨.

- [ ] **Step 2: worker/vitest.config.ts 작성**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
})
```

- [ ] **Step 3: worker/package.json에 test 스크립트 추가**

`scripts`를 다음으로 교체:
```json
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
```

- [ ] **Step 4: 실패하는 테스트 작성 — worker/test/lib.test.ts**

```ts
import { describe, it, expect } from 'vitest'
import {
  escapeHtml,
  sanitizeHttpUrl,
  isPngMagic,
  isExpired,
  formatExpiryKST,
  buildViewerHtml,
  parseSharedContext,
  MAX_AGE_MS,
  PNG_MAGIC,
  type SharedContext
} from '../src/lib'

describe('escapeHtml', () => {
  it('escapes &, <, >, ", \'', () => {
    expect(escapeHtml('<script>"&\'')).toBe('&lt;script&gt;&quot;&amp;&#39;')
  })
})

describe('sanitizeHttpUrl', () => {
  it('allows http/https', () => {
    expect(sanitizeHttpUrl('https://a.com/x')).toBe('https://a.com/x')
  })
  it('rejects javascript:', () => {
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBeNull()
  })
  it('rejects garbage', () => {
    expect(sanitizeHttpUrl('not a url')).toBeNull()
  })
})

describe('isPngMagic', () => {
  it('true for PNG signature', () => {
    expect(isPngMagic(new Uint8Array([...PNG_MAGIC, 0x00]))).toBe(true)
  })
  it('false for non-PNG', () => {
    expect(isPngMagic(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false)
  })
})

describe('isExpired', () => {
  const now = 1_700_000_000_000
  it('expired past 7 days', () => {
    expect(isExpired(new Date(now - MAX_AGE_MS - 1), now)).toBe(true)
  })
  it('not expired within 7 days', () => {
    expect(isExpired(new Date(now - 1000), now)).toBe(false)
  })
})

describe('formatExpiryKST', () => {
  it('returns non-empty string', () => {
    const s = formatExpiryKST(new Date(1_700_000_000_000))
    expect(typeof s).toBe('string')
    expect(s.length).toBeGreaterThan(0)
  })
})

describe('parseSharedContext', () => {
  it('parses valid json', () => {
    const ctx = parseSharedContext('{"v":1,"sourceUrl":"http://a"}')
    expect(ctx?.sourceUrl).toBe('http://a')
  })
  it('returns null on invalid json', () => {
    expect(parseSharedContext('{bad')).toBeNull()
  })
})

describe('buildViewerHtml', () => {
  const ctx: SharedContext = {
    v: 1,
    sourceUrl: 'http://a.com/p',
    sourceTitle: '<script>x',
    captureType: 'visible',
    capturedAt: '2026-06-04T00:00:00.000Z',
    viewport: { width: 1280, height: 720 },
    pins: [{ id: 1, memo: '<b>memo' }]
  }
  it('escapes title (no raw script)', () => {
    const html = buildViewerHtml('id1', ctx, '2026-06-11 09:00')
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;script&gt;x')
  })
  it('references /i/{id}', () => {
    expect(buildViewerHtml('id1', ctx, 'x')).toContain('/i/id1')
  })
  it('does not linkify javascript: url', () => {
    const bad = { ...ctx, sourceUrl: 'javascript:alert(1)' }
    const html = buildViewerHtml('id2', bad, 'x')
    expect(html).not.toContain('href="javascript:')
  })
  it('renders image-only when ctx is null', () => {
    const html = buildViewerHtml('id3', null, 'x')
    expect(html).toContain('/i/id3')
    expect(html).not.toContain('<dl>')
  })
})
```

- [ ] **Step 5: 테스트 실패 확인**

Run (`worker/`에서): `npx vitest run`
Expected: FAIL — `Cannot find module '../src/lib'` (또는 export 없음).

- [ ] **Step 6: worker/src/lib.ts 구현**

```ts
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export type SharedContext = {
  v: 1
  sourceUrl: string
  sourceTitle: string
  captureType: string
  capturedAt: string
  viewport: { width: number; height: number }
  pins: Array<{ id: number; memo: string }>
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sanitizeHttpUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href
    return null
  } catch {
    return null
  }
}

export function isPngMagic(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_MAGIC.length) return false
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) return false
  }
  return true
}

export function isExpired(uploaded: Date, now: number): boolean {
  return uploaded.getTime() + MAX_AGE_MS < now
}

export function formatExpiryKST(uploaded: Date): string {
  const expiry = new Date(uploaded.getTime() + MAX_AGE_MS)
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(expiry)
}

export function parseSharedContext(raw: string): SharedContext | null {
  try {
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object') return null
    return o as SharedContext
  } catch {
    return null
  }
}

export function buildExpiredHtml(): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>SnapContext 공유</title><style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0f1424;color:#e8eaf0;display:grid;place-items:center;min-height:100vh}div{text-align:center;padding:24px}p{color:#9aa3bd}</style></head><body><div><h1>링크 만료</h1><p>이 링크는 만료되었거나 존재하지 않습니다.<br>(업로드 후 7일간 보관됩니다)</p></div></body></html>`
}

export function buildViewerHtml(
  id: string,
  ctx: SharedContext | null,
  expiryLabel: string
): string {
  const notice = `익명 공유 · 업로드 후 7일 자동 삭제 (만료 예정: ${escapeHtml(expiryLabel)})`
  let contextBlock = ''
  if (ctx) {
    const urlHref = sanitizeHttpUrl(ctx.sourceUrl)
    const urlHtml = urlHref
      ? `<a href="${escapeHtml(urlHref)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(ctx.sourceUrl)}</a>`
      : escapeHtml(ctx.sourceUrl)
    const pins = Array.isArray(ctx.pins) ? ctx.pins : []
    const pinsHtml = pins.length
      ? `<ul class="pins">${pins
          .map(
            (p) =>
              `<li><span class="pin-no">${escapeHtml(String(p.id))}</span> ${escapeHtml(p.memo || '(메모 없음)')}</li>`
          )
          .join('')}</ul>`
      : '<p class="muted">핀 메모 없음</p>'
    const vp = ctx.viewport
    contextBlock = `
      <section class="ctx">
        <h2>${escapeHtml(ctx.sourceTitle || '(제목 없음)')}</h2>
        <p class="src">${urlHtml}</p>
        <dl>
          <dt>캡처 유형</dt><dd>${escapeHtml(ctx.captureType || '')}</dd>
          <dt>캡처 시각</dt><dd>${escapeHtml(ctx.capturedAt || '')}</dd>
          <dt>뷰포트</dt><dd>${escapeHtml(`${vp?.width ?? '?'}x${vp?.height ?? '?'}`)}</dd>
        </dl>
        <h3>핀 메모</h3>
        ${pinsHtml}
      </section>`
  }
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>SnapContext 공유</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #0f1424; color: #e8eaf0; line-height: 1.5; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 16px; }
  .notice { font-size: 13px; color: #9aa3bd; text-align: center; padding: 10px; background: rgba(255,255,255,0.04); border-radius: 10px; margin: 10px 0; }
  .shot { width: 100%; height: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); display: block; }
  .ctx { margin-top: 16px; background: rgba(255,255,255,0.04); border-radius: 12px; padding: 16px; }
  .ctx h2 { margin: 0 0 6px; font-size: 18px; }
  .ctx h3 { font-size: 14px; margin: 12px 0 6px; color: #c5cbe0; }
  .ctx .src { margin: 0 0 12px; word-break: break-all; }
  .ctx a { color: #7db3ff; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; font-size: 14px; }
  dt { color: #9aa3bd; }
  dd { margin: 0; }
  .pins { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
  .pins li { display: flex; gap: 8px; align-items: baseline; }
  .pin-no { flex: 0 0 auto; min-width: 22px; height: 22px; border-radius: 50%; background: #e94560; color: #fff; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
  .muted { color: #9aa3bd; }
  footer { text-align: center; padding: 20px 0; color: #6b7390; font-size: 12px; }
</style>
</head>
<body>
  <div class="wrap">
    <p class="notice">${notice}</p>
    <img class="shot" src="/i/${encodeURIComponent(id)}" alt="공유된 캡처 이미지">
    ${contextBlock}
    <p class="notice">${notice}</p>
    <footer>SnapContext</footer>
  </div>
</body>
</html>`
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run (`worker/`에서): `npx vitest run`
Expected: PASS (모든 lib 테스트 green).

- [ ] **Step 8: 커밋**

```powershell
cd ..
git add worker/src/lib.ts worker/vitest.config.ts worker/test/lib.test.ts worker/package.json worker/package-lock.json
git commit -m "feat(worker): 순수 로직 lib 추가 (이스케이프·만료·매직바이트·뷰어HTML) + vitest"
```

---

## Task 2: worker fetch 핸들러 재작성 (multipart + 방어 + 뷰어)

**Files:**
- Modify: `worker/src/index.ts` (전면 교체)

- [ ] **Step 1: worker/src/index.ts 전체 교체**

```ts
import {
  MAX_UPLOAD_BYTES,
  isPngMagic,
  isExpired,
  formatExpiryKST,
  buildViewerHtml,
  buildExpiredHtml,
  parseSharedContext
} from './lib'

export interface Env {
  BUCKET: R2Bucket
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

const GONE_MSG = '이 링크는 만료되었거나 존재하지 않습니다. (업로드 후 7일 보관)'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
  })
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS }
  })
}

function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      ...CORS
    }
  })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS })
    }

    // 업로드: POST /upload (multipart/form-data: image 필수, context 선택)
    if (req.method === 'POST' && url.pathname === '/upload') {
      const cl = Number(req.headers.get('content-length') ?? '0')
      if (Number.isFinite(cl) && cl > MAX_UPLOAD_BYTES + 1024 * 1024) {
        return textResponse('파일이 너무 큽니다. (최대 10MB)', 413)
      }
      let form: FormData
      try {
        form = await req.formData()
      } catch {
        return textResponse('잘못된 업로드 형식입니다.', 400)
      }
      const image = form.get('image')
      if (!(image instanceof File) && !(image instanceof Blob)) {
        return textResponse('이미지가 없습니다.', 400)
      }
      if (image.size > MAX_UPLOAD_BYTES) {
        return textResponse('파일이 너무 큽니다. (최대 10MB)', 413)
      }
      const buf = await image.arrayBuffer()
      if (!isPngMagic(new Uint8Array(buf.slice(0, 8)))) {
        return textResponse('PNG 이미지만 업로드할 수 있습니다.', 415)
      }
      const id = crypto.randomUUID()
      await env.BUCKET.put(id, buf, {
        httpMetadata: { contentType: 'image/png' }
      })
      const context = form.get('context')
      if (typeof context === 'string' && context.length > 0) {
        await env.BUCKET.put(`${id}.json`, context, {
          httpMetadata: { contentType: 'application/json' }
        })
      }
      return jsonResponse({ id, url: `${url.origin}/s/${id}` })
    }

    // raw 이미지: GET /i/{id}
    if (req.method === 'GET' && url.pathname.startsWith('/i/')) {
      const id = url.pathname.slice(3)
      const obj = await env.BUCKET.get(id)
      if (!obj || isExpired(obj.uploaded, Date.now())) {
        return textResponse(GONE_MSG, 410)
      }
      return new Response(obj.body, {
        headers: {
          'Content-Type': obj.httpMetadata?.contentType ?? 'image/png',
          'Cache-Control': 'public, max-age=604800',
          ...CORS
        }
      })
    }

    // 뷰어: GET /s/{id}
    if (req.method === 'GET' && url.pathname.startsWith('/s/')) {
      const id = url.pathname.slice(3)
      const head = await env.BUCKET.head(id)
      if (!head || isExpired(head.uploaded, Date.now())) {
        return htmlResponse(buildExpiredHtml(), 410)
      }
      const ctxObj = await env.BUCKET.get(`${id}.json`)
      const ctx = ctxObj ? parseSharedContext(await ctxObj.text()) : null
      const html = buildViewerHtml(id, ctx, formatExpiryKST(head.uploaded))
      return htmlResponse(html, 200)
    }

    return textResponse('Not found', 404)
  }
}
```

- [ ] **Step 2: 타입체크**

Run (`worker/`에서): `npx tsc --noEmit`
Expected: 에러 없음 (`TSC_OK` 수준).

- [ ] **Step 3: worker 유닛 재실행 (회귀)**

Run (`worker/`에서): `npx vitest run`
Expected: PASS.

- [ ] **Step 4: 커밋**

```powershell
cd ..
git add worker/src/index.ts
git commit -m "feat(worker): multipart 업로드 + /i raw + /s HTML 뷰어 + 7일 만료/업로드 방어"
```

---

## Task 3: worker 배포 + 검증 (수동, 사용자 인증 필요)

> 이 태스크는 Cloudflare 인증이 필요해 사용자가 직접 실행한다. lazy expiry는 코드로 보증되며, 실제 삭제는 R2 lifecycle 규칙이 담당한다.

- [ ] **Step 1: R2 lifecycle 규칙 중복 확인 (먼저!)**

Run (`worker/`에서):
```powershell
npx wrangler r2 bucket lifecycle list snapcontext-uploads
```
- 7일 삭제 규칙이 이미 있으면 → **건드리지 않는다 (추가 금지).**
- 없을 때만 대시보드 또는 `npx wrangler r2 bucket lifecycle add` 로 7일 삭제 규칙 추가.

- [ ] **Step 2: 배포**

Run (`worker/`에서): `npx wrangler deploy`
Expected: `https://snapcontext-worker.byh3071-26a.workers.dev` 출력.

- [ ] **Step 3: 검증 curl 매트릭스 (PowerShell)**

```powershell
# 컨텍스트 포함 업로드
node -e "const fs=require('fs');fs.writeFileSync('t.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64'))"
curl.exe -s -X POST -F "image=@t.png;type=image/png" -F "context={""v"":1,""sourceUrl"":""https://example.com/p"",""sourceTitle"":""테스트"",""captureType"":""visible"",""capturedAt"":""2026-06-04T00:00:00.000Z"",""viewport"":{""width"":1280,""height"":720},""pins"":[{""id"":1,""memo"":""여기 버그""}]}" "https://snapcontext-worker.byh3071-26a.workers.dev/upload"
```
Expected: `{"id":"...","url":".../s/..."}`.

- [ ] **Step 4: 뷰어/이미지/방어 수동 확인**

- 위 응답의 `url`을 브라우저로 열기 → 이미지 + 제목/소스URL(클릭가능)/핀메모/만료예정일 표시.
- `/i/{id}` 직접 열기 → 이미지 바이트.
- 존재하지 않는 id `/s/없는거` → 410 만료 페이지.
- 비-PNG 업로드 415 확인:
```powershell
"hello" | Out-File -Encoding ascii bad.txt
curl.exe -s -o NUL -w "%{http_code}`n" -X POST -F "image=@bad.txt;type=image/png" "https://snapcontext-worker.byh3071-26a.workers.dev/upload"
```
Expected: `415`.

- [ ] **Step 5: 임시 파일 정리**

```powershell
Remove-Item t.png, bad.txt -ErrorAction SilentlyContinue
```

---

## Task 4: 확장 SharedContext 타입 추가

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: `src/types/index.ts` 끝에 타입 추가**

파일 맨 끝(`PinItem` 정의 다음)에 추가:
```ts

export type SharedContext = {
  v: 1
  sourceUrl: string
  sourceTitle: string
  captureType: CaptureType
  capturedAt: string
  viewport: { width: number; height: number }
  pins: Array<{ id: number; memo: string }>
}
```

- [ ] **Step 2: 타입체크**

Run (루트에서): `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```powershell
git add src/types/index.ts
git commit -m "feat(types): 공유용 최소 SharedContext 타입 추가 (화이트리스트)"
```

---

## Task 5: env 변수 배선

**Files:**
- Modify: `src/vite-env.d.ts`
- Modify: `.env.example`
- Create: `.env` (gitignore됨)

- [ ] **Step 1: `src/vite-env.d.ts`의 ImportMetaEnv 교체**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly VITE_UPLOAD_ENDPOINT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 2: `.env.example`에 한 줄 추가**

기존 내용 아래에 추가:
```
VITE_UPLOAD_ENDPOINT=https://snapcontext-worker.byh3071-26a.workers.dev
```

- [ ] **Step 3: 로컬 `.env` 생성 (빌드/E2E에 필요, gitignore됨)**

Run (루트에서, PowerShell):
```powershell
Add-Content -Path .env -Value "VITE_UPLOAD_ENDPOINT=https://snapcontext-worker.byh3071-26a.workers.dev" -Encoding utf8
```
(이미 `.env`가 있으면 해당 줄만 있는지 확인.)

- [ ] **Step 4: 커밋 (.env는 제외)**

```powershell
git add src/vite-env.d.ts .env.example
git commit -m "feat(env): VITE_UPLOAD_ENDPOINT 변수 배선"
```

---

## Task 6: 업로드 유틸 uploadShare (TDD)

**Files:**
- Create: `src/utils/upload.ts`
- Create: `tests/upload.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성 — tests/upload.test.ts**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { uploadShare } from '../src/utils/upload'
import type { SharedContext } from '../src/types'

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })

describe('uploadShare', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://w.example.dev')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('posts image-only and returns url', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ id: 'x', url: 'https://w.example.dev/s/x' }))
    vi.stubGlobal('fetch', fetchMock)

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    const url = await uploadShare(blob)

    expect(url).toBe('https://w.example.dev/s/x')
    const [calledUrl, opts] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe('https://w.example.dev/upload')
    expect(opts.method).toBe('POST')
    expect(opts.body).toBeInstanceOf(FormData)
    expect((opts.body as FormData).get('context')).toBeNull()
  })

  it('includes context when provided and never leaks debugLogs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ url: 'https://w.example.dev/s/y' }))
    vi.stubGlobal('fetch', fetchMock)

    const ctx: SharedContext = {
      v: 1,
      sourceUrl: 'http://a',
      sourceTitle: 't',
      captureType: 'visible',
      capturedAt: '2026-06-04T00:00:00.000Z',
      viewport: { width: 1, height: 2 },
      pins: [{ id: 1, memo: 'm' }]
    }
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    await uploadShare(blob, ctx)

    const body = fetchMock.mock.calls[0][1].body as FormData
    const sent = JSON.parse(body.get('context') as string)
    expect(sent).toEqual(ctx)
    expect('debugLogs' in sent).toBe(false)
    expect('project' in sent).toBe(false)
  })

  it('throws on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 413 })))
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    await expect(uploadShare(blob)).rejects.toThrow('업로드 실패 (413)')
  })

  it('throws when endpoint missing', async () => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', '')
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    await expect(uploadShare(blob)).rejects.toThrow('엔드포인트가 설정되지')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run (루트에서): `npx vitest run tests/upload.test.ts`
Expected: FAIL — `Cannot find module '../src/utils/upload'`.

- [ ] **Step 3: src/utils/upload.ts 구현**

```ts
import type { SharedContext } from '../types'

/**
 * 캡처 PNG(+선택 컨텍스트)를 공유 worker에 업로드하고 공유 URL을 반환한다.
 * 엔드포인트는 빌드 타임 .env의 VITE_UPLOAD_ENDPOINT에서 읽는다.
 */
export async function uploadShare(
  imageBlob: Blob,
  context?: SharedContext
): Promise<string> {
  const endpoint = import.meta.env.VITE_UPLOAD_ENDPOINT
  if (!endpoint) {
    throw new Error('업로드 엔드포인트가 설정되지 않았습니다.')
  }
  const form = new FormData()
  form.append('image', imageBlob, 'capture.png')
  if (context) {
    form.append('context', JSON.stringify(context))
  }
  const res = await fetch(`${endpoint}/upload`, {
    method: 'POST',
    body: form
  })
  if (!res.ok) {
    throw new Error(`업로드 실패 (${res.status})`)
  }
  const data = (await res.json()) as { url?: string }
  if (!data.url) {
    throw new Error('서버 응답에 URL이 없습니다.')
  }
  return data.url
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run (루트에서): `npx vitest run tests/upload.test.ts`
Expected: PASS (4 테스트).

- [ ] **Step 5: 커밋**

```powershell
git add src/utils/upload.ts tests/upload.test.ts
git commit -m "feat(upload): uploadShare 유틸 + 유닛 테스트 (컨텍스트 누출 차단 검증)"
```

---

## Task 7: ImageActions에 공유 버튼 + 컨텍스트 토글 + 동의 + 핸들러

**Files:**
- Modify: `src/sidepanel/components/ImageActions.ts`

- [ ] **Step 1: `src/sidepanel/components/ImageActions.ts` 전체 교체**

```ts
import { Copy, Download, UploadCloud } from 'lucide'
import type { PinItem, SharedContext } from '../../types'
import {
  copyAnnotatedPngToClipboard,
  downloadAnnotatedPng,
  renderAnnotatedPngBlob
} from '../../utils/annotated-image'
import { toKoreanErrorMessage } from '../../utils/messaging'
import { uploadShare } from '../../utils/upload'
import { getStorageItem, setStorageItem } from '../../storage'
import { showConfirm } from '../confirm-dialog'
import { panelLucideIcon } from '../utils/panel-lucide'

const CONSENT_KEY = 'snapcontext.uploadConsent'
const INCLUDE_CONTEXT_KEY = 'snapcontext.shareIncludeContext'
const CONSENT_MESSAGE =
  '공개 링크로 업로드됩니다. 링크를 아는 누구나 볼 수 있고 7일 후 삭제됩니다. ' +
  '컨텍스트 포함을 켜면 소스 주소·핀 메모도 함께 공개됩니다(주소에 토큰·쿼리가 있을 수 있으니 주의). ' +
  '민감한 화면은 주의하세요.'

export type ImageActionsApi = {
  sync: () => void
  copyPng: () => Promise<void>
}

export function mountImageActions(
  host: HTMLElement,
  deps: {
    hasCapture: () => boolean
    getImage: () => string | null
    getPins: () => PinItem[]
    getContext: () => SharedContext | null
    showToast: (message: string, kind?: 'info' | 'error') => void
  }
): ImageActionsApi {
  host.classList.add('image-actions')

  const row = document.createElement('div')
  row.className = 'image-actions__row'

  const mkBtn = (
    label: string,
    icon: SVGElement,
    variant: 'primary' | 'default'
  ): HTMLButtonElement => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className =
      variant === 'primary'
        ? 'context-pack-panel__btn context-pack-panel__btn--primary'
        : 'context-pack-panel__btn'
    const iconWrap = document.createElement('span')
    iconWrap.className = 'context-pack-panel__icon'
    iconWrap.setAttribute('aria-hidden', 'true')
    iconWrap.appendChild(icon)
    const labelSpan = document.createElement('span')
    labelSpan.textContent = label
    btn.append(iconWrap, labelSpan)
    return btn
  }

  const btnCopy = mkBtn('PNG 복사', panelLucideIcon(Copy, 18), 'primary')
  const btnSave = mkBtn('PNG 저장', panelLucideIcon(Download, 18), 'default')
  btnCopy.title = 'PNG copy (Alt+Shift+P)'
  btnSave.title = 'PNG save'
  row.append(btnCopy, btnSave)

  // 공유 링크 버튼 (전체 폭)
  const shareRow = document.createElement('div')
  shareRow.className = 'image-actions__share-row'
  const btnShare = mkBtn('공유 링크', panelLucideIcon(UploadCloud, 18), 'default')
  btnShare.title = '공유 링크 생성 (공개·7일)'
  const shareLabel = btnShare.querySelector('span:last-child') as HTMLSpanElement
  shareRow.append(btnShare)

  // 컨텍스트 포함 토글
  const toggleLabel = document.createElement('label')
  toggleLabel.className = 'image-actions__toggle'
  const toggleInput = document.createElement('input')
  toggleInput.type = 'checkbox'
  const toggleText = document.createElement('span')
  toggleText.textContent = '컨텍스트 포함 (소스 주소·핀 메모)'
  toggleLabel.append(toggleInput, toggleText)

  host.append(row, shareRow, toggleLabel)

  // 토글 상태 로드 (기본 OFF)
  void (async () => {
    toggleInput.checked =
      (await getStorageItem<boolean>(INCLUDE_CONTEXT_KEY)) ?? false
  })()
  toggleInput.addEventListener('change', () => {
    void setStorageItem(INCLUDE_CONTEXT_KEY, toggleInput.checked)
  })

  const onCopy = async (): Promise<void> => {
    const img = deps.getImage()
    if (!img) {
      deps.showToast('캡처 데이터가 없습니다.', 'error')
      return
    }
    try {
      await copyAnnotatedPngToClipboard(img, deps.getPins())
      deps.showToast('이미지를 클립보드에 복사했습니다.', 'info')
    } catch (e) {
      deps.showToast(toKoreanErrorMessage(e), 'error')
    }
  }

  const onSave = async (): Promise<void> => {
    const img = deps.getImage()
    if (!img) {
      deps.showToast('캡처 데이터가 없습니다.', 'error')
      return
    }
    try {
      const filename = `snapcontext_${Date.now()}.png`
      await downloadAnnotatedPng(img, deps.getPins(), filename)
      deps.showToast('PNG 다운로드를 시작했습니다.', 'info')
    } catch (e) {
      deps.showToast(toKoreanErrorMessage(e), 'error')
    }
  }

  const onShare = async (): Promise<void> => {
    const img = deps.getImage()
    if (!img) {
      deps.showToast('캡처 데이터가 없습니다.', 'error')
      return
    }
    // 최초 1회 동의
    const consented = (await getStorageItem<boolean>(CONSENT_KEY)) ?? false
    if (!consented) {
      const ok = await showConfirm(CONSENT_MESSAGE)
      if (!ok) return
      await setStorageItem(CONSENT_KEY, true)
    }

    btnShare.disabled = true
    shareLabel.textContent = '업로드 중…'
    try {
      const blob = await renderAnnotatedPngBlob(img, deps.getPins())
      const ctx = toggleInput.checked ? deps.getContext() ?? undefined : undefined
      const url = await uploadShare(blob, ctx)
      try {
        await navigator.clipboard.writeText(url)
        deps.showToast('공유 링크 복사됨 · 7일 후 만료', 'info')
      } catch {
        deps.showToast(`공유 링크: ${url} (복사 실패)`, 'info')
      }
    } catch (e) {
      deps.showToast(toKoreanErrorMessage(e), 'error')
    } finally {
      btnShare.disabled = !deps.hasCapture()
      shareLabel.textContent = '공유 링크'
    }
  }

  btnCopy.addEventListener('click', () => {
    void onCopy()
  })
  btnSave.addEventListener('click', () => {
    void onSave()
  })
  btnShare.addEventListener('click', () => {
    void onShare()
  })

  const sync = (): void => {
    const has = deps.hasCapture()
    host.hidden = !has
    btnCopy.disabled = !has
    btnSave.disabled = !has
    btnShare.disabled = !has
  }
  sync()

  return { sync, copyPng: onCopy }
}
```

> 참고: `toKoreanErrorMessage`가 `Error.message`를 그대로 노출하면 "업로드 실패 (413)" / "업로드 엔드포인트가 설정되지 않았습니다." 같은 메시지가 토스트로 보인다. (기존 동작 유지)

- [ ] **Step 2: 타입체크**

Run (루트에서): `npx tsc --noEmit`
Expected: `App.ts`에서 `getContext` 누락 에러가 발생할 수 있음 → Task 8에서 해결. ImageActions.ts 자체 타입 에러는 없어야 함. (만약 App.ts 에러만 남으면 Task 8 진행 후 재확인.)

- [ ] **Step 3: 커밋**

```powershell
git add src/sidepanel/components/ImageActions.ts
git commit -m "feat(sidepanel): 공유 링크 버튼 + 컨텍스트 포함 토글 + 최초 동의 + 업로드 핸들러"
```

---

## Task 8: App.ts에 getContext deps 연결

**Files:**
- Modify: `src/sidepanel/App.ts:271-276`

- [ ] **Step 1: mountImageActions 호출부 교체**

`App.ts`의 다음 블록(약 271행):
```ts
  const imageActions = mountImageActions(imageActionsHost, {
    hasCapture: () => capturedImage !== null,
    getImage: () => capturedImage,
    getPins: () => pins,
    showToast
  })
```
을 다음으로 교체:
```ts
  const imageActions = mountImageActions(imageActionsHost, {
    hasCapture: () => capturedImage !== null,
    getImage: () => capturedImage,
    getPins: () => pins,
    getContext: () =>
      captureSnapshot
        ? {
            v: 1,
            sourceUrl: captureSnapshot.sourceUrl,
            sourceTitle: captureSnapshot.sourceTitle,
            captureType: captureSnapshot.captureType,
            capturedAt: currentHistoryTimestamp,
            viewport: captureSnapshot.viewport,
            pins: pins.map((p) => ({ id: p.id, memo: p.memo }))
          }
        : null,
    showToast
  })
```

> 화이트리스트: `captureSnapshot`을 통째로 넘기지 않고 필요한 필드만 명시적으로 골라 담는다 → `debugLogs`/`project`/`userAgent` 구조적으로 제외.

- [ ] **Step 2: 타입체크**

Run (루트에서): `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```powershell
git add src/sidepanel/App.ts
git commit -m "feat(sidepanel): ImageActions에 getContext(화이트리스트) 연결"
```

---

## Task 9: 공유 UI 스타일

**Files:**
- Modify: `src/sidepanel/styles/global.css`

- [ ] **Step 1: `.image-actions__row` 블록 다음에 스타일 추가**

`global.css`의 `.image-actions__row .context-pack-panel__btn { justify-content: center; }` 규칙(약 1032행) 다음에 추가:
```css
.image-actions__share-row {
  margin-top: 8px;
}

.image-actions__share-row .context-pack-panel__btn {
  width: 100%;
  justify-content: center;
}

.image-actions__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  user-select: none;
}

.image-actions__toggle input {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #e94560;
}
```

- [ ] **Step 2: 빌드로 CSS 반영 확인**

Run (루트에서): `npm run build`
Expected: 빌드 성공, 에러 없음.

- [ ] **Step 3: 커밋**

```powershell
git add src/sidepanel/styles/global.css
git commit -m "style(sidepanel): 공유 버튼·컨텍스트 토글 스타일"
```

---

## Task 10: E2E 테스트 (fetch mock)

**Files:**
- Create: `tests/e2e/upload-share.mjs`
- Modify: `package.json`

- [ ] **Step 1: tests/e2e/upload-share.mjs 작성**

```js
/*
 * SnapContext 공유 링크 + 컨텍스트 토글 E2E.
 * window.fetch를 mock해 실제 worker를 때리지 않는다.
 * 검증: 공유 버튼 노출 / 최초 동의 / 토글 OFF·ON에 따른 context 동봉 / 클립보드 복사.
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..', '..')
const EXTENSION_PATH = resolve(PROJECT_ROOT, 'dist')
const SCREENSHOTS_DIR = resolve(__dirname, 'screenshots')
const USER_DATA_DIR = resolve(tmpdir(), `snapcontext-upload-${Date.now()}`)

if (!existsSync(EXTENSION_PATH)) {
  console.error('[upload-share] dist/ not found. Run "npm run build" first.')
  process.exit(1)
}
mkdirSync(SCREENSHOTS_DIR, { recursive: true })

const results = []
const log = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const fakeBuf = await sharp({
  create: {
    width: 200,
    height: 200,
    channels: 4,
    background: { r: 90, g: 110, b: 140, alpha: 1 }
  }
})
  .png()
  .toBuffer()
const FAKE_PNG = `data:image/png;base64,${fakeBuf.toString('base64')}`

const FAKE_CAPTURE = {
  type: 'CAPTURE_RESULT',
  imageData: FAKE_PNG,
  captureType: 'visible',
  sourceUrl: 'http://test.local/upload-test?token=secret',
  sourceTitle: 'Upload Test Page',
  viewport: { width: 1280, height: 720 },
  userAgent: 'Test/1.0',
  debugLogs: [{ id: 'd1', level: 'error', message: 'SECRET_LOG', timestamp: '2026' }],
  imageWidth: 200,
  imageHeight: 200
}

async function getServiceWorker(context) {
  const existing = context.serviceWorkers()
  if (existing.length > 0) return existing[0]
  return context.waitForEvent('serviceworker', { timeout: 10000 })
}

// 페이지 내부에서 fetch를 mock하고, 마지막 업로드의 context를 window에 저장한다.
async function installFetchMock(page) {
  await page.evaluate(() => {
    const w = window
    w.__lastUpload = null
    const real = w.fetch
    w.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.url
      if (url.includes('/upload')) {
        const body = init && init.body
        let ctx = null
        if (body && typeof body.get === 'function') {
          const c = body.get('context')
          ctx = c == null ? null : String(c)
        }
        w.__lastUpload = { context: ctx }
        return new Response(
          JSON.stringify({ id: 'mockid', url: 'https://mock.example.dev/s/mockid' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return real(input, init)
    }
  })
}

async function injectCapture(sw, page) {
  await sw.evaluate(async (payload) => {
    await chrome.runtime.sendMessage(payload)
  }, FAKE_CAPTURE)
  await page.waitForTimeout(700)
}

async function main() {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 400, height: 900 },
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-default-browser-check',
      '--no-first-run'
    ]
  })

  let exitCode = 0
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const sw = await getServiceWorker(context)
    const extensionId = new URL(sw.url()).host
    const sidePanelUrl = `chrome-extension://${extensionId}/src/sidepanel/index.html`

    const page = await context.newPage()
    await page.goto(sidePanelUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(700)
    await installFetchMock(page)
    await injectCapture(sw, page)

    const shareBtn = page
      .locator('.image-actions__share-row button')
      .filter({ hasText: '공유 링크' })
      .first()
    log('공유 링크 버튼 노출', (await shareBtn.count()) > 0)

    // --- 1회차: 토글 OFF, 동의 다이얼로그 → 계속 ---
    await shareBtn.click()
    await page.waitForTimeout(300)
    const dialog = page.locator('.snap-confirm')
    const dialogShown = (await dialog.count()) > 0
    log('최초 동의 다이얼로그 표시', dialogShown)
    if (dialogShown) {
      await page.locator('.snap-confirm__btn--primary').click()
    }
    await page.waitForTimeout(800)

    const off = await page.evaluate(() => window.__lastUpload)
    log('토글 OFF → context 미동봉', off !== null && off.context === null, JSON.stringify(off))

    const clip1 = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))
    log('공유 URL 클립보드 복사', clip1.includes('mock.example.dev/s/'))

    // --- 2회차: 토글 ON, 동의 다이얼로그 안 뜸 ---
    const toggle = page.locator('.image-actions__toggle input').first()
    await toggle.check()
    await page.waitForTimeout(150)
    await shareBtn.click()
    await page.waitForTimeout(400)
    const dialog2 = (await page.locator('.snap-confirm').count()) > 0
    log('2회차 동의 다이얼로그 안 뜸', !dialog2)
    if (dialog2) {
      await page.locator('.snap-confirm__btn--primary').click()
    }
    await page.waitForTimeout(800)

    const on = await page.evaluate(() => window.__lastUpload)
    let ctxObj = null
    try {
      ctxObj = on && on.context ? JSON.parse(on.context) : null
    } catch {
      ctxObj = null
    }
    log('토글 ON → context 동봉', !!ctxObj && ctxObj.sourceUrl === FAKE_CAPTURE.sourceUrl)
    log('컨텍스트에 debugLogs 누출 없음', !!ctxObj && !('debugLogs' in ctxObj))
    log('컨텍스트에 project/userAgent 누출 없음', !!ctxObj && !('project' in ctxObj) && !('userAgent' in ctxObj))

    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '07-upload-share.png') })

    const failed = results.filter((r) => !r.pass)
    console.log(`\n[upload-share] ${results.length - failed.length}/${results.length} checks passed`)
    if (failed.length > 0) exitCode = 1
  } catch (err) {
    console.error('[upload-share] fatal:', err)
    exitCode = 1
  } finally {
    await context.close()
    try {
      rmSync(USER_DATA_DIR, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
  process.exit(exitCode)
}

main()
```

- [ ] **Step 2: package.json의 test:e2e:all에 추가**

`test:e2e:all` 끝에 ` && node tests/e2e/upload-share.mjs` 추가:
```json
    "test:e2e:all": "node tests/e2e/smoke.mjs && node tests/e2e/pin-flow.mjs && node tests/e2e/loaded-pack-pin.mjs && node tests/e2e/pin-delete.mjs && node tests/e2e/coverage.mjs && node tests/e2e/full-page-shortcut.mjs && node tests/e2e/upload-share.mjs",
```

- [ ] **Step 3: 빌드 후 신규 E2E 실행**

Run (루트에서):
```powershell
npm run build
node tests/e2e/upload-share.mjs
```
Expected: 모든 체크 ✅, exit 0.

- [ ] **Step 4: 커밋**

```powershell
git add tests/e2e/upload-share.mjs package.json
git commit -m "test(e2e): 공유 업로드 + 컨텍스트 토글 + 누출 차단 E2E (fetch mock)"
```

---

## Task 11: 전체 검증 + 게이트 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 유닛 전체 (루트)**

Run: `npm test`
Expected: 기존 `context-pack.test.ts` + 신규 `upload.test.ts` 전부 PASS.

- [ ] **Step 2: worker 유닛**

Run: `cd worker; npx vitest run; cd ..`
Expected: lib 테스트 PASS.

- [ ] **Step 3: 빌드**

Run: `npm run build`
Expected: `tsc --noEmit` + `vite build` 성공.

- [ ] **Step 4: 전체 E2E**

Run: `npm run test:e2e:all`
Expected: 7개 E2E 파일 전부 통과 (기존 6 + 신규 1).

- [ ] **Step 5: 게이트 확인**

- 위 1~4 전부 green이어야 스토어(Phase 5) 제출 가능.
- worker 배포(Task 3) 완료 + R2 lifecycle 7일 삭제 규칙 존재 확인.

- [ ] **Step 6: 최종 정리 커밋 (필요 시)**

```powershell
git status
# 잔여 변경 없으면 생략
```

---

## Self-Review (작성자 점검 결과)

**Spec 커버리지:**
- multipart 업로드 → Task 2 ✅ / `/i/{id}` → Task 2 ✅ / `/s/{id}` HTML 뷰어 → Task 1(빌드)+2(라우팅) ✅
- 7일 lazy expiry → Task 1(`isExpired`)+2 ✅ / R2 lifecycle 필수+중복방지 → Task 3 Step1 ✅
- 업로드 방어(10MB/매직바이트) → Task 1(`isPngMagic`)+2 ✅
- SharedContext 화이트리스트 → Task 4(타입)+8(생성) ✅ / debugLogs·project 제외 → Task 6·10 테스트로 검증 ✅
- XSS 이스케이프 + URL 스킴 화이트리스트 → Task 1(`escapeHtml`/`sanitizeHttpUrl`)+테스트 ✅
- 컨텍스트 토글 기본 OFF → Task 7 ✅ / 최초 1회 동의(+주소·메모 경고) → Task 7 ✅
- 클립보드 복사 + 토스트 → Task 7 ✅ / `/s/` no-cache → Task 2(`htmlResponse`) ✅
- env 분리 → Task 5 ✅ / 엔드포인트 미설정 에러 → Task 6 ✅

**플레이스홀더 스캔:** 없음 (모든 코드 스텝 완전 코드 포함).

**타입 일관성:** worker `SharedContext`(lib.ts)와 확장 `SharedContext`(types/index.ts)는 별도 패키지라 의도적 중복. 확장 쪽 `captureType: CaptureType`, worker 쪽 `captureType: string`(직렬화 수신측이라 느슨) — 호환됨. `uploadShare(blob, context?)` 시그니처가 Task 6 정의·Task 7 호출 일치. `getContext` 반환 형태가 Task 8 생성·Task 7 소비 일치.

**알려진 한계:** worker fetch 핸들러(index.ts) 자체는 유닛 테스트 없이 Task 3 수동 curl로 검증(miniflare 도입은 YAGNI). 순수 로직은 전부 lib.test.ts로 커버.
