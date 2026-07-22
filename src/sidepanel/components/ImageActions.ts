import type { PinItem, SharedContext } from '../../types'
import {
  copyAnnotatedPngToClipboard,
  downloadAnnotatedPng,
  renderAnnotatedPngBlob
} from '../../utils/annotated-image'
import { toKoreanErrorMessage } from '../../utils/messaging'
import type { ExpiryDays } from '../../utils/upload'
import { uploadShareWithToken } from '../../utils/share-upload'
import {
  DEFAULT_SHARE_EXPIRY_DAYS,
  SHARE_EXPIRY_CHANGED_EVENT,
  buildShareConsentMessage,
  buildShareSuccessMessage,
  formatExpiryDays,
  loadShareExpiryDays,
  needsShareConsent,
  readConsentedDays
} from '../../utils/share-expiry'
import { getStorageItem, setStorageItem } from '../../storage'
import { showConfirm } from '../confirm-dialog'
import { swissIcon, type SwissIconName } from '../utils/swiss-icons'
import { mkSecHead } from '../utils/section'

const CONSENT_KEY = 'snapcontext.uploadConsent'
const INCLUDE_CONTEXT_KEY = 'snapcontext.shareIncludeContext'

export type ImageActionsApi = {
  sync: () => void
  copyPng: () => Promise<void>
}

/**
 * 캡처 내보내기 액션 — 두 호스트로 분리 마운트 (디자인 SoT):
 * - pngHost: §02 미리보기 카드 내 PNG 복사/저장 듀오
 * - shareHost: §04 공유 섹션 (발행 블록 + 컨텍스트 토글)
 * 두 호스트 모두 캡처 전 hidden (progressive disclosure).
 */
