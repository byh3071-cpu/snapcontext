import type { ContextPack } from '../types'
import { renderTemplate } from './template-engine'
import bugReportTemplate from '../../prompts/templates/bug-report.md?raw'
import refactorTemplate from '../../prompts/templates/refactor.md?raw'
import referenceTemplate from '../../prompts/templates/reference.md?raw'

export type PromptTemplateId = 'bug' | 'refactor' | 'reference'

export const PROMPT_TEMPLATES: Record<PromptTemplateId, string> = {
  bug: bugReportTemplate,
  refactor: refactorTemplate,
  reference: referenceTemplate
}

export const DEFAULT_PROMPT_TEMPLATE: PromptTemplateId = 'bug'

export type BuildTemplatePromptExtras = {
  userAgent?: string
  userNote?: string
  viewport?: { width: number; height: number }
}

function parseViewport(value: string): { width: number; height: number } {
  const [w, h] = value.split('x').map((part) => Number.parseInt(part, 10))
  return {
    width: Number.isFinite(w) ? w : 0,
    height: Number.isFinite(h) ? h : 0
  }
}

export function buildTemplatePrompt(
  pack: ContextPack,
  template: PromptTemplateId,
  extras?: BuildTemplatePromptExtras
): string {
  const source = pack.source
  const capture = pack.capture
  const viewport = extras?.viewport ?? parseViewport(capture.viewport)
  const ctx = {
    source: {
      url: source.url,
      title: source.title,
      userAgent: extras?.userAgent ?? '',
      captureType: capture.type,
      viewport
    },
    pins: pack.annotations.map((a) => ({
      id: a.id,
      x: a.position.x.toFixed(1),
      y: a.position.y.toFixed(1),
      memo: a.memo?.trim() ? a.memo : '(메모 없음)'
    })),
    context: {
      userNote: extras?.userNote?.trim() ?? ''
    }
  }
  return renderTemplate(PROMPT_TEMPLATES[template], ctx)
}
