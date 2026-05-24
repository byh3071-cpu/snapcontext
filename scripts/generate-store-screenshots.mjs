import { chromium } from 'playwright'
import sharp from 'sharp'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const EXTENSION_PATH = resolve(PROJECT_ROOT, 'dist')
const OUTPUT_DIR = resolve(
  PROJECT_ROOT,
  'docs',
  'store',
  'chrome-web-store',
  'screenshots'
)
const LOGO_PATH = resolve(PROJECT_ROOT, 'public', 'assets', 'icons', 'icon-128.png')
const USER_DATA_DIR = resolve(tmpdir(), `snapcontext-store-${Date.now()}`)

const PANEL_VIEWPORT = { width: 390, height: 760 }
const STORE_VIEWPORT = { width: 1280, height: 800 }

if (!existsSync(EXTENSION_PATH)) {
  console.error('[store-screenshots] dist/ not found. Run npm.cmd run build first.')
  process.exit(1)
}

if (!existsSync(LOGO_PATH)) {
  console.error(`[store-screenshots] logo not found: ${LOGO_PATH}`)
  process.exit(1)
}

const LOGO_DATA_URL = `data:image/png;base64,${readFileSync(LOGO_PATH).toString('base64')}`

mkdirSync(OUTPUT_DIR, { recursive: true })

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;')
}

function svgText(value) {
  return escapeHtml(value)
}

async function makeMockImage({ width, height, title, subtitle, accent, long }) {
  const cards = []
  const sections = long ? 10 : 4
  for (let i = 0; i < sections; i += 1) {
    const y = 210 + i * 250
    cards.push(`
      <rect x="84" y="${y}" width="${width - 168}" height="156" rx="22" fill="#ffffff" opacity="${i === 1 ? '0.96' : '0.9'}"/>
      <rect x="118" y="${y + 34}" width="${Math.round((width - 236) * (0.72 - (i % 3) * 0.08))}" height="16" rx="8" fill="#1a1a2e" opacity="0.18"/>
      <rect x="118" y="${y + 70}" width="${Math.round((width - 236) * (0.92 - (i % 2) * 0.1))}" height="12" rx="6" fill="#1a1a2e" opacity="0.12"/>
      <rect x="118" y="${y + 98}" width="${Math.round((width - 236) * 0.58)}" height="12" rx="6" fill="#1a1a2e" opacity="0.12"/>
    `)
  }

  const issueY = long ? 710 : 410
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f7fafc"/>
          <stop offset="100%" stop-color="#dce7f5"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <rect x="0" y="0" width="${width}" height="84" fill="#1a1a2e"/>
      <circle cx="44" cy="42" r="10" fill="#e94560"/>
      <circle cx="76" cy="42" r="10" fill="#ffd166"/>
      <circle cx="108" cy="42" r="10" fill="#06d6a0"/>
      <rect x="150" y="24" width="${width - 220}" height="36" rx="18" fill="#ffffff" opacity="0.16"/>
      <text x="84" y="154" font-family="Segoe UI, Arial, sans-serif" font-size="46" font-weight="800" fill="#1a1a2e">${svgText(title)}</text>
      <text x="86" y="198" font-family="Segoe UI, Arial, sans-serif" font-size="24" fill="#3d4a5c">${svgText(subtitle)}</text>
      ${cards.join('')}
      <rect x="116" y="${issueY}" width="${width - 232}" height="176" rx="26" fill="#fff7f8" stroke="${accent}" stroke-width="6"/>
      <text x="158" y="${issueY + 58}" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="800" fill="${accent}">캡처해야 할 UI 이슈</text>
      <rect x="158" y="${issueY + 88}" width="${width - 360}" height="14" rx="7" fill="${accent}" opacity="0.22"/>
      <rect x="158" y="${issueY + 118}" width="${width - 430}" height="14" rx="7" fill="${accent}" opacity="0.18"/>
      <circle cx="${width - 164}" cy="${issueY + 88}" r="34" fill="${accent}"/>
      <text x="${width - 176}" y="${issueY + 101}" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="800" fill="#ffffff">1</text>
    </svg>
  `
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer()
  return `data:image/png;base64,${buffer.toString('base64')}`
}

function fakeCapture({ imageData, captureType, title, url, width, height }) {
  return {
    type: 'CAPTURE_RESULT',
    imageData,
    captureType,
    sourceUrl: url,
    sourceTitle: title,
    viewport: { width: 1280, height: 720 },
    userAgent: 'Chrome Web Store Screenshot/1.0',
    debugLogs: [],
    imageWidth: width,
    imageHeight: height
  }
}

async function getExtensionId(context) {
  const existing = context.serviceWorkers()
  if (existing.length > 0) return new URL(existing[0].url()).host
  const sw = await context.waitForEvent('serviceworker', { timeout: 10000 })
  return new URL(sw.url()).host
}

async function clearExtensionStorage(sw) {
  await sw.evaluate(
    () =>
      new Promise((resolveClear) => {
        chrome.storage.local.clear(() => resolveClear())
      })
  )
}

async function openPanelPage(context, extensionId) {
  const page = await context.newPage()
  await page.setViewportSize(PANEL_VIEWPORT)
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`, {
    waitUntil: 'domcontentloaded'
  })
  await page.waitForTimeout(700)
  return page
}

