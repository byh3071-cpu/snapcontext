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
import { DAY_MS, MAX_AGE_MS, type SharedContext } from '../src/lib'

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
      captureRowFromSharedContext({
        id: 'alive-new',
        ctx,
        nowMs,
        expiresAtIso: new Date(nowMs + MAX_AGE_MS).toISOString(),
        owner: null
      })
    )
    await insertCapture(
      db,
      captureRowFromSharedContext({
        id: 'alive-old',
        ctx: { ...ctx, sourceTitle: 'Older' },
        nowMs: nowMs - 60_000,
        expiresAtIso: new Date(nowMs - 60_000 + MAX_AGE_MS).toISOString(),
        owner: null
      })
    )
    // 이미 만료된 행 — WHERE expires_at > now 에서 제외되어야 함
    await insertCapture(
      db,
      captureRowFromSharedContext({
        id: 'expired',
        ctx,
        nowMs: nowMs - 8 * DAY_MS,
        expiresAtIso: new Date(nowMs - 8 * DAY_MS + MAX_AGE_MS).toISOString(),
        owner: null
      })
    )

    const rows = await listCaptures(db, { nowIso, limit: 10 })
    expect(rows.map((r) => r.id)).toEqual(['alive-new', 'alive-old'])
    expect(rows[0]?.title).toBe('D1 Roundtrip')
    expect(rows[1]?.title).toBe('Older')
    expect(rows.every((r) => r.id !== 'expired')).toBe(true)
  })

  it('1일 보관 행은 T+2d 조회에서 빠지고 30일 행은 남는다 (파라미터화 만료)', async () => {
    const db = (env as unknown as TestEnv).DB
    const nowMs = Date.parse('2026-07-22T09:00:00.000Z')
    const owner = 'expiry-param-owner'

    await insertCapture(
      db,
      captureRowFromSharedContext({
        id: 'one-day',
        ctx: { ...ctx, sourceTitle: 'OneDay' },
        nowMs,
        expiresAtIso: new Date(nowMs + DAY_MS).toISOString(),
        owner
      })
    )
    await insertCapture(
      db,
      captureRowFromSharedContext({
        id: 'thirty-day',
        ctx: { ...ctx, sourceTitle: 'ThirtyDay' },
        nowMs,
        expiresAtIso: new Date(nowMs + 30 * DAY_MS).toISOString(),
        owner
      })
    )

    const atUpload = await listCaptures(db, {
      nowIso: new Date(nowMs).toISOString(),
      limit: 50,
      owner
    })
    expect(atUpload.map((r) => r.id).sort()).toEqual(['one-day', 'thirty-day'])

    const after2Days = await listCaptures(db, {
      nowIso: new Date(nowMs + 2 * DAY_MS).toISOString(),
      limit: 50,
      owner
    })
    expect(after2Days.map((r) => r.id)).toEqual(['thirty-day'])
  })
})
