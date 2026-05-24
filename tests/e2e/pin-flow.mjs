/*
 * SnapContext pin + memo interaction probe.
 *
 * Loads the extension, injects a fake CAPTURE_RESULT into the side panel via
 * the service worker (so applyCapturePayload runs), then exercises the pin
 * add → memo input flow programmatically. Reports which step (if any) fails.
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
const USER_DATA_DIR = resolve(tmpdir(), `snapcontext-pin-${Date.now()}`)

if (!existsSync(EXTENSION_PATH)) {
  console.error('[pin-flow] dist/ not found. Run "npm run build" first.')
  process.exit(1)
}
mkdirSync(SCREENSHOTS_DIR, { recursive: true })

const results = []
const log = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 200×200 PNG so the side panel actually has a clickable image area.
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

const FAKE_CAPTURE = {
  type: 'CAPTURE_RESULT',
  imageData: FAKE_PNG,
  captureType: 'visible',
  sourceUrl: 'http://test.local/page',
  sourceTitle: 'Test Page',
  viewport: { width: 1280, height: 720 },
  userAgent: 'Test/1.0',
  debugLogs: [],
  imageWidth: 200,
  imageHeight: 200
}

async function getServiceWorker(context) {
  const existing = context.serviceWorkers()
  if (existing.length > 0) return existing[0]
  return context.waitForEvent('serviceworker', { timeout: 10000 })
}

async function main() {
  console.log('[pin-flow] launching chromium')
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
  const consoleErrors = []
  try {
    const sw = await getServiceWorker(context)
    const extensionId = new URL(sw.url()).host

    const page = await context.newPage()
    page.on('pageerror', (err) => {
      consoleErrors.push(`pageerror: ${err.message}`)
    })
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`)
    })

    await page.goto(
      `chrome-extension://${extensionId}/src/sidepanel/index.html`,
      { waitUntil: 'domcontentloaded' }
    )
    await page.waitForTimeout(700)

    // ---- Inject fake capture via service worker → onMessage listener ----
    await sw.evaluate(async (payload) => {
      await chrome.runtime.sendMessage(payload)
    }, FAKE_CAPTURE)

    // Allow side panel listener + applyCapturePayload to settle.
    await page.waitForTimeout(600)

    const captureApplied = await page.evaluate(() => {
      const img = document.querySelector('.preview-img')
      return img instanceof HTMLImageElement ? img.complete && img.naturalWidth > 0 : false
    })
    log('fake capture applied (preview img loaded)', captureApplied)

    if (!captureApplied) {
      throw new Error('fake capture not applied; aborting downstream checks')
    }

    // pinMemoHost should now be visible.
    const memoHostVisible = await page.evaluate(() => {
      // Find the pin memo container by its title text.
      const heading = Array.from(document.querySelectorAll('h2')).find(
        (h) => (h.textContent ?? '').trim() === '핀 메모'
      )
      if (!heading) return 'no-heading'
      const host = heading.parentElement
      if (!host) return 'no-host'
      return !host.hasAttribute('hidden') && host.offsetParent !== null
    })
    log('pin memo host visible after capture', memoHostVisible === true,
      `state=${memoHostVisible}`)

    // ---- Click on the preview image to add a pin ----
    // Click the image directly (it bubbles to .pin-container's listener) so
    // the click is guaranteed to land inside the image's bounding box.
    const previewImg = page.locator('.pin-container > .preview-img').first()
    await previewImg.waitFor({ state: 'visible' })
    const imgBox = await previewImg.boundingBox()
    console.log(
      `[pin-flow] preview img box: ${imgBox ? `${imgBox.width}x${imgBox.height}` : 'null'}`
    )
    await previewImg.click({ position: { x: 100, y: 100 } })
    await page.waitForTimeout(300)

    // Count badges only inside the main view's pin-container. The image
    // lightbox renders its own badges with the same class; those are
    // intentionally separate and not relevant to this probe.
    const pinBadgeCount = await page
      .locator('.pin-container > .pin-badge')
      .count()
    log('pin badge created on click', pinBadgeCount === 1,
      `count=${pinBadgeCount}`)

    // ---- Check that memo textarea appeared ----
    const textarea = page.locator('.pin-memo__input').first()
    const textareaCount = await page.locator('.pin-memo__input').count()
    log('memo textarea rendered', textareaCount === 1,
      `count=${textareaCount}`)

    if (textareaCount === 0) {
      // Capture state for debugging
      const memoTreeHtml = await page.evaluate(() => {
        const heading = Array.from(document.querySelectorAll('h2')).find(
          (h) => (h.textContent ?? '').trim() === '핀 메모'
        )
        return heading?.parentElement?.outerHTML ?? 'no-host'
      })
      console.log('[pin-flow] DEBUG memo host HTML:\n', memoTreeHtml)
    }

    if (textareaCount > 0) {
      // ---- Check textarea geometry (height/visibility) ----
      const taBox = await textarea.boundingBox()
      log('memo textarea has non-zero size',
        !!taBox && taBox.width > 1 && taBox.height > 1,
        taBox ? `${taBox.width}x${taBox.height}` : 'null'
      )

      // ---- Type into the memo ----
      await textarea.click()
      await textarea.type('테스트 메모입니다')
      await page.waitForTimeout(150)
      const memoValue = await textarea.inputValue()
      log('memo accepts typing', memoValue === '테스트 메모입니다',
        `value="${memoValue}"`)
    }

    const screenshotPath = resolve(SCREENSHOTS_DIR, '03-pin-flow.png')
    await page.screenshot({ path: screenshotPath, fullPage: true })
    console.log('[pin-flow] saved', screenshotPath)

    if (consoleErrors.length > 0) {
      console.log('[pin-flow] console / page errors:')
      for (const e of consoleErrors) console.log(`  - ${e}`)
    }

    const failed = results.filter((r) => !r.pass)
    console.log(
      `\n[pin-flow] ${results.length - failed.length}/${results.length} checks passed`
    )
    if (failed.length > 0) exitCode = 1
  } catch (err) {
    console.error('[pin-flow] fatal:', err)
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
