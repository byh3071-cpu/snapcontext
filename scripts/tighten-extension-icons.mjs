/*
 * Trims transparent padding from public/assets/icons/icon-128.png
 * and re-renders all icon sizes so the logo fills more of the canvas.
 *
 * Usage:
 *   node scripts/tighten-extension-icons.mjs            # default 96% fill
 *   node scripts/tighten-extension-icons.mjs --fill 92  # custom fill ratio (60..100)
 */
import sharp from 'sharp'
import { existsSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const SIZES = [16, 48, 128]
const ASSET_DIR = resolve('public/assets/icons')
const LEGACY_DIR = resolve('public/icons')
const SOURCE = resolve(ASSET_DIR, 'icon-128.png')

const fillArgIdx = process.argv.indexOf('--fill')
const fillPercent = fillArgIdx >= 0 ? Number(process.argv[fillArgIdx + 1]) : 96
if (!Number.isFinite(fillPercent) || fillPercent < 60 || fillPercent > 100) {
  console.error('--fill must be a number between 60 and 100')
  process.exit(1)
}

if (!existsSync(SOURCE)) {
  console.error(`Missing source icon: ${SOURCE}`)
  process.exit(1)
}

const trimmed = await sharp(SOURCE).trim({ threshold: 10 }).toBuffer()

for (const s of SIZES) {
  const inner = Math.round((s * fillPercent) / 100)
  const padTotal = s - inner
  const padLeft = Math.floor(padTotal / 2)
  const padRight = padTotal - padLeft
  const padTop = padLeft
  const padBottom = padRight

  const buf = await sharp(trimmed)
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer()

  writeFileSync(resolve(ASSET_DIR, `icon-${s}.png`), buf)
  writeFileSync(resolve(LEGACY_DIR, `icon${s}.png`), buf)
}

console.log(
  `Tightened icons at ${fillPercent}% fill written to ${ASSET_DIR} and ${LEGACY_DIR}`
)
