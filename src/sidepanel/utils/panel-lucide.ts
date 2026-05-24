import { createElement, type IconNode } from 'lucide'

export function panelLucideIcon(node: IconNode, size: number): SVGElement {
  return createElement(node, {
    width: size,
    height: size,
    class: 'panel-lucide-icon',
    'aria-hidden': 'true'
  })
}

export function panelLucideIconRow(
  nodes: readonly [IconNode, IconNode],
  size: number
): HTMLSpanElement {
  const row = document.createElement('span')
  row.className = 'panel-lucide-icon-row'
  row.append(panelLucideIcon(nodes[0], size), panelLucideIcon(nodes[1], size))
  return row
}