async function sendCapture(sw, payload) {
  await sw.evaluate(async (message) => {
    await chrome.runtime.sendMessage(message)
  }, payload)
}

async function waitForPreview(page) {
  await page.locator('.preview-img').first().waitFor({ state: 'visible' })
  await page.waitForFunction(() => {
    const img = document.querySelector('.preview-img')
    return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0
  })
  await page.waitForTimeout(350)
}

async function addPinWithMemo(page, memo) {
  const img = page.locator('.pin-container > .preview-img').first()
  await img.click({ position: { x: 190, y: 150 } })
  await page.waitForTimeout(250)
  const memoInput = page.locator('.pin-memo__input').first()
  await memoInput.fill(memo)
  await page.waitForTimeout(250)
}

async function capturePanelState(
  context,
  sw,
  extensionId,
  setup,
  options = {}
) {
  await clearExtensionStorage(sw)
  const page = await openPanelPage(context, extensionId)
  await setup(page, sw)
  const clip = options.cropToContent
    ? await page.evaluate((viewport) => {
        const shell = document.querySelector('.app-shell')
        if (!(shell instanceof HTMLElement)) return null
        const rect = shell.getBoundingClientRect()
        return {
          x: 0,
          y: 0,
          width: viewport.width,
          height: Math.min(viewport.height, Math.ceil(rect.bottom + 10))
        }
      }, PANEL_VIEWPORT)
    : null
  const buffer = await page.screenshot(
    clip ? { clip } : { fullPage: false }
  )
  await page.close()
  return `data:image/png;base64,${buffer.toString('base64')}`
}

