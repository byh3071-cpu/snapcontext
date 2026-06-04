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
