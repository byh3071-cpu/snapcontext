import { ImageOff, Trash2, X } from 'lucide'
import {
  clearHistory,
  deleteCapture,
  getHistory,
  type CaptureHistoryItem
} from '../../storage/history'
import { panelLucideIcon } from '../utils/panel-lucide'

type HistoryListDeps = {
  onOpen: (item: CaptureHistoryItem) => void
  showToast: (message: string, kind?: 'info' | 'error') => void
}

export type HistoryListApi = {
  refresh: () => Promise<void>
}

function captureTypeLabel(type: CaptureHistoryItem['captureType']): string {
  if (type === 'document') return '문서'
  if (type === 'element') return '요소'
  if (type === 'full-page') return '전체'
  return '화면'
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function mountHistoryList(
  host: HTMLElement,
  deps: HistoryListDeps
): HistoryListApi {
  host.classList.add('panel-card')
  host.classList.add('capture-history')

  const header = document.createElement('div')
  header.className = 'capture-history__header'

  const title = document.createElement('h2')
  title.className = 'capture-history__title'
  title.textContent = '캡처 기록'

  const clearBtn = document.createElement('button')
  clearBtn.type = 'button'
  clearBtn.className = 'capture-history__clear'
  clearBtn.title = '캡처 기록 모두 삭제'
  clearBtn.setAttribute('aria-label', '캡처 기록 모두 삭제')
  clearBtn.appendChild(panelLucideIcon(Trash2, 15))

  header.append(title, clearBtn)

  const list = document.createElement('div')
  list.className = 'capture-history__list'

  host.append(header, list)

  let items: CaptureHistoryItem[] = []

  function renderEmpty(): void {
    const empty = document.createElement('div')
    empty.className = 'capture-history__empty empty-state'
    const emptyText = document.createElement('p')
    emptyText.className = 'empty-state__text'
    emptyText.textContent = '저장된 캡처가 아직 없습니다.'
    empty.append(panelLucideIcon(ImageOff, 28), emptyText)
    list.append(empty)
  }

  function wireSwipeDelete(
    row: HTMLButtonElement,
    item: CaptureHistoryItem,
    onSwipeDelete: () => void
  ): void {
    let startX = 0
    let currentX = 0
    let tracking = false

    row.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return
      startX = ev.clientX
      currentX = ev.clientX
      tracking = true
    })

    row.addEventListener('pointermove', (ev) => {
      if (!tracking) return
      currentX = ev.clientX
      const delta = Math.min(0, currentX - startX)
      row.style.transform = `translateX(${Math.max(delta, -76)}px)`
    })

    const finish = (): void => {
      if (!tracking) return
      tracking = false
      const delta = currentX - startX
      row.style.transform = ''
      if (delta < -72) {
        onSwipeDelete()
        void removeItem(item.id)
      }
    }

    row.addEventListener('pointerup', finish)
    row.addEventListener('pointercancel', finish)
    row.addEventListener('pointerleave', finish)
  }

  function renderItem(item: CaptureHistoryItem): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'capture-history__item-wrap'

    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'capture-history__item'
    let suppressNextClick = false
    row.addEventListener('click', () => {
      if (suppressNextClick) {
        suppressNextClick = false
        return
      }
      deps.onOpen(item)
    })
    wireSwipeDelete(row, item, () => {
      suppressNextClick = true
    })

    const thumb = document.createElement('div')
    thumb.className = 'capture-history__thumb'
    if (item.thumbnail) {
      const img = document.createElement('img')
      img.src = item.thumbnail
      img.alt = item.title || hostname(item.url)
      thumb.appendChild(img)
    }

    const body = document.createElement('div')
    body.className = 'capture-history__body'

    const primary = document.createElement('div')
    primary.className = 'capture-history__primary'
    primary.textContent = item.title || hostname(item.url)

    const url = document.createElement('div')
    url.className = 'capture-history__url'
    url.textContent = item.url

    const meta = document.createElement('div')
    meta.className = 'capture-history__meta'
    meta.textContent = `${formatTime(item.timestamp)} · ${captureTypeLabel(
      item.captureType
    )} · 핀 ${item.pinsCount}`

    body.append(primary, url, meta)

    const deleteBtn = document.createElement('button')
    deleteBtn.type = 'button'
    deleteBtn.className = 'capture-history__delete'
    deleteBtn.title = '캡처 삭제'
    deleteBtn.setAttribute('aria-label', '캡처 삭제')
    deleteBtn.appendChild(panelLucideIcon(X, 15))
    deleteBtn.addEventListener('click', (ev) => {
      ev.stopPropagation()
      void removeItem(item.id)
    })

    row.append(thumb, body)
    wrap.append(row, deleteBtn)
    return wrap
  }

  function render(): void {
    list.replaceChildren()
    if (items.length === 0) {
      renderEmpty()
      clearBtn.disabled = true
      return
    }

    clearBtn.disabled = false
    for (const item of items) {
      list.append(renderItem(item))
    }
  }

  async function refresh(): Promise<void> {
    items = await getHistory()
    render()
  }

  async function removeItem(id: string): Promise<void> {
    try {
      await deleteCapture(id)
      await refresh()
      deps.showToast('캡처를 삭제했습니다.', 'info')
    } catch {
      deps.showToast('캡처를 삭제하지 못했습니다.', 'error')
    }
  }

  clearBtn.addEventListener('click', () => {
    void (async () => {
      try {
        await clearHistory()
        await refresh()
        deps.showToast('캡처 기록을 모두 삭제했습니다.', 'info')
      } catch {
        deps.showToast('캡처 기록을 삭제하지 못했습니다.', 'error')
      }
    })()
  })

  window.addEventListener('snapcontext:history-updated', () => {
    void refresh()
  })

  void refresh()

  return { refresh }
}