function buildStoreHtml(scene, panelDataUrl) {
  const bullets = scene.bullets
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')
  const titleHtml = scene.title.split('\n').map(escapeHtml).join('<br>')
  return `
    <!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; }
          body {
            width: 1280px;
            height: 800px;
            margin: 0;
            overflow: hidden;
            color: #f8fafc;
            font-family: "Segoe UI", "Malgun Gothic", Arial, sans-serif;
            background:
              radial-gradient(circle at 84% 18%, rgba(233, 69, 96, 0.28), transparent 28%),
              radial-gradient(circle at 38% 88%, rgba(83, 52, 131, 0.42), transparent 34%),
              linear-gradient(135deg, #111827 0%, #16213e 52%, #0f172a 100%);
          }
          .screen {
            position: relative;
            width: 1280px;
            height: 800px;
            padding: 0;
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 46px;
            color: #cbd5e1;
            font-size: 25px;
            font-weight: 800;
          }
          .mark {
            display: grid;
            width: 76px;
            height: 76px;
            place-items: center;
            border-radius: 22px;
            background: rgba(255, 255, 255, 0.06);
            box-shadow: 0 18px 44px rgba(233, 69, 96, 0.22);
          }
          .mark img {
            display: block;
            width: 68px;
            height: 68px;
            object-fit: contain;
          }
          .copy {
            position: absolute;
            left: 80px;
            top: 62px;
            width: 560px;
          }
          .eyebrow {
            display: flex;
            align-items: center;
            width: fit-content;
            height: 46px;
            padding: 0 22px;
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-radius: 999px;
            color: #fecdd3;
            background: rgba(233, 69, 96, 0.13);
            font-size: 19px;
            font-weight: 800;
          }
          h1 {
            margin: 24px 0 20px;
            font-size: 64px;
            line-height: 1.06;
            letter-spacing: -0.02em;
            word-break: keep-all;
          }
          .subtitle {
            margin: 0;
            max-width: 520px;
            color: #cbd5e1;
            font-size: 25px;
            line-height: 1.48;
            font-weight: 500;
            word-break: keep-all;
          }
          ul {
            display: grid;
            gap: 14px;
            margin: 38px 0 0;
            padding: 0;
            list-style: none;
          }
          li {
            width: fit-content;
            max-width: 520px;
            min-height: 52px;
            padding: 12px 18px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 14px;
            color: #e2e8f0;
            background: rgba(15, 23, 42, 0.45);
            font-size: 20px;
            font-weight: 650;
            word-break: keep-all;
            display: flex;
            align-items: center;
          }
          .shortcut {
            margin-top: 28px;
            color: #f8fafc;
            font-size: 20px;
            font-weight: 800;
          }
          .shortcut span {
            color: #fecdd3;
          }
          .panel-frame {
            position: absolute;
            right: 72px;
            top: 42px;
            width: 476px;
            height: 716px;
            padding: 18px;
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-radius: 34px;
            background: rgba(15, 23, 42, 0.72);
            box-shadow:
              0 42px 120px rgba(0, 0, 0, 0.48),
              0 0 0 1px rgba(255, 255, 255, 0.06) inset;
          }
          .panel-frame::before {
            content: "";
            position: absolute;
            inset: 8px;
            border-radius: 28px;
            border: 1px solid rgba(255, 255, 255, 0.07);
            pointer-events: none;
          }
          .panel-shot {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: 22px;
            background: #16213e;
          }
          .badge {
            position: absolute;
            right: 72px;
            bottom: 42px;
            display: flex;
            align-items: center;
            height: 48px;
            padding: 0 22px;
            border-radius: 999px;
            color: #fff;
            background: linear-gradient(135deg, #e94560, #533483);
            font-size: 18px;
            font-weight: 850;
            box-shadow: 0 18px 50px rgba(233, 69, 96, 0.26);
          }
        </style>
      </head>
      <body>
        <main class="screen">
          <section class="copy">
            <div class="brand"><div class="mark"><img src="${escapeAttr(LOGO_DATA_URL)}" alt=""></div>SnapContext</div>
            <div class="eyebrow">${escapeHtml(scene.eyebrow)}</div>
            <h1>${titleHtml}</h1>
            <p class="subtitle">${escapeHtml(scene.subtitle)}</p>
            <ul>${bullets}</ul>
            <div class="shortcut">기본 단축키 <span>${escapeHtml(scene.shortcut)}</span></div>
          </section>
          <section class="panel-frame">
            <img class="panel-shot" src="${escapeAttr(panelDataUrl)}" alt="">
          </section>
          <div class="badge">1280 × 800</div>
        </main>
      </body>
    </html>
  `
}

async function renderStoreShot(context, scene, panelDataUrl) {
  const page = await context.newPage()
  await page.setViewportSize(STORE_VIEWPORT)
  await page.setContent(buildStoreHtml(scene, panelDataUrl), {
    waitUntil: 'load'
  })
  await page.waitForTimeout(250)
  const outputPath = resolve(OUTPUT_DIR, scene.file)
  await page.screenshot({
    path: outputPath,
    fullPage: false
  })
  await page.close()

  const metadata = await sharp(outputPath).metadata()
  if (metadata.width !== 1280 || metadata.height !== 800) {
    throw new Error(
      `${scene.file} has invalid size ${metadata.width}x${metadata.height}`
    )
  }
  console.log(`[store-screenshots] saved ${outputPath}`)
}

