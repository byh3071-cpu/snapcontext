import type { SerializedRect } from '../types'

function readFileAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('이미지 데이터를 읽지 못했습니다.'))
    reader.readAsDataURL(blob)
  })
}

export async function cropPngDataUrlWithDpr(
  fullDataUrl: string,
  rectCss: SerializedRect,
  devicePixelRatio: number
): Promise<{ dataUrl: string; width: number; height: number }> {
  const res = await fetch(fullDataUrl)
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)

  const sx = Math.round(rectCss.left * devicePixelRatio)
  const sy = Math.round(rectCss.top * devicePixelRatio)
  const sw = Math.round(rectCss.width * devicePixelRatio)
  const sh = Math.round(rectCss.height * devicePixelRatio)

  const clampedSx = Math.max(0, Math.min(sx, Math.max(0, bitmap.width - 1)))
  const clampedSy = Math.max(0, Math.min(sy, Math.max(0, bitmap.height - 1)))
  const maxW = bitmap.width - clampedSx
  const maxH = bitmap.height - clampedSy
  const clampedSw = Math.max(1, Math.min(sw, maxW))
  const clampedSh = Math.max(1, Math.min(sh, maxH))

  const canvas = new OffscreenCanvas(clampedSw, clampedSh)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Canvas 2D 컨텍스트를 가져오지 못했습니다.')
  }

  ctx.drawImage(
    bitmap,
    clampedSx,
    clampedSy,
    clampedSw,
    clampedSh,
    0,
    0,
    clampedSw,
    clampedSh
  )
  bitmap.close()

  const outBlob = await canvas.convertToBlob({ type: 'image/png' })
  const dataUrl = await readFileAsDataUrl(outBlob)
  return { dataUrl, width: clampedSw, height: clampedSh }
}
