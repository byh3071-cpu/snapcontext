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
    w.__tokenRequests = 0
    const real = w.fetch
    w.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.url
      // 토큰 발급도 가로챈다 — 안 막으면 실제 워커로 나가서 테스트가 네트워크·시크릿
      // 주입 상태에 의존하게 되고, 왕복 지연이 아래 업로드 대기와 겹쳐 오탐이 난다
      if (url.includes('/token')) {
        w.__tokenRequests += 1
        return new Response(JSON.stringify({ token: 'sc_AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (url.includes('/upload')) {
        const headers = (init && init.headers) || null
        w.__lastAuth = headers ? headers.Authorization ?? null : null
        const form = init && init.body
        w.__lastExpiry =
          form && typeof form.get === 'function' ? form.get('expiresInDays') : null
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

    // --- 0회차: 미동의(취소) → 업로드 차단 (#6) ---
    await shareBtn.click()
    await page.waitForTimeout(300)
    const cancelDialogShown = (await page.locator('.snap-confirm').count()) > 0
    log('미동의 케이스: 동의 다이얼로그 표시', cancelDialogShown)
    if (cancelDialogShown) {
      await page.locator('.snap-confirm__btn--muted').click() // '취소' 클릭
    }
    await page.waitForTimeout(500)
    // 취소했으니 /upload 호출이 일어나면 안 됨 (window.__lastUpload === null 유지)
    const afterCancel = await page.evaluate(() => window.__lastUpload)
    log('미동의(취소) → 업로드 호출 차단', afterCancel === null, JSON.stringify(afterCancel))

    // --- 1회차: 토글 OFF, 동의 다이얼로그 → 계속 (취소 시 동의 미저장이라 다시 떠야 함) ---
    await shareBtn.click()
    await page.waitForTimeout(300)
    const dialog = page.locator('.snap-confirm')
    const dialogShown = (await dialog.count()) > 0
    log('취소 후 재클릭 시 동의 다이얼로그 재표시(동의 미저장)', dialogShown)
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

    // 0.4.0 P5 — 토큰·보관 기간
    const auth = await page.evaluate(() => window.__lastAuth ?? null)
    const expiry = await page.evaluate(() => window.__lastExpiry ?? null)
    const tokenReqs = await page.evaluate(() => window.__tokenRequests ?? 0)
    log('업로드에 Bearer 토큰 동봉', typeof auth === 'string' && auth.startsWith('Bearer sc_'))
    log('보관 기간 기본값 7일 전송', expiry === '7')
    // in-flight 가드 + storage 재사용이 동작하면 업로드를 여러 번 해도 발급은 1회다
    log('토큰 발급은 1회만 (재사용)', tokenReqs === 1)

    // --- 3회차: 설정에서 30일 선택 (N5) — 비기본 기간이 한 번도 안 돌던 구멍 ---
    await page.locator('[data-role="settings"]').click()
    await page.waitForTimeout(200)
    const expirySelect = page.locator('#share-expiry-days')
    log('설정 패널에 보관 기간 select 노출', (await expirySelect.count()) > 0)
    await expirySelect.selectOption('30')
    await page.waitForTimeout(300)
    await page.locator('.help-close').click()
    await page.waitForTimeout(200)

    const label30 = (await shareBtn.textContent()) ?? ''
    log('기간 변경 시 공유 버튼 라벨 갱신', label30.includes('30일'), label30.trim())
    const cap30 = (await page.locator('.publish-cap').first().textContent()) ?? ''
    log('기간 변경 시 발행 캡션 갱신', cap30.includes('30일'), cap30.trim())

    await shareBtn.click()
    await page.waitForTimeout(300)
    // 7일 → 30일 상향이라 재동의를 받아야 한다 (N3)
    const dialog3 = page.locator('.snap-confirm')
    const dialog3Shown = (await dialog3.count()) > 0
    log('기간 상향 시 재동의 다이얼로그 표시', dialog3Shown)
    if (dialog3Shown) {
      const consentText = (await dialog3.first().textContent()) ?? ''
      log('재동의 문구에 30일 반영(사실과 다른 동의 방지)', consentText.includes('30일'))
      await page.locator('.snap-confirm__btn--primary').click()
    }
    await page.waitForTimeout(800)

    const expiry30 = await page.evaluate(() => window.__lastExpiry ?? null)
    log('보관 기간 30일 전송', expiry30 === '30', String(expiry30))

    // --- 4회차: MCP 연동 온보딩 UI (T6.1) — 업로드로 발급된 토큰이 storage 에 있다 ---
    const ISSUED = 'sc_AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB' // mock 발급값(installFetchMock)
    await page.locator('[data-role="settings"]').click()
    await page.waitForTimeout(300)

    const onboardGroup = page.locator('#help-panel .set-group-label', { hasText: 'MCP 연동' })
    log('설정 패널에 MCP 연동 그룹 노출', (await onboardGroup.count()) > 0)

    // 내 토큰은 마스킹만 화면에 — 원문 전체가 DOM 텍스트로 새면 안 된다(보안)
    const tokenMasked = page.locator('.shortcuts-help__token-row code')
    const maskedText = (await tokenMasked.textContent()) ?? ''
    log('내 토큰 마스킹 표시', maskedText === 'sc_AAAA…BBBB', maskedText)
    // 명령 표시까지 포함해 패널 어디에도 원문 토큰이 보이면 안 된다(화면공유·스크린샷 방지)
    const panelText = (await page.locator('#help-panel').textContent()) ?? ''
    log('토큰 원문이 패널 어디에도(명령 포함) 노출되지 않음', !panelText.includes(ISSUED))

    // 복붙 명령 표시도 마스킹 토큰 — 원문은 복사 시점에만 생성한다
    const claudeCmd = (await page.locator('#help-panel pre').first().textContent()) ?? ''
    log('Claude 명령 표시는 마스킹(원문 노출 없음)',
      claudeCmd.includes('claude mcp add') && claudeCmd.includes('sc_AAAA…BBBB') && !claudeCmd.includes(ISSUED) && claudeCmd.includes('/mcp'))
    const codexCmd = (await page.locator('#help-panel pre').nth(1).textContent()) ?? ''
    log('Codex 명령 표시는 마스킹 2줄 + env var',
      codexCmd.includes('setx SNAPCONTEXT_MCP_TOKEN') && codexCmd.includes('--bearer-token-env-var') && !codexCmd.includes(ISSUED))

    // 복사 버튼은 마스킹이 아니라 원문을 클립보드에 넣는다
    await page.locator('.shortcuts-help__token-row .btn-ghost').click()
    await page.waitForTimeout(200)
    const tokenClip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))
    log('토큰 복사 = 원문(마스킹 아님)', tokenClip === ISSUED, tokenClip)

    // 다른 기기 토큰 붙여넣기 — 유효값이면 마스킹·명령이 갱신된다
    const pasteInput = page.locator('#shortcuts-help-token-paste')
    await pasteInput.fill('sc_CCCCCCCCCCCCCCCCCCCCCC.DDDDDDDDDDDDDDDDDDDDDD')
    await page.locator('#help-panel button', { hasText: '적용' }).click()
    await page.waitForTimeout(300)
    log('붙여넣기(유효) → 마스킹 갱신', ((await tokenMasked.textContent()) ?? '') === 'sc_CCCC…DDDD')
    const PASTED = 'sc_CCCCCCCCCCCCCCCCCCCCCC.DDDDDDDDDDDDDDDDDDDDDD'
    const claudeCmd2 = (await page.locator('#help-panel pre').first().textContent()) ?? ''
    log('붙여넣기(유효) → 명령 표시 마스킹 갱신',
      claudeCmd2.includes('sc_CCCC…DDDD') && !claudeCmd2.includes(PASTED))
    // 명령 복사는 화면 마스킹이 아니라 원문 토큰 명령을 클립보드에 넣는다(nth(1)=Claude 명령 복사)
    await page.locator('#help-panel .btn-ghost').nth(1).click()
    await page.waitForTimeout(200)
    const cmdClip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))
    log('명령 복사 = 원문 토큰 명령(마스킹 아님)', cmdClip.includes('claude mcp add') && cmdClip.includes(PASTED))

    // 형식 위반은 조용히 무시하지 않고 인라인 에러 — 저장도 안 된다
    await pasteInput.fill('notoken')
    await page.locator('#help-panel button', { hasText: '적용' }).click()
    await page.waitForTimeout(200)
    const errShown = await page.locator('#help-panel', { hasText: '토큰 형식이 올바르지 않습니다' }).count()
    log('붙여넣기(형식 위반) → 인라인 에러 표시', errShown > 0)
    log('형식 위반은 저장 안 됨(마스킹 불변)', ((await tokenMasked.textContent()) ?? '') === 'sc_CCCC…DDDD')

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
