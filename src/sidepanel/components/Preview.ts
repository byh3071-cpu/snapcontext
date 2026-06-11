import type { CaptureType } from '../../types'
import { swissIcon } from '../utils/swiss-icons'
import { mkSecHead } from '../utils/section'
import { mountImageLightbox, type ImageLightboxPinHandlers } from './ImageLightbox'

type PreviewImageInput = {
  dataUrl: string
  captureType: CaptureType
  imageWidth: number
  imageHeight: number
  /** 스테이지 좌하단 잉크 shot-tag용 소스 주소 (디자인 SoT §02) */
  sourceUrl?: string
}

export type PreviewApi = {
  setImage: (input: PreviewImageInput | null) => void
  clear: () => void
  hasImage: () => boolean
  pinContainer: HTMLElement
  imageEl: HTMLImageElement
  /** §02 미리보기 카드 — 핀 메모 블록이 이 안에 들어간다 */
  cardEl: HTMLElement
  /** PNG 복사/저장 듀오(ImageActions)가 마운트되는 카드 내 슬롯 */
  exportHost: HTMLElement
  openPinLightbox: () => void
  closePinLightbox: () => void
  isPinLightboxOpen: () => boolean
  refreshImageLightbox: () => void
}

function captureLabel(type: CaptureType): string {
  if (type === 'visible') return '화면 캡처'
  if (type === 'document') return '문서 캡처'
  if (type === 'full-page') return '전체 캡처'
  return '요소 캡처'
}

export function mountPreview(
  host: HTMLElement,
  pinHandlers?: ImageLightboxPinHandlers
): PreviewApi {
  /* ---- 섹션 헤드: 02 | 캡처됨 / 캡처 미리보기 | 상태 배지 ---- */
  const badge = document.createElement('span')
  badge.className = 'badge preview-result-meta tnum'
  badge.setAttribute('role', 'status')
  const badgeIcon = swissIcon('check')
  const badgeText = document.createElement('span')
  badgeText.textContent = '준비됨'
  badge.append(badgeIcon, badgeText)

  const { head, titleEl } = mkSecHead({
    num: '02',
    eyebrow: '캡처됨',
    title: '',
    titleId: 'sec-pv-title',
    titleClass: 'preview-result-title',
    asideNode: badge
  })
  const resultName = document.createElement('strong')
  resultName.textContent = '캡처 미리보기'
  titleEl.append(resultName)

  /* ---- 미리보기 카드 ---- */
  const card = document.createElement('div')
  card.className = 'pv-card'

  const empty = document.createElement('div')
  empty.className = 'preview-empty'
  const iconWrap = document.createElement('div')
  iconWrap.className = 'preview-empty-icon'
  iconWrap.setAttribute('aria-hidden', 'true')
  iconWrap.append(swissIcon('camera'))
  const placeholder = document.createElement('p')
  placeholder.className = 'preview-placeholder'
  placeholder.textContent = '위 버튼으로 캡처를 시작하세요'
  empty.append(iconWrap, placeholder)

  const captureWrap = document.createElement('div')
  captureWrap.className = 'preview-capture preview-capture--hidden'

  const stage = document.createElement('div')
  stage.className = 'stage'

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
  btnZoom.append(swissIcon('zoomIn', 'ic-sm'))

  const shotTag = document.createElement('span')
  shotTag.className = 'shot-tag tnum'
  shotTag.hidden = true

  pinContainer.appendChild(img)
  stage.appendChild(pinContainer)
  stage.appendChild(btnZoom)
  stage.appendChild(shotTag)
  captureWrap.append(stage)

  /* ---- 스테이지 도구열: 크게 보기 + 휠 힌트 ---- */
  const tools = document.createElement('div')
  tools.className = 'stage-tools'
  tools.hidden = true
  const btnExpand = document.createElement('button')
  btnExpand.type = 'button'
  btnExpand.className = 'ghost-btn preview-expand-btn'
  btnExpand.setAttribute('aria-expanded', 'false')
  btnExpand.disabled = true
  btnExpand.append(swissIcon('expand', 'ic-sm'), document.createTextNode('크게 보기'))
  const zoomHint = document.createElement('span')
  zoomHint.className = 'zoom-hint tnum'
  zoomHint.textContent = 'Ctrl+휠: 확대/축소'
  tools.append(btnExpand, zoomHint)

  const exportHost = document.createElement('div')

  card.append(empty, captureWrap, tools, exportHost)

  /* ---- 핀 라이트박스 (크게 보기) ---- */
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
  btnCloseLb.append(swissIcon('x', 'ic-sm'))
  lbHeader.append(lbTitle, lbHint, btnCloseLb)

  const lbScroll = document.createElement('div')
  lbScroll.className = 'pin-lightbox__scroll'

  lbPanel.append(lbHeader, lbScroll)
  lightbox.append(lbBackdrop, lbPanel)

  host.append(head, card, lightbox)

  const imageLightbox = mountImageLightbox(host, pinHandlers)
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
    host.dispatchEvent(new CustomEvent('snapcontext:pin-lightbox-open'))
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
      tools.hidden = true
      btnExpand.disabled = true
      resultName.textContent = '캡처 미리보기'
      lbTitle.textContent = '캡처 미리보기'
      badgeText.textContent = '준비됨'
      shotTag.hidden = true
      shotTag.replaceChildren()
      return
    }
    const label = captureLabel(input.captureType)
    hasImageState = true
    img.src = input.dataUrl
    resultName.textContent = label
    lbTitle.textContent = label
    badgeText.textContent = `${input.imageWidth}×${input.imageHeight}`
    let host = ''
    if (input.sourceUrl) {
      try {
        host = new URL(input.sourceUrl).hostname
      } catch {
        host = input.sourceUrl
      }
    }
    if (host) {
      const slash = document.createElement('span')
      slash.className = 'slash'
      slash.textContent = '/'
      shotTag.replaceChildren(document.createTextNode(host), slash, document.createTextNode(label))
      shotTag.hidden = false
    } else {
      shotTag.hidden = true
      shotTag.replaceChildren()
    }
    captureWrap.classList.remove('preview-capture--hidden')
    empty.hidden = true
    tools.hidden = false
    btnExpand.disabled = false
  }

  const hasImage = (): boolean => hasImageState

  return {
    setImage,
    clear: () => setImage(null),
    hasImage,
    pinContainer,
    imageEl: img,
    cardEl: card,
    exportHost,
    openPinLightbox,
    closePinLightbox,
    isPinLightboxOpen: () => lightboxOpen,
    refreshImageLightbox: () => imageLightbox.refreshPins()
  }
}
