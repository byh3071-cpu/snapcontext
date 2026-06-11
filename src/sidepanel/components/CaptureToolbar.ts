import { swissIcon, type SwissIconName } from '../utils/swiss-icons'

export type CaptureToolbarHandlers = {
  onVisible: () => void | Promise<void>
  onElement: () => void | Promise<void>
  onDocument: () => void | Promise<void>
  onFullPage: () => void | Promise<void>
  onPrompt: () => void | Promise<void>
}

type CaptureRow = {
  action: 'visible' | 'element' | 'document' | 'full-page' | 'prompt'
  idx: string
  icon: SwissIconName
  label: string
  desc: string
  /** manifest commands의 suggested_key. copy-png/프롬프트는 미등록 → 키캡 없음 */
  kbd?: string
  primary?: boolean
  groupBreak?: boolean
}

/* 행 구성 — 디자인 SoT §01: 즉시형(화면/요소) ↔ 자동감지형(문서/전체) 2+2 그룹 호흡,
   05 프롬프트 = 시그널 레드 primary 행 */
const ROWS: CaptureRow[] = [
  {
    action: 'visible',
    idx: '01',
    icon: 'monitor',
    label: '화면 캡처',
    desc: '현재 보이는 화면',
    kbd: 'Alt+Shift+V'
  },
  {
    action: 'element',
    idx: '02',
    icon: 'element',
    label: '요소 캡처',
    desc: '페이지 요소 선택',
    kbd: 'Alt+Shift+E'
  },
  {
    action: 'document',
    idx: '03',
    icon: 'docText',
    label: '문서 캡처',
    desc: '본문 영역 감지',
    kbd: 'Alt+Shift+M',
    groupBreak: true
  },
  {
    action: 'full-page',
    idx: '04',
    icon: 'pageFull',
    label: '전체 캡처',
    desc: '스크롤 전체 페이지',
    kbd: 'Alt+Shift+G'
  },
  {
    action: 'prompt',
    idx: '05',
    icon: 'sparkles',
    label: '프롬프트',
    desc: 'AI 프롬프트 생성',
    primary: true
  }
]

function mkRow(row: CaptureRow): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'cap-btn'
  if (row.primary) btn.classList.add('is-primary')
  if (row.groupBreak) btn.classList.add('is-group-break')
  btn.dataset.action = row.action
  btn.title = row.kbd ? `${row.label} (${row.kbd})` : `${row.label} — ${row.desc}`

  const idx = document.createElement('span')
  idx.className = 'cap-idx tnum'
  idx.setAttribute('aria-hidden', 'true')
  idx.textContent = row.idx

  const icon = document.createElement('span')
  icon.className = 'cap-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.append(swissIcon(row.icon))

  const text = document.createElement('span')
  text.className = 'cap-text'
  const label = document.createElement('span')
  label.className = 'cap-label'
  label.textContent = row.label
  const desc = document.createElement('span')
  desc.className = 'cap-desc'
  desc.textContent = row.desc
  text.append(label, desc)

  btn.append(idx, icon, text)
  if (row.kbd) {
    const kbd = document.createElement('kbd')
    kbd.textContent = row.kbd
    btn.append(kbd)
  }
  return btn
}

export function mountCaptureToolbar(
  root: HTMLElement,
  handlers: CaptureToolbarHandlers
): void {
  root.replaceChildren()

  const toolbar = document.createElement('div')
  toolbar.className = 'toolbar'
  toolbar.setAttribute('role', 'toolbar')
  toolbar.setAttribute('aria-label', '캡처 모드')

  for (const row of ROWS) {
    toolbar.append(mkRow(row))
  }
  root.append(toolbar)

  const onClick = (ev: MouseEvent): void => {
    const target = ev.target
    if (!(target instanceof Element)) return
    const btn = target.closest<HTMLButtonElement>('button[data-action]')
    if (!btn || btn.disabled) return
    const action = btn.dataset.action
    if (action === 'visible') void handlers.onVisible()
    if (action === 'element') void handlers.onElement()
    if (action === 'document') void handlers.onDocument()
    if (action === 'full-page') void handlers.onFullPage()
    if (action === 'prompt') void handlers.onPrompt()
  }

  root.addEventListener('click', onClick)
}
