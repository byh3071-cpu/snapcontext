import type {
  BackgroundToContentMessage,
  CaptureResultPayload,
  ContentToBackgroundMessage,
  ExtensionMessage,
  SidePanelToBackgroundMessage
} from '../types'
import { cropPngDataUrlWithDpr } from '../utils/crop'
import { getPngDimensionsFromDataUrl } from '../utils/png-dimensions'
import type { SidePanelResponse } from '../utils/messaging'

type ContentAck = { ok: true } | { ok: false; error: string }

function isElementSelected(
  msg: ExtensionMessage
): msg is Extract<ContentToBackgroundMessage, { type: 'ELEMENT_SELECTED' }> {
  return msg.type === 'ELEMENT_SELECTED'
}

function isDocumentAreaFound(
  msg: ExtensionMessage
): msg is Extract<ContentToBackgroundMessage, { type: 'DOCUMENT_AREA_FOUND' }> {
  return msg.type === 'DOCUMENT_AREA_FOUND'
}

/**
 * Escape ?깆쑝濡?蹂대궦 CANCEL_SELECT留?援щ텇?쒕떎.
 * ?쇰? 釉뚮씪?곗?(?⑥씪 ???먯꽌??Side Panel 硫붿떆吏?먮룄 sender.tab??遺숈쓣 ???덉뼱
 * tab ?좊Т留뚯쑝濡쒕뒗 ?뺤옣 UI? ??CS瑜?援щ텇?섎㈃ ???쒕떎.
 */
function isCancelSelectFromWebContent(
  sender: chrome.runtime.MessageSender
): boolean {
  const url = sender.url ?? ''
  if (url.startsWith('chrome-extension://')) {
    return false
  }
  return /^https?:\/\//i.test(url) && sender.tab?.id !== undefined
}

function isSidePanelCaptureCommand(
  msg: ExtensionMessage
): msg is Extract<
  SidePanelToBackgroundMessage,
  | { type: 'CAPTURE_VISIBLE' }
  | { type: 'START_ELEMENT_SELECT' }
  | { type: 'CAPTURE_DOCUMENT' }
  | { type: 'CAPTURE_FULL_PAGE' }
  | { type: 'GET_PENDING_ELEMENT_CAPTURE' }
> {
  return (
    msg.type === 'CAPTURE_VISIBLE' ||
    msg.type === 'START_ELEMENT_SELECT' ||
    msg.type === 'CAPTURE_DOCUMENT' ||
    msg.type === 'CAPTURE_FULL_PAGE' ||
    msg.type === 'GET_PENDING_ELEMENT_CAPTURE'
  )
}

let pendingElementCapture: CaptureResultPayload | null = null
let commandPendingDocumentCapture = false

