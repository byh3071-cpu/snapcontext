// 390px 폭에서 스크롤 세그먼트별 확대 스크린샷 — 디테일 품질 검수
import { chromium } from 'playwright';
import { pathToFileURL } from 'url';

const file = process.argv[2];
const prefix = process.argv[3] || 'docs/ui-audit/swiss/_seg';
const VW = 390, VH = 760;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' });
try { await page.evaluate(() => document.fonts.ready); } catch {}
await page.waitForTimeout(500);

const total = await page.evaluate(() => document.body.scrollHeight);
const step = VH - 40; // 약간 겹치게
let i = 0;
for (let y = 0; y < total; y += step) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(180);
  const out = `${prefix}-${String(i).padStart(2, '0')}.png`;
  await page.screenshot({ path: out });
  console.log('seg', i, 'y=', y, out);
  i++;
}
console.log('total height', total, 'segments', i);
await browser.close();
