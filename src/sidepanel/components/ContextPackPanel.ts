import {
  generateContextPack,
  type GenerateContextPackInput
} from '../../context-pack/generator'
import {
  buildTemplatePrompt,
  DEFAULT_PROMPT_TEMPLATE,
  type PromptTemplateId
} from '../../context-pack/prompt-builder'
import type {
  ContextPack,
  PackHistoryItem,
  PackMode,
  ProjectProfile
} from '../../types'
import { getStorageItem, setStorageItem } from '../../storage'
import { swissIcon, type SwissIconName } from '../utils/swiss-icons'
import { mkSecHead } from '../utils/section'
import { toKoreanErrorMessage } from '../../utils/messaging'

const PROFILE_STORAGE_KEY = 'projectProfiles'
const HISTORY_STORAGE_KEY = 'packHistory'
const TEMPLATE_STORAGE_KEY = 'promptTemplate'
const MAX_HISTORY_ITEMS = 20

const TEMPLATE_OPTIONS: ReadonlyArray<{
  id: PromptTemplateId
  label: string
}> = [
  { id: 'bug', label: '버그 리포트' },
  { id: 'refactor', label: '리팩토링' },
  { id: 'reference', label: '레퍼런스' }
]

function isPromptTemplateId(value: unknown): value is PromptTemplateId {
  return value === 'bug' || value === 'refactor' || value === 'reference'
}

export type ContextPackPanelApi = {
  sync: () => void
  resetPack: () => void
  loadPack: (pack: ContextPack) => void
  /** §01 프롬프트 행에서 호출 — 'AI 프롬프트 복사'와 동일 동작 */
  copyPrompt: () => Promise<void>
}

