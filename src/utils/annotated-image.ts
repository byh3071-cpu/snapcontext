import type { PinItem } from '../types'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'))
    img.src = url
  })
}

export async function renderAnnotatedPngBlob(
  imageDataUrl: string,
  pins: PinItem[]
): Promise<Blob> {
  const img = await loadImage(imageDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D 컨텍스트를 사용할 수 없습니다.')
  }

  ctx.drawImage(img, 0, 0)

  for (const pin of pins) {
    const px = (pin.x / 100) * canvas.width
    const py = (pin.y / 100) * canvas.height
    const r = 12
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowBlur = 6
    ctx.fillStyle = '#e94560'
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(pin.id), px, py)
    ctx.restore()
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('PNG 데이터를 만들지 못했습니다.'))
      else resolve(blob)
    }, 'image/png')
  })
}

export async function downloadAnnotatedPng(
  imageDataUrl: string,
  pins: PinItem[],
  filename: string
): Promise<void> {
  const blob = await renderAnnotatedPngBlob(imageDataUrl, pins)
  const url = URL.createObjectURL(blob)
  try {
    await chrome.downloads.download({ url, filename, saveAs: false })
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return
  } catch {
    /* fallback below */
  }

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function copyAnnotatedPngToClipboard(
  imageDataUrl: string,
  pins: PinItem[]
): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('이 브라우저에서는 이미지 복사를 지원하지 않습니다.')
  }
  const blob = await renderAnnotatedPngBlob(imageDataUrl, pins)
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob })
  ])
}
