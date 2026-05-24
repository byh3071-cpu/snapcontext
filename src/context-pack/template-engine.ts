export type TemplateContext = Record<string, unknown>

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/
const IF_BLOCK_RE = /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g
const EACH_BLOCK_RE = /\{\{#each\s+([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g
const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g

function lookup(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[key]
  }, obj)
}

function stringify(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  return String(value)
}

function isTruthy(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'boolean') return value
  return true
}

function trimSurroundingNewline(s: string): string {
  return s.replace(/^\r?\n/, '').replace(/\r?\n$/, '')
}

function renderVars(template: string, ctx: unknown): string {
  return template.replace(VAR_RE, (_match, path: string) => {
    return stringify(lookup(ctx, path))
  })
}

export function renderTemplate(template: string, ctx: TemplateContext): string {
  let out = template.replace(FRONTMATTER_RE, '')

  out = out.replace(IF_BLOCK_RE, (_match, path: string, body: string) => {
    if (!isTruthy(lookup(ctx, path))) return ''
    return trimSurroundingNewline(body)
  })

  out = out.replace(EACH_BLOCK_RE, (_match, path: string, body: string) => {
    const arr = lookup(ctx, path)
    if (!Array.isArray(arr) || arr.length === 0) return ''
    const trimmedBody = trimSurroundingNewline(body)
    return arr.map((item) => renderVars(trimmedBody, item)).join('\n')
  })

  out = renderVars(out, ctx)

  return out.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
