import { swissIcon } from '../utils/swiss-icons'
import { EXPIRY_DAYS_ALLOWLIST, isExpiryDays } from '../../utils/upload'
import {
  formatExpiryDays,
  loadShareExpiryDays,
  saveShareExpiryDays
} from '../../utils/share-expiry'
import { getStoredToken, setUserToken, isValidTokenFormat, maskToken } from '../../utils/token'

/* manifest commands 진실 기준: V/E/M/G만 suggested_key 등록.
   copy-png은 Chrome suggested_key 4개 제한으로 미등록 → '직접 지정' 안내. */
interface ShortcutEntry {
  readonly label: string
  readonly value: string
  /** true = 실제 키 조합(kbd 렌더), false = 안내 문구 */
  readonly isKey: boolean
}

const shortcuts: readonly ShortcutEntry[] = [
  { label: '화면 캡처', value: 'Alt+Shift+V', isKey: true },
  { label: '요소 캡처', value: 'Alt+Shift+E', isKey: true },
  { label: '문서 캡처', value: 'Alt+Shift+M', isKey: true },
  { label: '전체 캡처', value: 'Alt+Shift+G', isKey: true },
  { label: 'PNG 복사', value: '직접 지정', isKey: false },
  { label: 'PNG 저장', value: '버튼만 제공', isKey: false }
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

  for (const { label, value, isKey } of shortcuts) {
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

  /* ---- 두 번째 그룹: 공유 보관 기간 (storage 키 shareExpiryDays) ---- */
  const shareGroupLabel = document.createElement('div')
  shareGroupLabel.className = 'set-group-label shortcuts-help__share-label'
  shareGroupLabel.textContent = '공유'

  const expiryRow = document.createElement('div')
  expiryRow.className = 'help-row shortcuts-help__expiry-row'
  const expiryLabel = document.createElement('label')
  expiryLabel.className = 'lbl'
  expiryLabel.htmlFor = 'share-expiry-days'
  expiryLabel.textContent = '보관 기간'
  const expirySelectWrap = document.createElement('div')
  expirySelectWrap.className = 'select-wrap'
  const expirySelect = document.createElement('select')
  expirySelect.id = 'share-expiry-days'
  expirySelect.className = 'shortcuts-help__expiry-select'
  for (const days of EXPIRY_DAYS_ALLOWLIST) {
    const option = document.createElement('option')
    option.value = String(days)
    option.textContent = formatExpiryDays(days)
    expirySelect.append(option)
  }
  expirySelectWrap.append(expirySelect, swissIcon('chev', 'ic-sm chev'))
  expiryRow.append(expiryLabel, expirySelectWrap)

  const expiryNote = document.createElement('p')
  expiryNote.className = 'help-note shortcuts-help__expiry-note'
  expiryNote.textContent =
    '새로 만드는 공유 링크에 적용됩니다. 이미 만든 링크의 보관 기간은 바뀌지 않습니다.'

  void (async () => {
    expirySelect.value = String(await loadShareExpiryDays())
  })()
  expirySelect.addEventListener('change', () => {
    const next = Number(expirySelect.value)
    if (!isExpiryDays(next)) {
      // option 을 allowlist 로 만들었으니 도달 불가 — 도달했다면 조용히 넘기지 않고 드러낸다
      console.warn('[share-expiry] 허용되지 않은 보관 기간 선택값:', expirySelect.value)
      return
    }
    void saveShareExpiryDays(next)
  })

  const note = document.createElement('p')
  note.className = 'help-note shortcuts-help__note'
  note.textContent =
    '브라우저에서 이미 사용 중인 단축키와 충돌하면 자동 등록되지 않을 수 있습니다. 그럴 때는 브라우저의 확장 프로그램 단축키 설정에서 직접 지정하세요.'

  /* ---- 세 번째 그룹: MCP 연동 온보딩 (토큰 표시/복사 · 다른 기기 붙여넣기 · 연결 명령) ----
   * 새 CSS 클래스는 만들지 않는다 — 기존 클래스(help-row/help-note/lbl/field/btn)만 재사용하고
   * 레이아웃 미세조정은 이 파일의 기존 선례(dd.style.fontSize, 위)처럼 인라인 style 로 한다. */
  const onboardGroupLabel = document.createElement('div')
  onboardGroupLabel.className = 'set-group-label'
  onboardGroupLabel.style.marginTop = 'var(--s-4)'
  onboardGroupLabel.textContent = 'MCP 연동'

  const mkCopyBtn = (): HTMLButtonElement => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn btn-ghost'
    btn.style.width = 'auto'
    btn.style.flex = 'none'
    btn.style.padding = '4px 10px'
    btn.append(swissIcon('copy', 'ic-sm'))
    const label = document.createElement('span')
    label.textContent = '복사'
    btn.append(label)
    return btn
  }

  // 1) 내 토큰 표시 + 복사
  const tokenRow = document.createElement('div')
  tokenRow.className = 'help-row shortcuts-help__token-row'
  const tokenLabel = document.createElement('span')
  tokenLabel.className = 'lbl'
  tokenLabel.textContent = '내 토큰'
  const tokenValueWrap = document.createElement('div')
  tokenValueWrap.style.display = 'flex'
  tokenValueWrap.style.alignItems = 'center'
  tokenValueWrap.style.gap = '8px'
  tokenValueWrap.style.minWidth = '0'
  // 화면에 보이는 건 마스킹된 표시뿐 — 원문은 클립보드 복사 클로저(currentToken)에만 존재한다.
  const tokenMasked = document.createElement('code')
  tokenMasked.style.fontFamily = 'var(--font-mono)'
  tokenMasked.style.fontSize = 'var(--t-meta)'
  tokenMasked.style.color = 'var(--ink)'
  tokenMasked.style.wordBreak = 'break-all'
  const tokenCopyBtn = mkCopyBtn()
  const tokenNoValue = document.createElement('span')
  tokenNoValue.className = 'muted'
  tokenNoValue.style.fontSize = 'var(--t-meta)'
  tokenNoValue.textContent = '미발급'
  tokenValueWrap.append(tokenMasked, tokenCopyBtn, tokenNoValue)
  tokenRow.append(tokenLabel, tokenValueWrap)

  const tokenEmptyNote = document.createElement('p')
  tokenEmptyNote.className = 'help-note'
  tokenEmptyNote.textContent = '공유를 한 번 실행하면 토큰이 생깁니다.'

  // 2) 다른 기기 토큰 붙여넣기
  const pasteLabel = document.createElement('label')
  pasteLabel.className = 'lbl'
  pasteLabel.htmlFor = 'shortcuts-help-token-paste'
  pasteLabel.style.marginTop = 'var(--s-3)'
  pasteLabel.textContent = '다른 기기 토큰 붙여넣기'

  const pasteRow = document.createElement('div')
  pasteRow.style.display = 'flex'
  pasteRow.style.gap = 'var(--s-2)'
  pasteRow.style.alignItems = 'center'
  const pasteInput = document.createElement('input')
  pasteInput.type = 'text'
  pasteInput.id = 'shortcuts-help-token-paste'
  pasteInput.className = 'field'
  pasteInput.placeholder = 'sc_...'
  pasteInput.autocomplete = 'off'
  pasteInput.spellcheck = false
  pasteInput.style.flex = '1'
  pasteInput.style.minWidth = '0'
  const pasteApplyBtn = document.createElement('button')
  pasteApplyBtn.type = 'button'
  pasteApplyBtn.className = 'btn btn-primary'
  pasteApplyBtn.style.width = 'auto'
  pasteApplyBtn.style.flex = 'none'
  pasteApplyBtn.textContent = '적용'
  pasteRow.append(pasteInput, pasteApplyBtn)

  // 붙여넣기 실패는 조용히 무시하지 않는다 — 인라인 문구로 반드시 드러낸다
  const pasteFeedback = document.createElement('p')
  pasteFeedback.className = 'help-note'
  pasteFeedback.hidden = true

  // 3) Claude/Codex 복붙 명령
  const mkCmdLabel = (text: string): HTMLDivElement => {
    const el = document.createElement('div')
    el.className = 'lbl'
    el.style.marginTop = 'var(--s-3)'
    el.textContent = text
    return el
  }
  const mkCmdRow = (): { row: HTMLDivElement; pre: HTMLPreElement; copyBtn: HTMLButtonElement } => {
    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.gap = 'var(--s-2)'
    row.style.alignItems = 'flex-start'
    const pre = document.createElement('pre')
    pre.style.fontFamily = 'var(--font-mono)'
    pre.style.fontSize = 'var(--t-meta)'
    pre.style.whiteSpace = 'pre-wrap'
    pre.style.wordBreak = 'break-all'
    pre.style.flex = '1'
    pre.style.minWidth = '0'
    pre.style.margin = '0'
    pre.style.padding = '8px'
    pre.style.background = 'var(--paper-2)'
    pre.style.border = 'var(--rule-hair) solid var(--hair)'
    const copyBtn = mkCopyBtn()
    copyBtn.style.alignSelf = 'flex-start'
    row.append(pre, copyBtn)
    return { row, pre, copyBtn }
  }

  const claudeLabelEl = mkCmdLabel('Claude Code 연결 명령')
  const { row: claudeCmdRow, pre: claudeCmdPre, copyBtn: claudeCopyBtn } = mkCmdRow()
  const codexLabelEl = mkCmdLabel('Codex 연결 명령')
  const { row: codexCmdRow, pre: codexCmdPre, copyBtn: codexCopyBtn } = mkCmdRow()

  const NO_TOKEN_PLACEHOLDER = '<토큰-없음>'
  const uploadEndpoint: string | undefined = import.meta.env.VITE_UPLOAD_ENDPOINT
  if (!uploadEndpoint) {
    console.warn(
      '[shortcuts-help] 업로드 엔드포인트가 없어 MCP 연결 명령의 base URL 이 비어 있습니다.'
    )
  }
  const mcpBase = uploadEndpoint ? uploadEndpoint.replace(/\/+$/, '') : ''

  const buildClaudeCommand = (base: string, token: string): string =>
    `claude mcp add --transport http snapcontext ${base}/mcp --header "Authorization: Bearer ${token}"`
  const buildCodexCommand = (base: string, token: string): string =>
    `setx SNAPCONTEXT_MCP_TOKEN ${token}\ncodex mcp add snapcontext --url ${base}/mcp --bearer-token-env-var SNAPCONTEXT_MCP_TOKEN`

  // 화면 밖(로그·에러)으로는 절대 새지 않는다 — 이 클로저 값은 클립보드 복사에만 쓰인다.
  let currentToken: string | null = null

  const renderTokenViews = (token: string | null): void => {
    currentToken = token
    tokenMasked.hidden = !token
    tokenCopyBtn.hidden = !token
    tokenNoValue.hidden = Boolean(token)
    tokenEmptyNote.hidden = Boolean(token)
    if (token) tokenMasked.textContent = maskToken(token)

    const tokenForCmd = token ?? NO_TOKEN_PLACEHOLDER
    claudeCmdPre.textContent = buildClaudeCommand(mcpBase, tokenForCmd)
    codexCmdPre.textContent = buildCodexCommand(mcpBase, tokenForCmd)
  }
  renderTokenViews(null)

  void (async () => {
    renderTokenViews(await getStoredToken())
  })()

  // 복사 실패(비포커스·비보안 컨텍스트)를 조용히 삼키지 않는다 — 인라인으로 드러낸다.
  const copyWithFeedback = (text: string): void => {
    navigator.clipboard.writeText(text).then(
      () => {
        pasteFeedback.hidden = false
        pasteFeedback.textContent = '복사했습니다.'
      },
      (e) => {
        pasteFeedback.hidden = false
        pasteFeedback.textContent = '복사에 실패했습니다. 직접 선택해 복사해 주세요.'
        console.warn('[shortcuts-help] 클립보드 복사 실패', e)
      }
    )
  }

  tokenCopyBtn.addEventListener('click', () => {
    if (!currentToken) return
    copyWithFeedback(currentToken)
  })

  pasteApplyBtn.addEventListener('click', () => {
    void (async () => {
      const value = pasteInput.value.trim()
      pasteFeedback.hidden = false
      // 형식 위반과 저장 실패를 구분해 보고한다 — 둘 다 "형식 오류"로 뭉치면
      // storage 문제를 형식 문제로 오인해 사용자가 엉뚱한 곳을 고치게 된다.
      if (!isValidTokenFormat(value)) {
        pasteFeedback.textContent = '토큰 형식이 올바르지 않습니다.'
        return
      }
      const ok = await setUserToken(value)
      if (ok) {
        pasteFeedback.textContent = '토큰을 적용했습니다.'
        pasteInput.value = ''
        renderTokenViews(value)
      } else {
        pasteFeedback.textContent = '토큰을 저장하지 못했습니다. 다시 시도해 주세요.'
      }
    })()
  })

  claudeCopyBtn.addEventListener('click', () => {
    copyWithFeedback(claudeCmdPre.textContent ?? '')
  })
  codexCopyBtn.addEventListener('click', () => {
    copyWithFeedback(codexCmdPre.textContent ?? '')
  })

  panel.append(
    headRow,
    groupLabel,
    list,
    note,
    shareGroupLabel,
    expiryRow,
    expiryNote,
    onboardGroupLabel,
    tokenRow,
    tokenEmptyNote,
    pasteLabel,
    pasteRow,
    pasteFeedback,
    claudeLabelEl,
    claudeCmdRow,
    codexLabelEl,
    codexCmdRow
  )
  masthead.append(panel)

  const setOpen = (open: boolean): void => {
    panel.hidden = !open
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false')
    // 패널을 열 때마다 토큰을 다시 읽는다 — mount 시 1회만 읽으면 "공유 후 발급된 토큰"이
    // 설정 화면에 영영 '미발급'으로 남는다(발급은 첫 공유 시점에 lazy 로 일어나므로).
    if (open) void (async () => { renderTokenViews(await getStoredToken()) })()
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
