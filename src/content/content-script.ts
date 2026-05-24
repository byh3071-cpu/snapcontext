import { findMainContentRoot } from './document-selector'
import { buildSelectorForElement } from './selectors'
import type { DebugLogEntry, ExtensionMessage, SerializedRect } from '../types'

const OVERLAY_ATTR = 'data-snapcontext-overlay'
const DOC_HIGHLIGHT_ATTR = 'data-snapcontext-doc-highlight'
const HIGHLIGHT_INSET =
  'inset 0 0 0 2px rgba(233, 69, 96, 0.95)'
/** outline은 히트 영역에 포함되지 않아, 테두리만 클릭하면 잘못된 요소가 잡힌다 */
const PICK_HIT_PADDING_PX = 8

type Cleanup = () => void

let activeCleanup: Cleanup | null = null
let documentHighlightEl: HTMLElement | null = null
let debugLogs: DebugLogEntry[] = []
const debugSnapshotResolvers = new Map<string, () => void>()

const DEBUG_SOURCE_PAGE = 'snapcontext-page-debug'
const DEBUG_SOURCE_CONTENT = 'snapcontext-content-debug'
const MAX_DEBUG_LOGS = 50

function pageViewport(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight }
}

function requestDebugLogSnapshot(): Promise<void> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  window.postMessage(
    {
      source: DEBUG_SOURCE_CONTENT,
      type: 'GET_DEBUG_LOGS',
      requestId
    },
    '*'
  )
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      debugSnapshotResolvers.delete(requestId)
      resolve()
    }, 150)
    debugSnapshotResolvers.set(requestId, () => {
      window.clearTimeout(timer)
      resolve()
    })
  })
}

function installDebugLogBridge(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    const data = event.data as
      | {
          source?: string
          type?: string
          requestId?: string
          log?: DebugLogEntry
          logs?: DebugLogEntry[]
        }
      | undefined
    if (data?.source !== DEBUG_SOURCE_PAGE) return
    if (data.type === 'DEBUG_LOG' && data.log) {
      debugLogs = [...debugLogs, data.log].slice(-MAX_DEBUG_LOGS)
      return
    }
    if (data.type === 'DEBUG_LOGS_SNAPSHOT' && Array.isArray(data.logs)) {
      debugLogs = data.logs.slice(-MAX_DEBUG_LOGS)
      if (data.requestId) {
        debugSnapshotResolvers.get(data.requestId)?.()
        debugSnapshotResolvers.delete(data.requestId)
      }
    }
  })
  void requestDebugLogSnapshot()
}

function showCaptureErrorPageToast(text: string): void {
  const el = document.createElement('div')
  el.setAttribute('data-snapcontext-page-toast', 'true')
  el.textContent = text
  el.style.cssText =
    'position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:2147483647;max-width:min(420px,92vw);padding:10px 14px;background:#16161f;color:#eee;border-radius:8px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)'
  document.documentElement.appendChild(el)
  window.setTimeout(() => el.remove(), 7000)
}

function rectToPayload(rect: DOMRect): SerializedRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom
  }
}

function isIgnorableTarget(el: Element | null): boolean {
  if (!el) return true
  if (el.closest(`[${OVERLAY_ATTR}]`)) return true
  const tag = el.tagName.toLowerCase()
  return tag === 'html' || tag === 'body'
}

function clearDocumentHighlight(): void {
  documentHighlightEl?.remove()
  documentHighlightEl = null
}

function flashDocumentHighlight(rect: DOMRect, ms: number): void {
  clearDocumentHighlight()
  const box = document.createElement('div')
  box.setAttribute(DOC_HIGHLIGHT_ATTR, 'true')
  box.style.position = 'fixed'
  box.style.left = `${rect.left}px`
  box.style.top = `${rect.top}px`
  box.style.width = `${rect.width}px`
  box.style.height = `${rect.height}px`
  box.style.border = '2px solid #e94560'
  box.style.borderRadius = '6px'
  box.style.boxSizing = 'border-box'
  box.style.pointerEvents = 'none'
  box.style.zIndex = '2147483646'
  document.body.appendChild(box)
  documentHighlightEl = box
  window.setTimeout(() => clearDocumentHighlight(), ms)
}

