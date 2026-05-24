import type {
  CaptureResultPayload,
  ContextPack,
  ExtensionMessage,
  PinItem
} from '../types'
import { generateContextPack } from '../context-pack/generator'
import * as history from '../storage/history'
import { sendToBackground } from '../utils/messaging'
import type { ContextPackPanelApi } from './components/ContextPackPanel'
import { mountCaptureToolbar } from './components/CaptureToolbar'
import { mountContextPackPanel } from './components/ContextPackPanel'
import { mountHistoryList } from './components/HistoryList'
import { mountImageActions } from './components/ImageActions'
import { mountPinLayer } from './components/PinAnnotation'
import { mountPinMemoList } from './components/PinMemoList'
import { mountPreview } from './components/Preview'
import { mountShortcutsHelp } from './components/ShortcutsHelp'
import './styles/global.css'
import { showConfirm } from './confirm-dialog'
import { showToast } from './toast'

function init(): void {
  const app = document.getElementById('app')
  if (!app) return

  let capturedImage: string | null = null
  let captureSnapshot: CaptureResultPayload | null = null
  let pins: PinItem[] = []
  let activePinId: number | null = null
  let currentHistoryId: string | null = null
  let currentHistoryTimestamp = ''
  let historyPersistTimer: number | null = null
  let lastSaveCaptureTask: Promise<void> = Promise.resolve()
  // Tracks the most recently *user-clicked* pin (NOT the auto-selected pin
  // after an add). When the user clicks the same pin twice consecutively,
  // the second click triggers delete instead of select. Reset on add/delete
  // so a fresh pin always needs an explicit first click before delete.
  let lastClickedPinId: number | null = null

  const packRef: { api: ContextPackPanelApi | null } = { api: null }

  const toastRoot = document.createElement('div')
  toastRoot.id = 'toast-root'
  toastRoot.className = 'toast-root'

  const shell = document.createElement('div')
  shell.className = 'app-shell'

  const header = document.createElement('header')
  header.className = 'app-header'
  const title = document.createElement('h1')
  title.className = 'app-title'
  title.textContent = 'SnapContext'
  const sub = document.createElement('p')
  sub.className = 'app-sub'
  sub.textContent = 'v0.1.3'
  header.append(title, sub)

  const toolbarHost = document.createElement('div')
  const selectionBanner = document.createElement('div')
  selectionBanner.className = 'selection-banner'
  selectionBanner.hidden = true
  selectionBanner.innerHTML = `
    <div class="selection-banner__row">
      <p class="selection-banner__text">페이지에서 요소를 클릭하세요. <kbd>Esc</kbd>로 취소할 수 있습니다.</p>
      <button type="button" class="selection-banner__cancel">취소</button>
    </div>
  `

  const previewHost = document.createElement('div')
  const imageActionsHost = document.createElement('div')
  const pinMemoHost = document.createElement('div')
  const packHost = document.createElement('div')
  const historyHost = document.createElement('div')
  const shortcutsHost = document.createElement('div')

  // Progressive disclosure: hide pin memo + AI debug pack until first capture.
  // ImageActions hides itself based on hasCapture(); history stays visible to
  // let users reload prior packs.
  pinMemoHost.hidden = true
  packHost.hidden = true

  shell.append(
    header,
    toastRoot,
    toolbarHost,
    selectionBanner,
    previewHost,
    imageActionsHost,
    pinMemoHost,
    packHost,
    historyHost,
    shortcutsHost
  )

  app.append(shell)

  const preview = mountPreview(previewHost, {
    canPin: () => preview.hasImage(),
    getPins: () => pins,
    getActivePinId: () => activePinId,
    onAddPin: (x: number, y: number) => {
      const nextId = pins.length + 1
      pins = [...pins, { id: nextId, x, y, memo: '' }]
      activePinId = nextId
      refreshPins()
      memoList.focusMemo(nextId)
      syncPinOutputs()
    },
    onDeletePin: (pinId: number) => {
      pins = pins
        .filter((p) => p.id !== pinId)
        .map((p, i) => ({ ...p, id: i + 1 }))
      activePinId = null
      refreshPins()
      syncPinOutputs()
    },
    onSelectPin: (pinId: number) => {
      activePinId = pinId
      // Active-pin only; preserve focused memo textarea (see onFocusPin note).
      pinLayerMain.render(pins, activePinId)
      memoList.highlightRow(pinId)
      preview.refreshImageLightbox()
    }
  })

  previewHost.addEventListener('snapcontext:pin-lightbox-open', () => {
    refreshPins()
  })

  const memoList = mountPinMemoList(pinMemoHost, {
    onMemoChange: (pinId, memo) => {
      pins = pins.map((p) => (p.id === pinId ? { ...p, memo } : p))
      syncPinOutputs({ debounceHistory: true })
    },
    onDelete: (pinId) => {
      pins = pins
        .filter((p) => p.id !== pinId)
        .map((p, i) => ({ ...p, id: i + 1 }))
      activePinId = null
      refreshPins()
      syncPinOutputs()
    },
    onFocusPin: (pinId) => {
      activePinId = pinId
      // Do NOT call refreshPins() here — that calls memoList.render() which
      // destroys and recreates every textarea, killing focus and dropping
      // any keystrokes that arrive next. Just update the active highlight
      // and re-render the pin badges (which are not focused inputs).
      pinLayerMain.render(pins, activePinId)
      memoList.highlightRow(pinId)
      preview.refreshImageLightbox()
    }
  })

  /** Full re-render. Use only when pin set changes (add / delete / reorder). */
  function refreshPins(): void {
    pinLayerMain.render(pins, activePinId)
    memoList.render(pins, activePinId)
    preview.refreshImageLightbox()
  }

  function buildHistoryContextPack(): ContextPack | null {
    if (!currentHistoryId || !captureSnapshot || !capturedImage) return null
    const pack = generateContextPack({
      imageBase64: capturedImage,
      captureType: captureSnapshot.captureType,
      selectedElement: captureSnapshot.selectedElement,
      pins,
      sourceUrl: captureSnapshot.sourceUrl,
      sourceTitle: captureSnapshot.sourceTitle,
      viewport: captureSnapshot.viewport,
      userAgent: captureSnapshot.userAgent,
      debugLogs: captureSnapshot.debugLogs,
      imageWidth: captureSnapshot.imageWidth,
      imageHeight: captureSnapshot.imageHeight
    })
    pack.id = currentHistoryId
    if (currentHistoryTimestamp) {
      pack.source.capturedAt = currentHistoryTimestamp
    }
    return pack
  }

  function persistHistoryPins(): void {
    const pack = buildHistoryContextPack()
    if (!currentHistoryId || !pack) return
    const historyId = currentHistoryId
    const pinsCount = pins.length
    void lastSaveCaptureTask
      .then(() =>
        history.updateCaptureAnnotations(historyId, {
          pinsCount,
          contextPack: pack
        })
      )
      .catch(() => {
        /* History persistence must not block the current capture workflow. */
      })
  }

  function persistHistoryPinsDebounced(): void {
    if (historyPersistTimer !== null) {
      window.clearTimeout(historyPersistTimer)
    }
    historyPersistTimer = window.setTimeout(() => {
      historyPersistTimer = null
      persistHistoryPins()
    }, 400)
  }

  function syncPinOutputs(options: { debounceHistory?: boolean } = {}): void {
    packRef.api?.sync()
    if (options.debounceHistory) {
      persistHistoryPinsDebounced()
      return
    }
    persistHistoryPins()
  }

  const pinHandlers = {
    canPin: () => preview.hasImage(),
    onAddPin: (x: number, y: number) => {
      const nextId = pins.length + 1
      pins = [...pins, { id: nextId, x, y, memo: '' }]
      activePinId = nextId
      lastClickedPinId = null
      refreshPins()
      memoList.focusMemo(nextId)
      syncPinOutputs()
    },
    onSelectPin: (pinId: number) => {
      // Two consecutive clicks on the same pin = delete.
      if (lastClickedPinId === pinId) {
        pins = pins
          .filter((p) => p.id !== pinId)
          .map((p, i) => ({ ...p, id: i + 1 }))
        activePinId = null
        lastClickedPinId = null
        refreshPins()
        syncPinOutputs()
        return
      }
      lastClickedPinId = pinId
      activePinId = pinId
      // Active-pin update only — keep existing memo textareas alive so the
      // user does not lose focus / typed text when a pin is reselected.
      pinLayerMain.render(pins, activePinId)
      memoList.highlightRow(pinId)
      memoList.focusMemo(pinId)
      preview.refreshImageLightbox()
    },
    onDeletePin: (pinId: number) => {
      pins = pins
        .filter((p) => p.id !== pinId)
        .map((p, i) => ({ ...p, id: i + 1 }))
      activePinId = null
      lastClickedPinId = null
      refreshPins()
      syncPinOutputs()
    }
  }

  const pinLayerMain = mountPinLayer(
    preview.pinContainer,
    preview.imageEl,
    pinHandlers
  )

  const imageActions = mountImageActions(imageActionsHost, {
    hasCapture: () => capturedImage !== null,
    getImage: () => capturedImage,
    getPins: () => pins,
    showToast
  })

  packRef.api = mountContextPackPanel(packHost, {
    hasCapture: () => capturedImage !== null,
    buildInput: () => {
      if (!captureSnapshot || !capturedImage) return null
      return {
        imageBase64: capturedImage,
        captureType: captureSnapshot.captureType,
        selectedElement: captureSnapshot.selectedElement,
        pins,
        sourceUrl: captureSnapshot.sourceUrl,
        sourceTitle: captureSnapshot.sourceTitle,
        viewport: captureSnapshot.viewport,
        userAgent: captureSnapshot.userAgent,
        debugLogs: captureSnapshot.debugLogs,
        imageWidth: captureSnapshot.imageWidth,
        imageHeight: captureSnapshot.imageHeight
      }
    },
    showToast
  })

  mountHistoryList(historyHost, {
    onOpen: (item) => {
      // Restore capture image to preview.
      const imageData = item.imageBase64 ?? item.thumbnail
      if (!imageData) {
        showToast('이 캡처에는 저장된 이미지가 없습니다.', 'error')
        return
      }

      // Parse image dimensions from contextPack if available.
      let imageWidth = 0
      let imageHeight = 0
      if (item.contextPack?.capture.imageSize) {
        const [w, h] = item.contextPack.capture.imageSize.split('x').map(Number)
        imageWidth = w || 0
        imageHeight = h || 0
      }

      // Restore pins from contextPack annotations.
      const restoredPins = (item.contextPack?.annotations ?? []).map((a) => ({
        id: a.id,
        x: a.position.x,
        y: a.position.y,
        memo: a.memo ?? ''
      }))

      // Build a CaptureResultPayload-like snapshot for the pack panel.
      const viewport = item.contextPack?.capture.viewport
        ? (() => {
            const [w, h] = item.contextPack.capture.viewport.split('x').map(Number)
            return { width: w || 0, height: h || 0 }
          })()
        : { width: 0, height: 0 }

      captureSnapshot = {
        type: 'CAPTURE_RESULT',
        imageData,
        captureType: item.captureType,
        selectedElement: item.contextPack?.capture.selectedElement,
        sourceUrl: item.url,
        sourceTitle: item.title,
        viewport,
        userAgent: '',
        debugLogs: item.contextPack?.debugLogs ?? [],
        imageWidth,
        imageHeight
      }
      capturedImage = imageData
      currentHistoryId = item.id
      currentHistoryTimestamp = item.timestamp
      lastSaveCaptureTask = Promise.resolve()

      // Apply to preview.
      preview.setImage({
        dataUrl: imageData,
        captureType: item.captureType,
        imageWidth,
        imageHeight
      })

      // Restore pins.
      pins = restoredPins
      activePinId = null
      refreshPins()

      // Sync panels.
      pinMemoHost.hidden = false
      packHost.hidden = false
      imageActions.sync()
      if (item.contextPack) {
        packRef.api?.loadPack(item.contextPack)
      }
      packRef.api?.sync()

      showToast('캡처를 불러왔습니다.', 'info')
    },
    showToast
  })

  mountShortcutsHelp(shortcutsHost)

  const maybeConfirmClearPins = async (): Promise<boolean> => {
    if (pins.length === 0) return true
    return showConfirm(
      '새 캡처를 시작하면 기존 핀이 삭제됩니다. 계속할까요?',
      app
    )
  }

  const resetPinsUi = (): void => {
    pins = []
    activePinId = null
    refreshPins()
  }

  const applyCapturePayload = (payload: CaptureResultPayload): void => {
    captureSnapshot = payload
    capturedImage = payload.imageData
    preview.setImage({
      dataUrl: capturedImage,
      captureType: payload.captureType,
      imageWidth: payload.imageWidth,
      imageHeight: payload.imageHeight
    })
    packRef.api?.resetPack()
    packRef.api?.sync()
    imageActions.sync()
    pinMemoHost.hidden = false
    packHost.hidden = false
    try {
      const contextPack = generateContextPack({
        imageBase64: payload.imageData,
        captureType: payload.captureType,
        selectedElement: payload.selectedElement,
        pins: [],
        sourceUrl: payload.sourceUrl,
        sourceTitle: payload.sourceTitle,
        viewport: payload.viewport,
        userAgent: payload.userAgent,
        debugLogs: payload.debugLogs,
        imageWidth: payload.imageWidth,
        imageHeight: payload.imageHeight
      })
      currentHistoryId = contextPack.id
      currentHistoryTimestamp = contextPack.source.capturedAt
      lastSaveCaptureTask = history.saveCapture({
        id: contextPack.id,
        timestamp: contextPack.source.capturedAt,
        url: payload.sourceUrl,
        title: payload.sourceTitle,
        captureType: payload.captureType,
        imageBase64: payload.imageData,
        pinsCount: 0,
        contextPack
      }).catch(() => {
        showToast('캡처 기록을 저장하지 못했습니다.', 'error')
      })
    } catch {
      /* Capture display should not fail if history persistence cannot start. */
    }
  }

  const setSelectingUi = (active: boolean): void => {
    selectionBanner.hidden = !active
  }

  const cancelBtn = selectionBanner.querySelector<HTMLButtonElement>(
    '.selection-banner__cancel'
  )
  cancelBtn?.addEventListener('click', () => {
    void (async () => {
      const res = await sendToBackground({ type: 'CANCEL_SELECT' })
      if (res.type === 'ERROR') {
        showToast(res.message, 'error')
      }
      setSelectingUi(false)
    })()
  })

  const drainPendingElementCapture = async (): Promise<void> => {
    const res = await sendToBackground({
      type: 'GET_PENDING_ELEMENT_CAPTURE'
    })
    if (res.type === 'ERROR') return
    if (res.type !== 'PENDING_ELEMENT_CAPTURE') return
    if (!res.payload) return
    if (res.payload.imageData === capturedImage) {
      setSelectingUi(false)
      return
    }
    try {
      resetPinsUi()
      applyCapturePayload(res.payload)
      setSelectingUi(false)
      showToast('요소 캡처 완료', 'info')
    } catch {
      showToast('캡처 결과를 표시하지 못했습니다.', 'error')
    }
  }

  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === 'ELEMENT_CAPTURE_PENDING_READY') {
      void drainPendingElementCapture()
      return
    }
    if (message.type === 'CAPTURE_RESULT') {
      void (async (): Promise<void> => {
        try {
          resetPinsUi()
          applyCapturePayload(message)
          const msg =
            message.captureType === 'document'
              ? '문서 캡처 완료'
              : message.captureType === 'visible'
                ? '화면 캡처 완료'
                : message.captureType === 'full-page'
                  ? '전체 캡처 완료'
                  : '요소 캡처 완료'
          showToast(msg, 'info')
        } catch {
          showToast('캡처 결과를 표시하지 못했습니다.', 'error')
        } finally {
          setSelectingUi(false)
        }
      })()
      return
    }
    if (message.type === 'COPY_PNG_COMMAND') {
      void imageActions.copyPng()
      return
    }
    if (message.type === 'FULL_PAGE_CAPTURE_FAILED') {
      showToast(message.message, 'error')
      return
    }
    if (message.type === 'FULL_PAGE_CAPTURE_TRUNCATED') {
      showToast(
        `페이지가 너무 길어 ${message.cappedAtPx}px까지 캡처했습니다.`,
        'info'
      )
      return
    }
    if (message.type === 'SELECT_CANCELLED') {
      setSelectingUi(false)
      showToast('요소 선택이 취소되었습니다.', 'info')
      return
    }
    if (message.type === 'DOCUMENT_AREA_NOT_FOUND') {
      showToast(
        '본문 영역을 찾지 못했습니다. 화면 캡처를 사용해주세요.',
        'error'
      )
    }
  })

  mountCaptureToolbar(toolbarHost, {
    onVisible: async () => {
      if (!(await maybeConfirmClearPins())) return
      resetPinsUi()
      const res = await sendToBackground({ type: 'CAPTURE_VISIBLE' })
      if (res.type === 'ERROR') {
        showToast(res.message, 'error')
        return
      }
      if (res.type !== 'ACK') {
        showToast('예기치 않은 응답입니다.', 'error')
        return
      }
    },
    onElement: async () => {
      if (!(await maybeConfirmClearPins())) return
      const res = await sendToBackground({
        type: 'START_ELEMENT_SELECT'
      })
      if (res.type === 'ERROR') {
        showToast(res.message, 'error')
        return
      }
      if (res.type === 'SELECTOR_STARTED') {
        setSelectingUi(true)
        return
      }
      showToast('예기치 않은 응답입니다.', 'error')
    },
    onDocument: async () => {
      if (!(await maybeConfirmClearPins())) return
      const res = await sendToBackground({ type: 'CAPTURE_DOCUMENT' })
      if (res.type === 'ERROR') {
        showToast(res.message, 'error')
        return
      }
      if (res.type === 'DOCUMENT_SCAN_STARTED') {
        return
      }
      showToast('예기치 않은 응답입니다.', 'error')
    },
    onFullPage: async () => {
      if (!(await maybeConfirmClearPins())) return
      resetPinsUi()
      const res = await sendToBackground({ type: 'CAPTURE_FULL_PAGE' })
      if (res.type === 'ERROR') {
        showToast(res.message, 'error')
        return
      }
      if (res.type === 'FULL_PAGE_CAPTURE_STARTED') {
        showToast('전체 페이지 캡처 중...', 'info')
        return
      }
      if (res.type !== 'ACK') {
        showToast('예기치 않은 응답입니다.', 'error')
      }
    }
  })

  void drainPendingElementCapture()
}

document.addEventListener('DOMContentLoaded', init)
