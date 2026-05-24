import type { CaptureType, ContextPack } from '../types'

export const CAPTURE_HISTORY_STORAGE_KEY = 'captureHistory'
export const MAX_CAPTURE_HISTORY_ITEMS = 20
export const MAX_STORED_IMAGE_DATA_BYTES = 900_000
export const MAX_CAPTURE_HISTORY_STORAGE_BYTES = 4_000_000
export const THUMBNAIL_WIDTH = 200

export type CaptureHistoryItem = {
  id: string
  timestamp: string
  url: string
  title: string
  captureType: CaptureType
  thumbnail: string
  imageBase64?: string
  pinsCount: number
  contextPack?: ContextPack
}

export type SaveCaptureInput = Omit<CaptureHistoryItem, 'thumbnail'> & {
  thumbnail?: string
  imageBase64?: string
}

export type UpdateCaptureAnnotationsInput = {
  pinsCount: number
  contextPack: ContextPack
}

type ChromeStorageShape = {
  storage?: {
    local?: {
      get: (key: string) => Promise<Record<string, unknown>>
      set: (items: Record<string, unknown>) => Promise<void>
      remove: (key: string) => Promise<void>
    }
  }
}

function hasChromeStorage(): boolean {
  const runtimeChrome = (globalThis as typeof globalThis & { chrome?: ChromeStorageShape })
    .chrome
  return Boolean(runtimeChrome?.storage?.local)
}

async function readItems(): Promise<CaptureHistoryItem[]> {
  if (!hasChromeStorage()) return []
  const result = await chrome.storage.local.get(CAPTURE_HISTORY_STORAGE_KEY)
  const value = result[CAPTURE_HISTORY_STORAGE_KEY]
  return Array.isArray(value) ? (value as CaptureHistoryItem[]) : []
}

async function writeItems(items: CaptureHistoryItem[]): Promise<void> {
  if (!hasChromeStorage()) return
  await chrome.storage.local.set({ [CAPTURE_HISTORY_STORAGE_KEY]: items })
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('snapcontext:history-updated'))
  }
}

function byNewestFirst(a: CaptureHistoryItem, b: CaptureHistoryItem): number {
  return Date.parse(b.timestamp) - Date.parse(a.timestamp)
}

function utf8ByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

function enforceStorageBudget(
  items: CaptureHistoryItem[]
): CaptureHistoryItem[] {
  let next = items.slice(0, MAX_CAPTURE_HISTORY_ITEMS)

  while (
    utf8ByteLength({ [CAPTURE_HISTORY_STORAGE_KEY]: next }) >
    MAX_CAPTURE_HISTORY_STORAGE_BYTES
  ) {
    const imageIndex = next
      .map((item, index) => ({ item, index }))
      .reverse()
      .find(({ item }) => Boolean(item.imageBase64))?.index

    if (imageIndex !== undefined) {
      next = next.map((item, index) =>
        index === imageIndex ? { ...item, imageBase64: undefined } : item
      )
      continue
    }

    if (next.length <= 1) break
    next = next.slice(0, -1)
  }

  return next
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load capture thumbnail'))
    image.src = dataUrl
  })
}

async function resizeThumbnail(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return ''

  const image = await loadImage(dataUrl)
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (!sourceWidth || !sourceHeight) return ''

  const width = Math.min(THUMBNAIL_WIDTH, sourceWidth)
  const height = Math.max(1, Math.round((sourceHeight / sourceWidth) * width))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.72)
}

export async function saveCapture(input: SaveCaptureInput): Promise<void> {
  if (!hasChromeStorage()) return

  const thumbnail =
    input.thumbnail ?? (input.imageBase64 ? await resizeThumbnail(input.imageBase64) : '')
  const imageBase64 =
    input.imageBase64 &&
    utf8ByteLength(input.imageBase64) <= MAX_STORED_IMAGE_DATA_BYTES
      ? input.imageBase64
      : undefined

  const item: CaptureHistoryItem = {
    id: input.id,
    timestamp: input.timestamp,
    url: input.url,
    title: input.title,
    captureType: input.captureType,
    thumbnail,
    imageBase64,
    pinsCount: input.pinsCount,
    contextPack: input.contextPack
  }

  const existing = await readItems()
  const next = enforceStorageBudget(
    [item, ...existing.filter((entry) => entry.id !== item.id)].sort(
      byNewestFirst
    )
  )

  await writeItems(next)
}

export async function updateCaptureAnnotations(
  id: string,
  input: UpdateCaptureAnnotationsInput
): Promise<void> {
  if (!hasChromeStorage()) return

  const existing = await readItems()
  const next = enforceStorageBudget(
    existing
      .map((item) =>
        item.id === id
          ? {
              ...item,
              pinsCount: input.pinsCount,
              contextPack: input.contextPack
            }
          : item
      )
      .sort(byNewestFirst)
  )

  await writeItems(next)
}

export async function getHistory(): Promise<CaptureHistoryItem[]> {
  return (await readItems()).sort(byNewestFirst)
}

export async function deleteCapture(id: string): Promise<void> {
  const next = (await readItems()).filter((item) => item.id !== id)
  await writeItems(next)
}

export async function clearHistory(): Promise<void> {
  if (!hasChromeStorage()) return
  await chrome.storage.local.remove(CAPTURE_HISTORY_STORAGE_KEY)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('snapcontext:history-updated'))
  }
}
