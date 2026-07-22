/**
 * 0.4.0 owner 마이그레이션·격리 — 실 D1(miniflare)
 */
import { env } from 'cloudflare:workers'
import { describe, it, expect } from 'vitest'
import {
  captureRowFromSharedContext,
  insertCapture
} from '../src/ingest'
import { listCaptures } from '../src/history'
import { MAX_AGE_MS, type SharedContext } from '../src/lib'

type TestEnv = { DB: D1Database }

const ctx: SharedContext = {
  v: 1,
  sourceUrl: 'https://example.com/owner',
  sourceTitle: 'Owner Isolation',
  captureType: 'visible',
  capturedAt: '2026-07-18T00:00:00.000Z',
  viewport: { width: 1280, height: 720 },
  pins: [{ id: 1, memo: 'a' }]
}

describe('D1 owner migration + isolation (0.4.0)', () => {
  it('0002 마이그레이션: owner 컬럼 + idx_captures_owner_created 존재', async () => {
    const db = (env as unknown as TestEnv).DB
    const cols = await db.prepare('PRAGMA table_info(captures)').all<{ name: string }>()
    const names = (cols.results ?? []).map((c) => c.name)
    expect(names).toContain('owner')

    const indexes = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='captures'`)
      .all<{ name: string }>()
    const indexNames = (indexes.results ?? []).map((i) => i.name)
    expect(indexNames).toContain('idx_captures_owner_created')
  })

  it('두 owner 격리: A 업로드가 B history에 안 보임', async () => {
    const db = (env as unknown as TestEnv).DB
    const nowMs = Date.parse('2026-07-18T12:00:00.000Z')
    const nowIso = new Date(nowMs).toISOString()

    const expiresAtIso = new Date(nowMs + MAX_AGE_MS).toISOString()

    await insertCapture(
      db,
      captureRowFromSharedContext({
        id: 'cap-a',
        ctx,
        nowMs,
        expiresAtIso,
        owner: 'owner-a-hex'
      })
    )
    await insertCapture(
      db,
      captureRowFromSharedContext({
        id: 'cap-b',
        ctx: { ...ctx, sourceTitle: 'B' },
        nowMs,
        expiresAtIso,
        owner: 'owner-b-hex'
      })
    )
    await insertCapture(
      db,
      captureRowFromSharedContext({
        id: 'cap-anon',
        ctx: { ...ctx, sourceTitle: 'Anon' },
        nowMs,
        expiresAtIso,
        owner: null
      })
    )

    const forA = await listCaptures(db, {
      nowIso,
      limit: 20,
      owner: 'owner-a-hex'
    })
    expect(forA.map((r) => r.id)).toEqual(['cap-a'])

    const forB = await listCaptures(db, {
      nowIso,
      limit: 20,
      owner: 'owner-b-hex'
    })
    expect(forB.map((r) => r.id)).toEqual(['cap-b'])
  })

  it('admin(owner 미지정) 전체조회: NULL 레거시 포함', async () => {
    const db = (env as unknown as TestEnv).DB
    const nowMs = Date.parse('2026-07-18T14:00:00.000Z')
    const nowIso = new Date(nowMs).toISOString()

    await insertCapture(
      db,
      captureRowFromSharedContext({
        id: 'admin-a',
        ctx,
        nowMs,
        expiresAtIso: new Date(nowMs + MAX_AGE_MS).toISOString(),
        owner: 'owner-x'
      })
    )
    await insertCapture(
      db,
      captureRowFromSharedContext({
        id: 'admin-null',
        ctx: { ...ctx, sourceTitle: 'Null' },
        nowMs: nowMs - 1000,
        expiresAtIso: new Date(nowMs - 1000 + MAX_AGE_MS).toISOString(),
        owner: null
      })
    )

    const all = await listCaptures(db, { nowIso, limit: 50 })
    const ids = all.map((r) => r.id)
    expect(ids).toContain('admin-a')
    expect(ids).toContain('admin-null')
  })
})
