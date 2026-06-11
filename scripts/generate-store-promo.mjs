/*
 * 스토어 프로모 타일 generator — 소형 440×280(필수) + 마퀴 1400×560(피처드).
 * 공식 가이드: 텍스트 최소·고채도·흰/밝은회색 과다 금지·풀블리드·알파 금지·절반 축소 인식.
 * 시그널 레드 풀블리드 + 흰 카메라 글리프(메인 아이콘 지오메트리) + 워드마크 — 스위스 에디토리얼.
 */
import { chromium } from 'playwright'
import sharp from 'sharp'
import { mkdirSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const OUTPUT_DIR = resolve(PROJECT_ROOT, 'docs', 'store', 'promo')
const FONT_DIR = resolve(PROJECT_ROOT, 'src', 'sidepanel', 'fonts')

mkdirSync(OUTPUT_DIR, { recursive: true })

function fontDataUrl(file) {
  const buf = readFileSync(resolve(FONT_DIR, file))
  return `data:font/woff2;base64,${buf.toString('base64')}`
}
const ARCHIVO_URL = fontDataUrl('Archivo-wght-latin.woff2')
const MONO_URL = fontDataUrl('JetBrainsMono-wght-latin.woff2')

/* App.ts BRAND_SVG와 동일 지오메트리 — 메인 확장 아이콘 카메라 */
function brandSvg(size, stroke) {
  return `<svg width="${size}" height="${size}" viewBox="0 4 128 128" aria-hidden="true"><path d="M21 42h20l9-13h28l9 13h20c7.2 0 13 5.8 13 13v39c0 7.2-5.8 13-13 13H21c-7.2 0-13-5.8-13-13V55c0-7.2 5.8-13 13-13Z" fill="none" stroke="${stroke}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><circle cx="64" cy="75" r="22" fill="none" stroke="${stroke}" stroke-width="13"/><circle cx="64" cy="75" r="8" fill="${stroke}"/></svg>`
}

function baseCss(width, height) {
  return `
    @font-face {
      font-family: 'Archivo';
      src: url('${ARCHIVO_URL}') format('woff2-variations');
      font-weight: 100 800;
    }
    @font-face {
      font-family: 'JetBrains Mono';
      src: url('${MONO_URL}') format('woff2-variations');
      font-weight: 100 800;
    }
    * { box-sizing: border-box; margin: 0; }
    body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: #E5302E;
      color: #FFFFFF;
      font-family: 'Archivo', 'Malgun Gothic', 'Segoe UI', sans-serif;
    }
  `
}

/* 소형 타일 440×280 — 글리프 + 워드마크만. 절반(220×140) 축소에도 식별 */
function tileHtml() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    ${baseCss(440, 280)}
    .wrap {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      width: 440px;
      height: 280px;
      padding: 30px 34px 26px;
      border: 6px solid #15110F;
    }
    .glyph-row { display: flex; align-items: flex-start; justify-content: space-between; }
    .ver {
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.18em;
    }
    .word {
      font-size: 47px;
      font-weight: 800;
      letter-spacing: 0.045em;
      line-height: 1;
      text-transform: uppercase;
    }
    .rule { width: 64px; height: 7px; background: #FFFFFF; margin-bottom: 14px; }
  </style></head><body>
    <div class="wrap">
      <div class="glyph-row">${brandSvg(84, '#FFFFFF')}<span class="ver">V0.2.0</span></div>
      <div>
        <div class="rule"></div>
        <div class="word">Snap<br>Context</div>
      </div>
    </div>
  </body></html>`
}

/* 마퀴 1400×560 — 워드마크 + 글리프 + 태그라인 1줄 */
function marqueeHtml() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    ${baseCss(1400, 560)}
    .wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 56px;
      width: 1400px;
      height: 560px;
      padding: 0 88px;
      border: 10px solid #15110F;
    }
    .copy { flex: none; }
    .word {
      font-size: 106px;
      font-weight: 800;
      letter-spacing: 0.01em;
      line-height: 0.98;
      text-transform: uppercase;
    }
    .rule { width: 120px; height: 12px; background: #FFFFFF; margin: 0 0 28px; }
    .tag {
      margin-top: 30px;
      font-size: 34px;
      font-weight: 700;
      letter-spacing: 0.01em;
      word-break: keep-all;
    }
    .tag .mono {
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-weight: 700;
    }
    .glyph { flex: none; }
  </style></head><body>
    <div class="wrap">
      <div class="copy">
        <div class="rule"></div>
        <div class="word">SnapContext</div>
        <div class="tag">캡처 한 번 <span class="mono">→</span> AI 컨텍스트 완성</div>
      </div>
      <div class="glyph">${brandSvg(236, '#FFFFFF')}</div>
    </div>
  </body></html>`
}

const TARGETS = [
  { file: 'tile-440x280.png', width: 440, height: 280, html: tileHtml() },
  { file: 'marquee-1400x560.png', width: 1400, height: 560, html: marqueeHtml() }
]

async function main() {
  const browser = await chromium.launch()
  try {
    for (const t of TARGETS) {
      const page = await browser.newPage({
        viewport: { width: t.width, height: t.height }
      })
      await page.setContent(t.html, { waitUntil: 'load' })
      await page.waitForTimeout(250)
      const outputPath = resolve(OUTPUT_DIR, t.file)
      await page.screenshot({ path: outputPath })
      await page.close()

      const meta = await sharp(outputPath).metadata()
      if (meta.width !== t.width || meta.height !== t.height) {
        throw new Error(`${t.file} invalid size ${meta.width}x${meta.height}`)
      }
      if (meta.hasAlpha) {
        /* 스토어 규격: 알파 금지 → RGB로 평탄화 재저장 */
        const flat = await sharp(outputPath).flatten({ background: '#E5302E' }).removeAlpha().png().toBuffer()
        await sharp(flat).toFile(outputPath)
      }
      console.log(`[store-promo] saved ${outputPath}`)
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('[store-promo] failed:', err)
  process.exit(1)
})
