import type {
  CaptureType,
  ContextPack,
  DebugLogEntry,
  PackMode,
  PinItem,
  ProjectProfile
} from '../types'

export type GenerateContextPackInput = {
  imageBase64: string
  captureType: CaptureType
  selectedElement?: string
  pins: PinItem[]
  mode?: PackMode
  sourceUrl: string
  sourceTitle: string
  viewport: { width: number; height: number }
  userAgent?: string
  debugLogs?: DebugLogEntry[]
  projectProfile?: ProjectProfile
  imageWidth: number
  imageHeight: number
}

export function generateContextPack(input: GenerateContextPackInput): ContextPack {
  const id = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const capturedAt = new Date().toISOString()
  const mode = input.mode ?? 'context'

  const capture: ContextPack['capture'] = {
    type: input.captureType,
    viewport: `${input.viewport.width}x${input.viewport.height}`,
    imageSize: `${input.imageWidth}x${input.imageHeight}`
  }
  if (input.selectedElement) {
    capture.selectedElement = input.selectedElement
  }

  const pack: ContextPack = {
    version: '0.2',
    id,
    source: {
      url: input.sourceUrl,
      title: input.sourceTitle,
      capturedAt
    },
    capture,
    annotations: input.pins.map((p) => ({
      id: p.id,
      position: { x: p.x, y: p.y },
      memo: p.memo.trim() ? p.memo : null
    })),
    debugLogs: input.debugLogs ?? [],
    project: input.projectProfile,
    mode
  }

  return pack
}
