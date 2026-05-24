import { Copy, Download } from 'lucide'
import type { PinItem } from '../../types'
import {
  copyAnnotatedPngToClipboard,
  downloadAnnotatedPng
} from '../../utils/annotated-image'
import { toKoreanErrorMessage } from '../../utils/messaging'
import { panelLucideIcon } from '../utils/panel-lucide'

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
  btnCopy.title = 'PNG copy (Alt+Shift+P)'
  btnSave.title = 'PNG save'
  row.append(btnCopy, btnSave)
  host.append(row)

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

  btnCopy.addEventListener('click', () => {
    void onCopy()
  })
  btnSave.addEventListener('click', () => {
    void onSave()
  })

  const sync = (): void => {
    const has = deps.hasCapture()
    host.hidden = !has
    btnCopy.disabled = !has
    btnSave.disabled = !has
  }
  sync()

  return { sync, copyPng: onCopy }
}
