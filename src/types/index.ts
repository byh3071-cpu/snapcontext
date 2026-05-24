export interface SerializedRect {

  x: number

  y: number

  width: number

  height: number

  top: number

  left: number

  right: number

  bottom: number

}



export type CaptureType = 'visible' | 'element' | 'document' | 'full-page'

export type PackMode = 'context' | 'bug-report'

export type DebugLogLevel = 'error' | 'network' | 'unhandled'

export interface DebugLogEntry {

  id: string

  level: DebugLogLevel

  message: string

  source?: string

  timestamp: string

  url?: string

  method?: string

  status?: number

  statusText?: string

  durationMs?: number

}

export interface ProjectProfile {

  id: string

  name: string

  stack: string[]

  designSystem?: string

  aiPreferences?: string

  urlPattern: string

}

export interface PackHistoryItem {

  id: string

  createdAt: string

  mode: PackMode

  title: string

  url: string

  prompt: string

  json: string

}



export interface ContextPack {

  version: '0.2'

  id: string

  source: {

    url: string

    title: string

    capturedAt: string

  }

  capture: {

    type: CaptureType

    viewport: string

    imageSize: string

    selectedElement?: string

  }

  annotations: Array<{

    id: number

    position: { x: number; y: number }

    memo: string | null

  }>

  debugLogs: DebugLogEntry[]

  project?: ProjectProfile

  mode: PackMode

  /** Legacy: filled by older versions. New packs do not set this. */
  prompt?: string

}



export type CaptureResultPayload = {

  type: 'CAPTURE_RESULT'

  imageData: string

  captureType: CaptureType

  selectedElement?: string

  sourceUrl: string

  sourceTitle: string

  viewport: { width: number; height: number }

  userAgent: string

  debugLogs: DebugLogEntry[]

  imageWidth: number

  imageHeight: number

}



export type SidePanelToBackgroundMessage =

  | { type: 'CAPTURE_VISIBLE' }

  | { type: 'START_ELEMENT_SELECT' }

  | { type: 'CAPTURE_DOCUMENT' }

  | { type: 'CAPTURE_FULL_PAGE' }

  | { type: 'CANCEL_SELECT' }

  | { type: 'GET_PENDING_ELEMENT_CAPTURE' }



export type BackgroundToSidePanelMessage =

  | CaptureResultPayload

  | { type: 'SELECT_CANCELLED' }

  | { type: 'DOCUMENT_AREA_NOT_FOUND' }

  | { type: 'ELEMENT_CAPTURE_PENDING_READY' }

  | { type: 'COPY_PNG_COMMAND' }

  | { type: 'FULL_PAGE_CAPTURE_FAILED'; message: string }

  | { type: 'FULL_PAGE_CAPTURE_TRUNCATED'; cappedAtPx: number }



export type BackgroundToContentMessage =

  | { type: 'ENABLE_SELECTOR' }

  | { type: 'DISABLE_SELECTOR' }

  | { type: 'ENABLE_DOCUMENT_SELECTOR' }

  | { type: 'DISABLE_DOCUMENT_SELECTOR' }

  | { type: 'GET_PAGE_META' }



export type ContentToBackgroundMessage =

  | {

      type: 'ELEMENT_SELECTED'

      rect: SerializedRect

      selector: string

      devicePixelRatio: number

      viewport: { width: number; height: number }

      userAgent: string

    }

  | {

      type: 'DOCUMENT_AREA_FOUND'

      rect: SerializedRect

      selector: string

      devicePixelRatio: number

      viewport: { width: number; height: number }

      userAgent: string

    }

  | { type: 'DOCUMENT_AREA_NOT_FOUND' }

  | { type: 'CANCEL_SELECT' }

  | {

      type: 'PAGE_META'

      viewport: { width: number; height: number }

      userAgent: string

      debugLogs: DebugLogEntry[]

    }



export type ExtensionMessage =

  | SidePanelToBackgroundMessage

  | BackgroundToSidePanelMessage

  | BackgroundToContentMessage

  | ContentToBackgroundMessage



export type PinItem = {

  id: number

  x: number

  y: number

  memo: string

}

