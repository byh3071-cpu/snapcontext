import { describe, it, expect } from 'vitest'
import {
  isContextJsonKey,
  captureIdFromKey,
  rowFromSharedContext,
  collectBackfillRows
} from '../../scripts/lib/backfill-d1.mjs'

describe('backfill-d1 helpers', () => {
  it('isContextJsonKey: {id}.json 만 true', () => {
    expect(isContextJsonKey('abc-uuid.json')).toBe(true)
    expect(isContextJsonKey('abc-uuid')).toBe(false)
    expect(isContextJsonKey('folder/x.json')).toBe(false)
    expect(isContextJsonKey('.json')).toBe(false)
  })

  it('captureIdFromKey: .json 접미사 제거', () => {
    expect(captureIdFromKey('abc-uuid.json')).toBe('abc-uuid')
  })

  it('rowFromSharedContext: SharedContext → captures 행', () => {
    const row = rowFromSharedContext(
      'id1',
      {
        sourceUrl: 'https://a.com',
        sourceTitle: 'Title',
        captureType: 'visible',
        capturedAt: '2026-07-10T12:00:00.000Z',
        pins: [{ id: 1, memo: 'x' }, { id: 2, memo: 'y' }]
      },
      '2026-07-17T12:00:00.000Z'
    )
    expect(row).toEqual({
      id: 'id1',
      created_at: '2026-07-10T12:00:00.000Z',
      url: 'https://a.com',
      title: 'Title',
      capture_type: 'visible',
      pin_count: 2,
      expires_at: '2026-07-17T12:00:00.000Z'
    })
  })

  it('collectBackfillRows: R2 list 키에서 {id}.json 만 적재', async () => {
    const keys = ['a.json', 'a', 'b.json', 'skip/me.json']
    const jsonById: Record<string, unknown> = {
      a: {
        sourceUrl: 'https://a.com',
        sourceTitle: 'A',
        captureType: 'visible',
        capturedAt: '2026-07-01T00:00:00.000Z',
        pins: []
      },
      b: {
        sourceUrl: 'https://b.com',
        sourceTitle: 'B',
        captureType: 'element',
        capturedAt: '2026-07-02T00:00:00.000Z',
        pins: [{ id: 1, memo: 'm' }]
      }
    }
    const rows = await collectBackfillRows({
      listKeys: async () => keys,
      getJson: async (id: string) => jsonById[id] ?? null,
      expiresAtFrom: () => '2026-07-08T00:00:00.000Z'
    })
    expect(rows.map((r) => r.id).sort()).toEqual(['a', 'b'])
    expect(rows.find((r) => r.id === 'b')?.pin_count).toBe(1)
  })
})
