import { describe, it, expect } from 'vitest'
import { DAY_MS, MAX_AGE_MS } from '../src/lib'
import { getSnapPack, SnapPackError } from '../src/pack'

type StoredObj = {
  text?: string
  uploaded: Date
  customMetadata?: Record<string, string>
}

function makeBucket(objects: Map<string, StoredObj>) {
  return {
    async get(key: string) {
      const o = objects.get(key)
      if (!o) return null
      return {
        uploaded: o.uploaded,
        customMetadata: o.customMetadata,
        async text() {
          return o.text ?? ''
        }
      }
    },
    async head(key: string) {
      const o = objects.get(key)
      if (!o) return null
      return { uploaded: o.uploaded, customMetadata: o.customMetadata }
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

  it('만료된 id: SnapPackError (readExpiry·isExpiredAt 재사용)', async () => {
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

  it('메타 1일: uploaded 가 신선해도 T+2d 조회는 EXPIRED', async () => {
    const uploadedAt = Date.now()
    const meta = { expiresAt: new Date(uploadedAt + DAY_MS).toISOString() }
    const bucket = makeBucket(
      new Map([
        [
          'short.json',
          { text: ctxJson, uploaded: new Date(uploadedAt), customMetadata: meta }
        ],
        ['short', { uploaded: new Date(uploadedAt), customMetadata: meta }]
      ])
    )
    await expect(
      getSnapPack(bucket as unknown as R2Bucket, {
        id: 'short',
        origin: 'https://w.test',
        includeImage: false,
        now: uploadedAt + 2 * DAY_MS
      })
    ).rejects.toMatchObject({ name: 'SnapPackError', code: 'EXPIRED' })
  })

  it('메타 30일: uploaded 가 8일 지나도 정상 반환 (이미지·json 양쪽 메타)', async () => {
    const uploadedAt = Date.now()
    const meta = { expiresAt: new Date(uploadedAt + 30 * DAY_MS).toISOString() }
    const bucket = makeBucket(
      new Map([
        [
          'long.json',
          { text: ctxJson, uploaded: new Date(uploadedAt), customMetadata: meta }
        ],
        ['long', { uploaded: new Date(uploadedAt), customMetadata: meta }]
      ])
    )
    const pack = await getSnapPack(bucket as unknown as R2Bucket, {
      id: 'long',
      origin: 'https://w.test',
      includeImage: false,
      now: uploadedAt + 8 * DAY_MS
    })
    expect(pack.sourceTitle).toBe('T')
  })

  it('orphan(JSON만 있고 이미지 없음): NOT_FOUND (MAJOR-3)', async () => {
    const bucket = makeBucket(
      new Map([['orphan.json', { text: ctxJson, uploaded: new Date() }]])
    )
    await expect(
      getSnapPack(bucket as unknown as R2Bucket, {
        id: 'orphan',
        origin: 'https://w.test',
        includeImage: true,
        now: Date.now()
      })
    ).rejects.toMatchObject({
      name: 'SnapPackError',
      code: 'NOT_FOUND'
    })
  })
})
