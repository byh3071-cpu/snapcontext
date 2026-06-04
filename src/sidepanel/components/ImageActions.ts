import { Copy, Download, UploadCloud } from 'lucide'
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
import { panelLucideIcon } from '../utils/panel-lucide'

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

export function mountImageActions(
  host: HTMLElement,
  deps: {
    hasCapture: () => boolean
    getImage: () => string | null
    getPins: () => PinItem[]
    getContext: () => SharedContext | null
    showToast: (message: string, kind?: 'info' | 'error') => void
  }
): ImageActionsApi {
  host.classList.add('image-actions')

  const row = document.createElement('div')
  row.className = 'image-actions__row'

  const mkBtn = (
    label: string,
    icon: SVGElement,
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

  const btnCopy = mkBtn('PNG 복사', panelLucideIcon(Copy, 18), 'primary')
  const btnSave = mkBtn('PNG 저장', panelLucideIcon(Download, 18), 'default')
  btnCopy.title = 'PNG 복사 (Alt+Shift+P)'
  btnSave.title = 'PNG 저장'
  row.append(btnCopy, btnSave)

  // 공유 링크 버튼 (전체 폭)
  const shareRow = document.createElement('div')
  shareRow.className = 'image-actions__share-row'
  const btnShare = mkBtn('공유 링크', panelLucideIcon(UploadCloud, 18), 'default')
  btnShare.title = '공유 링크 생성 (공개·7일)'
  const shareLabel = btnShare.querySelector('span:last-child') as HTMLSpanElement
  shareRow.append(btnShare)

  // 컨텍스트 포함 토글
  const toggleLabel = document.createElement('label')
  toggleLabel.className = 'image-actions__toggle'
  const toggleInput = document.createElement('input')
  toggleInput.type = 'checkbox'
  const toggleText = document.createElement('span')
  toggleText.textContent = '컨텍스트 포함 (소스 주소·핀 메모)'
  toggleLabel.append(toggleInput, toggleText)

  host.append(row, shareRow, toggleLabel)

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
      shareLabel.textContent = '공유 링크'
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
    host.hidden = !has
    btnCopy.disabled = !has
    btnSave.disabled = !has
    btnShare.disabled = !has
  }
  sync()

  return { sync, copyPng: onCopy }
}
