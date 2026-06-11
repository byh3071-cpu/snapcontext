import { swissIcon } from '../utils/swiss-icons'

/* manifest commands 진실 기준: V/E/M/G만 suggested_key 등록.
   copy-png은 Chrome suggested_key 4개 제한으로 미등록 → '직접 지정' 안내. */
const shortcuts: ReadonlyArray<readonly [string, string, boolean]> = [
  ['화면 캡처', 'Alt+Shift+V', true],
  ['요소 캡처', 'Alt+Shift+E', true],
  ['문서 캡처', 'Alt+Shift+M', true],
  ['전체 캡처', 'Alt+Shift+G', true],
  ['PNG 복사', '직접 지정', false],
  ['PNG 저장', '버튼만 제공', false]
]

/**
 * 설정/도움말 드롭다운 — 마스트헤드 톱니 버튼이 토글하는 .help-panel
 * (디자인 SoT: 헤더 과밀 해소 P0-3 — details 섹션 → 기어 드롭다운으로 이동)
 */
export function mountShortcutsHelp(
  masthead: HTMLElement,
  trigger: HTMLButtonElement
): void {
  const panel = document.createElement('div')
  panel.className = 'help-panel shortcuts-help'
  panel.id = 'help-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', '설정 / 도움말: 단축키')
  panel.hidden = true

  const headRow = document.createElement('div')
  headRow.className = 'help-head'
  const title = document.createElement('span')
  title.className = 'help-title'
  title.textContent = '설정'
  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'help-close'
  closeBtn.setAttribute('aria-label', '닫기')
  closeBtn.append(swissIcon('x', 'ic-sm'))
  headRow.append(title, closeBtn)

  const groupLabel = document.createElement('div')
  groupLabel.className = 'set-group-label'
  groupLabel.textContent = '단축키'

  const list = document.createElement('dl')
  list.className = 'help-list shortcuts-help__list'

  for (const [label, value, isKey] of shortcuts) {
    const rowEl = document.createElement('div')
    rowEl.className = 'help-row'
    const term = document.createElement('dt')
    term.textContent = label
    const dd = document.createElement('dd')
    if (isKey) {
      const kbd = document.createElement('kbd')
      kbd.textContent = value
      dd.append(kbd)
    } else {
      dd.className = 'muted'
      dd.style.fontSize = 'var(--t-meta)'
      dd.textContent = value
    }
    rowEl.append(term, dd)
    list.append(rowEl)
  }

  const note = document.createElement('p')
  note.className = 'help-note shortcuts-help__note'
  note.textContent =
    '브라우저에서 이미 사용 중인 단축키와 충돌하면 자동 등록되지 않을 수 있습니다. 그럴 때는 브라우저의 확장 프로그램 단축키 설정에서 직접 지정하세요.'

  panel.append(headRow, groupLabel, list, note)
  masthead.append(panel)

  const setOpen = (open: boolean): void => {
    panel.hidden = !open
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false')
  }

  trigger.addEventListener('click', (ev) => {
    ev.stopPropagation()
    setOpen(panel.hidden)
  })
  closeBtn.addEventListener('click', () => {
    setOpen(false)
    trigger.focus()
  })
  document.addEventListener('click', (ev) => {
    const t = ev.target as Node | null
    if (!panel.hidden && t && !panel.contains(t) && !trigger.contains(t)) {
      setOpen(false)
    }
  })
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !panel.hidden) {
      setOpen(false)
      trigger.focus()
    }
  })
}
