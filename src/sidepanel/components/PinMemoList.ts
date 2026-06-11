import type { PinItem } from '../../types'
import { swissIcon, swissPinGlyph } from '../utils/swiss-icons'

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
  // 미리보기 카드 내부 하위 블록 (디자인 SoT §02 pin-memo)
  host.classList.add('pin-memo')

  const headRow = document.createElement('div')
  headRow.className = 'pin-memo-head'
  const heading = document.createElement('h2')
  heading.className = 'pin-memo-title pin-memo__title'
  heading.textContent = '핀 메모'
  headRow.append(swissPinGlyph(), heading)

  const listRoot = document.createElement('div')
  listRoot.className = 'pin-memo__list'

  const placeholder = document.createElement('div')
  placeholder.className = 'pin-memo__placeholder pin-empty'
  placeholder.textContent = '이미지를 클릭하여 핀을 추가하세요'

  host.append(headRow, listRoot, placeholder)

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
      label.className = 'pin-memo__label tnum'
      label.textContent = String(pin.id)

      const ta = document.createElement('textarea')
      ta.className = 'field pin-memo__input'
      ta.rows = 1
      ta.dataset.pinId = String(pin.id)
      ta.value = pin.memo
      ta.placeholder = '메모 입력…'
      ta.setAttribute('aria-label', `핀 ${pin.id} 메모`)
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
      del.append(swissIcon('x', 'ic-sm'))
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
  // border-box: scrollHeight엔 보더가 빠진다 — 보정 없으면 2px 오버플로로 스크롤바 출현
  const border = el.offsetHeight - el.clientHeight
  el.style.height = `${el.scrollHeight + border}px`
}
