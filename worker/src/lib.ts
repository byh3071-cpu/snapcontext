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
