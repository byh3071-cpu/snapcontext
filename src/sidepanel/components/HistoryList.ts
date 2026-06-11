import {
  clearHistory,
  deleteCapture,
  getHistory,
  type CaptureHistoryItem
} from '../../storage/history'
import { swissIcon } from '../utils/swiss-icons'
import { mkSecHead } from '../utils/section'

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

/** 디자인 SoT 기록행 메타 포맷: MM.DD HH:mm (tabular-nums) */
function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(date.getMonth() + 1)}.${p(date.getDate())} ${p(date.getHours())}:${p(
    date.getMinutes()
  )}`
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
  host.classList.add('capture-history')

  /* ---- 섹션 헤드: 05 | 기록 / 캡처 기록 | 모두 삭제 ---- */
  const clearBtn = document.createElement('button')
  clearBtn.type = 'button'
  clearBtn.className = 'danger-link capture-history__clear'
  clearBtn.title = '캡처 기록 모두 삭제'
  clearBtn.setAttribute('aria-label', '캡처 기록 모두 삭제')
  clearBtn.append(swissIcon('trashLines'), document.createTextNode('모두 삭제'))

  const { head } = mkSecHead({
    num: '05',
    eyebrow: '기록',
    title: '캡처 기록',
    titleId: 'sec-hist-title',
    titleClass: 'capture-history__title',
    asideNode: clearBtn
  })

  const list = document.createElement('div')
  list.className = 'hist-list capture-history__list'

  host.append(head, list)

  let items: CaptureHistoryItem[] = []

  function renderEmpty(): void {
    const empty = document.createElement('div')
    empty.className = 'capture-history__empty'
    empty.textContent = '저장된 캡처가 아직 없습니다.'
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

  function renderItem(item: CaptureHistoryItem, index: number): HTMLElement {
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

    const idx = document.createElement('span')
    idx.className = 'hist-idx tnum'
    idx.setAttribute('aria-hidden', 'true')
    idx.textContent = String(index + 1).padStart(2, '0')

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

    const meta = document.createElement('div')
    meta.className = 'capture-history__meta tnum'
    const mkSlash = (): HTMLSpanElement => {
      const s = document.createElement('span')
      s.className = 'slash'
      s.textContent = '/'
      return s
    }
    meta.append(
      document.createTextNode(formatTime(item.timestamp)),
      mkSlash(),
      document.createTextNode(captureTypeLabel(item.captureType)),
      mkSlash(),
      document.createTextNode(`핀 ${item.pinsCount}`)
    )

    body.append(primary, meta)

    const deleteBtn = document.createElement('button')
    deleteBtn.type = 'button'
    deleteBtn.className = 'row-del capture-history__delete'
    deleteBtn.title = '캡처 삭제'
    deleteBtn.setAttribute('aria-label', '캡처 삭제')
    deleteBtn.append(swissIcon('trash', 'ic-sm'))
    deleteBtn.addEventListener('click', (ev) => {
      ev.stopPropagation()
      void removeItem(item.id)
    })

    row.append(idx, thumb, body)
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
    items.forEach((item, i) => {
      list.append(renderItem(item, i))
    })
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
