export function showToast(
  message: string,
  kind: 'error' | 'info' = 'info'
): void {
  const root = document.getElementById('toast-root')
  if (!root) return
  const el = document.createElement('div')
  el.className = `toast toast--${kind}`
  el.textContent = message
  root.appendChild(el)
  requestAnimationFrame(() => el.classList.add('toast--show'))
  window.setTimeout(() => {
    el.classList.remove('toast--show')
    window.setTimeout(() => el.remove(), 220)
  }, 3200)
}
