// 사이드패널 실폭(390px) 렌더 스크린샷 — 품질 육안 검수용
import { chromium } from 'playwright';
import { pathToFileURL } from 'url';

const file = process.argv[2];
const out = process.argv[3];
const state = process.argv[4]; // optional: idle|busy|done
const fullArg = process.argv[5]; // 'full' | 'view'

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 390, height: 1100 },
  deviceScaleFactor: 2,
});
await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' });
try { await page.evaluate(() => document.fonts.ready); } catch {}
if (state) {
  await page.evaluate((s) => {
    const el = document.querySelector('[data-state]');
    if (el) el.setAttribute('data-state', s);
  }, state);
}
await page.waitForTimeout(500);
await page.screenshot({ path: out, fullPage: fullArg !== 'view' });
await browser.close();
console.log('shot:', out);