export function mountContextPackPanel(
  host: HTMLElement,
  deps: {
    hasCapture: () => boolean
    buildInput: () => GenerateContextPackInput | null
    showToast: (message: string, kind?: 'info' | 'error') => void
  }
): ContextPackPanelApi {
  host.classList.add('context-pack-panel')

  let profiles: ProjectProfile[] = []
  let history: PackHistoryItem[] = []
  let loadedPack: ContextPack | null = null

  /* ---- 섹션 헤드: 03 | 컨텍스트 팩 / AI 디버그 팩 | n 팩 ---- */
  const { head, asideEl } = mkSecHead({
    num: '03',
    eyebrow: '컨텍스트 팩',
    title: 'AI 디버그 팩',
    titleId: 'sec-pack-title',
    asideText: '0 팩'
  })
  const updateAsideCount = (): void => {
    asideEl.textContent = `${history.length} 팩`
  }

  const hint = document.createElement('p')
  hint.className = 'sec-sub context-pack-panel__hint muted'

  const matchedProfile = document.createElement('p')
  matchedProfile.className = 'context-pack-panel__hint muted'
  // v0.1.x: Project profile feature is hidden in the side panel pending v0.2
  // restoration. Element kept in DOM so existing references stay valid.
  matchedProfile.hidden = true

  /* ---- 폼 그리드 척추(a/b) — §01과 동일 좌측 정렬축 ---- */
  const formGrid = document.createElement('div')
  formGrid.className = 'form-grid'

  const mkIdx = (ch: string): HTMLSpanElement => {
    const s = document.createElement('span')
    s.className = 'fg-idx'
    s.setAttribute('aria-hidden', 'true')
    s.textContent = ch
    return s
  }

  // a — 프롬프트 템플릿
  const fieldA = document.createElement('div')
  fieldA.className = 'fg-field'
  const templateLabel = document.createElement('label')
  templateLabel.className = 'lbl context-pack-panel__template-label'
  templateLabel.htmlFor = 'pack-template'
  templateLabel.textContent = '프롬프트 템플릿'
  const selectWrap = document.createElement('div')
  selectWrap.className = 'select-wrap context-pack-panel__template-row'
  const templateSelect = document.createElement('select')
  templateSelect.className = 'context-pack-panel__template-select'
  templateSelect.id = 'pack-template'
  for (const opt of TEMPLATE_OPTIONS) {
    const option = document.createElement('option')
    option.value = opt.id
    option.textContent = opt.label
    templateSelect.appendChild(option)
  }
  const chev = swissIcon('chev', 'ic-sm chev')
  selectWrap.append(templateSelect, chev)
  fieldA.append(templateLabel, selectWrap)

  // b — 메모
  const fieldB = document.createElement('div')
  fieldB.className = 'fg-field'
  const intentLabel = document.createElement('label')
  intentLabel.className = 'lbl'
  intentLabel.htmlFor = 'pack-intent'
  intentLabel.textContent = '메모'
  const intentInput = document.createElement('textarea')
  intentInput.className = 'field context-pack-panel__intent'
  intentInput.id = 'pack-intent'
  intentInput.rows = 3
  intentInput.placeholder = '증상 또는 AI에게 요청할 내용 (추가 메모로 프롬프트에 삽입됨)'
  fieldB.append(intentLabel, intentInput)

  formGrid.append(mkIdx('a'), fieldA, mkIdx('b'), fieldB)

  let currentTemplate: PromptTemplateId = DEFAULT_PROMPT_TEMPLATE

  /* ---- 복사 버튼 스택 (폼 정렬축 인셋) ---- */
  const btnStack = document.createElement('div')
  btnStack.className = 'btn-stack fg-inset'

  const mkBtn = (
    label: string,
    icon: SwissIconName,
    variant: 'primary' | 'ghost'
  ): HTMLButtonElement => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className =
      variant === 'primary'
        ? 'btn btn-primary context-pack-panel__btn context-pack-panel__btn--primary'
        : 'btn btn-ghost context-pack-panel__btn'
    const iconWrap = document.createElement('span')
    iconWrap.className = 'context-pack-panel__icon'
    iconWrap.setAttribute('aria-hidden', 'true')
    iconWrap.append(swissIcon(icon))
    const labelSpan = document.createElement('span')
    labelSpan.textContent = label
    btn.append(iconWrap, labelSpan)
    return btn
  }

  const btnPrompt = mkBtn('AI 프롬프트 복사', 'copy', 'primary')
  const btnJson = mkBtn('JSON 복사', 'braces', 'ghost')
  const btnCopyAll = mkBtn('프롬프트＋JSON', 'copy', 'ghost')
  const duo = document.createElement('div')
  duo.className = 'duo'
  duo.append(btnJson, btnCopyAll)
  btnStack.append(btnPrompt, duo)

  /* ---- 프로젝트 프로필 (v0.2 복원 전까지 hidden 게이트 유지) ---- */
  const profileSection = document.createElement('details')
  profileSection.className = 'context-pack-panel__section'
  profileSection.hidden = true
  const profileSummary = document.createElement('summary')
  profileSummary.textContent = '프로젝트 프로필'
  const profileForm = document.createElement('div')
  profileForm.className = 'context-pack-panel__profile-form'

  const profileName = mkInput('프로젝트 이름')
  const profilePattern = mkInput('URL 패턴, 예: localhost:5173')
  const profileStack = mkInput('스택, 쉼표로 구분')
  const profileDesign = mkInput('디자인 시스템')
  const profilePrefs = document.createElement('textarea')
  profilePrefs.className = 'field context-pack-panel__intent'
  profilePrefs.rows = 2
  profilePrefs.placeholder = 'AI 선호 설정'
  const saveProfileBtn = document.createElement('button')
  saveProfileBtn.type = 'button'
  saveProfileBtn.className = 'btn btn-ghost context-pack-panel__btn'
  saveProfileBtn.append(swissIcon('floppy'), document.createTextNode('프로필 저장'))
  const profileList = document.createElement('div')
  profileList.className = 'context-pack-panel__list'
  profileForm.append(
    profileName,
    profilePattern,
    profileStack,
    profileDesign,
    profilePrefs,
    saveProfileBtn,
    profileList
  )
  profileSection.append(profileSummary, profileForm)

  /* ---- 최근 팩 ---- */
  const historySection = document.createElement('details')
  historySection.className = 'context-pack-panel__section'
  const historySummary = document.createElement('summary')
  historySummary.textContent = '최근 팩'
  const historyList = document.createElement('div')
  historyList.className = 'context-pack-panel__list'
  historySection.append(historySummary, historyList)

  // matchedProfile(숨김)을 hint보다 앞에 — E2E가 `.context-pack-panel__hint.muted`의
  // .last()를 실제 상태 힌트로 읽는 기존 계약 유지.
  host.append(
    head,
    matchedProfile,
    hint,
    formGrid,
    btnStack,
    profileSection,
    historySection
  )

  function mkInput(placeholder: string): HTMLInputElement {
    const input = document.createElement('input')
    input.className = 'field context-pack-panel__input'
    input.placeholder = placeholder
    return input
  }

  function modeLabel(value: PackMode): string {
    return value === 'bug-report' ? '버그 리포트' : '컨텍스트 팩'
  }

  const currentProfile = (url: string): ProjectProfile | undefined =>
    profiles.find(
      (profile) =>
        profile.urlPattern.trim().length > 0 &&
        url.includes(profile.urlPattern.trim())
    )

  const templateToMode = (id: PromptTemplateId): PackMode =>
    id === 'bug' ? 'bug-report' : 'context'

  let mode: PackMode = templateToMode(currentTemplate)

  const renderProfiles = (): void => {
    profileList.replaceChildren()
    if (profiles.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'muted'
      empty.textContent = '아직 프로젝트 프로필이 없습니다.'
      profileList.append(empty)
      return
    }
    for (const profile of profiles) {
      const row = document.createElement('div')
      row.className = 'context-pack-panel__list-row'
      const text = document.createElement('span')
      text.textContent = `${profile.name} - ${profile.urlPattern}`
      const del = document.createElement('button')
      del.type = 'button'
      del.textContent = '삭제'
      del.addEventListener('click', () => {
        void (async () => {
          profiles = profiles.filter((p) => p.id !== profile.id)
          await setStorageItem(PROFILE_STORAGE_KEY, profiles)
          renderProfiles()
          sync()
        })()
      })
      row.append(text, del)
      profileList.append(row)
    }
  }

  const renderHistory = (): void => {
    historyList.replaceChildren()
    updateAsideCount()
    if (history.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'muted'
      empty.textContent = '아직 저장된 팩이 없습니다.'
      historyList.append(empty)
      return
    }
    for (const item of history) {
      const row = document.createElement('div')
      row.className = 'context-pack-panel__history-row'
      const meta = document.createElement('div')
      meta.className = 'context-pack-panel__history-meta'
      meta.textContent = `${modeLabel(item.mode)} - ${item.title || item.url}`
      const copyPromptBtn = document.createElement('button')
      copyPromptBtn.type = 'button'
      copyPromptBtn.textContent = '프롬프트'
      copyPromptBtn.addEventListener('click', () => {
        void navigator.clipboard.writeText(item.prompt)
      })
      const copyAll = document.createElement('button')
      copyAll.type = 'button'
      copyAll.textContent = '전체'
      copyAll.addEventListener('click', () => {
        void navigator.clipboard.writeText(
          `--- AI 프롬프트 ---\n\n${item.prompt}\n\n--- 컨텍스트 팩 JSON ---\n\n${item.json}`
        )
      })
      const deleteBtn = document.createElement('button')
      deleteBtn.type = 'button'
      deleteBtn.className = 'context-pack-panel__history-delete'
      deleteBtn.setAttribute('aria-label', '히스토리 삭제')
      deleteBtn.append(swissIcon('x', 'ic-sm'))
      deleteBtn.addEventListener('click', () => {
        void (async () => {
          history = history.filter((h) => h.id !== item.id)
          await setStorageItem(HISTORY_STORAGE_KEY, history)
          renderHistory()
        })()
      })
      row.append(meta, copyPromptBtn, copyAll, deleteBtn)
      historyList.append(row)
    }
  }

  const saveHistory = async (pack: ContextPack): Promise<void> => {
    const item: PackHistoryItem = {
      id: pack.id,
      createdAt: pack.source.capturedAt,
      mode: pack.mode,
      title: pack.source.title,
      url: pack.source.url,
      prompt: buildPromptText(pack),
      json: JSON.stringify(pack, null, 2)
    }
    history = [item, ...history.filter((h) => h.url !== item.url)].slice(
      0,
      MAX_HISTORY_ITEMS
    )
    await setStorageItem(HISTORY_STORAGE_KEY, history)
    renderHistory()
  }

  const tryBuildPack = (): ContextPack | null => {
    // Always rebuild from the live capture + current pins so that pins added
    // after a history-loaded pack actually make it into the prompt. The
    // `loadedPack` is only a fallback for the rare case where capture state
    // has been cleared but a loaded pack is still around.
    const base = deps.buildInput()
    if (base) {
      return generateContextPack({
        ...base,
        mode,
        projectProfile: currentProfile(base.sourceUrl)
      })
    }
    if (loadedPack) return loadedPack
    return null
  }

  const sync = (): void => {
    const hasCap = deps.hasCapture()
    const hasLoadedPack = loadedPack !== null
    const base = deps.buildInput()
    const profile = base ? currentProfile(base.sourceUrl) : undefined
    matchedProfile.textContent = profile
      ? `프로젝트 프로필: ${profile.name}`
      : '프로젝트 프로필: 일치 항목 없음'
    hint.textContent = hasLoadedPack
      ? `불러온 컨텍스트 팩: ${loadedPack?.source.title || loadedPack?.source.url}`
      : hasCap
      ? 'AI용 디버그 프롬프트, JSON 팩 또는 주석이 포함된 PNG를 복사하세요.'
      : 'AI 디버그 팩을 만들려면 페이지 또는 요소를 캡처하세요.'

    btnPrompt.disabled = !hasCap && !hasLoadedPack
    btnJson.disabled = !hasCap && !hasLoadedPack
    btnCopyAll.disabled = !hasCap && !hasLoadedPack
  }

  const resetPack = (): void => {
    loadedPack = null
    intentInput.value = ''
  }

  const loadPack = (pack: ContextPack): void => {
    loadedPack = pack
    mode = pack.mode
    sync()
  }

  const buildPromptText = (pack: ContextPack): string => {
    const base = deps.buildInput()
    const userNote = intentInput.value.trim()
    return buildTemplatePrompt(pack, currentTemplate, {
      userAgent: base?.userAgent,
      userNote: userNote || undefined,
      viewport: base?.viewport
    })
  }

  const copyPack = async (
    buildText: (pack: ContextPack) => string,
    successMessage: string
  ): Promise<void> => {
    const pack = tryBuildPack()
    if (!pack) {
      deps.showToast('캡처 데이터가 없습니다.', 'error')
      return
    }
    try {
      await navigator.clipboard.writeText(buildText(pack))
      await saveHistory(pack)
      deps.showToast(successMessage, 'info')
    } catch (e) {
      deps.showToast(toKoreanErrorMessage(e), 'error')
    }
  }

  saveProfileBtn.addEventListener('click', () => {
    void (async () => {
      const name = profileName.value.trim()
      const urlPattern = profilePattern.value.trim()
      if (!name || !urlPattern) {
        deps.showToast('프로젝트 이름과 URL 패턴은 필수입니다.', 'error')
        return
      }
      const profile: ProjectProfile = {
        id: `profile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        urlPattern,
        stack: profileStack.value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        designSystem: profileDesign.value.trim() || undefined,
        aiPreferences: profilePrefs.value.trim() || undefined
      }
      profiles = [profile, ...profiles]
      await setStorageItem(PROFILE_STORAGE_KEY, profiles)
      profileName.value = ''
      profilePattern.value = ''
      profileStack.value = ''
      profileDesign.value = ''
      profilePrefs.value = ''
      renderProfiles()
      sync()
      deps.showToast('프로젝트 프로필을 저장했습니다.', 'info')
    })()
  })

  const copyPromptAction = (): Promise<void> =>
    copyPack(buildPromptText, 'AI 프롬프트를 복사했습니다.')

  btnPrompt.addEventListener('click', () => {
    void copyPromptAction()
  })

  btnJson.addEventListener('click', () => {
    void copyPack((pack) => JSON.stringify(pack, null, 2), '컨텍스트 팩 JSON을 복사했습니다.')
  })

  btnCopyAll.addEventListener('click', () => {
    void copyPack(
      (pack) =>
        `--- AI 프롬프트 ---\n\n${buildPromptText(pack)}\n--- 컨텍스트 팩 JSON ---\n\n${JSON.stringify(
          pack,
          null,
          2
        )}`,
      '프롬프트와 JSON을 복사했습니다.'
    )
  })

  templateSelect.addEventListener('change', () => {
    if (isPromptTemplateId(templateSelect.value)) {
      currentTemplate = templateSelect.value
      mode = templateToMode(currentTemplate)
      void setStorageItem(TEMPLATE_STORAGE_KEY, currentTemplate)
    }
  })

  void (async () => {
    profiles = (await getStorageItem<ProjectProfile[]>(PROFILE_STORAGE_KEY)) ?? []
    history = (await getStorageItem<PackHistoryItem[]>(HISTORY_STORAGE_KEY)) ?? []
    const savedTemplate = await getStorageItem<unknown>(TEMPLATE_STORAGE_KEY)
    if (isPromptTemplateId(savedTemplate)) {
      currentTemplate = savedTemplate
      templateSelect.value = currentTemplate
      mode = templateToMode(currentTemplate)
    }
    renderProfiles()
    renderHistory()
    sync()
  })()

  sync()

  return { sync, resetPack, loadPack, copyPrompt: copyPromptAction }
}
