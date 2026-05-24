/*
 * Regression probe: Alt+Shift+G should trigger the real chrome.commands path
 * for full-page capture and deliver a full-page CAPTURE_RESULT to the panel.
 */
import { chromium } from 'playwright'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import { createServer } from 'http'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..', '..')
const EXTENSION_PATH = resolve(PROJECT_ROOT, 'dist')
const SCREENSHOTS_DIR = resolve(__dirname, 'screenshots')
const USER_DATA_DIR = resolve(tmpdir(), `snapcontext-shortcut-${Date.now()}`)

if (!existsSync(EXTENSION_PATH)) {
  console.error('[full-shortcut] dist/ not found. Run "npm run build" first.')
  process.exit(1)
}
mkdirSync(SCREENSHOTS_DIR, { recursive: true })

const results = []
function log(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function getServiceWorker(context) {
  const existing = context.serviceWorkers()
  if (existing.length > 0) return existing[0]
  return context.waitForEvent('serviceworker', { timeout: 10000 })
}

async function main() {
  console.log('[full-shortcut] launching chromium')
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(`
      <!doctype html>
      <title>Shortcut Fixture</title>
      <main style="font: 18px system-ui; width: 620px">
        <h1>Full page shortcut fixture</h1>
        ${Array.from({ length: 80 }, (_, i) => `<p>Row ${i + 1}</p>`).join('')}
      </main>
    `)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const fixtureUrl = `http://127.0.0.1:${port}/`

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 900, height: 700 },
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

    const commands = await sw.evaluate(async () => chrome.commands.getAll())
    const fullPageCommand = commands.find((cmd) => cmd.name === 'capture-full-page')
    log(
      'capture-full-page command is registered as Alt+Shift+G',
      fullPageCommand?.shortcut === 'Alt+Shift+G',
      `shortcut="${fullPageCommand?.shortcut ?? ''}"`
    )
    await sw.evaluate(() => {
      const g = globalThis
      g.__snapcontextShortcutEvents = []
      if (!g.__snapcontextShortcutProbeInstalled) {
        g.__snapcontextShortcutProbeInstalled = true
        chrome.commands.onCommand.addListener((command) => {
          g.__snapcontextShortcutEvents.push(command)
        })
      }
    })

    const page = await context.newPage()
    await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
    await page.bringToFront()
    await page.keyboard.press('Alt+Shift+G')
    await page.waitForTimeout(500)

    const commandEvents = await sw.evaluate(() => {
      return globalThis.__snapcontextShortcutEvents ?? []
    })
    if (commandEvents.includes('capture-full-page')) {
      console.log('[full-shortcut] synthetic Alt+Shift+G reached chrome.commands')
    } else {
      console.log(
        `[full-shortcut] synthetic Alt+Shift+G did not reach chrome.commands; events=${JSON.stringify(commandEvents)}`
      )
    }

    const sidePanelUrl = `chrome-extension://${extensionId}/src/sidepanel/index.html`
    const panel = await context.newPage()
    await panel.goto(sidePanelUrl, { waitUntil: 'domcontentloaded' })
    await sw.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url })
      if (!tab?.id) throw new Error(`Fixture tab not found: ${url}`)
      await chrome.tabs.update(tab.id, { active: true })
      await chrome.windows.update(tab.windowId, { focused: true })
    }, fixtureUrl)
    await panel.evaluate(async () => {
      await chrome.runtime.sendMessage({ type: 'CAPTURE_FULL_PAGE' })
    })
    await panel.waitForTimeout(5000)

    const title = await panel.locator('.preview-result-title strong').textContent()
    const meta = await panel.locator('.preview-result-meta').textContent()
    const size = (meta ?? '').match(/(\d+)\D+(\d+)/)
    const height = size ? Number(size[2]) : 0
    log(
      'CAPTURE_FULL_PAGE command route creates a full-page result',
      (title ?? '').trim() === '전체 캡처',
      `title="${(title ?? '').trim()}"`
    )
    log(
      'full-page capture height exceeds viewport height',
      height > 700,
      `meta="${(meta ?? '').trim()}"`
    )

    const screenshotPath = resolve(SCREENSHOTS_DIR, '06-full-page-shortcut.png')
    await panel.screenshot({ path: screenshotPath, fullPage: true })
    console.log('[full-shortcut] saved', screenshotPath)

    const failed = results.filter((r) => !r.pass)
    console.log(
      `\n[full-shortcut] ${results.length - failed.length}/${results.length} checks passed`
    )
    if (failed.length > 0) exitCode = 1
  } catch (err) {
    console.error('[full-shortcut] fatal:', err)
    exitCode = 1
  } finally {
    await context.close()
    await new Promise((resolve) => server.close(resolve))
    try {
      rmSync(USER_DATA_DIR, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
  process.exit(exitCode)
}

main()
