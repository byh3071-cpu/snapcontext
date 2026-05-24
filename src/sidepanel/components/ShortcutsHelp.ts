const shortcuts = [
  ['화면 캡처', 'Alt+Shift+V'],
  ['요소 캡처', 'Alt+Shift+E'],
  ['문서 캡처', 'Alt+Shift+M'],
  ['전체 캡처', 'Alt+Shift+G'],
  ['PNG 복사', '직접 지정'],
  ['PNG 저장', '버튼만 제공']
] as const

export function mountShortcutsHelp(host: HTMLElement): void {
  host.classList.add('panel-card')
  host.classList.add('shortcuts-help')

  const details = document.createElement('details')
  details.className = 'shortcuts-help__details'

  const summary = document.createElement('summary')
  summary.textContent = '설정 / 도움말: 단축키'

  const list = document.createElement('dl')
  list.className = 'shortcuts-help__list'

  for (const [label, shortcut] of shortcuts) {
    const term = document.createElement('dt')
    term.textContent = label
    const value = document.createElement('dd')
    value.textContent = shortcut
    list.append(term, value)
  }

  const note = document.createElement('p')
  note.className = 'shortcuts-help__note muted'
  note.textContent =
    '브라우저에서 이미 사용 중인 단축키와 충돌하면 자동 등록되지 않을 수 있습니다. 그럴 때는 whale://extensions/shortcuts 에서 직접 지정하세요.'

  details.append(summary, list, note)
  host.append(details)
}
