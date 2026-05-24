/*
 * SnapContext side panel smoke test.
 *
 * Loads the built extension into a fresh Chromium persistent context, opens
 * the side panel HTML as a regular tab (chrome-extension://<id>/...),
 * verifies the initial Korean UI, and saves a screenshot.
 *
 * What this can verify automatically:
 *   - Side panel HTML loads without runtime errors
 *   - Initial progressive-disclosure state (pin memo + AI debug pack hidden)
 *   - Korean labels are present (capture buttons, history, shortcuts help)
 *   - 4-button 2x2 capture grid renders
 *   - Empty preview placeholder text
 *
 * What this cannot verify (needs manual / real-browser flow):
 *   - chrome.tabs.captureVisibleTab and the actual capture pipeline
 *   - Extension keyboard shortcuts (Alt+Shift+V/E/D/F)
 *   - Pin annotation flow (no captured image to click on)
 *   - Lightbox wheel-zoom interaction quality
 */
import { chromium } from 'playwright'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..', '..')
const EXTENSION_PATH = resolve(PROJECT_ROOT, 'dist')
const SCREENSHOTS_DIR = resolve(__dirname, 'screenshots')
const USER_DATA_DIR = resolve(tmpdir(), `snapcontext-pw-${Date.now()}`)

if (!existsSync(EXTENSION_PATH)) {
  console.error(`[smoke] dist/ not found. Run "npm run build" first.`)
  process.exit(1)
}

mkdirSync(SCREENSHOTS_DIR, { recursive: true })

/**
 * @typedef {{
 *   name: string,
 *   pass: boolean,
 *   detail?: string,
 * }} CheckResult
 */

const results = /** @type {CheckResult[]} */ ([])

