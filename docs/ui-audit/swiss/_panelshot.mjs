/*
 * 실제 확장 사이드패널 390px 세그먼트 스크린샷 — mockup 육안 대조용.
 * _segshot.mjs는 file:// 전용이라 chrome-extension:// 패널은 이 스크립트로 찍는다.
 * (smoke.mjs 확장 로드 하네스 + pin-flow.mjs 캡처 주입 패턴 재사용)
 *
 * 실행: node docs/ui-audit/swiss/_panelshot.mjs [출력디렉토리=docs/ui-audit/swiss/_port]
 * 산출: empty-NN.png(빈 상태 세그먼트), cap-NN.png(캡처+핀 상태 세그먼트)
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
const OUT_DIR = resolve(PROJECT_ROOT, process.argv[2] || 'docs/ui-audit/swiss/_port')
const USER_DATA_DIR = resolve(tmpdir(), `snapcontext-panelshot-${Date.now()}`)
const VW = 390
const VH = 760

if (!existsSync(EXTENSION_PATH)) {
  console.error('[panelshot] dist/ 없음 — pnpm build 먼저')
  process.exit(1)
}
mkdirSync(OUT_DIR, { recursive: true })

// 스위스 톤 가짜 캡처 (종이/잉크/그레이 블록)
const fakeBuf = await sharp({
  create: {
    width: 360,
    height: 240,
    channels: 4,
    background: { r: 250, g: 250, b: 248, alpha: 1 }
  }
})
  .composite([
    {
      input: await sharp({
        create: { width: 360, height: 40, channels: 4, background: { r: 21, g: 17, b: 15, alpha: 1 } }
      })
        .png()
        .toBuffer(),
      top: 0,
      left: 0
    },
    {
      input: await sharp({
        create: { width: 200, height: 16, channels: 4, background: { r: 21, g: 17, b: 15, alpha: 1 } }
      })
        .png()
        .toBuffer(),
      top: 64,
      left: 24
    },
    {
      input: await sharp({
        create: { width: 300, height: 10, channels: 4, background: { r: 201, g: 199, b: 192, alpha: 1 } }
      })
        .png()
        .toBuffer(),
      top: 96,
      left: 24
    },
    {
      input: await sharp({
        create: { width: 300, height: 10, channels: 4, background: { r: 201, g: 199, b: 192, alpha: 1 } }
      })
        .png()
        .toBuffer(),
      top: 114,
      left: 24
    },
    {
      input: await sharp({
        create: { width: 110, height: 30, channels: 4, background: { r: 21, g: 17, b: 15, alpha: 1 } }
      })
        .png()
        .toBuffer(),
      top: 160,
      left: 24
    }
  ])
  .png()
  .toBuffer()
const FAKE_PNG = `data:image/png;base64,${fakeBuf.toString('base64')}`

const FAKE_CAPTURE = {
  type: 'CAPTURE_RESULT',
  imageData: FAKE_PNG,
  captureType: 'visible',
  sourceUrl: 'https://example.com/checkout',
  sourceTitle: '결제 모달 레이아웃 점검',
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

async function shootSegments(page, prefix) {
  // 토스트(3.2s) 소멸 대기 + 마우스 파킹(hover 상태 오염 방지)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(3600)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(200)
  const total = await page.evaluate(() => document.body.scrollHeight)
  const step = VH - 40
  let i = 0
  for (let y = 0; y < total; y += step) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y)
    await page.waitForTimeout(180)
    const out = resolve(OUT_DIR, `${prefix}-${String(i).padStart(2, '0')}.png`)
    await page.screenshot({ path: out })
    console.log('[panelshot]', prefix, i, 'y=', y)
    i++
  }
  console.log('[panelshot]', prefix, 'total height', total, 'segments', i)
}

async function main() {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: VW, height: VH },
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
    page.on('pageerror', (err) => console.error('[panelshot] pageerror:', err.message))

    await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`, {
      waitUntil: 'domcontentloaded'
    })
    try {
      await page.evaluate(() => document.fonts.ready)
    } catch {}
    await page.waitForTimeout(800)

    // 1) 빈 상태
    await shootSegments(page, 'empty')

    // 2) 캡처 + 핀 2개 + 메모 상태
    await sw.evaluate(async (payload) => {
      await chrome.runtime.sendMessage(payload)
    }, FAKE_CAPTURE)
    await page.waitForTimeout(700)
    const img = page.locator('.pin-container > .preview-img').first()
    await img.waitFor({ state: 'visible', timeout: 5000 })
    await img.click({ position: { x: 120, y: 60 } })
    await page.waitForTimeout(250)
    await img.click({ position: { x: 220, y: 140 } })
    await page.waitForTimeout(250)
    const memo = page.locator('.pin-memo__input').first()
    await memo.fill('로그인 버튼 색상 대비 확인 요청')
    await page.waitForTimeout(300)
    await page.evaluate(() => {
      const el = document.activeElement
      if (el instanceof HTMLElement) el.blur()
    })
    await shootSegments(page, 'cap')
  } finally {
    await context.close()
    try {
      rmSync(USER_DATA_DIR, { recursive: true, force: true })
    } catch {}
  }
}

main()
