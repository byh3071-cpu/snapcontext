/*
 * SnapContext extended coverage probe.
 *
 * Picks up where smoke / pin-flow / loaded-pack-pin leave off:
 *
 *   #14, #15, #16  Image lightbox open / ESC + backdrop close / shows original
 *   #17, #19       PNG copy → clipboard ImageItem (with baked pin annotations)
 *   #18            PNG save → chrome.downloads.download invocation
 *   #21            Template switching produces template-specific prompt
 *   #23            JSON copy puts valid JSON on clipboard
 *   #24            Prompt+JSON copy contains both sections
 *   #25            Template selection persists across panel reload
 *   #26            History list grows with multiple distinct captures
 *
 * One Chromium launch, multiple phases.
 */
import { chromium } from 'playwright'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..', '..')
const EXTENSION_PATH = resolve(PROJECT_ROOT, 'dist')
const SCREENSHOTS_DIR = resolve(__dirname, 'screenshots')
const USER_DATA_DIR = resolve(tmpdir(), `snapcontext-cov-${Date.now()}`)

if (!existsSync(EXTENSION_PATH)) {
  console.error('[coverage] dist/ not found. Run "npm run build" first.')
  process.exit(1)
}
mkdirSync(SCREENSHOTS_DIR, { recursive: true })

const results = []
const log = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const fakeBuf = await sharp({
  create: {
    width: 200,
    height: 200,
    channels: 4,
    background: { r: 90, g: 110, b: 140, alpha: 1 }
  }
})
  .png()
  .toBuffer()
const FAKE_PNG = `data:image/png;base64,${fakeBuf.toString('base64')}`

function fakeCapture(overrides = {}) {
  return {
    type: 'CAPTURE_RESULT',
    imageData: FAKE_PNG,
    captureType: 'visible',
    sourceUrl: 'http://test.local/page',
    sourceTitle: 'Test Page',
    viewport: { width: 1280, height: 720 },
    userAgent: 'Test/1.0',
    debugLogs: [],
    imageWidth: 200,
    imageHeight: 200,
    ...overrides
  }
}

async function injectCapture(sw, payload) {
  await sw.evaluate(async (p) => {
    await chrome.runtime.sendMessage(p)
  }, payload)
}

async function readClipboardText(page) {
  return page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText()
    } catch (e) {
      return `<<read failed: ${e instanceof Error ? e.message : String(e)}>>`
    }
  })
}

async function isImageLightboxVisible(page) {
  return page.evaluate(() => {
    const lb = document.querySelector('.image-lightbox')
    if (!lb) return false
    return !lb.hasAttribute('hidden')
  })
}

async function getServiceWorker(context) {
  const existing = context.serviceWorkers()
  if (existing.length > 0) return existing[0]
  return context.waitForEvent('serviceworker', { timeout: 10000 })
}

