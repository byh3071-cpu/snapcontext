import type { PinItem } from '../../types'

const PIN_CLASS = 'pin-badge'

export type PinLayerSurface = HTMLImageElement | HTMLCanvasElement

function surfaceReady(el: PinLayerSurface): boolean {
  if (el instanceof HTMLCanvasElement) {
    return el.width > 0 && el.height > 0
  }
  return el.complete && el.naturalWidth > 0
}

export type PinLayerApi = {
  render: (pins: PinItem[], activePinId: number | null) => void
}

export function mountPinLayer(
  pinContainer: HTMLElement,
  imageEl: PinLayerSurface,
  opts: {
    canPin: () => boolean
    onAddPin: (x: number, y: number) => void
    onSelectPin: (id: number) => void
    onDeletePin?: (id: number) => void
  }
): PinLayerApi {
  const clamp = (v: number): number =>
    Math.min(100, Math.max(0, v))

  pinContainer.classList.add('pin-container')

  pinContainer.addEventListener('click', (ev) => {
    if (!opts.canPin()) return
    const t = ev.target as HTMLElement | null
    if (t?.closest(`.${PIN_CLASS}`)) return
    if (!surfaceReady(imageEl)) return
    const rect = imageEl.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    const x = clamp(((ev.clientX - rect.left) / rect.width) * 100)
    const y = clamp(((ev.clientY - rect.top) / rect.height) * 100)
    opts.onAddPin(x, y)
  })

  const render = (pins: PinItem[], activePinId: number | null): void => {
    for (const node of Array.from(
      pinContainer.querySelectorAll(`.${PIN_CLASS}`)
    )) {
      node.remove()
    }

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
      badge.title = `핀 ${pin.id} (한 번 더 클릭하면 삭제)`
      badge.addEventListener('click', (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        // The "click again to delete" gate is enforced by the host (App.ts)
        // via lastClickedPinId, not by render-time closure state — that way
        // a freshly-added pin (auto-set as activePinId for highlight) does
        // not get deleted on its very first click.
        opts.onSelectPin(pin.id)
      })
      pinContainer.appendChild(badge)
    }
  }

  return { render }
}
