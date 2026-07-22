import { describe, it, expect } from 'vitest'
import { listCaptures, DEFAULT_HISTORY_LIMIT } from '../src/history'

type Row = {
  id: string
  created_at: string
  url: string
  title: string
  capture_type: string
  pin_count: number
  expires_at: string
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
              const limit = Number(args[1])
              const filtered = rows
                // 실 SQL 과 같은 경계(WHERE expires_at >= ?) — 다르면 이 테스트는 거짓 통과다
                .filter((r) => r.expires_at >= nowIso)
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

describe('listCaptures (snap_history)', () => {
  const now = '2026-07-18T00:00:00.000Z'
  const rows: Row[] = [
    {
      id: 'old',
      created_at: '2026-07-10T00:00:00.000Z',
      url: 'https://a.com',
      title: 'Old',
      capture_type: 'visible',
      pin_count: 0,
      expires_at: '2026-07-20T00:00:00.000Z'
    },
    {
      id: 'new',
      created_at: '2026-07-17T00:00:00.000Z',
      url: 'https://b.com',
      title: 'New',
      capture_type: 'element',
      pin_count: 2,
      expires_at: '2026-07-24T00:00:00.000Z'
    },
    {
      id: 'expired',
      created_at: '2026-07-16T00:00:00.000Z',
      url: 'https://c.com',
      title: 'Gone',
      capture_type: 'document',
      pin_count: 1,
      expires_at: '2026-07-17T00:00:00.000Z'
    }
  ]

  it('created_at DESC + expires_at 필터로 반환', async () => {
    const db = makeDb(rows)
    const result = await listCaptures(db as unknown as D1Database, { nowIso: now, limit: 10 })
    expect(result.map((r) => r.id)).toEqual(['new', 'old'])
    expect(result.find((r) => r.id === 'expired')).toBeUndefined()
    expect(db.lastSql).toMatch(/ORDER BY created_at DESC/i)
    // 만료 필터가 SQL 에 실재하는지 + 경계가 R2 isExpiredAt(strict <) 과 같은지.
    // `>` 로 두면 만료 정각에 R2 는 200 인데 D1 만 제외해 두 경로가 갈린다.
    expect(db.lastSql).toMatch(/expires_at\s*>=\s*\?/i)
  })

  it('만료 정각(expires_at === nowIso)은 아직 유효 — R2 경로와 같은 경계', async () => {
    const boundary = '2026-07-20T00:00:00.000Z'
    const db = makeDb(rows)
    const atExact = await listCaptures(db as unknown as D1Database, {
      nowIso: boundary,
      limit: 10
    })
    // 'old' 의 expires_at 이 정확히 boundary — 포함돼야 한다
    expect(atExact.map((r) => r.id)).toContain('old')

    const after1ms = await listCaptures(db as unknown as D1Database, {
      nowIso: '2026-07-20T00:00:00.001Z',
      limit: 10
    })
    expect(after1ms.map((r) => r.id)).not.toContain('old')
  })

  it('limit 기본값은 DEFAULT_HISTORY_LIMIT', async () => {
    const db = makeDb(rows)
    await listCaptures(db as unknown as D1Database, { nowIso: now })
    expect(db.lastBind[1]).toBe(DEFAULT_HISTORY_LIMIT)
  })

  it('출력이 인덱스 엔트리 형태(id, createdAt, url, title, captureType, pinCount)', async () => {
    const db = makeDb(rows)
    const [first] = await listCaptures(db as unknown as D1Database, { nowIso: now, limit: 1 })
    expect(first).toEqual({
      id: 'new',
      createdAt: '2026-07-17T00:00:00.000Z',
      url: 'https://b.com',
      title: 'New',
      captureType: 'element',
      pinCount: 2
    })
  })
})