export function mountImageActions(
  pngHost: HTMLElement,
  shareHost: HTMLElement,
  deps: {
    hasCapture: () => boolean
    getImage: () => string | null
    getPins: () => PinItem[]
    getContext: () => SharedContext | null
    showToast: (message: string, kind?: 'info' | 'error') => void
  }
): ImageActionsApi {
  /* ---- §02 카드 내 PNG 듀오 ---- */
  pngHost.classList.add('image-actions')

  const row = document.createElement('div')
  row.className = 'duo image-actions__row'

  const mkBtn = (label: string, icon: SwissIconName): HTMLButtonElement => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn btn-ghost context-pack-panel__btn'
    const iconWrap = document.createElement('span')
    iconWrap.className = 'context-pack-panel__icon'
    iconWrap.setAttribute('aria-hidden', 'true')
    iconWrap.append(swissIcon(icon))
    const labelSpan = document.createElement('span')
    labelSpan.textContent = label
    btn.append(iconWrap, labelSpan)
    return btn
  }

  const btnCopy = mkBtn('PNG 복사', 'copy')
  const btnSave = mkBtn('PNG 저장', 'download')
  btnCopy.title = 'PNG 복사 (단축키: 직접 지정)'
  btnSave.title = 'PNG 저장'
  row.append(btnCopy, btnSave)
  pngHost.append(row)

  /* ---- §04 공유 섹션: 발행 블록 ---- */
  // 만료 문구 5곳(aside·캡션·버튼 title·버튼 라벨·업로드 후 라벨 복원)이 설정 변경 시
  // 함께 갱신돼야 해서 asideEl 을 버리지 않고 받는다 (ContextPackPanel 선례)
  const { head, asideEl } = mkSecHead({
    num: '04',
    eyebrow: '발행',
    title: '공유',
    titleId: 'sec-share-title',
    asideText: formatExpiryDays(DEFAULT_SHARE_EXPIRY_DAYS)
  })

  const block = document.createElement('div')
  block.className = 'publish-block'

  const cap = document.createElement('div')
  cap.className = 'publish-cap'
  cap.setAttribute('aria-hidden', 'true')
  const capNum = document.createElement('span')
  capNum.className = 'pc-num tnum'
  capNum.textContent = '04'
  // innerHTML 대신 노드로 만든다 — 만료 문구만 따로 갱신하려면 참조가 필요하다
  const capTxt = document.createElement('span')
  capTxt.className = 'pc-txt'
  cap.append(capNum, capTxt)

  const shareRow = document.createElement('div')
  shareRow.className = 'image-actions__share-row'
  const btnShare = document.createElement('button')
  btnShare.type = 'button'
  btnShare.className = 'btn-publish'
  const shareIcon = swissIcon('share')
  const shareLabel = document.createElement('span')
  btnShare.append(shareIcon, shareLabel)
  shareRow.append(btnShare)

  /* ---- 만료 문구 단일 재렌더 ---- */
  // 마운트 시점에 값이 정해지고 갱신 훅이 없던 5곳을 여기 한 곳으로 묶는다.
  // 설정에서 보관 기간을 바꾸면 이 함수만 다시 부르면 된다.
  let expiryDays: ExpiryDays = DEFAULT_SHARE_EXPIRY_DAYS
  const renderExpiryTexts = (): void => {
    const label = formatExpiryDays(expiryDays)
    asideEl.textContent = label
    capTxt.textContent = `PUBLISH · 공개 · ${label} 만료`
    // e2e 로케이터가 '공유 링크' substring 에 결합돼 있다 — 이 접두사는 유지해야 한다
    const shareText = `공유 링크 생성 (공개·${label})`
    btnShare.title = shareText
    shareLabel.textContent = shareText
  }
  renderExpiryTexts()

  /* 컨텍스트 포함 토글 — 직각 스위치 */
  const toggleLabel = document.createElement('label')
  toggleLabel.className = 'toggle-row image-actions__toggle'
  const toggleText = document.createElement('span')
  toggleText.className = 'toggle-text'
  toggleText.innerHTML =
    '<span class="tt-title">컨텍스트 포함</span><span class="tt-sub">소스 주소·핀 메모</span>'
  const toggleSwitch = document.createElement('span')
  toggleSwitch.className = 'switch'
  const toggleInput = document.createElement('input')
  toggleInput.type = 'checkbox'
  toggleInput.setAttribute('aria-label', '컨텍스트 포함 (소스 주소·핀 메모)')
  const track = document.createElement('span')
  track.className = 'track'
  track.setAttribute('aria-hidden', 'true')
  toggleSwitch.append(toggleInput, track)
  toggleLabel.append(toggleText, toggleSwitch)

  block.append(cap, shareRow, toggleLabel)
  shareHost.append(head, block)

  // 토글 상태 로드 (기본 OFF)
  void (async () => {
    toggleInput.checked =
      (await getStorageItem<boolean>(INCLUDE_CONTEXT_KEY)) ?? false
  })()
  toggleInput.addEventListener('change', () => {
    void setStorageItem(INCLUDE_CONTEXT_KEY, toggleInput.checked)
  })

  // 보관 기간 로드 + 설정 패널에서 바뀌면 문구 갱신 (storage/history.ts 의 이벤트 방식 선례)
  const reloadExpiryDays = async (): Promise<void> => {
    expiryDays = await loadShareExpiryDays()
    // 업로드 중이면 라벨은 '업로드 중…' 이어야 한다 — 복원은 onShare 의 finally 가 한다
    if (!sharing) renderExpiryTexts()
  }
  void reloadExpiryDays()
  window.addEventListener(SHARE_EXPIRY_CHANGED_EVENT, () => {
    void reloadExpiryDays()
  })

  const onCopy = async (): Promise<void> => {
    const img = deps.getImage()
    if (!img) {
      deps.showToast('캡처 데이터가 없습니다.', 'error')
      return
    }
    try {
      await copyAnnotatedPngToClipboard(img, deps.getPins())
      deps.showToast('이미지를 클립보드에 복사했습니다.', 'info')
    } catch (e) {
      deps.showToast(toKoreanErrorMessage(e), 'error')
    }
  }

  const onSave = async (): Promise<void> => {
    const img = deps.getImage()
    if (!img) {
      deps.showToast('캡처 데이터가 없습니다.', 'error')
      return
    }
    try {
      const filename = `snapcontext_${Date.now()}.png`
      await downloadAnnotatedPng(img, deps.getPins(), filename)
      deps.showToast('PNG 다운로드를 시작했습니다.', 'info')
    } catch (e) {
      deps.showToast(toKoreanErrorMessage(e), 'error')
    }
  }

  // 업로드 중 재진입(더블클릭 → 중복 업로드) 방지용 동기 가드
  let sharing = false
  const onShare = async (): Promise<void> => {
    if (sharing) return
    const img = deps.getImage()
    if (!img) {
      deps.showToast('캡처 데이터가 없습니다.', 'error')
      return
    }
    sharing = true
    // 이 업로드가 쓸 보관 기간을 여기서 한 번 고정한다 — 동의 문구·전송값·성공 토스트가
    // 같은 값을 봐야 한다(중간에 설정이 바뀌어도 사실과 다른 동의가 되지 않게)
    const days = expiryDays
    try {
      // 동의 — 문구에 선택한 보관 기간이 들어가고, 동의한 기간을 함께 저장한다.
      // 더 긴 기간으로 올리면 다시 받는다(짧게 줄이는 건 불리하지 않으니 안 묻는다).
      const consentedDays = readConsentedDays(
        await getStorageItem<unknown>(CONSENT_KEY)
      )
      if (needsShareConsent(consentedDays, days)) {
        const ok = await showConfirm(buildShareConsentMessage(days))
        if (!ok) return
        await setStorageItem(CONSENT_KEY, days)
      }

      btnShare.disabled = true
      shareLabel.textContent = '업로드 중…'
      const blob = await renderAnnotatedPngBlob(img, deps.getPins())
      const ctx = toggleInput.checked ? deps.getContext() ?? undefined : undefined
      // 토큰 발급은 반드시 업로드 직전에 — 사이드패널 초기화 시점에 부르면
      // e2e 의 fetch mock 설치(page.goto 후) 이전이라 실제 네트워크로 나간다.
      // 발급 실패(null)면 익명 업로드, 서버가 토큰을 거부(401)하면 폐기 후 익명 재시도.
      const { url, anonymous } = await uploadShareWithToken(blob, ctx, days)
      try {
        await navigator.clipboard.writeText(url)
        // /upload 응답에 expiresAt 이 없다(ADR-013) → 로컬 선택값으로 문구를 만든다.
        // 익명으로 올라갔으면 성공이어도 그 사실을 알린다(owner 미스탬프 = MCP 목록 누락).
        // 레벨이 error 가 아닌 이유: 업로드는 실제로 성공했고 링크도 유효하다.
        deps.showToast(buildShareSuccessMessage(days, anonymous), 'info')
      } catch {
        const anonNote = anonymous ? ' · 익명 업로드라 내 캡처 목록(MCP)에 안 뜹니다' : ''
        deps.showToast(`공유 링크: ${url} (복사 실패)${anonNote}`, 'info')
      }
    } catch (e) {
      deps.showToast(toKoreanErrorMessage(e), 'error')
    } finally {
      sharing = false
      btnShare.disabled = !deps.hasCapture()
      // 라벨 복원도 재렌더로 — 업로드 중 설정이 바뀌었으면 최신 기간이 반영된다
      renderExpiryTexts()
    }
  }

  btnCopy.addEventListener('click', () => {
    void onCopy()
  })
  btnSave.addEventListener('click', () => {
    void onSave()
  })
  btnShare.addEventListener('click', () => {
    void onShare()
  })

  const sync = (): void => {
    const has = deps.hasCapture()
    pngHost.hidden = !has
    shareHost.hidden = !has
    btnCopy.disabled = !has
    btnSave.disabled = !has
    btnShare.disabled = !has
  }
  sync()

  return { sync, copyPng: onCopy }
}
