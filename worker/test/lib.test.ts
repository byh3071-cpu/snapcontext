import { describe, it, expect, vi } from 'vitest'
import {
  escapeHtml,
  sanitizeHttpUrl,
  isPngMagic,
  readExpiry,
  isExpiredAt,
  formatExpiryKST,
  buildViewerHtml,
  parseSharedContext,
  safeDecodeId,
  DAY_MS,
  DEFAULT_EXPIRY_DAYS,
  MAX_AGE_MS,
  PNG_MAGIC,
  type ExpiryInfo,
  type SharedContext
} from '../src/lib'

const T = Date.parse('2026-07-18T00:00:00.000Z')

/** 레거시(메타 없음) 객체와 동일한 만료 정보 — buildViewerHtml 기존 케이스용 */
const EXPIRY_LEGACY: ExpiryInfo = {
  expiresAtMs: T + MAX_AGE_MS,
  retentionDays: DEFAULT_EXPIRY_DAYS,
  source: 'legacy'
}

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

describe('readExpiry', () => {
  it('메타 없음(레거시): uploaded + 7일 · source=legacy', () => {
    const info = readExpiry({ uploaded: new Date(T) })
    expect(info.expiresAtMs).toBe(T + MAX_AGE_MS)
    expect(info.retentionDays).toBe(DEFAULT_EXPIRY_DAYS)
    expect(info.source).toBe('legacy')
  })

  it('메타 1일: 짧은 쪽이 이긴다 — T+2d 에 만료(레거시였다면 미만료)', () => {
    const info = readExpiry({
      uploaded: new Date(T),
      customMetadata: { expiresAt: new Date(T + DAY_MS).toISOString() }
    })
    expect(info.source).toBe('metadata')
    expect(info.retentionDays).toBe(1)
    expect(isExpiredAt(info.expiresAtMs, T + 2 * DAY_MS)).toBe(true)
    // 대조군: 같은 uploaded 라도 메타가 없으면 아직 살아 있다 → 메타를 실제로 읽었다는 증거
    const legacy = readExpiry({ uploaded: new Date(T) })
    expect(isExpiredAt(legacy.expiresAtMs, T + 2 * DAY_MS)).toBe(false)
  })

  it('메타 30일: 긴 쪽이 이긴다 — T+8d 에 미만료(레거시였다면 만료)', () => {
    const info = readExpiry({
      uploaded: new Date(T),
      customMetadata: { expiresAt: new Date(T + 30 * DAY_MS).toISOString() }
    })
    expect(info.source).toBe('metadata')
    expect(info.retentionDays).toBe(30)
    expect(isExpiredAt(info.expiresAtMs, T + 8 * DAY_MS)).toBe(false)
    const legacy = readExpiry({ uploaded: new Date(T) })
    expect(isExpiredAt(legacy.expiresAtMs, T + 8 * DAY_MS)).toBe(true)
  })

  it('파싱 실패: source=invalid + 즉시 만료 (조용히 7일로 되돌리지 않는다)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const info = readExpiry({
      uploaded: new Date(T),
      customMetadata: { expiresAt: 'not-a-date' }
    })
    expect(info.source).toBe('invalid')
    expect(info.retentionDays).toBe(0)
    expect(info.expiresAtMs).toBe(T)
    expect(isExpiredAt(info.expiresAtMs, T + 1000)).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('isExpiredAt (경계)', () => {
  it('(T, T) = false — 만료시각 정각은 아직 유효', () => {
    expect(isExpiredAt(T, T)).toBe(false)
  })
  it('(T, T+1) = true', () => {
    expect(isExpiredAt(T, T + 1)).toBe(true)
  })
})

describe('formatExpiryKST', () => {
  const kst = (ms: number) =>
    new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ms))

  it('returns non-empty string', () => {
    const s = formatExpiryKST(1_700_000_000_000)
    expect(typeof s).toBe('string')
    expect(s.length).toBeGreaterThan(0)
  })

  it('받은 epoch ms 를 그대로 포맷한다 (내부에서 7일을 더하지 않는다)', () => {
    expect(formatExpiryKST(T)).toBe(kst(T))
    expect(formatExpiryKST(T)).not.toBe(formatExpiryKST(T + MAX_AGE_MS))
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
    const html = buildViewerHtml('id1', ctx, EXPIRY_LEGACY)
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;script&gt;x')
  })
  it('references /i/{id}', () => {
    expect(buildViewerHtml('id1', ctx, EXPIRY_LEGACY)).toContain('/i/id1')
  })
  it('does not linkify javascript: url', () => {
    const bad = { ...ctx, sourceUrl: 'javascript:alert(1)' }
    const html = buildViewerHtml('id2', bad, EXPIRY_LEGACY)
    expect(html).not.toContain('href="javascript:')
  })
  it('renders image-only when ctx is null', () => {
    const html = buildViewerHtml('id3', null, EXPIRY_LEGACY)
    expect(html).toContain('/i/id3')
    expect(html).not.toContain('<dl>')
  })
  it('notice 는 ExpiryInfo 로 만든다 — 일수·라벨이 같은 값에서 나온다', () => {
    const html = buildViewerHtml('id4', null, EXPIRY_LEGACY)
    expect(html).toContain(
      `익명 공유 · 업로드 후 7일 자동 삭제 (만료 예정: ${formatExpiryKST(EXPIRY_LEGACY.expiresAtMs)})`
    )
  })
  it('retentionDays 가 바뀌면 문구 일수도 따라 바뀐다 (하드코딩 7일 아님)', () => {
    const expiry1: ExpiryInfo = {
      expiresAtMs: T + DAY_MS,
      retentionDays: 1,
      source: 'metadata'
    }
    const html = buildViewerHtml('id5', null, expiry1)
    expect(html).toContain('업로드 후 1일 자동 삭제')
    expect(html).not.toContain('업로드 후 7일 자동 삭제')
    expect(html).toContain(formatExpiryKST(T + DAY_MS))
  })
})

describe('hardening (regression)', () => {
  it('escapeHtml processes & first (no double-escape)', () => {
    expect(escapeHtml('a&lt;b')).toBe('a&amp;lt;b')
  })
  it('sanitizeHttpUrl rejects uppercase/whitespace javascript scheme', () => {
    expect(sanitizeHttpUrl(' JavaScript:alert(1)')).toBeNull()
    expect(sanitizeHttpUrl('java\tscript:alert(1)')).toBeNull()
  })
  it('parseSharedContext rejects JSON arrays', () => {
    expect(parseSharedContext('[1,2,3]')).toBeNull()
  })
  it('safeDecodeId decodes valid and returns raw on malformed', () => {
    expect(safeDecodeId('%41bc')).toBe('Abc')
    expect(safeDecodeId('%')).toBe('%')
    expect(safeDecodeId('abc-123')).toBe('abc-123')
  })
  it('buildViewerHtml escapes quotes in source url (no attribute breakout)', () => {
    const ctx: SharedContext = {
      v: 1,
      sourceUrl: 'http://a.com/"><script>alert(1)</script>',
      sourceTitle: 't',
      captureType: 'visible',
      capturedAt: '2026',
      viewport: { width: 1, height: 2 },
      pins: []
    }
    const html = buildViewerHtml('idq', ctx, EXPIRY_LEGACY)
    expect(html).not.toContain('"><script>alert(1)')
  })
})
