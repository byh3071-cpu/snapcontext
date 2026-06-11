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
import { mkSecHead } from './utils/section'
import './styles/global.css'
import { showConfirm } from './confirm-dialog'
import { showToast } from './toast'

/* 마스트헤드 정적 마크업 — 디자인 SoT(docs/ui-audit/swiss/snapcontext.html) 1:1.
   SVG는 mockup 검증본 그대로(브랜드 블록 잉크 마크 + 톱니). */
const BRAND_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M5 5h14v14" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="square"/>' +
  '<path d="M5 12v7h7" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="square"/></svg>'

const GEAR_SVG =
  '<svg class="ic ic-soft" viewBox="0 0 24 24" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="3"/>' +
  '<path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l1.7-1.3-1.8-3.1-2 .8a7.7 7.7 0 0 0-2.6-1.5l-.3-2.1H7.6l-.3 2.1a7.7 7.7 0 0 0-2.6 1.5l-2-.8L.9 9.2l1.7 1.3a7.8 7.8 0 0 0 0 3L.9 14.8l1.8 3.1 2-.8a7.7 7.7 0 0 0 2.6 1.5l.3 2.1h4.8l.3-2.1a7.7 7.7 0 0 0 2.6-1.5l2 .8 1.8-3.1-1.7-1.3Z"/></svg>'

