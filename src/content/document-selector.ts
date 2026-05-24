function isVisibleBlock(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 32 || rect.height < 32) return false
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  if (Number(style.opacity) === 0) return false
  return true
}

export function findMainContentRoot(doc: Document): Element | null {
  const article = doc.querySelector('article')
  if (article && isVisibleBlock(article)) return article

  const mainEl = doc.querySelector('main')
  if (mainEl && isVisibleBlock(mainEl)) return mainEl

  const roleMain = doc.querySelector('[role="main"]')
  if (roleMain && isVisibleBlock(roleMain)) return roleMain

  return findLargestTextDensityBlock(doc)
}

function findLargestTextDensityBlock(doc: Document): Element | null {
  const body = doc.body
  if (!body) return null

  const candidates = Array.from(
    body.querySelectorAll('div, section, article, main, aside, header, footer')
  ).filter((el) => isVisibleBlock(el))

  let best: Element | null = null
  let bestScore = 0

  for (const el of candidates) {
    const html = el as HTMLElement
    const text = html.innerText?.trim() ?? ''
    if (text.length < 48) continue
    const rect = html.getBoundingClientRect()
    const area = rect.width * rect.height
    if (area < 8000) continue
    const score = text.length / Math.sqrt(area + 1)
    if (score > bestScore) {
      bestScore = score
      best = el
    }
  }

  return best
}
