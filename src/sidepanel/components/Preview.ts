import { X, ZoomIn } from 'lucide'
import type { CaptureType } from '../../types'
import { panelLucideIcon } from '../utils/panel-lucide'
import { mountImageLightbox, type ImageLightboxPinHandlers } from './ImageLightbox'

type PreviewImageInput = {
  dataUrl: string
  captureType: CaptureType
  imageWidth: number
  imageHeight: number
}

export type PreviewApi = {
  setImage: (input: PreviewImageInput | null) => void
  clear: () => void
  hasImage: () => boolean
  pinContainer: HTMLElement
  imageEl: HTMLImageElement
  openPinLightbox: () => void
  closePinLightbox: () => void
  isPinLightboxOpen: () => boolean
  refreshImageLightbox: () => void
}

const EMPTY_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 7a2 2 0 0 1 2-2h1l1.5-2h5L15 5h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z"/>
  <circle cx="12" cy="12.5" r="3.25"/>
</svg>
`.trim()

function captureLabel(type: CaptureType): string {
  if (type === 'visible') return '화면 캡처'
  if (type === 'document') return '문서 캡처'
  if (type === 'full-page') return '전체 캡처'
  return '요소 캡처'
}

export function mountPreview(
  container: HTMLElement,
  pinHandlers?: ImageLightboxPinHandlers
): PreviewApi {
  container.classList.add('preview-card')

  const expandRow = document.createElement('div')
  expandRow.className = 'preview-expand-row'
  expandRow.hidden = true
  const expandHint = document.createElement('p')
  expandHint.className = 'preview-expand-hint muted'
  expandHint.textContent = '큰 작업 화면에서 캡처를 확인하고 핀을 추가하세요.'
  const btnExpand = document.createElement('button')
  btnExpand.type = 'button'
  btnExpand.className = 'preview-expand-btn'
  btnExpand.textContent = '크게 보기'
  btnExpand.setAttribute('aria-expanded', 'false')
  btnExpand.disabled = true
  expandRow.append(expandHint, btnExpand)

  const wrap = document.createElement('div')
  wrap.className = 'preview-inner'

  const empty = document.createElement('div')
  empty.className = 'preview-empty'
  const iconWrap = document.createElement('div')
  iconWrap.className = 'preview-empty-icon'
  iconWrap.setAttribute('aria-hidden', 'true')
  iconWrap.innerHTML = EMPTY_SVG
  const placeholder = document.createElement('p')
  placeholder.className = 'preview-placeholder'
  placeholder.textContent = '위 버튼으로 캡처를 시작하세요'
  empty.append(iconWrap, placeholder)

  const captureWrap = document.createElement('div')
  captureWrap.className = 'preview-capture preview-capture--hidden'

  const resultHeader = document.createElement('div')
  resultHeader.className = 'preview-result-header'
  const resultTitle = document.createElement('div')
  resultTitle.className = 'preview-result-title'
  const resultEyebrow = document.createElement('span')
  resultEyebrow.className = 'preview-result-eyebrow'
  resultEyebrow.textContent = '캡처됨'
  const resultName = document.createElement('strong')
  resultName.textContent = '캡처 미리보기'
  resultTitle.append(resultEyebrow, resultName)

  const resultActions = document.createElement('div')
  resultActions.className = 'preview-result-actions'
  const resultMeta = document.createElement('span')
  resultMeta.className = 'preview-result-meta'
  resultMeta.textContent = '준비됨'
  resultActions.append(resultMeta)
  resultHeader.append(resultTitle, resultActions)

  const stage = document.createElement('div')
  stage.className = 'preview-stage'

  const pinContainer = document.createElement('div')
  pinContainer.className = 'pin-container'

  const img = document.createElement('img')
  img.className = 'preview-img'
  img.alt = '캡처 미리보기'

  const btnZoom = document.createElement('button')
  btnZoom.type = 'button'
  btnZoom.className = 'preview-zoom-btn'
  btnZoom.setAttribute('aria-label', '원본 이미지 확대')
  btnZoom.title = '원본 이미지 확대'
  btnZoom.appendChild(panelLucideIcon(ZoomIn, 16))

  pinContainer.appendChild(img)
  stage.appendChild(pinContainer)
  stage.appendChild(btnZoom)
  captureWrap.append(resultHeader, stage)

  wrap.append(empty, captureWrap)

  const lightbox = document.createElement('div')
  lightbox.className = 'pin-lightbox'
  lightbox.hidden = true
  lightbox.setAttribute('role', 'dialog')
  lightbox.setAttribute('aria-modal', 'true')
  lightbox.setAttribute('aria-label', '캡처 미리보기')

  const lbBackdrop = document.createElement('div')
  lbBackdrop.className = 'pin-lightbox__backdrop'

  const lbPanel = document.createElement('div')
  lbPanel.className = 'pin-lightbox__panel'

  const lbHeader = document.createElement('div')
  lbHeader.className = 'pin-lightbox__header'
  const lbTitle = document.createElement('span')
  lbTitle.className = 'pin-lightbox__title'
  lbTitle.textContent = '캡처 미리보기'
  const lbHint = document.createElement('span')
  lbHint.className = 'pin-lightbox__hint muted'
  lbHint.textContent = 'Ctrl+휠: 확대/축소'
  const btnCloseLb = document.createElement('button')
  btnCloseLb.type = 'button'
  btnCloseLb.className = 'pin-lightbox__close'
  btnCloseLb.setAttribute('aria-label', '닫기')
  btnCloseLb.appendChild(panelLucideIcon(X, 18))
  lbHeader.append(lbTitle, lbHint, btnCloseLb)

  const lbScroll = document.createElement('div')
  lbScroll.className = 'pin-lightbox__scroll'

  lbPanel.append(lbHeader, lbScroll)
  lightbox.append(lbBackdrop, lbPanel)
  container.append(expandRow, wrap, lightbox)

  const imageLightbox = mountImageLightbox(container, pinHandlers)
  btnZoom.addEventListener('click', () => {
    if (!hasImageState || !img.src) return
    imageLightbox.open(img.src, '원본 이미지 확대')
  })

  let hasImageState = false
  let lightboxOpen = false
  let pinLbScale = 1
  const PIN_LB_MIN_SCALE = 0.5
  const PIN_LB_MAX_SCALE = 6

  function applyPinLbScale(): void {
    if (lightboxOpen && captureWrap.parentElement === lbScroll) {
      captureWrap.style.transform = `scale(${pinLbScale})`
      captureWrap.style.transformOrigin = 'top center'
    } else {
      captureWrap.style.transform = ''
    }
  }

  function resetPinLbScale(): void {
    pinLbScale = 1
    applyPinLbScale()
  }

  function notifyPinLightboxOpen(): void {
    container.dispatchEvent(new CustomEvent('snapcontext:pin-lightbox-open'))
  }

  function escapeHandler(ev: KeyboardEvent): void {
    if (ev.key !== 'Escape') return
    if (!lightboxOpen) return
    ev.preventDefault()
    closePinLightbox()
  }

  function restoreCaptureToPreview(): void {
    if (captureWrap.parentElement !== lbScroll) return
    captureWrap.classList.remove('preview-capture--lightbox')
    empty.after(captureWrap)
  }

  function closePinLightbox(): void {
    if (!lightboxOpen) return
    lightboxOpen = false
    lightbox.hidden = true
    btnExpand.setAttribute('aria-expanded', 'false')
    document.removeEventListener('keydown', escapeHandler)
    resetPinLbScale()
    restoreCaptureToPreview()
  }

  function onLightboxWheel(ev: WheelEvent): void {
    // Ctrl/⌘ + wheel = zoom; plain wheel = let scroll happen.
    if (!lightboxOpen) return
    if (!(ev.ctrlKey || ev.metaKey)) return
    ev.preventDefault()
    const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15
    pinLbScale = Math.min(
      PIN_LB_MAX_SCALE,
      Math.max(PIN_LB_MIN_SCALE, pinLbScale * factor)
    )
    applyPinLbScale()
  }

  lbScroll.addEventListener('wheel', onLightboxWheel, { passive: false })

  function openPinLightbox(): void {
    if (!hasImageState || !img.src) return
    if (captureWrap.parentElement === lbScroll) return

    captureWrap.classList.remove('preview-capture--hidden')
    captureWrap.classList.add('preview-capture--lightbox')
    lbScroll.appendChild(captureWrap)

    lightboxOpen = true
    lightbox.hidden = false
    btnExpand.setAttribute('aria-expanded', 'true')
    document.addEventListener('keydown', escapeHandler)
    void (async () => {
      try {
        if (img.decode) await img.decode()
      } catch {
        /* no-op */
      }
      requestAnimationFrame(() => {
        notifyPinLightboxOpen()
      })
    })()
  }

  btnExpand.addEventListener('click', () => {
    openPinLightbox()
  })

  btnCloseLb.addEventListener('click', () => {
    closePinLightbox()
  })

  lbBackdrop.addEventListener('click', () => {
    closePinLightbox()
  })

  lbPanel.addEventListener('click', (ev) => {
    ev.stopPropagation()
  })

  img.addEventListener('load', () => {
    if (!hasImageState) return
    captureWrap.dataset.size =
      img.naturalWidth < 140 || img.naturalHeight < 140 ? 'small' : 'regular'
  })

  const setImage = (input: PreviewImageInput | null): void => {
    if (!input) {
      closePinLightbox()
      imageLightbox.close()
      hasImageState = false
      img.removeAttribute('src')
      restoreCaptureToPreview()
      captureWrap.classList.add('preview-capture--hidden')
      delete captureWrap.dataset.size
      empty.hidden = false
      expandRow.hidden = true
      btnExpand.disabled = true
      resultName.textContent = '캡처 미리보기'
      lbTitle.textContent = '캡처 미리보기'
      resultMeta.textContent = '준비됨'
      return
    }
    const label = captureLabel(input.captureType)
    hasImageState = true
    img.src = input.dataUrl
    resultName.textContent = label
    lbTitle.textContent = label
    resultMeta.textContent = `${input.imageWidth}×${input.imageHeight}`
    captureWrap.classList.remove('preview-capture--hidden')
    empty.hidden = true
    expandRow.hidden = false
    btnExpand.disabled = false
  }

  const hasImage = (): boolean => hasImageState

  return {
    setImage,
    clear: () => setImage(null),
    hasImage,
    pinContainer,
    imageEl: img,
    openPinLightbox,
    closePinLightbox,
    isPinLightboxOpen: () => lightboxOpen,
    refreshImageLightbox: () => imageLightbox.refreshPins()
  }
}