function runDocumentScan(): void {
  try {
    const root = findMainContentRoot(document)
    if (!root) {
      void chrome.runtime.sendMessage({
        type: 'DOCUMENT_AREA_NOT_FOUND'
      } satisfies ExtensionMessage)
      return
    }
    const rect = root.getBoundingClientRect()
    const selector = buildSelectorForElement(root)
    const devicePixelRatio = window.devicePixelRatio || 1
    const viewport = pageViewport()
    const userAgent = navigator.userAgent
    flashDocumentHighlight(rect, 2000)
    void chrome.runtime.sendMessage({
      type: 'DOCUMENT_AREA_FOUND',
      rect: rectToPayload(rect),
      selector,
      devicePixelRatio,
      viewport,
      userAgent
    } satisfies ExtensionMessage)
  } catch {
    void chrome.runtime.sendMessage({
      type: 'DOCUMENT_AREA_NOT_FOUND'
    } satisfies ExtensionMessage)
  }
}

function startElementSelection(): void {
  activeCleanup?.()
  activeCleanup = null

  const overlay = document.createElement('div')
  overlay.setAttribute(OVERLAY_ATTR, 'true')
  overlay.style.position = 'fixed'
  overlay.style.inset = '0'
  overlay.style.zIndex = '2147483647'
  overlay.style.background = 'transparent'
  overlay.style.pointerEvents = 'none'
  overlay.style.cursor = 'crosshair'

  const htmlEl = document.documentElement
  const prevHtmlCursor = htmlEl.style.cursor
  htmlEl.style.cursor = 'crosshair'

  let highlighted: HTMLElement | SVGElement | null = null
  let savedHighlightBoxShadow = ''
  let savedHighlightOutline = ''
  let savedHighlightOutlineOffset = ''
  let selectionLocked = false

  const clearHighlight = (): void => {
    if (highlighted) {
      highlighted.style.boxShadow = savedHighlightBoxShadow
      highlighted.style.outline = savedHighlightOutline
      highlighted.style.outlineOffset = savedHighlightOutlineOffset
    }
    highlighted = null
    savedHighlightBoxShadow = ''
    savedHighlightOutline = ''
    savedHighlightOutlineOffset = ''
  }

  const applyHighlight = (el: Element | null): void => {
    clearHighlight()
    if (!el || isIgnorableTarget(el)) return
    if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) return
    highlighted = el
    savedHighlightBoxShadow = el.style.boxShadow
    savedHighlightOutline = el.style.outline
    savedHighlightOutlineOffset = el.style.outlineOffset
    el.style.boxShadow = HIGHLIGHT_INSET
    el.style.outline = ''
    el.style.outlineOffset = ''
  }

  const pickTarget = (clientX: number, clientY: number): Element | null => {
    const picked = document.elementFromPoint(clientX, clientY)
    if (!(picked instanceof Element)) return null
    if (picked === overlay || picked.closest(`[${OVERLAY_ATTR}]`)) return null
    if (isIgnorableTarget(picked)) return null
    return picked
  }

  const resolvePickTarget = (clientX: number, clientY: number): Element | null => {
    if (highlighted) {
      const r = highlighted.getBoundingClientRect()
      const pad = PICK_HIT_PADDING_PX
      if (
        clientX >= r.left - pad &&
        clientX <= r.right + pad &&
        clientY >= r.top - pad &&
        clientY <= r.bottom + pad
      ) {
        return highlighted
      }
    }
    return pickTarget(clientX, clientY)
  }

  const onMouseMove = (ev: MouseEvent): void => {
    const target = pickTarget(ev.clientX, ev.clientY)
    applyHighlight(target)
  }

  const winEvtOpts = { capture: true, passive: false } as const

  /**
   * 링크·버튼은 보통 click 단계에서 동작한다. pointerdown만 막으면 이동/실행된다.
   */
  const suppressActivation = (ev: Event): void => {
    ev.preventDefault()
    ev.stopPropagation()
    ev.stopImmediatePropagation()
  }

  const cleanup = (): void => {
    window.removeEventListener('pointerdown', onPickPress, winEvtOpts)
    window.removeEventListener('mousedown', onPickPress, winEvtOpts)
    window.removeEventListener('click', suppressActivation, winEvtOpts)
    window.removeEventListener('auxclick', suppressActivation, winEvtOpts)
    window.removeEventListener('dblclick', suppressActivation, winEvtOpts)
    window.removeEventListener('dragstart', suppressActivation, winEvtOpts)
    document.removeEventListener('submit', suppressActivation, winEvtOpts)
    window.removeEventListener('keydown', onKeyDown, winEvtOpts)
    document.removeEventListener('mousemove', onMouseMove, true)
    htmlEl.style.cursor = prevHtmlCursor
    clearHighlight()
    overlay.remove()
    activeCleanup = null
    selectionLocked = false
  }

  const onPickPress = (ev: Event): void => {
    if (selectionLocked) return
    const clientX =
      'clientX' in ev && typeof ev.clientX === 'number' ? ev.clientX : 0
    const clientY =
      'clientY' in ev && typeof ev.clientY === 'number' ? ev.clientY : 0

    if (ev instanceof PointerEvent) {
      if (!ev.isPrimary) return
      if (ev.pointerType === 'mouse' && ev.button !== 0) return
    } else if (ev instanceof MouseEvent) {
      if (ev.button !== 0) return
    } else {
      return
    }

    ev.preventDefault()
    ev.stopPropagation()
    ev.stopImmediatePropagation()

    let target: Element | null = null
    try {
      target = resolvePickTarget(clientX, clientY)
      if (!target || isIgnorableTarget(target)) {
        return
      }
    } catch {
      return
    }

    let rect: DOMRect
    let selector: string
    const devicePixelRatio = window.devicePixelRatio || 1
    const viewport = pageViewport()
    const userAgent = navigator.userAgent

    try {
      rect = target.getBoundingClientRect()
      selector = buildSelectorForElement(target)
    } catch {
      cleanup()
      return
    }

    selectionLocked = true

    void (async (): Promise<void> => {
      try {
        const ack = (await chrome.runtime.sendMessage({
          type: 'ELEMENT_SELECTED',
          rect: rectToPayload(rect),
          selector,
          devicePixelRatio,
          viewport,
          userAgent
        } satisfies ExtensionMessage)) as { ok?: boolean; error?: string } | undefined
        if (ack && typeof ack === 'object' && ack.ok === false) {
          showCaptureErrorPageToast(
            ack.error ?? '요소 캡처에 실패했습니다.'
          )
        }
      } catch (e: unknown) {
        const raw = e instanceof Error ? e.message : String(e)
        showCaptureErrorPageToast(
          /Receiving end does not exist|Could not establish connection/i.test(
            raw
          )
            ? '사이드패널을 연 상태에서 다시 시도하세요.'
            : raw
        )
      } finally {
        cleanup()
      }
    })()
  }

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      cleanup()
      void chrome.runtime.sendMessage({
        type: 'CANCEL_SELECT'
      } satisfies ExtensionMessage)
      return
    }
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault()
      ev.stopPropagation()
      ev.stopImmediatePropagation()
    }
  }

  activeCleanup = cleanup

  document.body.appendChild(overlay)

  window.addEventListener('click', suppressActivation, winEvtOpts)
  window.addEventListener('auxclick', suppressActivation, winEvtOpts)
  window.addEventListener('dblclick', suppressActivation, winEvtOpts)
  window.addEventListener('dragstart', suppressActivation, winEvtOpts)
  document.addEventListener('submit', suppressActivation, winEvtOpts)

  window.addEventListener('pointerdown', onPickPress, winEvtOpts)
  window.addEventListener('mousedown', onPickPress, winEvtOpts)
  window.addEventListener('keydown', onKeyDown, winEvtOpts)
  document.addEventListener('mousemove', onMouseMove, true)
}


chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender,
    sendResponse: (r: ExtensionMessage | undefined) => void
  ) => {
    if (message.type === 'GET_PAGE_META') {
      void (async () => {
        await requestDebugLogSnapshot()
        sendResponse({
          type: 'PAGE_META',
          viewport: pageViewport(),
          userAgent: navigator.userAgent,
          debugLogs
        })
      })()
      return true
    }
    if (message.type === 'ENABLE_SELECTOR') {
      startElementSelection()
      return false
    }
    if (message.type === 'DISABLE_SELECTOR') {
      activeCleanup?.()
      return false
    }
    if (message.type === 'ENABLE_DOCUMENT_SELECTOR') {
      runDocumentScan()
      return false
    }
    if (message.type === 'DISABLE_DOCUMENT_SELECTOR') {
      clearDocumentHighlight()
      return false
    }
    return false
  }
)

installDebugLogBridge()
