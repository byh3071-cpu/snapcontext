/*
 * SnapContext 공유 링크 + 컨텍스트 토글 E2E.
 * window.fetch를 mock해 실제 worker를 때리지 않는다.
 * 검증: 공유 버튼 노출 / 최초 동의 / 토글 OFF·ON에 따른 context 동봉 / 클립보드 복사.
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..', '..')
const EXTENSION_PATH = resolve(PROJECT_ROOT, 'dist')
const SCREENSHOTS_DIR = resolve(__dirname, 'screenshots')
const USER_DATA_DIR = resolve(tmpdir(), `snapcontext-upload-${Date.now()}`)

if (!existsSync(EXTENSION_PATH)) {
  console.error('[upload-share] dist/ not found. Run "npm run build" first.')
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
  sourceUrl: 'http://test.local/upload-test?token=secret',
  sourceTitle: 'Upload Test Page',
  viewport: { width: 1280, height: 720 },
  userAgent: 'Test/1.0',
  debugLogs: [{ id: 'd1', level: 'error', message: 'SECRET_LOG', timestamp: '2026' }],
  imageWidth: 200,
  imageHeight: 200
}

async function getServiceWorker(context) {
  const existing = context.serviceWorkers()
  if (existing.length > 0) return existing[0]
  return context.waitForEvent('serviceworker', { timeout: 10000 })
}

async function installFetchMock(page) {
  await page.evaluate(() => {
    const w = window
    w.__lastUpload = null
    const real = w.fetch
    w.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.url
      if (url.includes('/upload')) {
        const body = init && init.body
        let ctx = null
        if (body && typeof body.get === 'function') {
          const c = body.get('context')
          ctx = c == null ? null : String(c)
        }
        w.__lastUpload = { context: ctx }
        return new Response(
          JSON.stringify({ id: 'mockid', url: 'https://mock.example.dev/s/mockid' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return real(input, init)
    }
  })
}

async function injectCapture(sw, page) {
  await sw.evaluate(async (payload) => {
    await chrome.runtime.sendMessage(payload)
  }, FAKE_CAPTURE)
  await page.waitForTimeout(700)
}

async function main() {
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
    const sidePanelUrl = `chrome-extension://${extensionId}/src/sidepanel/index.html`

    const page = await context.newPage()
    await page.goto(sidePanelUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(700)
    await installFetchMock(page)
    await injectCapture(sw, page)

    const shareBtn = page
      .locator('.image-actions__share-row button')
      .filter({ hasText: '공유 링크' })
      .first()
    log('공유 링크 버튼 노출', (await shareBtn.count()) > 0)

    // --- 1회차: 토글 OFF, 동의 다이얼로그 → 계속 ---
    await shareBtn.click()
    await page.waitForTimeout(300)
    const dialog = page.locator('.snap-confirm')
    const dialogShown = (await dialog.count()) > 0
    log('최초 동의 다이얼로그 표시', dialogShown)
    if (dialogShown) {
      await page.locator('.snap-confirm__btn--primary').click()
    }
    await page.waitForTimeout(800)

    const off = await page.evaluate(() => window.__lastUpload)
    log('토글 OFF → context 미동봉', off !== null && off.context === null, JSON.stringify(off))

    const clip1 = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))
    log('공유 URL 클립보드 복사', clip1.includes('mock.example.dev/s/'))

    // --- 2회차: 토글 ON, 동의 다이얼로그 안 뜸 ---
    const toggle = page.locator('.image-actions__toggle input').first()
    await toggle.check()
    await page.waitForTimeout(150)
    await shareBtn.click()
    await page.waitForTimeout(400)
    const dialog2 = (await page.locator('.snap-confirm').count()) > 0
    log('2회차 동의 다이얼로그 안 뜸', !dialog2)
    if (dialog2) {
      await page.locator('.snap-confirm__btn--primary').click()
    }
    await page.waitForTimeout(800)

    const on = await page.evaluate(() => window.__lastUpload)
    let ctxObj = null
    try {
      ctxObj = on && on.context ? JSON.parse(on.context) : null
    } catch {
      ctxObj = null
    }
    log('토글 ON → context 동봉', !!ctxObj && ctxObj.sourceUrl === FAKE_CAPTURE.sourceUrl)
    log('컨텍스트에 debugLogs 누출 없음', !!ctxObj && !('debugLogs' in ctxObj))
    log('컨텍스트에 project/userAgent 누출 없음', !!ctxObj && !('project' in ctxObj) && !('userAgent' in ctxObj))

    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '07-upload-share.png') })

    const failed = results.filter((r) => !r.pass)
    console.log(`\n[upload-share] ${results.length - failed.length}/${results.length} checks passed`)
    if (failed.length > 0) exitCode = 1
  } catch (err) {
    console.error('[upload-share] fatal:', err)
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
