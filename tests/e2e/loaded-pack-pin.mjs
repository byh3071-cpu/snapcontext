/*
 * Regression probe: history-load → add pin → copy prompt should include pins.
 *
 * Reproduces the bug the user reported: 핀 섹션이 프롬프트에 포함 안 됨 after
 * loading a saved pack and pinning. Verifies the fix.
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
const USER_DATA_DIR = resolve(tmpdir(), `snapcontext-loaded-${Date.now()}`)

if (!existsSync(EXTENSION_PATH)) {
  console.error('[loaded-pack] dist/ not found. Run "npm run build" first.')
  process.exit(1)
}
mkdirSync(SCREENSHOTS_DIR, { recursive: true })

const results = []
const log = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const fakeBuf = await sharp({
  create: {
    width: 200,
    height: 200,
    channels: 4,
    background: { r: 200, g: 220, b: 240, alpha: 1 }
  }
})
  .png()
  .toBuffer()
const FAKE_PNG = `data:image/png;base64,${fakeBuf.toString('base64')}`

const FAKE_CAPTURE = {
  type: 'CAPTURE_RESULT',
  imageData: FAKE_PNG,
  captureType: 'visible',
  sourceUrl: 'http://test.local/wiki',
  sourceTitle: 'Test Wiki Page',
  viewport: { width: 1280, height: 720 },
  userAgent: 'Test/1.0',
  debugLogs: [],
  imageWidth: 200,
  imageHeight: 200
}

async function main() {
  console.log('[loaded-pack] launching chromium')
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
    const sw = await (async () => {
      const existing = context.serviceWorkers()
      if (existing.length > 0) return existing[0]
      return context.waitForEvent('serviceworker', { timeout: 10000 })
    })()
    const extensionId = new URL(sw.url()).host

    const page = await context.newPage()
    await page.goto(
      `chrome-extension://${extensionId}/src/sidepanel/index.html`,
      { waitUntil: 'domcontentloaded' }
    )
    await page.waitForTimeout(700)

    // 1) Inject a fake capture and let the side panel save it to history.
    await sw.evaluate(async (payload) => {
      await chrome.runtime.sendMessage(payload)
    }, FAKE_CAPTURE)
    await page.waitForTimeout(800)
    log('initial capture saved to history', true)

    // 2) Reload the side panel so we start from a clean state with the
    //    pack already in history (no pins yet).
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(700)

    // 3) Click on the history entry to load the saved pack.
    const historyItem = page.locator('.capture-history__item').first()
    await historyItem.waitFor({ state: 'visible', timeout: 5000 })
    await historyItem.click()
    await page.waitForTimeout(500)

    const loadedHint = await page
      .locator('.context-pack-panel__hint.muted')
      .last()
      .textContent()
    log(
      'history pack loaded (hint shows "불러온")',
      (loadedHint ?? '').includes('불러온') ||
        (loadedHint ?? '').includes('AI용 디버그 프롬프트'),
      `hint="${(loadedHint ?? '').trim()}"`
    )

    // 4) Click on the preview image to add a NEW pin AFTER load.
    const previewImg = page.locator('.pin-container > .preview-img').first()
    await previewImg.waitFor({ state: 'visible' })
    await previewImg.click({ position: { x: 100, y: 100 } })
    await page.waitForTimeout(300)

    const pinBadgeCount = await page
      .locator('.pin-container > .pin-badge')
      .count()
    log('new pin badge created after history load', pinBadgeCount === 1,
      `count=${pinBadgeCount}`)

    // 5) Type a memo for the new pin.
    const textarea = page.locator('.pin-memo__input').first()
    await textarea.click()
    await textarea.type('새 메모')
    await page.waitForTimeout(150)
    const memoValue = await textarea.inputValue()
    log('memo accepts typing', memoValue === '새 메모', `value="${memoValue}"`)

    // 6) Click "AI 프롬프트 복사" and read clipboard.
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const copyBtn = page
      .locator('.context-pack-panel button.context-pack-panel__btn')
      .filter({ hasText: 'AI 프롬프트 복사' })
      .first()
    await copyBtn.waitFor({ state: 'visible' })
    await copyBtn.click()
    await page.waitForTimeout(300)

    const clipboardText = await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText()
      } catch (e) {
        return `<<read failed: ${(e instanceof Error ? e.message : String(e))}>>`
      }
    })

    log(
      'prompt contains "## 핀 주석" section',
      clipboardText.includes('## 핀 주석'),
      clipboardText.includes('## 핀 주석') ? 'present' : 'MISSING'
    )
    log(
      'prompt contains the new pin memo "새 메모"',
      clipboardText.includes('새 메모'),
      clipboardText.includes('새 메모') ? 'present' : 'MISSING'
    )

    // 7) Wait for debounced capture-history persistence, reload, and verify
    //    the pin/memo survive a real history restore.
    await page.waitForTimeout(800)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(700)
    await page.locator('.capture-history__item').first().click()
    await page.waitForTimeout(500)

    const restoredPinCount = await page
      .locator('.pin-container > .pin-badge')
      .count()
    log(
      'history restore includes the pin added after load',
      restoredPinCount === 1,
      `count=${restoredPinCount}`
    )

    const restoredMemo = await page.locator('.pin-memo__input').first().inputValue()
    log(
      'history restore includes the memo added after load',
      restoredMemo === '새 메모',
      `value="${restoredMemo}"`
    )

    if (!clipboardText.includes('## 핀 주석') || !clipboardText.includes('새 메모')) {
      console.log('\n[loaded-pack] DEBUG full clipboard text:')
      console.log('---')
      console.log(clipboardText)
      console.log('---\n')
    }

    const screenshotPath = resolve(SCREENSHOTS_DIR, '04-loaded-pack-pin.png')
    await page.screenshot({ path: screenshotPath, fullPage: true })

    const failed = results.filter((r) => !r.pass)
    console.log(
      `\n[loaded-pack] ${results.length - failed.length}/${results.length} checks passed`
    )
    if (failed.length > 0) exitCode = 1
  } catch (err) {
    console.error('[loaded-pack] fatal:', err)
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
