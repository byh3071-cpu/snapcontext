/*
 * Chrome Web Store 스크린샷 generator (1280×800 PNG ×5) — v0.2.0 스위스 에디토리얼.
 * 실 dist 사이드패널을 Playwright로 캡처해 스위스 프레임(종이/잉크/시그널 레드)에 조판한다.
 * scene: ① AI 컨텍스트 후킹 ② 캡처 4모드 ③ 프롬프트 템플릿 ④ 익명 공유(fetch mock) ⑤ 단축키.
 * 단축키 카피는 manifest 진실 기준: 기본 4개, copy-png는 직접 지정(Alt+Shift+P 표기 금지).
 */
import { chromium } from 'playwright'
import sharp from 'sharp'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync } from 'fs'
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
const FONT_DIR = resolve(PROJECT_ROOT, 'src', 'sidepanel', 'fonts')
const USER_DATA_DIR = resolve(tmpdir(), `snapcontext-store-${Date.now()}`)

const PANEL_VIEWPORT = { width: 390, height: 760 }
const STORE_VIEWPORT = { width: 1280, height: 800 }
const SHARE_MOCK_URL = 'https://snapcontext-worker.byh3071-26a.workers.dev/s/k3x9q2'

if (!existsSync(EXTENSION_PATH)) {
  console.error('[store-screenshots] dist/ not found. Run npm.cmd run build first.')
  process.exit(1)
}

mkdirSync(OUTPUT_DIR, { recursive: true })

/* 사이드패널과 동일한 self-host 폰트를 프레임에도 인라인 — 시각 한 몸 */
function fontDataUrl(file) {
  const buf = readFileSync(resolve(FONT_DIR, file))
  return `data:font/woff2;base64,${buf.toString('base64')}`
}
const ARCHIVO_URL = fontDataUrl('Archivo-wght-latin.woff2')
const MONO_URL = fontDataUrl('JetBrainsMono-wght-latin.woff2')

/* 브랜드 글리프 — App.ts BRAND_SVG와 동일 지오메트리(메인 확장 아이콘 카메라) */
function brandSvg(size, stroke = '#FFFFFF') {
  return `<svg width="${size}" height="${size}" viewBox="0 4 128 128" aria-hidden="true"><path d="M21 42h20l9-13h28l9 13h20c7.2 0 13 5.8 13 13v39c0 7.2-5.8 13-13 13H21c-7.2 0-13-5.8-13-13V55c0-7.2 5.8-13 13-13Z" fill="none" stroke="${stroke}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><circle cx="64" cy="75" r="22" fill="none" stroke="${stroke}" stroke-width="13"/><circle cx="64" cy="75" r="8" fill="${stroke}"/></svg>`
}

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

