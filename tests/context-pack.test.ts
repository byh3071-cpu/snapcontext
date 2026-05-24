import { describe, expect, it } from 'vitest'

import {
  generateContextPack,
  type GenerateContextPackInput
} from '../src/context-pack/generator'
import { buildTemplatePrompt } from '../src/context-pack/prompt-builder'

const baseInput = (): GenerateContextPackInput => ({
  imageBase64: 'data:image/png;base64,AAAA',
  captureType: 'visible',
  pins: [],
  sourceUrl: 'https://example.com/page',
  sourceTitle: 'Example',
  viewport: { width: 1280, height: 720 },
  userAgent: 'Chrome Test',
  imageWidth: 240,
  imageHeight: 120
})

describe('context pack', () => {
  it('generateContextPack is lightweight (no image, no legacy prompt)', () => {
    const pack = generateContextPack(baseInput())
    const raw = JSON.stringify(pack)

    expect(raw.length).toBeLessThan(2048)
    expect(raw).not.toContain('AAAA')
    expect(raw).not.toContain('imageBase64')
    expect(pack.version).toBe('0.2')
    expect(pack.capture.viewport).toBe('1280x720')
    expect(pack.capture.imageSize).toBe('240x120')
    expect(pack.source.url).toContain('example.com')
    expect(pack.mode).toBe('context')
    expect(pack.debugLogs).toEqual([])
    expect(pack.prompt).toBeUndefined()
  })
})

describe('buildTemplatePrompt', () => {
  it('renders the bug template with pins and userAgent', () => {
    const pack = generateContextPack({
      ...baseInput(),
      pins: [{ id: 1, x: 10.25, y: 20.5, memo: 'button is broken' }]
    })
    const md = buildTemplatePrompt(pack, 'bug', { userAgent: 'Test UA' })

    expect(md).toContain('# 🐛 버그 리포트')
    expect(md).toContain('https://example.com/page')
    expect(md).toContain('1280×720')
    expect(md).toContain('Test UA')
    expect(md).toContain('button is broken')
    expect(md).toContain('10.3%')
    expect(md).toContain('20.5%')
    expect(md).not.toContain('## 추가 메모')
  })

  it('emits the userNote section only when userNote is set', () => {
    const pack = generateContextPack(baseInput())

    const without = buildTemplatePrompt(pack, 'refactor')
    expect(without).toContain('# 🔧 리팩토링 요청')
    expect(without).not.toContain('## 추가 메모')

    const withNote = buildTemplatePrompt(pack, 'refactor', {
      userNote: '성능 개선 부탁'
    })
    expect(withNote).toContain('## 추가 메모')
    expect(withNote).toContain('성능 개선 부탁')
  })

  it('renders the reference template with title and falls back when no pins', () => {
    const pack = generateContextPack(baseInput())
    const md = buildTemplatePrompt(pack, 'reference')

    expect(md).toContain('# 📐 레퍼런스 참고 구현')
    expect(md).toContain('Example')
    // pins 가 비어 있으면 #each 블록은 통째로 제거되어 핀 본문 줄이 없어야 함
    expect(md).not.toMatch(/^- \*\*핀 \d/m)
    // pins 가 비어 있으면 "## 핀 주석" 헤더 자체도 출력되지 않아야 함
    expect(md).not.toContain('## 핀 주석')
  })

  it('omits the pin section header for all 3 templates when no pins', () => {
    const pack = generateContextPack(baseInput())
    for (const template of ['bug', 'refactor', 'reference'] as const) {
      const md = buildTemplatePrompt(pack, template)
      expect(md, `template=${template}`).not.toContain('## 핀 주석')
    }
  })

  it('shows the pin section header when pins are present', () => {
    const pack = generateContextPack({
      ...baseInput(),
      pins: [{ id: 1, x: 10, y: 20, memo: 'click target' }]
    })
    const md = buildTemplatePrompt(pack, 'bug')
    expect(md).toContain('## 핀 주석')
    expect(md).toContain('click target')
  })

  it('substitutes "(메모 없음)" for blank pin memos', () => {
    const pack = generateContextPack({
      ...baseInput(),
      pins: [{ id: 1, x: 0, y: 0, memo: '' }]
    })
    const md = buildTemplatePrompt(pack, 'bug')

    expect(md).toContain('(메모 없음)')
  })
})
