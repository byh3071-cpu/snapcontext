import { describe, it, expect } from 'vitest'
import {
  isContextJsonKey,
  captureIdFromKey,
  rowFromSharedContext,
  collectBackfillRows,
  parseCfEnvelope,
  listAllR2ObjectsFromPages,
  expiresAtFromLastModified,
  insertRowsWithCheckpoint,
  MAX_AGE_MS
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
    const objects = [
      { key: 'a.json', last_modified: '2026-07-01T00:00:00.000Z' },
      { key: 'a', last_modified: '2026-07-01T00:00:00.000Z' },
      { key: 'b.json', last_modified: '2026-07-02T00:00:00.000Z' },
      { key: 'skip/me.json', last_modified: '2026-07-03T00:00:00.000Z' }
    ]
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
      listObjects: async () => objects,
      getJson: async (id: string) => jsonById[id] ?? null
    })
    expect(rows.map((r) => r.id).sort()).toEqual(['a', 'b'])
    expect(rows.find((r) => r.id === 'b')?.pin_count).toBe(1)
  })
})

describe('BLOCKER-1 — R2 list pagination (result_info)', () => {
  it('parseCfEnvelope 가 result 와 result_info 를 함께 보존', () => {
    const env = parseCfEnvelope({
      success: true,
      result: [{ key: 'a.json' }],
      result_info: { is_truncated: true, cursor: 'next' }
    })
    expect(env.result).toEqual([{ key: 'a.json' }])
    expect(env.result_info).toEqual({ is_truncated: true, cursor: 'next' })
  })

  it('2페이지(1000+1) API 응답을 모두 열거', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      key: `k${i}.json`,
      last_modified: '2026-07-10T00:00:00.000Z'
    }))
    const page2 = [{ key: 'k1000.json', last_modified: '2026-07-11T00:00:00.000Z' }]
    let calls = 0
    const objects = await listAllR2ObjectsFromPages(async (cursor) => {
      calls += 1
      if (!cursor) {
        return {
          result: page1,
          result_info: { is_truncated: true, cursor: 'page2' }
        }
      }
      expect(cursor).toBe('page2')
      return {
        result: page2,
        result_info: { is_truncated: false }
      }
    })
    expect(calls).toBe(2)
    expect(objects).toHaveLength(1001)
    expect(objects[1000]?.key).toBe('k1000.json')
  })
})

describe('MAJOR-2 — expires_at = last_modified + 7d (client clock 무시)', () => {
  it('과거 capturedAt 이어도 last_modified 기준 만료', async () => {
    const uploaded = '2026-07-17T00:00:00.000Z'
    const rows = await collectBackfillRows({
      listObjects: async () => [
        { key: 'x.json', last_modified: uploaded }
      ],
      getJson: async () => ({
        sourceUrl: 'https://a.com',
        sourceTitle: 'X',
        captureType: 'visible',
        // client clock 과거 — expires_at 에 쓰면 안 됨
        capturedAt: '2026-01-01T00:00:00.000Z',
        pins: []
      })
    })
    expect(rows[0]?.expires_at).toBe(
      new Date(Date.parse(uploaded) + MAX_AGE_MS).toISOString()
    )
    expect(rows[0]?.expires_at).not.toBe('2026-01-08T00:00:00.000Z')
    expect(rows[0]?.created_at).toBe('2026-01-01T00:00:00.000Z')
  })

  it('미래 capturedAt 이어도 last_modified 기준 만료', () => {
    const uploaded = '2026-07-17T00:00:00.000Z'
    const expires = expiresAtFromLastModified(uploaded)
    expect(expires).toBe(new Date(Date.parse(uploaded) + MAX_AGE_MS).toISOString())
    // 미래 client clock 으로 계산한 값과 달라야 함
    const badFuture = new Date(Date.parse('2030-01-01T00:00:00.000Z') + MAX_AGE_MS).toISOString()
    expect(expires).not.toBe(badFuture)
  })
})

describe('MINOR-1 — insert 실패 checkpoint', () => {
  it('N번째 실패 시 inserted·failedId·재실행 안내', async () => {
    const rows = [
      { id: 'a', created_at: '1', url: '', title: '', capture_type: '', pin_count: 0, expires_at: '1' },
      { id: 'b', created_at: '2', url: '', title: '', capture_type: '', pin_count: 0, expires_at: '2' },
      { id: 'c', created_at: '3', url: '', title: '', capture_type: '', pin_count: 0, expires_at: '3' }
    ]
    await expect(
      insertRowsWithCheckpoint(rows, async (row) => {
        if (row.id === 'b') throw new Error('D1 boom')
      })
    ).rejects.toMatchObject({
      inserted: 1,
      failedId: 'b',
      scanned: 3,
      message: expect.stringContaining('Re-run: node scripts/backfill-d1.mjs')
    })
  })
})
