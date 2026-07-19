import { describe, it, expect } from 'vitest'
import { listCaptures } from '../src/history'

type Row = {
  id: string
  created_at: string
  url: string
  title: string
  capture_type: string
  pin_count: number
  expires_at: string
  owner: string | null
}

function makeDb(rows: Row[]) {
  let lastSql = ''
  let lastBind: unknown[] = []
  return {
    get lastSql() {
      return lastSql
    },
    get lastBind() {
      return lastBind
    },
    prepare(sql: string) {
      lastSql = sql
      return {
        bind(...args: unknown[]) {
          lastBind = args
          return {
            async all() {
              const nowIso = String(args[0])
              let filtered = rows.filter((r) => r.expires_at > nowIso)
              let limit: number
              if (args.length === 3) {
                const owner = String(args[1])
                limit = Number(args[2])
                filtered = filtered.filter((r) => r.owner === owner)
              } else {
                limit = Number(args[1])
              }
              filtered = filtered
                .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                .slice(0, limit)
              return { results: filtered }
            }
          }
        }
      }
    }
  }
}

describe('listCaptures owner 필터 (T2.3)', () => {
  const now = '2026-07-18T00:00:00.000Z'
  const rows: Row[] = [
    {
      id: 'a1',
      created_at: '2026-07-17T00:00:00.000Z',
      url: 'https://a.com',
      title: 'A',
      capture_type: 'visible',
      pin_count: 0,
      expires_at: '2026-07-24T00:00:00.000Z',
      owner: 'owner-aaa'
    },
    {
      id: 'b1',
      created_at: '2026-07-16T00:00:00.000Z',
      url: 'https://b.com',
      title: 'B',
      capture_type: 'visible',
      pin_count: 1,
      expires_at: '2026-07-24T00:00:00.000Z',
      owner: 'owner-bbb'
    },
    {
      id: 'anon',
      created_at: '2026-07-15T00:00:00.000Z',
      url: 'https://c.com',
      title: 'Anon',
      capture_type: 'visible',
      pin_count: 0,
      expires_at: '2026-07-24T00:00:00.000Z',
      owner: null
    }
  ]

  it('owner 지정 시 WHERE owner = ? 추가 + 해당 행만', async () => {
    const db = makeDb(rows)
    const result = await listCaptures(db as unknown as D1Database, {
      nowIso: now,
      limit: 10,
      owner: 'owner-aaa'
    })
    expect(result.map((r) => r.id)).toEqual(['a1'])
    expect(db.lastSql).toMatch(/owner\s*=\s*\?/i)
    expect(db.lastBind).toEqual([now, 'owner-aaa', 10])
  })

  it('owner 미지정 시 전체(NULL 포함) — admin 시맨틱', async () => {
    const db = makeDb(rows)
    const result = await listCaptures(db as unknown as D1Database, {
      nowIso: now,
      limit: 10
    })
    expect(result.map((r) => r.id)).toEqual(['a1', 'b1', 'anon'])
    expect(db.lastSql).not.toMatch(/owner\s*=/i)
  })
})