function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  const flag = pass ? '✅' : '❌'
  console.log(`${flag} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function getExtensionId(context) {
  const existing = context.serviceWorkers()
  if (existing.length > 0) return new URL(existing[0].url()).host
  const sw = await context.waitForEvent('serviceworker', { timeout: 10000 })
  return new URL(sw.url()).host
}

async function main() {
  console.log('[smoke] launching chromium with extension at', EXTENSION_PATH)
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 400, height: 900 }, // mimic side panel proportions
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-default-browser-check',
      '--no-first-run'
    ]
  })

  let exitCode = 0
  try {
    const extensionId = await getExtensionId(context)
    console.log('[smoke] extension id:', extensionId)

    const page = await context.newPage()
    page.on('pageerror', (err) => {
      record('side panel runtime error', false, err.message)
    })
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        record('side panel console error', false, msg.text())
      }
    })

    const sidePanelUrl = `chrome-extension://${extensionId}/src/sidepanel/index.html`
    await page.goto(sidePanelUrl, { waitUntil: 'domcontentloaded' })
    // Allow async init (storage reads, mounts) to settle.
    await page.waitForTimeout(800)

    // ---- Initial state checks ----

    // A: 4 capture buttons present
    const captureBtnCount = await page.locator('.toolbar-btn').count()
    record(
      '4 capture buttons present',
      captureBtnCount === 4,
      `count=${captureBtnCount}`
    )

    // A: Korean capture button labels
    const captureLabels = await page
      .locator('.toolbar-btn strong')
      .allTextContents()
    const expectedLabels = ['화면 캡처', '문서 캡처', '요소 캡처', '전체 캡처']
    const missingLabels = expectedLabels.filter(
      (l) => !captureLabels.some((found) => found.includes(l))
    )
    record(
      'capture button labels in Korean',
      missingLabels.length === 0,
      missingLabels.length ? `missing=${missingLabels.join(',')}` : `${captureLabels.length} labels`
    )

    // A: 2-column grid for the toolbar row
    const gridCols = await page.evaluate(() => {
      const row = document.querySelector('.toolbar-row')
      if (!row) return null
      return getComputedStyle(row).gridTemplateColumns
    })
    record(
      'capture buttons use 2-column grid',
      typeof gridCols === 'string' && gridCols.split(' ').length === 2,
      `grid-template-columns=${gridCols}`
    )

    // A: Empty preview placeholder text
    const emptyPlaceholder = await page
      .locator('.preview-placeholder')
      .textContent()
    record(
      'empty preview placeholder text',
      (emptyPlaceholder ?? '').trim() === '위 버튼으로 캡처를 시작하세요',
      `text="${(emptyPlaceholder ?? '').trim()}"`
    )

    // A: Pin memo section hidden before capture
    const pinMemoHidden = await page.evaluate(() => {
      // pinMemoHost is the third div in app-shell after header+toast+toolbar+banner+preview+imageActions
      const candidates = document.querySelectorAll('.app-shell > div')
      // We don't have a stable selector; check that no .pin-memo* visible content
      const memo = document.querySelector('.pin-memo, [class*="pin-memo"]')
      if (!memo) return 'no-pin-memo-element'
      return memo.closest('[hidden]') !== null ||
        memo.matches('[hidden]') ||
        memo.parentElement?.hasAttribute('hidden') ||
        false
    })
    record(
      'pin memo host hidden before capture',
      pinMemoHidden === true || pinMemoHidden === 'no-pin-memo-element',
      `state=${pinMemoHidden}`
    )

    // A: AI debug pack section hidden before capture
    const packHidden = await page.evaluate(() => {
      const pack = document.querySelector('.context-pack-panel')
      if (!pack) return 'no-pack-element'
      const hostHidden =
        pack.parentElement?.hasAttribute('hidden') ||
        pack.matches('[hidden]')
      return hostHidden
    })
    record(
      'AI debug pack hidden before capture',
      packHidden === true || packHidden === 'no-pack-element',
      `state=${packHidden}`
    )

    // A: History section visible (not gated by capture)
    const historyVisible = await page.evaluate(() => {
      const h = document.querySelector('.capture-history__title')
      if (!h) return false
      return (h.textContent ?? '').trim() === '캡처 기록'
    })
    record('history title is "캡처 기록"', historyVisible, '')

    // A: Shortcuts help summary translated
    const shortcutsSummary = await page
      .locator('.shortcuts-help summary')
      .textContent()
    record(
      'shortcuts help summary in Korean',
      (shortcutsSummary ?? '').includes('단축키'),
      `summary="${(shortcutsSummary ?? '').trim()}"`
    )

    // Project profile feature flag — both nodes should be hidden
    const profileHidden = await page.evaluate(() => {
      const section = document.querySelector(
        '.context-pack-panel__section'
      )
      return section ? section.hasAttribute('hidden') : 'no-section'
    })
    record(
      'project profile section hidden (v0.2 flag)',
      profileHidden === true || profileHidden === 'no-section',
      `state=${profileHidden}`
    )

    // ---- Screenshots ----
    const initialShot = resolve(SCREENSHOTS_DIR, '01-initial.png')
    await page.screenshot({ path: initialShot, fullPage: true })
    console.log('[smoke] saved', initialShot)

    // Resize to 300px (manifest spec minimum) and shoot again to verify
    // the 2x2 grid still renders without horizontal overflow.
    await page.setViewportSize({ width: 300, height: 900 })
    await page.waitForTimeout(200)
    const narrowShot = resolve(SCREENSHOTS_DIR, '02-narrow-300px.png')
    await page.screenshot({ path: narrowShot, fullPage: true })
    console.log('[smoke] saved', narrowShot)

    const horizontalOverflow = await page.evaluate(() => {
      const root = document.body
      return root.scrollWidth > root.clientWidth + 1
    })
    record(
      'no horizontal overflow at 300px width',
      !horizontalOverflow,
      horizontalOverflow ? 'overflow detected' : ''
    )

    // ---- Summary ----
    const failed = results.filter((r) => !r.pass)
    console.log(
      `\n[smoke] ${results.length - failed.length}/${results.length} checks passed`
    )
    if (failed.length > 0) {
      exitCode = 1
      console.log('[smoke] failures:')
      for (const f of failed) {
        console.log(`  - ${f.name}${f.detail ? ': ' + f.detail : ''}`)
      }
    }
  } catch (err) {
    console.error('[smoke] fatal:', err)
    exitCode = 1
  } finally {
    await context.close()
    try {
      rmSync(USER_DATA_DIR, { recursive: true, force: true })
    } catch {
      /* tmp cleanup best effort */
    }
  }

  process.exit(exitCode)
}

main()
