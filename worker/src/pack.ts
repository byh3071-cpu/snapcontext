import {
  isExpiredAt,
  readExpiry,
  parseSharedContext,
  type SharedContext
} from './lib'

export class SnapPackError extends Error {
  readonly code: 'NOT_FOUND' | 'EXPIRED' | 'INVALID'

  constructor(code: 'NOT_FOUND' | 'EXPIRED' | 'INVALID', message: string) {
    super(message)
    this.name = 'SnapPackError'
    this.code = code
  }
}

export interface SnapPackResult extends SharedContext {
  id: string
  imageUrl?: string
}

export interface GetSnapPackOptions {
  id: string
  origin: string
  includeImage: boolean
  now: number
}

/** snap_pack: 이미지 head() 실재 확인 후 {id}.json 조회. orphan/만료는 명시적 에러 */
export async function getSnapPack(
  bucket: R2Bucket,
  opts: GetSnapPackOptions
): Promise<SnapPackResult> {
  const { id, origin, includeImage, now } = opts

  let imageHead: R2Object | null
  try {
    imageHead = await bucket.head(id)
  } catch (err) {
    throw new SnapPackError(
      'NOT_FOUND',
      `Failed to head image ${id}: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  if (!imageHead) {
    throw new SnapPackError('NOT_FOUND', `Capture image not found: ${id}`)
  }
  if (isExpiredAt(readExpiry(imageHead).expiresAtMs, now)) {
    throw new SnapPackError('EXPIRED', `Capture expired: ${id}`)
  }

  let obj: R2ObjectBody | null
  try {
    obj = await bucket.get(`${id}.json`)
  } catch (err) {
    throw new SnapPackError(
      'NOT_FOUND',
      `Failed to read pack ${id}: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  if (!obj) {
    throw new SnapPackError('NOT_FOUND', `Capture context not found: ${id}`)
  }

  if (isExpiredAt(readExpiry(obj).expiresAtMs, now)) {
    throw new SnapPackError('EXPIRED', `Capture context expired: ${id}`)
  }

  const raw = await obj.text()
  const ctx = parseSharedContext(raw)
  if (!ctx) {
    throw new SnapPackError('INVALID', `Invalid SharedContext JSON for: ${id}`)
  }

  const result: SnapPackResult = { ...ctx, id }
  if (includeImage) {
    result.imageUrl = `${origin}/i/${encodeURIComponent(id)}`
  }
  return result
}
