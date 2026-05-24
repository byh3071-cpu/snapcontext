export function buildSelectorForElement(element: Element): string {
  const escapeId = (id: string): string => {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(id)
    }
    return id.replace(/([^a-zA-Z0-9_-])/g, '\\$1')
  }

  if (element.id) {
    return `#${escapeId(element.id)}`
  }

  const parts: string[] = []
  let current: Element | null = element
  let depth = 0
  const maxDepth = 8

  while (current !== null && depth < maxDepth) {
    if (current.nodeType !== Node.ELEMENT_NODE) {
      break
    }

    const el: Element = current
    const tag = el.tagName.toLowerCase()
    const parent: Element | null = el.parentElement

    if (parent === null) {
      parts.unshift(tag)
      break
    }

    const tagName = el.tagName
    const siblings: Element[] = []
    for (const node of parent.children) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue
      const childEl = node as Element
      if (childEl.tagName === tagName) {
        siblings.push(childEl)
      }
    }

    const index = siblings.indexOf(el) + 1
    parts.unshift(`${tag}:nth-of-type(${index})`)
    current = parent
    depth += 1
  }

  return parts.join(' > ')
}
