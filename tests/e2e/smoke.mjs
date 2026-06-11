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
 *   - Korean labels are present (capture rows, history, settings help panel)
 *   - 스위스 §01 캡처 리스트: 4 캡처 행 + 프롬프트 primary 행 (5행)
 *   - 레드 다이어트 잠금: 시그널 레드는 프롬프트 CTA에만, 섹션 번호는 잉크
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

    // A: 캡처 행 5개 (4 캡처 모드 + 프롬프트 primary)
    const captureBtnCount = await page.locator('.cap-btn').count()
    record(
      '5 capture rows present (4 modes + prompt)',
      captureBtnCount === 5,
      `count=${captureBtnCount}`
    )

    // A: Korean capture row labels
    const captureLabels = await page
      .locator('.cap-btn .cap-label')
      .allTextContents()
    const expectedLabels = ['화면 캡처', '요소 캡처', '문서 캡처', '전체 캡처', '프롬프트']
    const missingLabels = expectedLabels.filter(
      (l) => !captureLabels.some((found) => found.includes(l))
    )
    record(
      'capture row labels in Korean',
      missingLabels.length === 0,
      missingLabels.length ? `missing=${missingLabels.join(',')}` : `${captureLabels.length} labels`
    )

    // A: 레드 다이어트 잠금 — 프롬프트 행만 시그널 레드, 섹션 번호는 잉크
    const redLock = await page.evaluate(() => {
      const primary = document.querySelector('.cap-btn.is-primary')
      const plain = document.querySelector('.cap-btn:not(.is-primary)')
      const secNum = document.querySelector('.sec-num')
      if (!primary || !plain || !secNum) return { ok: false, why: 'missing-elements' }
      const primaryBg = getComputedStyle(primary).backgroundColor
      const plainBg = getComputedStyle(plain).backgroundColor
      const numColor = getComputedStyle(secNum).color
      return {
        ok:
          primaryBg === 'rgb(229, 48, 46)' && // --red #E5302E
          plainBg !== primaryBg &&
          numColor === 'rgb(21, 17, 15)', // --ink #15110F (레드 아님)
        why: `primary=${primaryBg} plain=${plainBg} secNum=${numColor}`
      }
    })
    record('red diet lock (prompt CTA only, ink sec-num)', redLock.ok, redLock.why)

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

    // A: 설정 기어 → 도움말 패널 토글 (단축키 목록 노출)
    const settingsBtn = page.locator('[data-role="settings"]')
    const settingsLabel = await settingsBtn.getAttribute('aria-label')
    record(
      'settings gear labeled in Korean',
      (settingsLabel ?? '').includes('단축키'),
      `aria-label="${settingsLabel ?? ''}"`
    )
    await settingsBtn.click()
    await page.waitForTimeout(150)
    const helpVisible = await page.evaluate(() => {
      const help = document.querySelector('.help-panel')
      if (!help || help.hasAttribute('hidden')) return false
      return (help.textContent ?? '').includes('Alt+Shift+V')
    })
    record('help panel opens with shortcut list', helpVisible, '')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    const helpClosed = await page.evaluate(() => {
      const help = document.querySelector('.help-panel')
      return !!help && help.hasAttribute('hidden')
    })
    record('help panel closes on Escape', helpClosed, '')

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
