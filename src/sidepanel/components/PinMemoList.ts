import { MapPin, X } from 'lucide'
import type { PinItem } from '../../types'
import { panelLucideIcon } from '../utils/panel-lucide'

export type PinMemoListApi = {
  render: (pins: PinItem[], activePinId: number | null) => void
  focusMemo: (pinId: number) => void
  highlightRow: (activePinId: number | null) => void
}

export function mountPinMemoList(
  host: HTMLElement,
  handlers: {
    onMemoChange: (pinId: number, memo: string) => void
    onDelete: (pinId: number) => void
    onFocusPin: (pinId: number) => void
  }
): PinMemoListApi {
  host.classList.add('panel-card')
  const heading = document.createElement('h2')
  heading.className = 'pin-memo__title'
  heading.textContent = '핀 메모'

  const listRoot = document.createElement('div')
  listRoot.className = 'pin-memo__list'

  const placeholder = document.createElement('div')
  placeholder.className = 'pin-memo__placeholder empty-state'
  const placeholderText = document.createElement('p')
  placeholderText.className = 'empty-state__text'
  placeholderText.textContent = '이미지를 클릭하여 핀을 추가하세요'
  placeholder.append(panelLucideIcon(MapPin, 28), placeholderText)

  host.append(heading, listRoot, placeholder)

  const highlightRow = (activePinId: number | null): void => {
    for (const row of listRoot.querySelectorAll<HTMLElement>('.pin-memo__row')) {
      const id = Number(row.dataset.pinId)
      const active =
        activePinId !== null &&
        !Number.isNaN(id) &&
        id === activePinId
      row.classList.toggle('pin-memo__row--active', active)
    }
  }

  const render = (pins: PinItem[], activePinId: number | null): void => {
    listRoot.innerHTML = ''
    placeholder.hidden = pins.length > 0

    for (const pin of pins) {
      const row = document.createElement('div')
      row.className = 'pin-memo__row'
      row.dataset.pinId = String(pin.id)
      if (pin.id === activePinId) {
        row.classList.add('pin-memo__row--active')
      }

      const label = document.createElement('span')
      label.className = 'pin-memo__label'
      label.textContent = String(pin.id)

      const ta = document.createElement('textarea')
      ta.className = 'pin-memo__input'
      ta.rows = 1
      ta.dataset.pinId = String(pin.id)
      ta.value = pin.memo
      ta.placeholder = '메모 입력…'
      ta.addEventListener('input', () => {
        autoGrow(ta)
        handlers.onMemoChange(pin.id, ta.value)
      })
      ta.addEventListener('focus', () => handlers.onFocusPin(pin.id))

      const del = document.createElement('button')
      del.type = 'button'
      del.className = 'pin-memo__delete'
      del.title = '핀 삭제'
      del.setAttribute('aria-label', '핀 삭제')
      del.appendChild(panelLucideIcon(X, 16))
      del.addEventListener('click', () => handlers.onDelete(pin.id))

      const field = document.createElement('div')
      field.className = 'pin-memo__field'
      field.append(ta, del)

      row.append(label, field)
      listRoot.appendChild(row)
      autoGrow(ta)
    }
  }

  const focusMemo = (pinId: number): void => {
    const ta = listRoot.querySelector<HTMLTextAreaElement>(
      `textarea[data-pin-id="${pinId}"]`
    )
    ta?.focus()
    ta?.select()
  }

  return { render, focusMemo, highlightRow }
}

function autoGrow(el: HTMLTextAreaElement): void {
  el.style.height = '0px'
  el.style.height = `${el.scrollHeight}px`
}