function installMainWorldDebugCollector(): void {
  const sourcePage = 'snapcontext-page-debug'
  const sourceContent = 'snapcontext-content-debug'
  const maxDebugLogs = 50
  const w = window as Window & {
    __snapcontextDebugCollectorInstalled?: boolean
    __snapcontextDebugLogs?: CaptureResultPayload['debugLogs']
  }

  if (w.__snapcontextDebugCollectorInstalled) return
  w.__snapcontextDebugCollectorInstalled = true
  w.__snapcontextDebugLogs = w.__snapcontextDebugLogs ?? []

  const nowIso = (): string => new Date().toISOString()
  const makeId = (): string =>
    `dbg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const toMessage = (value: unknown): string => {
    if (value instanceof Error) return value.stack || value.message
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  const addLog = (
    entry: Omit<CaptureResultPayload['debugLogs'][number], 'id' | 'timestamp'>
  ): void => {
    const log: CaptureResultPayload['debugLogs'][number] = {
      id: makeId(),
      timestamp: nowIso(),
      ...entry
    }
    w.__snapcontextDebugLogs = [
      ...(w.__snapcontextDebugLogs ?? []),
      log
    ].slice(-maxDebugLogs)
    window.postMessage({ source: sourcePage, type: 'DEBUG_LOG', log }, '*')
  }

  const originalError = console.error
  console.error = function snapcontextConsoleError(...args: unknown[]) {
    addLog({
      level: 'error',
      source: 'console.error',
      message: args.map(toMessage).join(' ')
    })
    originalError.apply(console, args)
  }

  window.addEventListener('error', (event) => {
    addLog({
      level: 'unhandled',
      source: event.filename
        ? `${event.filename}:${event.lineno}:${event.colno}`
        : 'window.error',
      message: event.error ? toMessage(event.error) : event.message
    })
  })
  window.addEventListener('unhandledrejection', (event) => {
    addLog({
      level: 'unhandled',
      source: 'unhandledrejection',
      message: `Promise rejected: ${toMessage(event.reason)}`
    })
  })

  const originalFetch = window.fetch
  if (typeof originalFetch === 'function') {
    window.fetch = async function snapcontextFetch(input, init) {
      const started = performance.now()
      const method =
        init?.method ||
        (input instanceof Request ? input.method : undefined) ||
        'GET'
      const url =
        input instanceof Request
          ? input.url
          : typeof input === 'string'
            ? input
            : String(input)
      try {
        const response = await originalFetch.apply(window, [input, init])
        if (!response.ok) {
          addLog({
            level: 'network',
            source: 'fetch',
            method,
            url,
            status: response.status,
            statusText: response.statusText,
            durationMs: Math.round(performance.now() - started),
            message: `${method} ${url} - ${response.status} ${response.statusText}`
          })
        }
        return response
      } catch (error) {
        addLog({
          level: 'network',
          source: 'fetch',
          method,
          url,
          durationMs: Math.round(performance.now() - started),
          message: `${method} ${url} failed: ${toMessage(error)}`
        })
        throw error
      }
    }
  }

  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function snapcontextXhrOpen(
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    ;(this as XMLHttpRequest & {
      __snapcontextMeta?: { method: string; url: string; started: number }
    }).__snapcontextMeta = { method, url: String(url), started: 0 }
    return originalOpen.apply(this, [method, url, ...rest] as never)
  }
  XMLHttpRequest.prototype.send = function snapcontextXhrSend(body?: Document | XMLHttpRequestBodyInit | null) {
    const xhr = this as XMLHttpRequest & {
      __snapcontextMeta?: { method: string; url: string; started: number }
    }
    const meta = xhr.__snapcontextMeta
    if (meta) meta.started = performance.now()
    const onDone = (): void => {
      if (!meta) return
      if (xhr.status >= 400 || xhr.status === 0) {
        const statusText = xhr.statusText || (xhr.status === 0 ? 'Failed' : '')
        addLog({
          level: 'network',
          source: 'xhr',
          method: meta.method,
          url: meta.url,
          status: xhr.status,
          statusText,
          durationMs: Math.round(performance.now() - meta.started),
          message: `${meta.method} ${meta.url} - ${xhr.status} ${statusText}`.trim()
        })
      }
    }
    xhr.addEventListener('loadend', onDone, { once: true })
    return originalSend.apply(this, [body] as never)
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    const data = event.data as { source?: string; type?: string; requestId?: string }
    if (data?.source !== sourceContent || data.type !== 'GET_DEBUG_LOGS') return
    window.postMessage(
      {
        source: sourcePage,
        type: 'DEBUG_LOGS_SNAPSHOT',
        requestId: data.requestId,
        logs: w.__snapcontextDebugLogs ?? []
      },
      '*'
    )
  })
}

async function ensureDebugCollector(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: installMainWorldDebugCollector
    })
  } catch {
    /* Some protected pages do not allow script injection. Capture can continue. */
  }
}

/** Side Panel ?ъ빱????currentWindow媛 鍮꾩뼱 ?덇굅???됰슧?????덉뼱 lastFocusedWindow ?ъ슜 */
function isCapturablePageUrl(url: string | undefined): boolean {
  if (!url) return false
  return /^https?:\/\//i.test(url) || url.startsWith('file://')
}

async function getActiveWebTabForSidePanel(): Promise<
  chrome.tabs.Tab | undefined
> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  })
  if (!tab?.id || tab.windowId === undefined) return undefined
  if (!isCapturablePageUrl(tab.url)) return undefined
  return tab
}

async function broadcastToExtensionPages(
  message: ExtensionMessage
): Promise<void> {
  await chrome.runtime.sendMessage(message)
}

async function sendMessageToTabWithInjection(
  tabId: number,
  message: BackgroundToContentMessage
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message)
    return
  } catch (firstError: unknown) {
    const contentScriptFile =
      chrome.runtime.getManifest().content_scripts?.[0]?.js?.[0]
    if (!contentScriptFile) throw firstError

    await chrome.scripting.executeScript({
      target: { tabId },
      files: [contentScriptFile]
    })
    await chrome.tabs.sendMessage(tabId, message)
  }
}

function openSidePanelFromGesture(
  tabId: number,
  windowId: number | undefined
): void {
  void chrome.sidePanel.open({ tabId }).catch(() => {
    if (windowId === undefined) return
    void chrome.sidePanel.open({ windowId }).catch(() => {
      /* Browser may reject this if the user activation was already consumed. */
    })
  })
}

async function getPageMetaFromTab(
  tabId: number
): Promise<{
  viewport: { width: number; height: number }
  userAgent: string
  debugLogs: CaptureResultPayload['debugLogs']
}> {
  await ensureDebugCollector(tabId)
  try {
    const res = (await chrome.tabs.sendMessage(tabId, {
      type: 'GET_PAGE_META'
    })) as
      | {
          type?: string
          viewport?: { width: number; height: number }
          userAgent?: string
          debugLogs?: CaptureResultPayload['debugLogs']
        }
      | undefined
    if (res?.type === 'PAGE_META' && res.viewport && res.userAgent) {
      return {
        viewport: res.viewport,
        userAgent: res.userAgent,
        debugLogs: res.debugLogs ?? []
      }
    }
  } catch {
    /* Content script may not be loaded; fall through to inline injection. */
  }

  // Fallback: read viewport + UA directly via inline script injection.
  // Works on pages where the registered content script did not respond
  // (e.g. SPA navigations, freshly installed extension before page reload).
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        viewport: { width: window.innerWidth, height: window.innerHeight },
        userAgent: navigator.userAgent
      })
    })
    const value = result?.result as
      | { viewport: { width: number; height: number }; userAgent: string }
      | undefined
    if (value?.viewport && value.userAgent) {
      return {
        viewport: value.viewport,
        userAgent: value.userAgent,
        debugLogs: []
      }
    }
  } catch {
    /* Some protected pages disallow injection. */
  }

  return { viewport: { width: 0, height: 0 }, userAgent: '', debugLogs: [] }
}

async function handleRegionCapture(
  message: Extract<
    ContentToBackgroundMessage,
    { type: 'ELEMENT_SELECTED' | 'DOCUMENT_AREA_FOUND' }
  >,
  tabId: number,
  captureType: 'element' | 'document'
): Promise<void> {
  const tab = await chrome.tabs.get(tabId)
  if (tab.windowId === undefined) {
    throw new Error('탭 창을 찾을 수 없습니다.')
  }
  const fullDataUrl = await captureVisibleTabThrottled(tab.windowId)
  const { dataUrl, width, height } = await cropPngDataUrlWithDpr(
    fullDataUrl,
    message.rect,
    message.devicePixelRatio
  )
  if (width < 1 || height < 1) {
    throw new Error('잘라낼 영역이 비어 있습니다.')
  }

  const payload: CaptureResultPayload = {
    type: 'CAPTURE_RESULT',
    imageData: dataUrl,
    captureType,
    selectedElement: message.selector,
    sourceUrl: tab.url ?? '',
    sourceTitle: tab.title ?? '',
    viewport: message.viewport,
    userAgent: message.userAgent,
    debugLogs: (await getPageMetaFromTab(tabId)).debugLogs,
    imageWidth: width,
    imageHeight: height
  }

  if (captureType === 'document' && commandPendingDocumentCapture) {
    pendingElementCapture = payload
    commandPendingDocumentCapture = false
  }

  if (captureType === 'element') {
    pendingElementCapture = payload
    try {
      await broadcastToExtensionPages(payload)
    } catch {
      /* Panel can still drain the pending payload when it opens. */
    }
    try {
      await chrome.sidePanel.open({ tabId })
    } catch {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId })
      } catch {
        /* sidePanel.open may require a user gesture in some browser versions. */
      }
    }
    try {
      await broadcastToExtensionPages({
        type: 'ELEMENT_CAPTURE_PENDING_READY'
      })
    } catch {
      /* ?⑤꼸 ?놁쓬 ???ъ삤????init?먯꽌 drain */
    }
    return
  }

  await broadcastToExtensionPages(payload)
  if (captureType === 'document') {
    try {
      await broadcastToExtensionPages({
        type: 'ELEMENT_CAPTURE_PENDING_READY'
      })
    } catch {
      /* Side panel can still drain pending payload when it opens. */
    }
  }
}

async function notifySelectCancelledFromContent(): Promise<void> {
  try {
    await broadcastToExtensionPages({ type: 'SELECT_CANCELLED' })
  } catch {
    /* ?ъ씠?쒗뙣?먯씠 ?ロ? ?덉쑝硫??섏떊 痢??놁쓬 */
  }
}

async function cancelSelectFromSidePanel(): Promise<SidePanelResponse> {
  const tab = await getActiveWebTabForSidePanel()
  if (!tab?.id) {
    return {
      type: 'ERROR',
      message:
        '캡처할 페이지를 찾지 못했습니다. 페이지 탭을 열고 다시 시도하세요.'
    }
  }
  try {
    await sendMessageToTabWithInjection(tab.id, { type: 'DISABLE_SELECTOR' })
  } catch {
    /* receiver ?놁쓬 */
  }
  try {
    await sendMessageToTabWithInjection(tab.id, {
      type: 'DISABLE_DOCUMENT_SELECTOR'
    })
  } catch {
    /* receiver ?놁쓬 */
  }
  return { type: 'ACK' }
}

async function routeSidePanelMessage(
  message: SidePanelToBackgroundMessage,
  options: { storePendingResult?: boolean; fallbackTab?: chrome.tabs.Tab } = {}
): Promise<SidePanelResponse> {
  switch (message.type) {
    case 'CAPTURE_VISIBLE': {
      const tab = options.fallbackTab ?? await getActiveWebTabForSidePanel()
      if (!tab?.id || tab.windowId === undefined) {
        return {
          type: 'ERROR',
          message:
            '캡처할 페이지를 찾지 못했습니다. 페이지 탭을 포커스한 뒤 다시 시도하세요.'
        }
      }
      const pageMeta = await getPageMetaFromTab(tab.id)
      const imageData = await captureVisibleTabThrottled(tab.windowId)
      const { width, height } = await getPngDimensionsFromDataUrl(imageData)
      const tabInfo = await chrome.tabs.get(tab.id)
      const payload: CaptureResultPayload = {
        type: 'CAPTURE_RESULT',
        imageData,
        captureType: 'visible',
        sourceUrl: tabInfo.url ?? '',
        sourceTitle: tabInfo.title ?? '',
        viewport: pageMeta.viewport,
        userAgent: pageMeta.userAgent,
        debugLogs: pageMeta.debugLogs,
        imageWidth: width,
        imageHeight: height
      }
      if (options.storePendingResult) {
        pendingElementCapture = payload
      }
      await broadcastToExtensionPages(payload)
      if (options.storePendingResult) {
        try {
          await broadcastToExtensionPages({
            type: 'ELEMENT_CAPTURE_PENDING_READY'
          })
        } catch {
          /* Side panel can still drain the pending payload when it opens. */
        }
      }
      return { type: 'ACK' }
    }
    case 'START_ELEMENT_SELECT': {
      const tab = options.fallbackTab ?? await getActiveWebTabForSidePanel()
      if (!tab?.id) {
        return {
          type: 'ERROR',
          message:
            '캡처할 페이지를 찾지 못했습니다. 페이지 탭을 열고 다시 시도하세요.'
        }
      }
      await ensureDebugCollector(tab.id)
      try {
        await sendMessageToTabWithInjection(tab.id, { type: 'ENABLE_SELECTOR' })
      } catch {
        return {
          type: 'ERROR',
          message:
            '콘텐츠 스크립트에 연결할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요.'
        }
      }
      return { type: 'SELECTOR_STARTED' }
    }
    case 'CAPTURE_DOCUMENT': {
      const tab = options.fallbackTab ?? await getActiveWebTabForSidePanel()
      if (!tab?.id) {
        return {
          type: 'ERROR',
          message:
            '캡처할 페이지를 찾지 못했습니다. 페이지 탭을 열고 다시 시도하세요.'
        }
      }
      await ensureDebugCollector(tab.id)
      if (options.storePendingResult) {
        commandPendingDocumentCapture = true
      }
      try {
        await sendMessageToTabWithInjection(tab.id, {
          type: 'ENABLE_DOCUMENT_SELECTOR'
        })
      } catch {
        if (options.storePendingResult) {
          commandPendingDocumentCapture = false
        }
        return {
          type: 'ERROR',
          message:
            '콘텐츠 스크립트에 연결할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요.'
        }
      }
      return { type: 'DOCUMENT_SCAN_STARTED' }
    }
    case 'CANCEL_SELECT':
      return cancelSelectFromSidePanel()
    case 'CAPTURE_FULL_PAGE':
      return handleFullPageCapture({
        fallbackTab: options.fallbackTab,
        storePendingResult: options.storePendingResult
      })
    case 'GET_PENDING_ELEMENT_CAPTURE': {
      const payload = pendingElementCapture
      pendingElementCapture = null
      return { type: 'PENDING_ELEMENT_CAPTURE', payload }
    }
    default: {
      const _exhaustive: never = message
      return _exhaustive
    }
  }
}

const FULL_PAGE_MAX_HEIGHT_PX = 15000
const FULL_PAGE_SCROLL_SETTLE_MS = 250
const FULL_PAGE_FIRST_FRAME_SETTLE_MS = 150
// chrome.tabs.captureVisibleTab is rate-limited to ~2 calls/sec on MV3.
// 510ms keeps us just above the 500ms floor so we don't hit the quota error.
const CAPTURE_VISIBLE_TAB_THROTTLE_MS = 510

let lastCaptureVisibleTabAt = 0
let captureVisibleTabQueue: Promise<void> = Promise.resolve()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function captureVisibleTabThrottled(windowId: number): Promise<string> {
  const run = async (): Promise<string> => {
    const elapsed = Date.now() - lastCaptureVisibleTabAt
    if (elapsed < CAPTURE_VISIBLE_TAB_THROTTLE_MS) {
      await sleep(CAPTURE_VISIBLE_TAB_THROTTLE_MS - elapsed)
    }
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: 'png'
    })
    lastCaptureVisibleTabAt = Date.now()
    return dataUrl
  }

  const result = captureVisibleTabQueue.then(run, run)
  captureVisibleTabQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

type FullPageMetrics = {
  scrollHeight: number
  viewportHeight: number
  viewportWidth: number
  devicePixelRatio: number
  capturedHeight: number
  truncated: boolean
}

async function measureFullPage(tabId: number): Promise<FullPageMetrics> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (maxHeight: number) => {
      const doc = document.documentElement
      const body = document.body
      const fullHeight = Math.max(
        doc.scrollHeight,
        doc.offsetHeight,
        body?.scrollHeight ?? 0,
        body?.offsetHeight ?? 0
      )
      const captured = Math.min(fullHeight, maxHeight)
      return {
        scrollHeight: fullHeight,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        devicePixelRatio: window.devicePixelRatio || 1,
        capturedHeight: captured,
        truncated: fullHeight > maxHeight
      }
    },
    args: [FULL_PAGE_MAX_HEIGHT_PX]
  })
  return result.result as FullPageMetrics
}

async function preparePageForFullPageCapture(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Stash original styles so we can restore later.
      type Stash = { html: string; body: string; fixed: Array<{ el: HTMLElement; visibility: string }> }
      const stash: Stash = {
        html: document.documentElement.style.cssText,
        body: document.body?.style.cssText ?? '',
        fixed: []
      }
      ;(window as unknown as { __snapcontextFullPageStash?: Stash }).__snapcontextFullPageStash = stash
      document.documentElement.style.scrollBehavior = 'auto'
      if (document.body) {
        document.body.style.scrollBehavior = 'auto'
      }
    }
  })
}

async function scrollAndHideFixed(
  tabId: number,
  scrollY: number,
  hideFixed: boolean
): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (y: number, doHide: boolean) => {
      type Stash = {
        html: string
        body: string
        fixed: Array<{ el: HTMLElement; visibility: string }>
      }
      const w = window as unknown as { __snapcontextFullPageStash?: Stash }
      const stash = w.__snapcontextFullPageStash
      // Restore previously hidden fixed elements before this step.
      if (stash) {
        for (const entry of stash.fixed) {
          entry.el.style.visibility = entry.visibility
        }
        stash.fixed = []
      }
      if (doHide && stash) {
        const all = document.querySelectorAll<HTMLElement>('body *')
        for (const el of Array.from(all)) {
          const cs = getComputedStyle(el)
          if (cs.position === 'fixed' || cs.position === 'sticky') {
            stash.fixed.push({ el, visibility: el.style.visibility })
            el.style.visibility = 'hidden'
          }
        }
      }
      window.scrollTo(0, y)
    },
    args: [scrollY, hideFixed]
  })
}

async function restoreAfterFullPageCapture(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      type Stash = {
        html: string
        body: string
        fixed: Array<{ el: HTMLElement; visibility: string }>
      }
      const w = window as unknown as { __snapcontextFullPageStash?: Stash }
      const stash = w.__snapcontextFullPageStash
      if (stash) {
        for (const entry of stash.fixed) {
          entry.el.style.visibility = entry.visibility
        }
        document.documentElement.style.cssText = stash.html
        if (document.body) {
          document.body.style.cssText = stash.body
        }
        delete w.__snapcontextFullPageStash
      }
      window.scrollTo(0, 0)
    }
  })
}

async function stitchChunks(
  chunks: Array<{ dataUrl: string; offsetY: number }>,
  imageWidth: number,
  imageHeight: number
): Promise<{ dataUrl: string; width: number; height: number }> {
  const canvas = new OffscreenCanvas(imageWidth, imageHeight)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('OffscreenCanvas 2D 컨텍스트를 얻지 못했습니다.')

  for (const chunk of chunks) {
    const res = await fetch(chunk.dataUrl)
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    ctx.drawImage(bitmap, 0, chunk.offsetY)
    bitmap.close()
  }

  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('PNG 인코딩 실패'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
  return { dataUrl, width: imageWidth, height: imageHeight }
}

async function handleFullPageCapture(
  options: { fallbackTab?: chrome.tabs.Tab; storePendingResult?: boolean } = {}
): Promise<SidePanelResponse> {
  const fallbackTab =
    options.fallbackTab?.id &&
    options.fallbackTab.windowId !== undefined &&
    isCapturablePageUrl(options.fallbackTab.url)
      ? options.fallbackTab
      : undefined
  const tab = fallbackTab ?? await getActiveWebTabForSidePanel()
  if (!tab?.id || tab.windowId === undefined) {
    return {
      type: 'ERROR',
      message:
        '캡처할 페이지를 찾지 못했습니다. 페이지 탭을 포커스한 뒤 다시 시도하세요.'
    }
  }

  const tabId = tab.id
  const windowId = tab.windowId

  void runFullPageCapture(tabId, windowId, {
    storePendingResult: options.storePendingResult
  }).catch(async (err) => {
    const message =
      err instanceof Error ? err.message : '전체 캡처에 실패했습니다.'
    try {
      await restoreAfterFullPageCapture(tabId)
    } catch {
      /* best effort */
    }
    await broadcastToExtensionPages({
      type: 'FULL_PAGE_CAPTURE_FAILED',
      message
    })
  })
  return { type: 'FULL_PAGE_CAPTURE_STARTED' }
}

async function runFullPageCapture(
  tabId: number,
  windowId: number,
  options: { storePendingResult?: boolean } = {}
): Promise<void> {
  await ensureDebugCollector(tabId)
  const metrics = await measureFullPage(tabId)
  const dpr = metrics.devicePixelRatio
  const imageWidth = Math.round(metrics.viewportWidth * dpr)
  const imageHeight = Math.round(metrics.capturedHeight * dpr)

  await preparePageForFullPageCapture(tabId)

  const chunks: Array<{ dataUrl: string; offsetY: number }> = []
  let scrollY = 0
  let isFirst = true

  try {
    while (scrollY < metrics.capturedHeight) {
      // Hide fixed/sticky elements after the first frame so they don't
      // ghost across every chunk.
      await scrollAndHideFixed(tabId, scrollY, !isFirst)
      await sleep(
        isFirst ? FULL_PAGE_FIRST_FRAME_SETTLE_MS : FULL_PAGE_SCROLL_SETTLE_MS
      )

      const dataUrl = await captureVisibleTabThrottled(windowId)

      const offsetY = Math.round(scrollY * dpr)
      const remaining = metrics.capturedHeight - scrollY
      // For the last chunk, crop the bottom slice to avoid duplicating
      // already-captured content if remaining < viewportHeight.
      if (remaining < metrics.viewportHeight && !isFirst) {
        const cropTopCss = metrics.viewportHeight - remaining
        const { dataUrl: cropped } = await cropPngDataUrlWithDpr(
          dataUrl,
          {
            x: 0,
            y: cropTopCss,
            width: metrics.viewportWidth,
            height: remaining,
            top: cropTopCss,
            left: 0,
            right: metrics.viewportWidth,
            bottom: cropTopCss + remaining
          },
          dpr
        )
        chunks.push({ dataUrl: cropped, offsetY })
      } else {
        chunks.push({ dataUrl, offsetY })
      }

      scrollY += metrics.viewportHeight
      isFirst = false
      await sleep(CAPTURE_VISIBLE_TAB_THROTTLE_MS)
    }
  } finally {
    await restoreAfterFullPageCapture(tabId)
  }

  const { dataUrl, width, height } = await stitchChunks(
    chunks,
    imageWidth,
    imageHeight
  )

  const tabInfo = await chrome.tabs.get(tabId)
  const pageMeta = await getPageMetaFromTab(tabId)
  const payload: CaptureResultPayload = {
    type: 'CAPTURE_RESULT',
    imageData: dataUrl,
    captureType: 'full-page',
    sourceUrl: tabInfo.url ?? '',
    sourceTitle: tabInfo.title ?? '',
    viewport: pageMeta.viewport,
    userAgent: pageMeta.userAgent,
    debugLogs: pageMeta.debugLogs,
    imageWidth: width,
    imageHeight: height
  }
  if (options.storePendingResult) {
    pendingElementCapture = payload
  }
  await broadcastToExtensionPages(payload)
  if (options.storePendingResult) {
    try {
      await broadcastToExtensionPages({
        type: 'ELEMENT_CAPTURE_PENDING_READY'
      })
    } catch {
      /* Side panel can still drain the pending payload when it opens. */
    }
  }

  if (metrics.truncated) {
    await broadcastToExtensionPages({
      type: 'FULL_PAGE_CAPTURE_TRUNCATED',
      cappedAtPx: FULL_PAGE_MAX_HEIGHT_PX
    })
  }
}

const commandToMessage: Record<
  string,
  Extract<
    SidePanelToBackgroundMessage,
    | { type: 'CAPTURE_VISIBLE' }
    | { type: 'START_ELEMENT_SELECT' }
    | { type: 'CAPTURE_DOCUMENT' }
    | { type: 'CAPTURE_FULL_PAGE' }
  >
> = {
  'capture-visible': { type: 'CAPTURE_VISIBLE' },
  'capture-element': { type: 'START_ELEMENT_SELECT' },
  'capture-document': { type: 'CAPTURE_DOCUMENT' },
  'capture-full-page': { type: 'CAPTURE_FULL_PAGE' }
}

async function handleCommand(
  command: string,
  gestureTab?: chrome.tabs.Tab
): Promise<void> {
  if (command === 'copy-png') {
    try {
      await broadcastToExtensionPages({ type: 'COPY_PNG_COMMAND' })
    } catch {
      /* Side panel is not open or cannot receive the command. */
    }
    return
  }

  const message = commandToMessage[command]
  if (!message) return

  // Open side panel BEFORE any await to preserve the user gesture token.
  // chrome.sidePanel.open() requires a user gesture; awaiting anything first
  // (e.g. chrome.tabs.query) consumes the gesture and the open call fails.
  if (gestureTab?.id) {
    openSidePanelFromGesture(gestureTab.id, gestureTab.windowId)
  } else {
    const tab = await getActiveWebTabForSidePanel()
    if (tab?.id) {
      openSidePanelFromGesture(tab.id, tab.windowId)
    }
  }

  const result = await routeSidePanelMessage(message, {
    storePendingResult: true,
    fallbackTab: gestureTab
  })
  if (result.type === 'ERROR' && message.type === 'CAPTURE_DOCUMENT') {
    commandPendingDocumentCapture = false
  }
}

function respondSidePanelAsync(
  work: Promise<SidePanelResponse>,
  sendResponse: (r: SidePanelResponse | ContentAck) => void
): void {
  void work
    .then((result) => {
      sendResponse(result)
    })
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      sendResponse({ type: 'ERROR', message: msg })
    })
}

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender,
    sendResponse: (r: SidePanelResponse | ContentAck) => void
  ) => {
    if (isElementSelected(message)) {
      void (async (): Promise<void> => {
        let tabId = sender.tab?.id
        if (tabId === undefined) {
          const t = await getActiveWebTabForSidePanel()
          tabId = t?.id
        }
        if (tabId === undefined) {
          sendResponse({ ok: false, error: '선택할 대상 탭을 찾을 수 없습니다.' })
          return
        }
        openSidePanelFromGesture(tabId, sender.tab?.windowId)
        try {
          await handleRegionCapture(message, tabId, 'element')
          sendResponse({ ok: true })
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          sendResponse({ ok: false, error: msg })
        }
      })()
      return true
    }

    if (isDocumentAreaFound(message)) {
      void (async (): Promise<void> => {
        let tabId = sender.tab?.id
        if (tabId === undefined) {
          const t = await getActiveWebTabForSidePanel()
          tabId = t?.id
        }
        if (tabId === undefined) {
          sendResponse({ ok: false, error: '본문 영역을 검사할 탭을 찾을 수 없습니다.' })
          return
        }
        try {
          await handleRegionCapture(message, tabId, 'document')
          sendResponse({ ok: true })
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          sendResponse({ ok: false, error: msg })
        }
      })()
      return true
    }

    if (message.type === 'DOCUMENT_AREA_NOT_FOUND') {
      void (async (): Promise<void> => {
        try {
          await broadcastToExtensionPages({ type: 'DOCUMENT_AREA_NOT_FOUND' })
        } catch {
          /* listener ?놁쓬 */
        }
        sendResponse({ ok: true })
      })()
      return true
    }

    if (message.type === 'CANCEL_SELECT') {
      if (isCancelSelectFromWebContent(sender)) {
        void notifySelectCancelledFromContent().then(() =>
          sendResponse({ ok: true })
        )
      } else {
        respondSidePanelAsync(cancelSelectFromSidePanel(), sendResponse)
      }
      return true
    }

    if (isSidePanelCaptureCommand(message)) {
      respondSidePanelAsync(routeSidePanelMessage(message), sendResponse)
      return true
    }

    sendResponse({
      type: 'ERROR',
      message: '처리되지 않은 메시지입니다.'
    })
    return true
  }
)

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

chrome.commands.onCommand.addListener((command, tab) => {
  void handleCommand(command, tab)
})
