import type { PinItem } from '../../types'
import { swissIcon } from '../utils/swiss-icons'

const PIN_CLASS = 'pin-badge'
/** Drag threshold in px – clicks shorter than this are treated as pin actions. */
const DRAG_THRESHOLD = 5

export type ImageLightboxApi = {
  open: (dataUrl: string, label?: string) => void
  close: () => void
  isOpen: () => boolean
  refreshPins: () => void
}

export type ImageLightboxPinHandlers = {
  canPin: () => boolean
  getPins: () => PinItem[]
  getActivePinId: () => number | null
  onAddPin: (x: number, y: number) => void
  onDeletePin: (pinId: number) => void
  onSelectPin: (pinId: number) => void
}

export function mountImageLightbox(
  host: HTMLElement,
  pinHandlers?: ImageLightboxPinHandlers
): ImageLightboxApi {
  const overlay = document.createElement('div')
  overlay.className = 'image-lightbox'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', '원본 이미지 확대')
  overlay.hidden = true

  const backdrop = document.createElement('div')
  backdrop.className = 'image-lightbox__backdrop'

  const stage = document.createElement('div')
  stage.className = 'image-lightbox__stage'

  const viewport = document.createElement('div')
  viewport.className = 'image-lightbox__viewport'

  const pinContainer = document.createElement('div')
  pinContainer.className = 'image-lightbox__pin-container'

  const img = document.createElement('img')
  img.className = 'image-lightbox__img'
  img.alt = '원본 캡처 이미지'

  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'image-lightbox__close'
  closeBtn.setAttribute('aria-label', '닫기')
  closeBtn.appendChild(swissIcon('x'))

  pinContainer.appendChild(img)
  viewport.appendChild(pinContainer)
  stage.append(viewport, closeBtn)
  overlay.append(backdrop, stage)
  host.append(overlay)

  let isOpenState = false
  // scale = 1 means "fit to viewport". scale = N means N × fit width.
  // We size the IMG element directly via width/height so the browser can
  // rasterize at the requested resolution and apply image-rendering hints
  // correctly. Earlier versions used CSS transform zooming, which puts the
  // element on a GPU compositor layer and falls back to GPU bilinear
  // interpolation regardless of image-rendering, producing ghosted text.
  let scale = 1
  const MIN_SCALE = 0.5
  const MAX_SCALE = 16

  let isDragging = false
  let dragStartX = 0
  let dragStartY = 0
  let dragStartScrollLeft = 0
  let dragStartScrollTop = 0
  let didDrag = false

  // Cached "fit" dimensions of the image inside the current viewport.
  // Recomputed on image load. zoom is applied as fitW × scale, fitH × scale.
  let fitW = 0
  let fitH = 0

  const computeFit = (): void => {
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    if (nw < 1 || nh < 1) {
      fitW = 0
      fitH = 0
      return
    }
    const vw = viewport.clientWidth || overlay.clientWidth || window.innerWidth
    const vh =
      viewport.clientHeight || overlay.clientHeight || window.innerHeight
    const sx = vw / nw
    const sy = vh / nh
    const fitScale = Math.min(sx, sy, 1) // never upscale beyond natural at fit
    fitW = Math.round(nw * fitScale)
    fitH = Math.round(nh * fitScale)
  }

  const applySize = (): void => {
    if (fitW === 0) return
    const w = Math.round(fitW * scale)
    const h = Math.round(fitH * scale)
    img.style.width = `${w}px`
    img.style.height = `${h}px`
    pinContainer.style.width = `${w}px`
    pinContainer.style.height = `${h}px`
  }

  const resetView = (): void => {
    scale = 1
    applySize()
    // Center the image in the viewport.
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, (pinContainer.offsetWidth - viewport.clientWidth) / 2)
      viewport.scrollTop = Math.max(0, (pinContainer.offsetHeight - viewport.clientHeight) / 2)
    })
  }

  /* ── Pin rendering ── */

  function renderPins(): void {
    for (const node of Array.from(
      pinContainer.querySelectorAll(`.${PIN_CLASS}`)
    )) {
      node.remove()
    }
    if (!pinHandlers) return
    const pins = pinHandlers.getPins()
    const activePinId = pinHandlers.getActivePinId()
    for (const pin of pins) {
      const badge = document.createElement('button')
      badge.type = 'button'
      badge.className = PIN_CLASS
      if (pin.id === activePinId) {
        badge.classList.add('pin-badge--active')
      }
      badge.style.left = `${pin.x}%`
      badge.style.top = `${pin.y}%`
      badge.textContent = String(pin.id)
      badge.title = `핀 ${pin.id} (클릭하면 삭제)`
      badge.dataset.pinId = String(pin.id)
      pinContainer.appendChild(badge)
    }
  }

  /* ── Close ── */

  const close = (): void => {
    if (!isOpenState) return
    isOpenState = false
    overlay.hidden = true
    img.removeAttribute('src')
    img.style.width = ''
    img.style.height = ''
    pinContainer.style.width = ''
    pinContainer.style.height = ''
    scale = 1
    fitW = 0
    fitH = 0
    document.removeEventListener('keydown', onKey)
  }

  /* ── Keyboard ── */

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      close()
      return
    }
    if (ev.key === '0' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault()
      resetView()
    }
  }

  /* ── Zoom (wheel) — resizes IMG, scrolls to keep cursor anchor ── */

  const onWheel = (ev: WheelEvent): void => {
    if (!isOpenState || fitW === 0) return
    ev.preventDefault()
    const factor = ev.deltaY < 0 ? 1.2 : 1 / 1.2
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor))
    if (newScale === scale) return

    // Position of the cursor inside the viewport.
    const vRect = viewport.getBoundingClientRect()
    const cursorViewportX = ev.clientX - vRect.left
    const cursorViewportY = ev.clientY - vRect.top

    // Position in image coordinates (= scrollLeft + cursorInViewport).
    const imgX = viewport.scrollLeft + cursorViewportX
    const imgY = viewport.scrollTop + cursorViewportY

    const ratio = newScale / scale
    scale = newScale
    applySize()

    // After resize, scroll so the same image point stays under the cursor.
    viewport.scrollLeft = imgX * ratio - cursorViewportX
    viewport.scrollTop = imgY * ratio - cursorViewportY
  }

  /* ── Drag-to-pan (via scroll) + click-to-pin ── */

  const onPointerDown = (ev: PointerEvent): void => {
    if (!isOpenState) return
    if (ev.button !== 0) return
    isDragging = true
    didDrag = false
    dragStartX = ev.clientX
    dragStartY = ev.clientY
    dragStartScrollLeft = viewport.scrollLeft
    dragStartScrollTop = viewport.scrollTop
    viewport.setPointerCapture(ev.pointerId)
    viewport.style.cursor = 'grabbing'
    ev.preventDefault()
  }

  const onPointerMove = (ev: PointerEvent): void => {
    if (!isDragging) return
    const dx = ev.clientX - dragStartX
    const dy = ev.clientY - dragStartY
    if (!didDrag && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      didDrag = true
    }
    if (didDrag) {
      // Drag right → image content shifts right under cursor → scroll left
      // (= reduce scrollLeft).
      viewport.scrollLeft = dragStartScrollLeft - dx
      viewport.scrollTop = dragStartScrollTop - dy
    }
  }

  const onPointerUp = (ev: PointerEvent): void => {
    if (!isDragging) return
    isDragging = false
    viewport.releasePointerCapture(ev.pointerId)
    viewport.style.cursor = ''

    if (didDrag) return // Was a drag, not a click.

    // Pointer-capture makes ev.target == viewport regardless of which pin
    // is under the cursor — use elementFromPoint instead.
    const elAtPoint = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
    const pinBadge = elAtPoint?.closest(`.${PIN_CLASS}`) as HTMLElement | null
    if (pinBadge && pinHandlers) {
      const pinId = Number(pinBadge.dataset.pinId)
      if (pinId > 0) {
        pinHandlers.onDeletePin(pinId)
        renderPins()
      }
      return
    }

    // Add pin at click position.
    if (!pinHandlers?.canPin()) return
    if (!img.complete || img.naturalWidth < 1) return
    const imgRect = img.getBoundingClientRect()
    if (imgRect.width < 1 || imgRect.height < 1) return
    const x = Math.min(100, Math.max(0, ((ev.clientX - imgRect.left) / imgRect.width) * 100))
    const y = Math.min(100, Math.max(0, ((ev.clientY - imgRect.top) / imgRect.height) * 100))
    pinHandlers.onAddPin(x, y)
    renderPins()
  }

  /* ── Double click = reset view ── */

  const onDblClick = (ev: MouseEvent): void => {
    if (!isOpenState) return
    const target = ev.target as HTMLElement | null
    if (target?.closest(`.${PIN_CLASS}`)) return
    resetView()
  }

  /* ── Open ── */

  const open = (dataUrl: string, label?: string): void => {
    img.src = dataUrl
    if (label) overlay.setAttribute('aria-label', label)
    overlay.hidden = false
    isOpenState = true
    document.addEventListener('keydown', onKey)
    // computeFit + apply runs as soon as the image natural size is known.
    if (img.complete && img.naturalWidth > 0) {
      computeFit()
      resetView()
      renderPins()
    }
  }

  img.addEventListener('load', () => {
    computeFit()
    resetView()
    renderPins()
  })

  backdrop.addEventListener('click', close)
  closeBtn.addEventListener('click', close)
  viewport.addEventListener('pointerdown', onPointerDown)
  viewport.addEventListener('pointermove', onPointerMove)
  viewport.addEventListener('pointerup', onPointerUp)
  viewport.addEventListener('dblclick', onDblClick)
  overlay.addEventListener('wheel', onWheel, { passive: false })
  // Prevent backdrop close when interacting with viewport.
  viewport.addEventListener('click', (ev) => ev.stopPropagation())

  return { open, close, isOpen: () => isOpenState, refreshPins: renderPins }
}
