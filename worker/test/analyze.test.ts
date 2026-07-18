import { describe, it, expect } from 'vitest'
import { MAX_AGE_MS } from '../src/lib'
import {
  ANALYZE_MODES,
  DEFAULT_ANALYZE_MODE,
  assertAnalyzeMode,
  buildAnalyzeDigest,
  snapAnalyze,
  SnapAnalyzeError
} from '../src/analyze'
import { SnapPackError } from '../src/pack'
import type { SharedContext } from '../src/lib'

type StoredObj = { text?: string; uploaded: Date }

function makeBucket(objects: Map<string, StoredObj>) {
  return {
    async get(key: string) {
      const o = objects.get(key)
      if (!o) return null
      return {
        uploaded: o.uploaded,
        async text() {
          return o.text ?? ''
        }
      }
    },
    async head(key: string) {
      const o = objects.get(key)
      if (!o) return null
      return { uploaded: o.uploaded }
    }
  }
}

const ctx: SharedContext = {
  v: 1,
  sourceUrl: 'https://a.com/page',
  sourceTitle: 'Page Title',
  captureType: 'visible',
  capturedAt: '2026-07-10T00:00:00.000Z',
  viewport: { width: 1280, height: 720 },
  pins: [
    { id: 1, memo: '버튼 깨짐' },
    { id: 2, memo: '' }
  ]
}

const ctxJson = JSON.stringify(ctx)

describe('assertAnalyzeMode (allowlist)', () => {
  it('미지정 → 기본 bug-report', () => {
    expect(assertAnalyzeMode(undefined)).toBe(DEFAULT_ANALYZE_MODE)
    expect(DEFAULT_ANALYZE_MODE).toBe('bug-report')
  })

  it('allowlist 3종 통과', () => {
    for (const mode of ANALYZE_MODES) {
      expect(assertAnalyzeMode(mode)).toBe(mode)
    }
  })

  it('allowlist 위반 → SnapAnalyzeError INVALID_MODE (명시적)', () => {
    expect(() => assertAnalyzeMode('summary')).toThrow(SnapAnalyzeError)
    try {
      assertAnalyzeMode('hack')
    } catch (err) {
      expect(err).toBeInstanceOf(SnapAnalyzeError)
      expect((err as SnapAnalyzeError).code).toBe('INVALID_MODE')
      expect((err as Error).message).toMatch(/allowlist|allowed|mode/i)
    }
  })
})

describe('buildAnalyzeDigest (3 mode 출력 구조)', () => {
  const pack = { ...ctx, id: 'cap-1', imageUrl: 'https://w.test/i/cap-1' }

  it('bug-report: ①메타 ②핀 ③분석지시 ④이미지URL', () => {
    const md = buildAnalyzeDigest(pack, 'bug-report')
    expect(md).toContain('Page Title')
    expect(md).toContain('https://a.com/page')
    expect(md).toContain('visible')
    expect(md).toContain('1280')
    expect(md).toContain('720')
    expect(md).toContain('버튼 깨짐')
    expect(md).toMatch(/원인 추정|버그/)
    expect(md).toContain('https://w.test/i/cap-1')
  })

  it('refactor: 모드별 분석 지시 포함', () => {
    const md = buildAnalyzeDigest(pack, 'refactor')
    expect(md).toContain('Page Title')
    expect(md).toMatch(/리팩토링|개선/)
    expect(md).toContain('https://w.test/i/cap-1')
  })

  it('reference: 모드별 분석 지시 포함', () => {
    const md = buildAnalyzeDigest(pack, 'reference')
    expect(md).toContain('Page Title')
    expect(md).toMatch(/레퍼런스|디자인 패턴/)
    expect(md).toContain('https://w.test/i/cap-1')
  })
})

describe('snapAnalyze (만료/없음 — snap_pack 헬퍼 재사용)', () => {
  it('유효 id + 기본 mode → 마크다운 다이제스트', async () => {
    const bucket = makeBucket(
      new Map([
        ['ok.json', { text: ctxJson, uploaded: new Date() }],
        ['ok', { uploaded: new Date() }]
      ])
    )
    const md = await snapAnalyze(bucket as unknown as R2Bucket, {
      id: 'ok',
      origin: 'https://w.test',
      now: Date.now()
    })
    expect(md).toContain('Page Title')
    expect(md).toContain('https://w.test/i/ok')
    expect(md).toMatch(/원인 추정|버그/)
  })

  it('없는 id → SnapPackError', async () => {
    const bucket = makeBucket(new Map())
    await expect(
      snapAnalyze(bucket as unknown as R2Bucket, {
        id: 'missing',
        origin: 'https://w.test',
        now: Date.now()
      })
    ).rejects.toBeInstanceOf(SnapPackError)
  })

  it('만료 id → SnapPackError EXPIRED', async () => {
    const stale = new Date(Date.now() - MAX_AGE_MS - 1000)
    const bucket = makeBucket(
      new Map([
        ['old.json', { text: ctxJson, uploaded: stale }],
        ['old', { uploaded: stale }]
      ])
    )
    await expect(
      snapAnalyze(bucket as unknown as R2Bucket, {
        id: 'old',
        origin: 'https://w.test',
        now: Date.now()
      })
    ).rejects.toMatchObject({ name: 'SnapPackError', code: 'EXPIRED' })
  })

  it('orphan(이미지 없음) → SnapPackError NOT_FOUND', async () => {
    const bucket = makeBucket(
      new Map([['orphan.json', { text: ctxJson, uploaded: new Date() }]])
    )
    await expect(
      snapAnalyze(bucket as unknown as R2Bucket, {
        id: 'orphan',
        origin: 'https://w.test',
        now: Date.now()
      })
    ).rejects.toMatchObject({ name: 'SnapPackError', code: 'NOT_FOUND' })
  })

  it('allowlist 위반 mode → SnapAnalyzeError (팩 조회 전)', async () => {
    const bucket = makeBucket(new Map())
    await expect(
      snapAnalyze(bucket as unknown as R2Bucket, {
        id: 'any',
        origin: 'https://w.test',
        now: Date.now(),
        mode: 'invalid-mode'
      })
    ).rejects.toMatchObject({ name: 'SnapAnalyzeError', code: 'INVALID_MODE' })
  })
})
