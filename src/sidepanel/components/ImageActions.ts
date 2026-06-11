import type { PinItem, SharedContext } from '../../types'
import {
  copyAnnotatedPngToClipboard,
  downloadAnnotatedPng,
  renderAnnotatedPngBlob
} from '../../utils/annotated-image'
import { toKoreanErrorMessage } from '../../utils/messaging'
import { uploadShare } from '../../utils/upload'
import { getStorageItem, setStorageItem } from '../../storage'
import { showConfirm } from '../confirm-dialog'
import { swissIcon, type SwissIconName } from '../utils/swiss-icons'
import { mkSecHead } from '../utils/section'

const CONSENT_KEY = 'snapcontext.uploadConsent'
const INCLUDE_CONTEXT_KEY = 'snapcontext.shareIncludeContext'
const CONSENT_MESSAGE =
  '공개 링크로 업로드됩니다. 링크를 아는 누구나 볼 수 있고 7일 후 삭제됩니다. ' +
  '컨텍스트 포함을 켜면 소스 주소·핀 메모도 함께 공개됩니다(주소에 토큰·쿼리가 있을 수 있으니 주의). ' +
  '민감한 화면은 주의하세요.'

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
  const { head } = mkSecHead({
    num: '04',
    eyebrow: '발행',
    title: '공유',
    titleId: 'sec-share-title',
    asideText: '7일'
  })

  const block = document.createElement('div')
  block.className = 'publish-block'

  const cap = document.createElement('div')
  cap.className = 'publish-cap'
  cap.setAttribute('aria-hidden', 'true')
  cap.innerHTML =
    '<span class="pc-num tnum">04</span><span class="pc-txt">PUBLISH · 공개 · 7일 만료</span>'

  const shareRow = document.createElement('div')
  shareRow.className = 'image-actions__share-row'
  const btnShare = document.createElement('button')
  btnShare.type = 'button'
  btnShare.className = 'btn-publish'
  btnShare.title = '공유 링크 생성 (공개·7일)'
  const shareIcon = swissIcon('share')
  const shareLabel = document.createElement('span')
  shareLabel.textContent = '공유 링크 생성 (공개·7일)'
  btnShare.append(shareIcon, shareLabel)
  shareRow.append(btnShare)

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
    try {
      // 최초 1회 동의
      const consented = (await getStorageItem<boolean>(CONSENT_KEY)) ?? false
      if (!consented) {
        const ok = await showConfirm(CONSENT_MESSAGE)
        if (!ok) return
        await setStorageItem(CONSENT_KEY, true)
      }

      btnShare.disabled = true
      shareLabel.textContent = '업로드 중…'
      const blob = await renderAnnotatedPngBlob(img, deps.getPins())
      const ctx = toggleInput.checked ? deps.getContext() ?? undefined : undefined
      const url = await uploadShare(blob, ctx)
      try {
        await navigator.clipboard.writeText(url)
        deps.showToast('공유 링크 복사됨 · 7일 후 만료', 'info')
      } catch {
        deps.showToast(`공유 링크: ${url} (복사 실패)`, 'info')
      }
    } catch (e) {
      deps.showToast(toKoreanErrorMessage(e), 'error')
    } finally {
      sharing = false
      btnShare.disabled = !deps.hasCapture()
      shareLabel.textContent = '공유 링크 생성 (공개·7일)'
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