/* 캡처 대상 가짜 웹페이지 — 뉴트럴 라이트 (구 네이비 브랜드 톤 제거) */
async function makeMockImage({ width, height, title, subtitle, long }) {
  const cards = []
  const sections = long ? 10 : 4
  for (let i = 0; i < sections; i += 1) {
    const y = 210 + i * 250
    cards.push(`
      <rect x="84" y="${y}" width="${width - 168}" height="156" fill="#ffffff" stroke="#e3e1db" stroke-width="2"/>
      <rect x="118" y="${y + 34}" width="${Math.round((width - 236) * (0.72 - (i % 3) * 0.08))}" height="16" fill="#15110f" opacity="0.22"/>
      <rect x="118" y="${y + 70}" width="${Math.round((width - 236) * (0.92 - (i % 2) * 0.1))}" height="12" fill="#15110f" opacity="0.12"/>
      <rect x="118" y="${y + 98}" width="${Math.round((width - 236) * 0.58)}" height="12" fill="#15110f" opacity="0.12"/>
    `)
  }

  const issueY = long ? 710 : 410
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#f7f6f3"/>
      <rect x="0" y="0" width="${width}" height="76" fill="#ffffff"/>
      <rect x="0" y="74" width="${width}" height="2" fill="#e3e1db"/>
      <rect x="44" y="28" width="120" height="20" fill="#15110f" opacity="0.8"/>
      <rect x="${width - 320}" y="26" width="80" height="24" fill="#f7f6f3" stroke="#e3e1db" stroke-width="2"/>
      <rect x="${width - 220}" y="26" width="80" height="24" fill="#f7f6f3" stroke="#e3e1db" stroke-width="2"/>
      <rect x="${width - 120}" y="26" width="80" height="24" fill="#15110f"/>
      <text x="84" y="156" font-family="Segoe UI, Malgun Gothic, Arial, sans-serif" font-size="42" font-weight="800" fill="#15110f">${svgText(title)}</text>
      <text x="86" y="196" font-family="Segoe UI, Malgun Gothic, Arial, sans-serif" font-size="22" fill="#6e6e6e">${svgText(subtitle)}</text>
      ${cards.join('')}
      <rect x="116" y="${issueY}" width="${width - 232}" height="176" fill="#ffffff" stroke="#c0271f" stroke-width="4"/>
      <text x="158" y="${issueY + 58}" font-family="Segoe UI, Malgun Gothic, Arial, sans-serif" font-size="24" font-weight="800" fill="#c0271f">캡처해야 할 UI 이슈</text>
      <rect x="158" y="${issueY + 88}" width="${width - 360}" height="14" fill="#c0271f" opacity="0.2"/>
      <rect x="158" y="${issueY + 118}" width="${width - 430}" height="14" fill="#c0271f" opacity="0.14"/>
      <circle cx="${width - 164}" cy="${issueY + 88}" r="32" fill="#c0271f"/>
      <text x="${width - 175}" y="${issueY + 101}" font-family="Segoe UI, Arial, sans-serif" font-size="32" font-weight="800" fill="#ffffff">1</text>
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

/* '캡처 완료' 토스트가 사라질 때까지 — 토스트 오염 방지 (공유 scene은 의도 토스트만 남김) */
async function waitToastClear(page) {
  await page
    .waitForFunction(() => document.querySelectorAll('.toast').length === 0, {
      timeout: 8000
    })
    .catch(() => {})
  await page.waitForTimeout(150)
}

async function addPinWithMemo(page, memo) {
  const img = page.locator('.pin-container > .preview-img').first()
  await img.click({ position: { x: 190, y: 150 } })
  await page.waitForTimeout(250)
  const memoInput = page.locator('.pin-memo__input').first()
  await memoInput.fill(memo)
  await page.waitForTimeout(250)
}

/* upload-share E2E와 동일 패턴 — 실 worker를 때리지 않는 fetch mock */
async function installShareMock(page) {
  await page.evaluate((mockUrl) => {
    const w = window
    const real = w.fetch
    w.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.url
      if (url.includes('/upload')) {
        return new Response(JSON.stringify({ id: 'k3x9q2', url: mockUrl }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return real(input, init)
    }
  }, SHARE_MOCK_URL)
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

/* 1280×800 스위스 에디토리얼 프레임 — 사이드패널 디자인 SoT와 동일 토큰 */
function buildStoreHtml(scene, panelDataUrl) {
  const bullets = scene.bullets
    .map(
      (item, i) =>
        `<li><span class="b-num tnum">0${i + 1}</span><span class="b-txt">${escapeHtml(item)}</span></li>`
    )
    .join('')
  const titleHtml = scene.title.split('\n').map(escapeHtml).join('<br>')
  return `
    <!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8">
        <style>
          @font-face {
            font-family: 'Archivo';
            src: url('${ARCHIVO_URL}') format('woff2-variations');
            font-weight: 100 800;
            font-style: normal;
          }
          @font-face {
            font-family: 'JetBrains Mono';
            src: url('${MONO_URL}') format('woff2-variations');
            font-weight: 100 800;
            font-style: normal;
          }
          * { box-sizing: border-box; margin: 0; }
          :root {
            --paper: #FAFAF8;
            --ink: #15110F;
            --ink-2: #2A2622;
            --muted: #6E6E6E;
            --hair: #E3E1DB;
            --red: #E5302E;
          }
          body {
            width: 1280px;
            height: 800px;
            overflow: hidden;
            background: var(--paper);
            color: var(--ink);
            font-family: 'Archivo', 'Malgun Gothic', 'Segoe UI', sans-serif;
          }
          .tnum { font-family: 'JetBrains Mono', Consolas, monospace; }
          .frame {
            display: flex;
            flex-direction: column;
            width: 1280px;
            height: 800px;
            padding: 0 56px;
          }
          .masthead {
            display: flex;
            align-items: center;
            gap: 16px;
            height: 92px;
            border-bottom: 4px solid var(--ink);
            flex: none;
          }
          .brand-block {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 44px;
            height: 44px;
            background: var(--ink);
          }
          .brand-name {
            font-size: 26px;
            font-weight: 800;
            letter-spacing: 0.14em;
            text-transform: uppercase;
          }
          .mast-meta {
            margin-left: auto;
            font-family: 'JetBrains Mono', Consolas, monospace;
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 0.18em;
            color: var(--muted);
          }
          .mast-meta b { color: var(--ink); font-weight: 700; }
          .body {
            display: flex;
            flex: 1;
            min-height: 0;
            gap: 56px;
            padding-top: 44px;
          }
          .copy { width: 600px; flex: none; }
          .sec-row {
            display: flex;
            align-items: baseline;
            gap: 18px;
          }
          .sec-num {
            font-size: 104px;
            font-weight: 800;
            line-height: 0.9;
            letter-spacing: -0.04em;
          }
          .eyebrow-wrap { padding-bottom: 6px; }
          .eyebrow {
            display: block;
            font-size: 17px;
            font-weight: 800;
            letter-spacing: 0.22em;
            text-transform: uppercase;
            color: var(--ink);
          }
          .eyebrow-rule {
            width: 44px;
            height: 6px;
            margin-top: 10px;
            background: var(--red);
          }
          h1 {
            margin: 30px 0 22px;
            font-size: 58px;
            font-weight: 800;
            line-height: 1.12;
            letter-spacing: -0.015em;
            word-break: keep-all;
          }
          .subtitle {
            max-width: 560px;
            color: var(--ink-2);
            font-size: 23px;
            line-height: 1.52;
            font-weight: 500;
            word-break: keep-all;
          }
          ul {
            margin-top: 34px;
            padding: 0;
            list-style: none;
            border-top: 2px solid var(--ink);
          }
          li {
            display: flex;
            align-items: center;
            gap: 18px;
            min-height: 56px;
            border-bottom: 1px solid var(--hair);
            font-size: 20px;
            font-weight: 650;
            word-break: keep-all;
          }
          .b-num {
            flex: none;
            font-size: 15px;
            font-weight: 700;
            color: var(--muted);
          }
          .colophon {
            display: flex;
            align-items: center;
            gap: 14px;
            height: 64px;
            border-top: 1px solid var(--hair);
            flex: none;
            font-family: 'JetBrains Mono', Consolas, monospace;
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 0.16em;
            color: var(--muted);
          }
          .colophon .dot {
            width: 10px;
            height: 10px;
            background: var(--red);
            margin-left: auto;
          }
          .panel-col {
            position: relative;
            flex: 1;
            min-width: 0;
          }
          .panel-frame {
            position: absolute;
            right: 10px;
            top: 0;
            width: 462px;
            border: 3px solid var(--ink);
            background: var(--paper);
          }
          .panel-frame::after {
            content: "";
            position: absolute;
            left: 10px;
            top: 10px;
            width: 100%;
            height: 100%;
            background: var(--ink);
            z-index: -1;
          }
          .panel-shot {
            display: block;
            width: 100%;
            height: 558px;
            object-fit: cover;
            object-position: top center;
          }
          .panel-cap {
            display: flex;
            align-items: center;
            gap: 12px;
            height: 44px;
            padding: 0 16px;
            border-top: 3px solid var(--ink);
            font-family: 'JetBrains Mono', Consolas, monospace;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.14em;
            color: var(--ink);
            text-transform: uppercase;
          }
        </style>
      </head>
      <body>
        <main class="frame">
          <header class="masthead">
            <span class="brand-block">${brandSvg(26)}</span>
            <span class="brand-name">SnapContext</span>
            <span class="mast-meta">CHROME · WHALE MV3 · <b>V0.2.0</b></span>
          </header>
          <div class="body">
            <section class="copy">
              <div class="sec-row">
                <span class="sec-num tnum">${escapeHtml(scene.num)}</span>
                <span class="eyebrow-wrap">
                  <span class="eyebrow">${escapeHtml(scene.eyebrow)}</span>
                  <span class="eyebrow-rule"></span>
                </span>
              </div>
              <h1>${titleHtml}</h1>
              <p class="subtitle">${escapeHtml(scene.subtitle)}</p>
              <ul>${bullets}</ul>
            </section>
            <section class="panel-col">
              <div class="panel-frame">
                <img class="panel-shot" src="${escapeAttr(panelDataUrl)}" alt="">
                <div class="panel-cap">${escapeHtml(scene.panelCap)}</div>
              </div>
            </section>
          </div>
          <footer class="colophon">
            <span>SNAPCONTEXT</span><span>·</span><span>화면 → 컨텍스트</span>
            <span class="dot"></span>
          </footer>
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
  await page.waitForTimeout(300)
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
    long: false
  })
  const fullPageImage = await makeMockImage({
    width: 900,
    height: 3500,
    title: 'Long Product Page',
    subtitle: '스크롤 전체 페이지도 한 장으로',
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
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const sw =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 10000 }))
    const extensionId = await getExtensionId(context)

    const captureVisible = async (page) => {
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
      await waitToastClear(page)
    }

    const panelShots = []

    /* ① 후킹: 캡처 + 핀 메모 + Context Pack 프롬프트가 함께 보이는 상태 */
    panelShots.push(
      await capturePanelState(context, sw, extensionId, async (page) => {
        await captureVisible(page)
        await addPinWithMemo(page, 'CTA 버튼 정렬이 깨짐')
        await page.locator('.context-pack-panel').scrollIntoViewIfNeeded()
        await page.waitForTimeout(250)
      })
    )

    /* ② 캡처 4모드: 초기 패널 (cap-btn 5행) */
    panelShots.push(
      await capturePanelState(context, sw, extensionId, async () => {}, {
        cropToContent: true
      })
    )

    /* ③ 프롬프트 템플릿: 핀 + 메모 → Context Pack 패널 포커스 */
    panelShots.push(
      await capturePanelState(context, sw, extensionId, async (page) => {
        await captureVisible(page)
        await addPinWithMemo(page, '이 영역 기준으로 원인과 수정안 요청')
        await page.locator('.context-pack-panel').scrollIntoViewIfNeeded()
        await page.waitForTimeout(250)
      })
    )

    /* ④ 익명 공유: fetch mock → 동의 → 공유 성공 토스트 (실 worker 미접촉) */
    panelShots.push(
      await capturePanelState(context, sw, extensionId, async (page) => {
        await installShareMock(page)
        await captureVisible(page)
        const shareBtn = page
          .locator('.image-actions__share-row button')
          .filter({ hasText: '공유 링크' })
          .first()
        await shareBtn.scrollIntoViewIfNeeded()
        await shareBtn.click()
        await page.waitForTimeout(300)
        const consent = page.locator('.snap-confirm__btn--primary')
        if ((await consent.count()) > 0) await consent.click()
        await page.waitForTimeout(600)
      })
    )

    /* ⑤ 단축키: 풀페이지 캡처 후 도움말 패널 오픈 */
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
        await waitToastClear(page)
        await page.locator('[data-role="settings"]').click()
        await page.waitForTimeout(400)
      })
    )

    const scenes = [
      {
        file: '01-ai-context-hook.png',
        num: '01',
        eyebrow: 'AI 컨텍스트',
        title: '캡처 한 번,\n프롬프트 완성',
        subtitle:
          '캡처와 동시에 화면·핀 주석·출처 정보가 AI에 붙여넣을 컨텍스트로 정리됩니다.',
        bullets: [
          '화면 + 핀 주석 + 출처 자동 정리',
          'ChatGPT·Claude에 바로 붙여넣기',
          '설명을 다시 쓸 필요가 없습니다'
        ],
        panelCap: '캡처 → 컨텍스트 팩'
      },
      {
        file: '02-capture-modes.png',
        num: '02',
        eyebrow: '캡처 4모드',
        title: '영역 · 요소 · 문서 ·\n풀페이지',
        subtitle:
          '사이드패널에서 4가지 캡처를 바로 실행합니다. 기본 단축키 4개를 제공합니다.',
        bullets: [
          '영역 Alt+Shift+V · 요소 Alt+Shift+E',
          '문서 Alt+Shift+M · 풀페이지 Alt+Shift+G',
          'Chrome · Whale MV3 호환'
        ],
        panelCap: '4 캡처 모드 + 프롬프트'
      },
      {
        file: '03-prompt-template.png',
        num: '03',
        eyebrow: '프롬프트 템플릿',
        title: '버그 리포트를\n템플릿으로',
        subtitle:
          '버그 리포트·리팩토링·레퍼런스 템플릿이 캡처 컨텍스트를 작업 지시문으로 바꿉니다.',
        bullets: [
          '버그 · 리팩토링 · 레퍼런스 템플릿',
          'Context Pack JSON 동봉',
          '클립보드 한 번에 복사'
        ],
        panelCap: '프롬프트 + JSON'
      },
      {
        file: '04-share-link.png',
        num: '04',
        eyebrow: '익명 공유',
        title: '로그인 없이,\n7일 뒤 사라집니다',
        subtitle:
          '공유 링크를 만들 때만 업로드됩니다. 7일 후 접근이 차단되고 서버에서도 영구 삭제됩니다.',
        bullets: [
          '계정 · 로그인 · 추적 없음',
          '컨텍스트 포함은 기본 꺼짐 + 동의제',
          '토큰·쿠키·로컬 데이터 전송 안 함'
        ],
        panelCap: '공유 링크 · 7일 만료'
      },
      {
        file: '05-shortcuts-help.png',
        num: '05',
        eyebrow: '단축키',
        title: '키보드로\n캡처부터 끝까지',
        subtitle:
          '기본 단축키 4개를 제공합니다. PNG 복사는 브라우저 단축키 설정에서 직접 지정합니다.',
        bullets: [
          'Alt+Shift+V — 영역 캡처',
          'Alt+Shift+E / M / G — 요소 · 문서 · 풀페이지',
          '도움말 패널에서 항상 확인'
        ],
        panelCap: '단축키 도움말'
      }
    ]

    /* 구 파일명 잔재 제거 — 이 디렉터리는 generator 소유 */
    for (const f of readdirSync(OUTPUT_DIR)) {
      if (f.endsWith('.png') && !scenes.some((s) => s.file === f)) {
        unlinkSync(resolve(OUTPUT_DIR, f))
        console.log(`[store-screenshots] removed stale ${f}`)
      }
    }

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
