import { describe, it, expect } from 'vitest'
import { MAX_AGE_MS } from '../src/lib'
import { getSnapPack, SnapPackError } from '../src/pack'

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

const ctxJson = JSON.stringify({
  v: 1,
  sourceUrl: 'https://a.com',
  sourceTitle: 'T',
  captureType: 'visible',
  capturedAt: '2026-07-10T00:00:00.000Z',
  viewport: { width: 1, height: 2 },
  pins: [{ id: 1, memo: 'm' }]
})

describe('getSnapPack (snap_pack)', () => {
  it('유효 id: SharedContext JSON 반환', async () => {
    const bucket = makeBucket(
      new Map([
        ['id1.json', { text: ctxJson, uploaded: new Date() }],
        ['id1', { uploaded: new Date() }]
      ])
    )
    const pack = await getSnapPack(bucket as unknown as R2Bucket, {
      id: 'id1',
      origin: 'https://w.test',
      includeImage: false,
      now: Date.now()
    })
    expect(pack.sourceTitle).toBe('T')
    expect(pack.id).toBe('id1')
    expect(pack.imageUrl).toBeUndefined()
  })

  it('includeImage=true 이면 /i/{id} URL 참조 (base64 아님)', async () => {
    const bucket = makeBucket(
      new Map([
        ['id1.json', { text: ctxJson, uploaded: new Date() }],
        ['id1', { uploaded: new Date() }]
      ])
    )
    const pack = await getSnapPack(bucket as unknown as R2Bucket, {
      id: 'id1',
      origin: 'https://w.test',
      includeImage: true,
      now: Date.now()
    })
    expect(pack.imageUrl).toBe('https://w.test/i/id1')
    expect(JSON.stringify(pack)).not.toMatch(/data:image/)
    expect(JSON.stringify(pack)).not.toMatch(/base64/i)
  })

  it('없는 id: SnapPackError (조용한 빈 반환 금지)', async () => {
    const bucket = makeBucket(new Map())
    await expect(
      getSnapPack(bucket as unknown as R2Bucket, {
        id: 'missing',
        origin: 'https://w.test',
        includeImage: false,
        now: Date.now()
      })
    ).rejects.toBeInstanceOf(SnapPackError)
  })

  it('만료된 id: SnapPackError (isExpired 재사용)', async () => {
    const stale = new Date(Date.now() - MAX_AGE_MS - 1000)
    const bucket = makeBucket(
      new Map([
        ['old.json', { text: ctxJson, uploaded: stale }],
        ['old', { uploaded: stale }]
      ])
    )
    await expect(
      getSnapPack(bucket as unknown as R2Bucket, {
        id: 'old',
        origin: 'https://w.test',
        includeImage: false,
        now: Date.now()
      })
    ).rejects.toBeInstanceOf(SnapPackError)
  })
})
