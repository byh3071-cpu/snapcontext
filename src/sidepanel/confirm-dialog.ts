export function showConfirm(
  message: string,
  mount: HTMLElement = document.body
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: boolean): void => {
      if (settled) return
      settled = true
      window.removeEventListener('keydown', onEscape)
      backdrop.remove()
      resolve(value)
    }

    const onEscape = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        finish(false)
      }
    }

    const backdrop = document.createElement('div')
    backdrop.className = 'snap-confirm'
    backdrop.setAttribute('role', 'dialog')
    backdrop.setAttribute('aria-modal', 'true')

    const panel = document.createElement('div')
    panel.className = 'snap-confirm__panel'

    const text = document.createElement('p')
    text.className = 'snap-confirm__message'
    text.textContent = message

    const actions = document.createElement('div')
    actions.className = 'snap-confirm__actions'

    const btnCancel = document.createElement('button')
    btnCancel.type = 'button'
    btnCancel.className = 'snap-confirm__btn snap-confirm__btn--muted'
    btnCancel.textContent = '취소'

    const btnOk = document.createElement('button')
    btnOk.type = 'button'
    btnOk.className = 'snap-confirm__btn snap-confirm__btn--primary'
    btnOk.textContent = '계속'

    btnCancel.addEventListener('click', () => finish(false))
    btnOk.addEventListener('click', () => finish(true))

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) finish(false)
    })

    panel.addEventListener('click', (e) => {
      e.stopPropagation()
    })

    actions.append(btnCancel, btnOk)
    panel.append(text, actions)
    backdrop.appendChild(panel)

    window.addEventListener('keydown', onEscape)
    mount.appendChild(backdrop)
    btnOk.focus()
  })
}