async function main() {
  const visibleImage = await makeMockImage({
    width: 1100,
    height: 720,
    title: 'Issue Board',
    subtitle: '버그 재현 화면을 그대로 캡처',
    accent: '#e94560',
    long: false
  })
  const fullPageImage = await makeMockImage({
    width: 900,
    height: 3500,
    title: 'Long Product Page',
    subtitle: '스크롤 전체 페이지도 한 장으로',
    accent: '#e94560',
    long: true
  })

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: PANEL_VIEWPORT,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-default-browser-check',
      '--no-first-run'
    ]
  })

  try {
    const sw =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 10000 }))
    const extensionId = await getExtensionId(context)

    const panelShots = []
    panelShots.push(
      await capturePanelState(context, sw, extensionId, async () => {}, {
        cropToContent: true
      })
    )
    panelShots.push(
      await capturePanelState(context, sw, extensionId, async (page) => {
        await sendCapture(
          sw,
          fakeCapture({
            imageData: visibleImage,
            captureType: 'visible',
            title: 'Issue Board',
            url: 'https://example.com/issues',
            width: 1100,
            height: 720
          })
        )
        await waitForPreview(page)
      })
    )
    panelShots.push(
      await capturePanelState(context, sw, extensionId, async (page) => {
        await sendCapture(
          sw,
          fakeCapture({
            imageData: visibleImage,
            captureType: 'visible',
            title: 'Issue Board',
            url: 'https://example.com/issues',
            width: 1100,
            height: 720
          })
        )
        await waitForPreview(page)
        await addPinWithMemo(page, 'CTA 버튼 정렬이 깨짐')
      })
    )
    panelShots.push(
      await capturePanelState(context, sw, extensionId, async (page) => {
        await sendCapture(
          sw,
          fakeCapture({
            imageData: visibleImage,
            captureType: 'visible',
            title: 'Issue Board',
            url: 'https://example.com/issues',
            width: 1100,
            height: 720
          })
        )
        await waitForPreview(page)
        await addPinWithMemo(page, '이 영역을 기준으로 원인과 수정안을 요청')
        await page.locator('.context-pack-panel').scrollIntoViewIfNeeded()
        await page.waitForTimeout(250)
      })
    )
    panelShots.push(
      await capturePanelState(context, sw, extensionId, async (page) => {
        await sendCapture(
          sw,
          fakeCapture({
            imageData: fullPageImage,
            captureType: 'full-page',
            title: 'Long Product Page',
            url: 'https://example.com/product',
            width: 900,
            height: 3500
          })
        )
        await waitForPreview(page)
        await page.locator('.shortcuts-help').scrollIntoViewIfNeeded()
        await page.waitForTimeout(250)
      })
    )

    const scenes = [
      {
        file: '01-capture-controls.png',
        eyebrow: '캡쳐 시작',
        title: '브라우저에서\n바로 캡쳐',
        subtitle: '보이는 화면, 요소, 문서, 풀페이지 캡처를 사이드패널에서 바로 실행합니다.',
        bullets: ['Chrome·Whale 호환 MV3 확장', '4개 캡처 모드', '한국어 생산성 UI'],
        shortcut: 'Alt+Shift+V'
      },
      {
        file: '02-visible-capture-preview.png',
        eyebrow: '캡처 미리보기',
        title: '캡처 결과를\n즉시 확인',
        subtitle: '이미지 크기, 캡처 방식, 출처 메타데이터를 보존해 AI 전달용 맥락을 유지합니다.',
        bullets: ['캡처 미리보기', '원본 이미지 확대', '출처 URL·타이틀 보존'],
        shortcut: 'Alt+Shift+V'
      },
      {
        file: '03-pin-memo-annotation.png',
        eyebrow: '핀 주석',
        title: '문제 위치에\n메모 추가',
        subtitle: '이미지 위에 번호 핀을 찍고 메모를 작성해 모호한 설명을 줄입니다.',
        bullets: ['번호 핀 좌표 저장', '핀별 메모', '주석 포함 PNG 저장'],
        shortcut: '클릭으로 핀 추가'
      },
      {
        file: '04-ai-prompt-context-pack.png',
        eyebrow: 'AI 전달',
        title: '프롬프트와 JSON을\n한 번에',
        subtitle: '캡처, 핀, 메모, 페이지 메타데이터를 Context Pack으로 묶어 AI에게 전달합니다.',
        bullets: ['버그 리포트 템플릿', 'Context Pack JSON', '클립보드 복사'],
        shortcut: 'Alt+Shift+P'
      },
      {
        file: '05-full-page-shortcut-history.png',
        eyebrow: '풀페이지 캡처',
        title: '긴 페이지도\n한 장으로',
        subtitle: '스크롤 전체 페이지를 stitch하고, 최근 캡처 기록에서 다시 불러옵니다.',
        bullets: ['Alt+Shift+G 기본 단축키', '최근 캡처 기록', '스토어 후보 v0.1.3'],
        shortcut: 'Alt+Shift+G'
      }
    ]

    for (let i = 0; i < scenes.length; i += 1) {
      await renderStoreShot(context, scenes[i], panelShots[i])
    }
  } finally {
    await context.close()
    rmSync(USER_DATA_DIR, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error('[store-screenshots] failed:', err)
  process.exit(1)
})