async function main() {
  console.log('[coverage] launching chromium')
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 400, height: 900 },
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-default-browser-check',
      '--no-first-run'
    ]
  })

  let exitCode = 0
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const sw = await getServiceWorker(context)
    const extensionId = new URL(sw.url()).host

    const page = await context.newPage()
    await page.goto(
      `chrome-extension://${extensionId}/src/sidepanel/index.html`,
      { waitUntil: 'domcontentloaded' }
    )
    await wait(700)

    /* ──────────────────────────────────────────────────────────────────
     * Phase 0: full-page captureType label sanity
     * ──────────────────────────────────────────────────────────────── */
    await injectCapture(
      sw,
      fakeCapture({ captureType: 'full-page', sourceUrl: 'http://test.local/full' })
    )
    await wait(600)
    const fullLabel = await page
      .locator('.preview-result-title strong')
      .textContent()
    log(
      'full-page captureType renders "전체 캡처" label',
      (fullLabel ?? '').trim() === '전체 캡처',
      `label="${(fullLabel ?? '').trim()}"`
    )

    /* ──────────────────────────────────────────────────────────────────
     * Phase A: #26 Multi-history — inject 3 distinct captures
     * ──────────────────────────────────────────────────────────────── */
    for (let i = 1; i <= 3; i++) {
      await injectCapture(
        sw,
        fakeCapture({
          sourceUrl: `http://test.local/page-${i}`,
          sourceTitle: `Test Page ${i}`
        })
      )
      await wait(450)
    }
    await wait(300)
    const historyCount = await page.locator('.capture-history__item').count()
    // Phase 0 injected one full-page capture before this loop, so the
    // expected count is 1 (full-page) + 3 (page-1..3) = 4 distinct URLs.
    log(
      '#26 history list grows with 4 distinct URLs (incl. Phase 0)',
      historyCount === 4,
      `count=${historyCount}`
    )

    /* ──────────────────────────────────────────────────────────────────
     * Phase B: Inject one capture for the rest of the tests
     * ──────────────────────────────────────────────────────────────── */
    await injectCapture(sw, fakeCapture())
    await wait(700)

    /* ──────────────────────────────────────────────────────────────────
     * Phase C: #21 Template switching — each template emits its header
     * ──────────────────────────────────────────────────────────────── */
    const templateCases = [
      ['bug', '# 🐛 버그 리포트'],
      ['refactor', '# 🔧 리팩토링 요청'],
      ['reference', '# 📐 레퍼런스 참고 구현']
    ]
    const promptBtn = page
      .locator('.context-pack-panel button.context-pack-panel__btn')
      .filter({ hasText: 'AI 프롬프트 복사' })
      .first()
    for (const [val, expectedHeader] of templateCases) {
      await page
        .locator('.context-pack-panel__template-select')
        .selectOption(val)
      await wait(150)
      await promptBtn.click()
      await wait(250)
      const text = await readClipboardText(page)
      const ok = text.trim().startsWith(expectedHeader)
      log(
        `#21 template "${val}" produces "${expectedHeader}" header`,
        ok,
        ok ? 'ok' : `got: "${text.split('\n')[0]}"`
      )
    }

    /* ──────────────────────────────────────────────────────────────────
     * Phase D: #25 Template persistence across reload
     * ──────────────────────────────────────────────────────────────── */
    await page
      .locator('.context-pack-panel__template-select')
      .selectOption('reference')
    await wait(300) // let storage write happen
    await page.reload({ waitUntil: 'domcontentloaded' })
    await wait(700)
    const persistedValue = await page
      .locator('.context-pack-panel__template-select')
      .inputValue()
    log(
      '#25 template selection persists across reload',
      persistedValue === 'reference',
      `value=${persistedValue}`
    )

    /* ──────────────────────────────────────────────────────────────────
     * Phase E: Re-inject a capture (reload cleared in-memory state)
     * ──────────────────────────────────────────────────────────────── */
    await injectCapture(sw, fakeCapture())
    await wait(700)

    /* ──────────────────────────────────────────────────────────────────
     * Phase F: #14, #15, #16 Image lightbox
     * ──────────────────────────────────────────────────────────────── */
    const zoomBtn = page.locator('.preview-zoom-btn').first()
    await zoomBtn.click()
    await wait(250)
    log('#14 lightbox opens via 🔍 button', await isImageLightboxVisible(page))

    const previewSrc = await page
      .locator('.pin-container > .preview-img')
      .first()
      .getAttribute('src')
    const lbSrc = await page
      .locator('.image-lightbox__img')
      .first()
      .getAttribute('src')
    log(
      '#16 lightbox shows the original image src (no baking)',
      previewSrc === lbSrc && !!lbSrc,
      previewSrc === lbSrc ? 'src match' : 'src differ'
    )

    await page.keyboard.press('Escape')
    await wait(200)
    log('#15a lightbox closes on ESC', !(await isImageLightboxVisible(page)))

    await zoomBtn.click()
    await wait(200)
    // Backdrop is partly covered by .image-lightbox__stage (centered image
    // + pin container) so a positional click may hit the stage instead.
    // Dispatch the click directly on the backdrop element to verify the
    // close handler wiring without depending on hit-test geometry.
    await page
      .locator('.image-lightbox__backdrop')
      .dispatchEvent('click')
    await wait(200)
    log(
      '#15b lightbox closes on backdrop click',
      !(await isImageLightboxVisible(page))
    )

    /* ──────────────────────────────────────────────────────────────────
     * Phase G: Add a pin so subsequent PNG/JSON tests have annotations
     * ──────────────────────────────────────────────────────────────── */
    const previewImg = page.locator('.pin-container > .preview-img').first()
    await previewImg.click({ position: { x: 100, y: 100 } })
    await wait(300)
    const memoTa = page.locator('.pin-memo__input').first()
    await memoTa.click()
    await memoTa.type('테스트 핀')
    await wait(150)

    /* ──────────────────────────────────────────────────────────────────
     * Phase H: #17, #19 PNG copy → clipboard ImageItem
     * ──────────────────────────────────────────────────────────────── */
    const pngCopyBtn = page
      .locator('.image-actions button')
      .filter({ hasText: 'PNG 복사' })
      .first()
    await pngCopyBtn.click()
    await wait(500)
    const pngClip = await page.evaluate(async () => {
      try {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          if (item.types.includes('image/png')) {
            const blob = await item.getType('image/png')
            const buf = await blob.arrayBuffer()
            const sig = Array.from(new Uint8Array(buf.slice(0, 8)))
            return { size: buf.byteLength, sig }
          }
        }
        return { size: 0, sig: null }
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) }
      }
    })
    const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    const sigOk =
      Array.isArray(pngClip?.sig) &&
      PNG_SIG.every((b, i) => b === pngClip.sig[i])
    log(
      '#17 PNG copy puts valid PNG on clipboard',
      sigOk,
      sigOk ? `size=${pngClip.size} bytes` : JSON.stringify(pngClip)
    )
    // 200x200 PNG with one pin badge baked in is well above ~1KB.
    log(
      '#19 PNG includes baked pin annotation (size > 1KB)',
      sigOk && pngClip.size > 1024,
      sigOk ? `size=${pngClip.size}` : 'no PNG'
    )

    /* ──────────────────────────────────────────────────────────────────
     * Phase I: #18 PNG save → chrome.downloads.download invoked
     * ──────────────────────────────────────────────────────────────── */
    await page.evaluate(() => {
      const w = /** @type {any} */ (window)
      w.__capturedDownloads = []
      const orig = chrome.downloads.download
      // Stash original so it can be restored if needed.
      w.__origDownload = orig
      chrome.downloads.download = ((opts) => {
        w.__capturedDownloads.push(opts)
        return Promise.resolve(1)
      })
    })
    const pngSaveBtn = page
      .locator('.image-actions button')
      .filter({ hasText: 'PNG 저장' })
      .first()
    await pngSaveBtn.click()
    await wait(500)
    const downloads = await page.evaluate(
      () => /** @type {any} */ (window).__capturedDownloads || []
    )
    log(
      '#18 PNG save invokes chrome.downloads.download',
      downloads.length === 1,
      `calls=${downloads.length}`
    )
    if (downloads.length > 0) {
      const fn = downloads[0].filename
      log(
        '   filename matches snapcontext_<ts>.png',
        /^snapcontext_\d+\.png$/.test(fn),
        fn
      )
    }

    /* ──────────────────────────────────────────────────────────────────
     * Phase J: #23 JSON copy
     * ──────────────────────────────────────────────────────────────── */
    const jsonBtn = page
      .locator('.context-pack-panel button.context-pack-panel__btn')
      .filter({ hasText: 'JSON 복사' })
      .first()
    await jsonBtn.click()
    await wait(300)
    const jsonText = await readClipboardText(page)
    let parsed = null
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      /* invalid JSON */
    }
    log('#23 JSON copy produces valid JSON', parsed !== null)
    log(
      '   JSON includes the pin annotation',
      Array.isArray(parsed?.annotations) && parsed.annotations.length === 1,
      parsed?.annotations
        ? `annotations=${parsed.annotations.length}`
        : 'missing'
    )

    /* ──────────────────────────────────────────────────────────────────
     * Phase K: #24 Prompt + JSON copy
     * ──────────────────────────────────────────────────────────────── */
    const bothBtn = page
      .locator('.context-pack-panel button.context-pack-panel__btn')
      .filter({ hasText: '프롬프트＋JSON' })
      .first()
    await bothBtn.click()
    await wait(300)
    const bothText = await readClipboardText(page)
    log(
      '#24 prompt+JSON contains both delimiters',
      bothText.includes('--- AI 프롬프트 ---') &&
        bothText.includes('--- 컨텍스트 팩 JSON ---'),
      bothText.length > 0 ? `${bothText.length} chars` : 'empty'
    )

    /* ── Save final screenshot for visual reference ─────────────────── */
    const shot = resolve(SCREENSHOTS_DIR, '05-coverage-final.png')
    await page.screenshot({ path: shot, fullPage: true })

    const failed = results.filter((r) => !r.pass)
    console.log(
      `\n[coverage] ${results.length - failed.length}/${results.length} checks passed`
    )
    if (failed.length > 0) {
      console.log('[coverage] failures:')
      for (const f of failed) {
        console.log(`  - ${f.name}${f.detail ? ': ' + f.detail : ''}`)
      }
      exitCode = 1
    }
  } catch (err) {
    console.error('[coverage] fatal:', err)
    exitCode = 1
  } finally {
    await context.close()
    try {
      rmSync(USER_DATA_DIR, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
  process.exit(exitCode)
}

main()
