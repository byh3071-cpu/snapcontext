import {
  Camera,
  FileScan,
  Monitor,
  MousePointerClick,
  ScanText
} from 'lucide'
import { panelLucideIcon, panelLucideIconRow } from '../utils/panel-lucide'

export type CaptureToolbarHandlers = {
  onVisible: () => void | Promise<void>
  onElement: () => void | Promise<void>
  onDocument: () => void | Promise<void>
  onFullPage: () => void | Promise<void>
}

function mkGlyph(content: Node): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = 'toolbar-btn__glyph'
  span.appendChild(content)
  return span
}

function mkCaptureButton(
  action: 'visible' | 'element' | 'document' | 'full-page',
  primary: boolean,
  glyphContent: Node,
  titleStrong: string,
  subtitle: string
): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = primary
    ? 'toolbar-btn toolbar-btn--primary'
    : 'toolbar-btn'
  btn.dataset.action = action
  const shortcuts = {
    visible: 'Alt+Shift+V',
    element: 'Alt+Shift+E',
    document: 'Alt+Shift+M',
    'full-page': 'Alt+Shift+G'
  }
  btn.title = `${titleStrong} (${shortcuts[action]})`

  const label = document.createElement('span')
  const strong = document.createElement('strong')
  strong.textContent = titleStrong
  const br = document.createElement('br')
  const sub = document.createElement('span')
  sub.className = 'muted'
  sub.style.fontSize = '0.78rem'
  sub.textContent = subtitle
  label.append(strong, br, sub)

  btn.append(mkGlyph(glyphContent), label)
  return btn
}

export function mountCaptureToolbar(
  root: HTMLElement,
  handlers: CaptureToolbarHandlers
): void {
  root.classList.add('panel-card')
  root.replaceChildren()

  const toolbar = document.createElement('div')
  toolbar.className = 'toolbar'
  toolbar.setAttribute('role', 'toolbar')
  toolbar.setAttribute('aria-label', '캡처 모드')

  const row = document.createElement('div')
  row.className = 'toolbar-row'

  const dualSize = 12
  const singleSize = 18

  const visibleGlyph = panelLucideIconRow([Monitor, Camera], dualSize)

  const btnVisible = mkCaptureButton(
    'visible',
    true,
    visibleGlyph,
    '화면 캡처',
    '현재 보이는 화면'
  )

  const btnElement = mkCaptureButton(
    'element',
    false,
    panelLucideIcon(MousePointerClick, singleSize),
    '요소 캡처',
    '페이지 요소 선택'
  )

  const btnDocument = mkCaptureButton(
    'document',
    false,
    panelLucideIcon(ScanText, singleSize),
    '문서 캡처',
    '본문 영역 자동 감지'
  )

  const btnFullPage = mkCaptureButton(
    'full-page',
    false,
    panelLucideIcon(FileScan, singleSize),
    '전체 캡처',
    '스크롤 전체 페이지'
  )

  row.append(btnVisible, btnDocument, btnElement, btnFullPage)
  toolbar.append(row)
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
  }

  root.addEventListener('click', onClick)
}
