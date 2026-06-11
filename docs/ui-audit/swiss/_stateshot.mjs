/*
 * 오버레이 상태 스크린샷 — 도움말 패널 / 핀 라이트박스 / 이미지 라이트박스 / 컨펌 다이얼로그.
 * 실행: node docs/ui-audit/swiss/_stateshot.mjs
 * 산출: docs/ui-audit/swiss/_port/state-*.png
 */
import { chromium } from 'playwright'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..')
const EXTENSION_PATH = resolve(PROJECT_ROOT, 'dist')
const OUT_DIR = resolve(PROJECT_ROOT, 'docs/ui-audit/swiss/_port')
const USER_DATA_DIR = resolve(tmpdir(), `snapcontext-stateshot-${Date.now()}`)

if (!existsSync(EXTENSION_PATH)) {
  console.error('[stateshot] dist/ 없음 — pnpm build 먼저')
  process.exit(1)
}
mkdirSync(OUT_DIR, { recursive: true })

const fakeBuf = await sharp({
  create: { width: 360, height: 240, channels: 4, background: { r: 244, g: 243, b: 239, alpha: 1 } }
})
  .composite([
    {
      input: await sharp({
        create: { width: 360, height: 36, channels: 4, background: { r: 21, g: 17, b: 15, alpha: 1 } }
      })
        .png()
        .toBuffer(),
      top: 0,
      left: 0
    }
  ])
  .png()
  .toBuffer()
const FAKE_PNG = `data:image/png;base64,${fakeBuf.toString('base64')}`
const FAKE_CAPTURE = {
  type: 'CAPTURE_RESULT',
  imageData: FAKE_PNG,
  captureType: 'visible',
  sourceUrl: 'https://example.com/page',
  sourceTitle: 'Test',
  viewport: { width: 1280, height: 720 },
  userAgent: 'Test/1.0',
  debugLogs: [],
  imageWidth: 360,
  imageHeight: 240
}

async function getServiceWorker(context) {
  const existing = context.serviceWorkers()
  if (existing.length > 0) return existing[0]
  return context.waitForEvent('serviceworker', { timeout: 10000 })
}

async function main() {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 390, height: 760 },
    deviceScaleFactor: 2,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-default-browser-check',
      '--no-first-run'
    ]
  })
  try {
    const sw = await getServiceWorker(context)
    const extensionId = new URL(sw.url()).host
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`, {
      waitUntil: 'domcontentloaded'
    })
    try {
      await page.evaluate(() => document.fonts.ready)
    } catch {}
    await page.waitForTimeout(800)

    // 1) 도움말 패널
    await page.locator('[data-role="settings"]').click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: resolve(OUT_DIR, 'state-help.png') })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // 캡처 주입 + 핀 1개
    await sw.evaluate(async (p) => {
      await chrome.runtime.sendMessage(p)
    }, FAKE_CAPTURE)
    await page.waitForTimeout(600)
    const img = page.locator('.pin-container > .preview-img').first()
    await img.waitFor({ state: 'visible' })
    await img.click({ position: { x: 150, y: 80 } })
    await page.waitForTimeout(3600) // 토스트 소멸

    // 2) 핀 라이트박스 (크게 보기)
    await page.locator('.preview-expand-btn').click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: resolve(OUT_DIR, 'state-pinlb.png') })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // 3) 이미지 라이트박스 (원본 확대)
    await page.locator('.preview-zoom-btn').click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: resolve(OUT_DIR, 'state-imglb.png') })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // 4) 컨펌 다이얼로그 (핀 있는 상태에서 새 캡처 시도)
    await page.mouse.move(0, 0)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.locator('.cap-btn[data-action="visible"]').click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: resolve(OUT_DIR, 'state-confirm.png') })

    console.log('[stateshot] saved 4 states')
  } finally {
    await context.close()
    try {
      rmSync(USER_DATA_DIR, { recursive: true, force: true })
    } catch {}
  }
}

main()
