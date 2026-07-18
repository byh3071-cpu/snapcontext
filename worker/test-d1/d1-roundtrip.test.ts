/**
 * 실 D1(miniflare) 왕복 — INSERT → SELECT WHERE expires_at > ? ORDER BY created_at DESC
 * mock이 필터/정렬을 재구현하던 Phase 2 공백(MINOR-4c) 보강.
 */
import { env } from 'cloudflare:workers'
import { describe, it, expect } from 'vitest'
import {
  captureRowFromSharedContext,
  insertCapture
} from '../src/ingest'
import { listCaptures } from '../src/history'
import type { SharedContext } from '../src/lib'

type TestEnv = { DB: D1Database }

const ctx: SharedContext = {
  v: 1,
  sourceUrl: 'https://example.com/d1-roundtrip',
  sourceTitle: 'D1 Roundtrip',
  captureType: 'visible',
  capturedAt: '2026-07-18T00:00:00.000Z',
  viewport: { width: 1280, height: 720 },
  pins: [{ id: 1, memo: 'a' }]
}

describe('D1 roundtrip (vitest-pool-workers)', () => {
  it('insertCapture → listCaptures: expires_at 필터 + created_at DESC 실 SQL', async () => {
    const db = (env as unknown as TestEnv).DB
    const nowMs = Date.parse('2026-07-18T12:00:00.000Z')
    const nowIso = new Date(nowMs).toISOString()

    await insertCapture(
      db,
      captureRowFromSharedContext('alive-new', ctx, nowMs)
    )
    await insertCapture(
      db,
      captureRowFromSharedContext(
        'alive-old',
        { ...ctx, sourceTitle: 'Older' },
        nowMs - 60_000
      )
    )
    // 이미 만료된 행 — WHERE expires_at > now 에서 제외되어야 함
    await insertCapture(
      db,
      captureRowFromSharedContext('expired', ctx, nowMs - 8 * 24 * 60 * 60 * 1000)
    )

    const rows = await listCaptures(db, { nowIso, limit: 10 })
    expect(rows.map((r) => r.id)).toEqual(['alive-new', 'alive-old'])
    expect(rows[0]?.title).toBe('D1 Roundtrip')
    expect(rows[1]?.title).toBe('Older')
    expect(rows.every((r) => r.id !== 'expired')).toBe(true)
  })
})
