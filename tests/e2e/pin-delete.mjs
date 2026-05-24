/*
 * Regression probe for the two delete bugs the user reported:
 *
 *   2A  Memo X button must remove the pin in a single click
 *   2B  Clicking an existing pin in the image lightbox must DELETE it,
 *       not silently add a new pin on top (this happens when pointer
 *       capture makes ev.target = viewport in the user-modified
 *       ImageLightbox.ts).
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
const USER_DATA_DIR = resolve(tmpdir(), `snapcontext-pdel-${Date.now()}`)

if (!existsSync(EXTENSION_PATH)) {
  console.error('[pin-delete] dist/ not found. Run "npm run build" first.')
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
  console.log('[pin-delete] launching chromium')
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
    const sw = await getServiceWorker(context)
    const extensionId = new URL(sw.url()).host

    const page = await context.newPage()
    await page.goto(
      `chrome-extension://${extensionId}/src/sidepanel/index.html`,
      { waitUntil: 'domcontentloaded' }
    )
    await wait(700)

    await sw.evaluate(async (p) => {
      await chrome.runtime.sendMessage(p)
    }, FAKE_CAPTURE)
    await wait(700)

    /* ── 2A. memo X button single-click delete ─────────────────────── */

    const previewImg = page.locator('.pin-container > .preview-img').first()
    await previewImg.click({ position: { x: 60, y: 60 } })
    await wait(250)
    await previewImg.click({ position: { x: 140, y: 140 } })
    await wait(250)

    let pinCount = await page.locator('.pin-container > .pin-badge').count()
    log('two pins added in main view', pinCount === 2, `count=${pinCount}`)

    // Click first pin's X button.
    const firstDeleteBtn = page.locator('.pin-memo__row .pin-memo__delete').first()
    await firstDeleteBtn.click()
    await wait(250)

    pinCount = await page.locator('.pin-container > .pin-badge').count()
    const memoCount = await page.locator('.pin-memo__input').count()
    log(
      '#2A X button removes pin in a single click',
      pinCount === 1 && memoCount === 1,
      `pins=${pinCount}, memos=${memoCount}`
    )

    /* ── 2B. lightbox pin click deletes (does not add) ──────────────── */

    // Open the image lightbox via 🔍.
    await page.locator('.preview-zoom-btn').click()
    await wait(300)

    // Verify we have 1 badge in the lightbox right now (mirroring the 1 pin).
    const lbBadgesBefore = await page
      .locator('.image-lightbox__pin-container > .pin-badge')
      .count()
    log(
      'lightbox starts with 1 pin badge (mirrors main view)',
      lbBadgesBefore === 1,
      `count=${lbBadgesBefore}`
    )

    // Click the existing pin badge inside the lightbox.
    const lbBadge = page
      .locator('.image-lightbox__pin-container > .pin-badge')
      .first()
    const lbBadgeBox = await lbBadge.boundingBox()
    if (!lbBadgeBox) {
      throw new Error('Could not measure lightbox pin badge box')
    }
    // Click via mouse on the centre of the badge (so the
    // pointerdown→pointerup cycle is exercised, not Locator.click which
    // may bypass capture pathways).
    await page.mouse.click(
      lbBadgeBox.x + lbBadgeBox.width / 2,
      lbBadgeBox.y + lbBadgeBox.height / 2
    )
    await wait(300)

    const lbBadgesAfter = await page
      .locator('.image-lightbox__pin-container > .pin-badge')
      .count()
    log(
      '#2B clicking existing pin in lightbox does NOT add a new pin',
      lbBadgesAfter === 0,
      `count_after=${lbBadgesAfter}`
    )

    // Bonus: verify it actually got deleted (count went from 1 → 0).
    log(
      '#2B clicking existing pin in lightbox deletes it',
      lbBadgesBefore === 1 && lbBadgesAfter === 0,
      `${lbBadgesBefore} → ${lbBadgesAfter}`
    )

    // Close lightbox to verify main view is in sync.
    await page.keyboard.press('Escape')
    await wait(200)
    const finalMainBadges = await page
      .locator('.pin-container > .pin-badge')
      .count()
    log(
      'main view reflects deletion done from lightbox',
      finalMainBadges === 0,
      `count=${finalMainBadges}`
    )

    /* ── 2C. main-view pin double-click delete ─────────────────────── */

    await previewImg.click({ position: { x: 80, y: 80 } })
    await wait(250)
    let mainBadges = await page
      .locator('.pin-container > .pin-badge')
      .count()
    log('one pin added in main view for toggle test', mainBadges === 1,
      `count=${mainBadges}`)

    // First click on the badge → should select (active state). Click via
    // mouse so the real click event chain runs, including the activePinId
    // toggle path.
    const mainBadge = page.locator('.pin-container > .pin-badge').first()
    const mainBox = await mainBadge.boundingBox()
    if (!mainBox) throw new Error('main view pin badge box not measurable')
    await page.mouse.click(
      mainBox.x + mainBox.width / 2,
      mainBox.y + mainBox.height / 2
    )
    await wait(200)
    const isActiveAfterFirstClick = await page.evaluate(() => {
      const b = document.querySelector('.pin-container > .pin-badge')
      return b?.classList.contains('pin-badge--active')
    })
    log(
      '#2C main view first click on pin selects it (active class)',
      isActiveAfterFirstClick === true,
      `active=${isActiveAfterFirstClick}`
    )

    // Second click on same pin → should delete.
    const mainBox2 = await mainBadge.boundingBox()
    if (mainBox2) {
      await page.mouse.click(
        mainBox2.x + mainBox2.width / 2,
        mainBox2.y + mainBox2.height / 2
      )
    }
    await wait(250)
    mainBadges = await page.locator('.pin-container > .pin-badge').count()
    log(
      '#2C main view second click on active pin deletes it',
      mainBadges === 0,
      `count=${mainBadges}`
    )

    const shot = resolve(SCREENSHOTS_DIR, '06-pin-delete.png')
    await page.screenshot({ path: shot, fullPage: true })

    const failed = results.filter((r) => !r.pass)
    console.log(
      `\n[pin-delete] ${results.length - failed.length}/${results.length} checks passed`
    )
    if (failed.length > 0) exitCode = 1
  } catch (err) {
    console.error('[pin-delete] fatal:', err)
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
