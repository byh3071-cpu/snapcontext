/**
 * 스위스 아이콘 어휘 — 단일 패밀리 (디자인 SoT: docs/ui-audit/swiss/snapcontext.html)
 * 24×24 광학박스 · stroke 1.8 · square cap/miter (전역 .ic 클래스가 스타일 담당).
 * lucide 혼재 제거(디자인 리뷰 P1: 아이콘 3출처 → 1패밀리).
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

const PATHS: Record<string, string> = {
  /* 캡처 모드 4종 + 프롬프트 */
  monitor: '<rect x="3" y="4" width="18" height="13" rx="0"/><path d="M3 8h18M8 21h8M12 17v4"/>',
  element:
    '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><rect x="9" y="9" width="6" height="6" rx="0"/>',
  docText:
    '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M19 8.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6.5L19 8.5Z"/><path d="M9 13h6M9 16.5h4"/>',
  pageFull: '<rect x="6" y="3" width="12" height="18" rx="0"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  sparkles:
    '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M18.5 15.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7.7-1.9Z"/>',

  /* 복사/저장/공유 */
  copy: '<rect x="9" y="9" width="11" height="11" rx="0"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  braces:
    '<path d="M8 4H7a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h1M16 4h1a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-1"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  floppy:
    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  share:
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>',

  /* 조작 */
  trash:
    '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  trashLines:
    '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6"/>',
  x: '<path d="M6 6 18 18M18 6 6 18"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',

  /* 메타/상태 */
  gear:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l1.7-1.3-1.8-3.1-2 .8a7.7 7.7 0 0 0-2.6-1.5l-.3-2.1H7.6l-.3 2.1a7.7 7.7 0 0 0-2.6 1.5l-2-.8L.9 9.2l1.7 1.3a7.8 7.8 0 0 0 0 3L.9 14.8l1.8 3.1 2-.8a7.7 7.7 0 0 0 2.6 1.5l.3 2.1h4.8l.3-2.1a7.7 7.7 0 0 0 2.6-1.5l2 .8 1.8-3.1-1.7-1.3Z"/>',
  pin: '<rect x="6" y="6" width="12" height="12" rx="0" fill="currentColor" stroke="none"/>',
  package:
    '<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 8 9 5 9-5M3 8v8l9 5 9-5V8M12 13v8"/>',
  camera:
    '<rect x="3" y="7" width="18" height="13" rx="0"/><path d="M8 7l1.5-3h5L16 7"/><circle cx="12" cy="13" r="3.4"/>',
  imageOff:
    '<rect x="3" y="5" width="18" height="14" rx="0"/><path d="M3 16l5-5 4 4M14 13l2-2 5 5"/><path d="M4 4l16 16"/>',
  spinner:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>'
}

export type SwissIconName = keyof typeof PATHS

/** .ic 전역 스타일을 따르는 24×24 stroke 아이콘. extraClass로 ic-sm/ic-lg/ic-soft 부착 */
export function swissIcon(name: SwissIconName, extraClass = ''): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', extraClass ? `ic ${extraClass}` : 'ic')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML = PATHS[name]
  return svg
}

/** 잉크 정사각 핀 글리프(숫자 슬롯 포함) — 핀 메모 행/헤드용 */
export function swissPinGlyph(num?: number, size = 18): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 22 22')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('aria-hidden', 'true')
  svg.style.display = 'block'
  svg.style.flexShrink = '0'
  const slot =
    num === undefined
      ? '<rect x="8.6" y="8.6" width="4.8" height="4.8" fill="#FFFFFF"/>'
      : `<text x="11" y="11.6" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="700" fill="#FFFFFF" font-family="'JetBrains Mono',monospace">${num}</text>`
  svg.innerHTML = `<rect x="2.5" y="2.5" width="17" height="17" fill="#15110F" stroke="#15110F" stroke-width="1.4" stroke-linejoin="miter"/>${slot}`
  return svg
}
