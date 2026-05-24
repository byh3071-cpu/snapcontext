import type {
  BackgroundToContentMessage,
  BackgroundToSidePanelMessage,
  CaptureResultPayload,
  ContentToBackgroundMessage,
  ExtensionMessage,
  SidePanelToBackgroundMessage
} from '../types'

export type SidePanelRequest = SidePanelToBackgroundMessage

export type SidePanelResponse =
  | Extract<BackgroundToSidePanelMessage, { type: 'CAPTURE_RESULT' }>
  | {
      type: 'PENDING_ELEMENT_CAPTURE'
      payload: CaptureResultPayload | null
    }
  | { type: 'ERROR'; message: string }
  | { type: 'SELECTOR_STARTED' }
  | { type: 'DOCUMENT_SCAN_STARTED' }
  | { type: 'FULL_PAGE_CAPTURE_STARTED' }
  | { type: 'ACK' }

export function toKoreanErrorMessage(input: unknown): string {
  const raw =
    input instanceof Error
      ? input.message
      : typeof input === 'string'
        ? input
        : input == null
          ? ''
          : String(input)
  const text = raw.trim()
  if (!text) return '알 수 없는 오류가 발생했습니다.'

  if (/extension context (invalidated|was invalidated)/i.test(text)) {
    return '확장 프로그램이 다시 로드되었습니다. 사이드 패널을 닫았다가 다시 열어주세요.'
  }
  if (
    /could not establish connection|receiving end does not exist/i.test(text)
  ) {
    return '콘텐츠 스크립트에 연결할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요.'
  }
  if (/message port closed/i.test(text)) {
    return '백그라운드 응답이 끊겼습니다. 잠시 후 다시 시도해주세요.'
  }
  if (/no tab with id|no window with id|tab .* (was )?closed/i.test(text)) {
    return '대상 탭 또는 창을 찾을 수 없습니다.'
  }
  if (
    /cannot access|cannot be scripted|chrome:\/\/|chrome-extension:\/\//i.test(
      text
    )
  ) {
    return '이 페이지에서는 캡처할 수 없습니다. 일반 웹 페이지에서 다시 시도해주세요.'
  }
  if (/user did not approve|user denied|permission denied/i.test(text)) {
    return '권한이 거부되었습니다.'
  }
  if (/network|fetch|failed to fetch/i.test(text)) {
    return '네트워크 오류가 발생했습니다.'
  }

  if (/[가-힯]/.test(text)) {
    return text
  }

  console.warn('[SnapContext] 번역되지 않은 오류:', text)
  return '예기치 않은 오류가 발생했습니다.'
}

export async function sendToBackground(
  message: SidePanelRequest
): Promise<SidePanelResponse> {
  try {
    const response = (await chrome.runtime.sendMessage(
      message as ExtensionMessage
    )) as SidePanelResponse | undefined
    if (!response) {
      return { type: 'ERROR', message: '백그라운드 응답이 비어 있습니다.' }
    }
    if (response.type === 'ERROR') {
      return { type: 'ERROR', message: toKoreanErrorMessage(response.message) }
    }
    return response
  } catch (e) {
    return { type: 'ERROR', message: toKoreanErrorMessage(e) }
  }
}

export async function sendToContentScript(
  tabId: number,
  message: BackgroundToContentMessage
): Promise<void> {
  await chrome.tabs.sendMessage(tabId, message as ExtensionMessage)
}

export async function notifyBackgroundFromContent(
  message: ContentToBackgroundMessage
): Promise<void> {
  await chrome.runtime.sendMessage(message as ExtensionMessage)
}
