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
import { Braces, ClipboardCopy, CopyCheck, Sparkles, X } from 'lucide'
import { panelLucideIcon, panelLucideIconRow } from '../utils/panel-lucide'
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
}

export function mountContextPackPanel(
  host: HTMLElement,
  deps: {
    hasCapture: () => boolean
    buildInput: () => GenerateContextPackInput | null
    showToast: (message: string, kind?: 'info' | 'error') => void
  }
): ContextPackPanelApi {
  host.classList.add('panel-card')
  host.classList.add('context-pack-panel')

  let profiles: ProjectProfile[] = []
  let history: PackHistoryItem[] = []
  let loadedPack: ContextPack | null = null

  const title = document.createElement('h2')
  title.className = 'context-pack-panel__title'
  title.textContent = 'AI 디버그 팩'

  const intentInput = document.createElement('textarea')
  intentInput.className = 'context-pack-panel__intent'
  intentInput.rows = 3
  intentInput.placeholder = '증상이나 AI에게 요청할 내용을 적어주세요'

  const matchedProfile = document.createElement('p')
  matchedProfile.className = 'context-pack-panel__hint muted'
  // v0.1.x: Project profile feature is hidden in the side panel pending v0.2
  // restoration. Element kept in DOM so existing references stay valid.
  matchedProfile.hidden = true

  const hint = document.createElement('p')
  hint.className = 'context-pack-panel__hint muted'

  let currentTemplate: PromptTemplateId = DEFAULT_PROMPT_TEMPLATE

  const templateRow = document.createElement('div')
  templateRow.className = 'context-pack-panel__template-row'
  const templateLabel = document.createElement('label')
  templateLabel.className = 'context-pack-panel__template-label'
  templateLabel.textContent = '프롬프트 템플릿'
  const templateSelect = document.createElement('select')
  templateSelect.className = 'context-pack-panel__template-select'
  for (const opt of TEMPLATE_OPTIONS) {
    const option = document.createElement('option')
    option.value = opt.id
    option.textContent = opt.label
    templateSelect.appendChild(option)
  }
  templateSelect.value = currentTemplate
  templateLabel.appendChild(templateSelect)
  templateRow.appendChild(templateLabel)

  const grid = document.createElement('div')
  grid.className = 'context-pack-panel__grid'

  const mkBtn = (
    label: string,
    icon: Element,
    variant: 'primary' | 'default'
  ): HTMLButtonElement => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className =
      variant === 'primary'
        ? 'context-pack-panel__btn context-pack-panel__btn--primary'
        : 'context-pack-panel__btn'
    const iconWrap = document.createElement('span')
    iconWrap.className = 'context-pack-panel__icon'
    iconWrap.setAttribute('aria-hidden', 'true')
    iconWrap.appendChild(icon)
    const labelSpan = document.createElement('span')
    labelSpan.textContent = label
    btn.append(iconWrap, labelSpan)
    return btn
  }

  const iconDual = 15
  const iconSingle = 18
  const btnPrompt = mkBtn(
    'AI 프롬프트 복사',
    panelLucideIconRow([Sparkles, ClipboardCopy], iconDual),
    'primary'
  )
  const btnJson = mkBtn(
    'JSON 복사',
    panelLucideIconRow([Braces, ClipboardCopy], iconDual),
    'default'
  )
  const btnCopyAll = mkBtn(
    '프롬프트 + JSON 복사',
    panelLucideIcon(CopyCheck, iconSingle),
    'default'
  )
  btnCopyAll.classList.add('context-pack-panel__btn--full')
  grid.append(btnPrompt, btnJson, btnCopyAll)

  const profileSection = document.createElement('details')
  profileSection.className = 'context-pack-panel__section'
  // v0.1.x: hide project profile section pending v0.2 restoration
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
  profilePrefs.className = 'context-pack-panel__intent'
  profilePrefs.rows = 2
  profilePrefs.placeholder = 'AI 선호 설정'
  const saveProfileBtn = document.createElement('button')
  saveProfileBtn.type = 'button'
  saveProfileBtn.className = 'context-pack-panel__btn context-pack-panel__btn--full'
  saveProfileBtn.textContent = '프로필 저장'
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

  const historySection = document.createElement('details')
  historySection.className = 'context-pack-panel__section'
  const historySummary = document.createElement('summary')
  historySummary.textContent = '최근 팩'
  const historyList = document.createElement('div')
  historyList.className = 'context-pack-panel__list'
  historySection.append(historySummary, historyList)

  host.append(
    title,
    intentInput,
    matchedProfile,
    hint,
    templateRow,
    grid,
    profileSection,
    historySection
  )

  function mkInput(placeholder: string): HTMLInputElement {
    const input = document.createElement('input')
    input.className = 'context-pack-panel__input'
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
      const copyPrompt = document.createElement('button')
      copyPrompt.type = 'button'
      copyPrompt.textContent = '프롬프트'
      copyPrompt.addEventListener('click', () => {
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
      deleteBtn.appendChild(panelLucideIcon(X, 14))
      deleteBtn.addEventListener('click', () => {
        void (async () => {
          history = history.filter((h) => h.id !== item.id)
          await setStorageItem(HISTORY_STORAGE_KEY, history)
          renderHistory()
        })()
      })
      row.append(meta, copyPrompt, copyAll, deleteBtn)
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

  btnPrompt.addEventListener('click', () => {
    void copyPack(buildPromptText, 'AI 프롬프트를 복사했습니다.')
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

  return { sync, resetPack, loadPack }
}