function buildMasthead(): { masthead: HTMLElement; settingsBtn: HTMLButtonElement } {
  const masthead = document.createElement('header')
  masthead.className = 'masthead'
  const version = chrome.runtime?.getManifest?.().version ?? ''
  masthead.innerHTML = `
    <div class="mast-top">
      <span class="brand-block" aria-hidden="true">${BRAND_SVG}</span>
      <div class="wordmark">
        <h1>SnapContext</h1>
        <div class="tag">
          <span class="ver tnum">v${version}</span>
          <span class="kicker">화면 → 컨텍스트</span>
        </div>
      </div>
      <button class="icon-btn" type="button" data-role="settings"
        aria-label="설정 / 도움말: 단축키" title="설정 / 도움말: 단축키"
        aria-expanded="false" aria-controls="help-panel">${GEAR_SVG}</button>
    </div>
    <div class="mast-meta" aria-hidden="true">
      <span class="tnum latin">CHROME · WHALE MV3</span>
      <span class="slash">/</span>
      <span class="mm-strong"><span class="tnum latin">4</span> 캡처 모드</span>
    </div>
    <div class="mast-hero" aria-hidden="true">
      <div class="hero-stack">
        <span class="hero-word disp">SNAP</span>
        <span class="hero-sub disp">Context</span>
      </div>
      <div class="hero-side">
        <div class="hs-line">캡처<span class="hs-arrow"> → </span>프롬프트</div>
        <div class="hs-line tnum">5 단축키 · 핀 메모</div>
      </div>
    </div>`
  const settingsBtn = masthead.querySelector<HTMLButtonElement>('[data-role="settings"]')
  if (!settingsBtn) throw new Error('masthead settings button missing')
  return { masthead, settingsBtn }
}

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

  const panel = document.createElement('div')
  panel.className = 'panel'

  const { masthead, settingsBtn } = buildMasthead()
  mountShortcutsHelp(masthead, settingsBtn)

  const main = document.createElement('main')
  main.className = 'scroll'

  /* ---- §01 캡처 모드 ---- */
  const secCap = document.createElement('section')
  secCap.className = 'sec'
  secCap.setAttribute('aria-labelledby', 'sec-cap-title')
  secCap.append(
    mkSecHead({
      num: '01',
      eyebrow: '캡처 모드',
      title: '화면을 잡아 컨텍스트로',
      titleId: 'sec-cap-title',
      asideText: '5 단축키'
    }).head
  )
  const toolbarHost = document.createElement('div')
  const selectionBanner = document.createElement('div')
  selectionBanner.className = 'selection-banner'
  selectionBanner.hidden = true
  selectionBanner.innerHTML = `
    <div class="selection-banner__row">
      <p class="selection-banner__text">페이지에서 요소를 클릭하세요. <kbd>Esc</kbd>로 취소할 수 있습니다.</p>
      <button type="button" class="ghost-btn selection-banner__cancel">취소</button>
    </div>
  `
  secCap.append(toolbarHost, selectionBanner)

  /* ---- §02 미리보기 (Preview가 sec-head + pv-card 구성) ---- */
  const secPreview = document.createElement('section')
  secPreview.className = 'sec sec--minor'
  secPreview.setAttribute('aria-labelledby', 'sec-pv-title')

  /* ---- §03 컨텍스트 팩 (ContextPackPanel이 sec-head 구성) ---- */
  const secPack = document.createElement('section')
  secPack.className = 'sec'
  secPack.setAttribute('aria-labelledby', 'sec-pack-title')

  /* ---- §04 공유 (ImageActions가 sec-head + 발행 블록 구성) ---- */
  const secShare = document.createElement('section')
  secShare.className = 'sec sec--minor'
  secShare.setAttribute('aria-labelledby', 'sec-share-title')

  /* ---- §05 캡처 기록 (HistoryList가 sec-head 구성) ---- */
  const secHistory = document.createElement('section')
  secHistory.className = 'sec'
  secHistory.setAttribute('aria-labelledby', 'sec-hist-title')

  const pinMemoHost = document.createElement('div')

  // Progressive disclosure: hide pin memo + AI debug pack until first capture.
  // ImageActions hides its hosts based on hasCapture(); history stays visible
  // to let users reload prior packs.
  pinMemoHost.hidden = true
  secPack.hidden = true

  main.append(secCap, secPreview, secPack, secShare, secHistory)
  panel.append(masthead, main, toastRoot)
  app.append(panel)

  const preview = mountPreview(secPreview, {
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

  // 핀 메모 블록은 미리보기 카드 내부 하위 블록 (디자인 SoT §02)
  preview.cardEl.append(pinMemoHost)

  secPreview.addEventListener('snapcontext:pin-lightbox-open', () => {
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

  const imageActions = mountImageActions(preview.exportHost, secShare, {
    hasCapture: () => capturedImage !== null,
    getImage: () => capturedImage,
    getPins: () => pins,
    getContext: () =>
      captureSnapshot
        ? {
            v: 1,
            sourceUrl: captureSnapshot.sourceUrl,
            sourceTitle: captureSnapshot.sourceTitle,
            captureType: captureSnapshot.captureType,
            capturedAt: currentHistoryTimestamp,
            viewport: captureSnapshot.viewport,
            pins: pins.map((p) => ({ id: p.id, memo: p.memo }))
          }
        : null,
    showToast
  })

  packRef.api = mountContextPackPanel(secPack, {
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

  mountHistoryList(secHistory, {
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
        imageHeight,
        sourceUrl: item.url
      })

      // Restore pins.
      pins = restoredPins
      activePinId = null
      refreshPins()

      // Sync panels.
      pinMemoHost.hidden = false
      secPack.hidden = false
      imageActions.sync()
      if (item.contextPack) {
        packRef.api?.loadPack(item.contextPack)
      }
      packRef.api?.sync()

      showToast('캡처를 불러왔습니다.', 'info')
    },
    showToast
  })

  /* 콜로폰 — 인쇄물 판권 푸터 (§05 하단). copy-png는 suggested key 미등록 → 표기 제외 */
  const colophon = document.createElement('div')
  colophon.className = 'colophon'
  colophon.setAttribute('aria-hidden', 'true')
  colophon.innerHTML = `
    <span>SNAPCONTEXT<span class="cx-dot"> · </span>CHROME · WHALE MV3</span>
    <span class="tnum">V/E/M/G · ALT+SHIFT</span>`
  secHistory.append(colophon)

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
      imageHeight: payload.imageHeight,
      sourceUrl: payload.sourceUrl
    })
    packRef.api?.resetPack()
    packRef.api?.sync()
    imageActions.sync()
    pinMemoHost.hidden = false
    secPack.hidden = false
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
    },
    onPrompt: async () => {
      // §01 프롬프트 행 = §03 'AI 프롬프트 복사'와 동일 동작.
      // 캡처가 없으면 copyPrompt 내부에서 안내 토스트 처리.
      await packRef.api?.copyPrompt()
    }
  })

  void drainPendingElementCapture()
}

document.addEventListener('DOMContentLoaded', init)
