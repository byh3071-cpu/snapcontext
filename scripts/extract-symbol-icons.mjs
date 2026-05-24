/*
 * Strips the dark (navy) background from public/assets/icons/icon-128-new.png,
 * trims the resulting symbol, and re-renders all icon sizes so the symbol
 * (brackets + pin) fills the canvas with a transparent background.
 *
 * Heuristic: pixels whose max(R,G,B) channel is below DARK_CUTOFF become
 * fully transparent; values up to MID_CUTOFF fade in linearly to preserve
 * anti-aliased edges of the symbol.
 *
 * Usage:
 *   node scripts/extract-symbol-icons.mjs               # default 96% fill
 *   node scripts/extract-symbol-icons.mjs --fill 100    # custom fill
 */
import sharp from 'sharp'
import { existsSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const SIZES = [16, 48, 128]
const ASSET_DIR = resolve('public/assets/icons')
const LEGACY_DIR = resolve('public/icons')
const SOURCE = resolve(ASSET_DIR, 'icon-128-new.png')

const DARK_CUTOFF = 95   // <= this → fully transparent
const MID_CUTOFF = 160   // (DARK_CUTOFF, MID_CUTOFF] → fade alpha

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

// Step 1: read raw RGBA pixels
const { data, info } = await sharp(SOURCE)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

// Step 2: replace dark background with transparent
const out = Buffer.from(data)
for (let i = 0; i < out.length; i += 4) {
  const r = out[i]
  const g = out[i + 1]
  const b = out[i + 2]
  const max = Math.max(r, g, b)
  if (max <= DARK_CUTOFF) {
    out[i + 3] = 0
  } else if (max < MID_CUTOFF) {
    const fade = Math.round(((max - DARK_CUTOFF) * 255) / (MID_CUTOFF - DARK_CUTOFF))
    out[i + 3] = Math.min(out[i + 3], fade)
  }
}

const stripped = await sharp(out, {
  raw: { width: info.width, height: info.height, channels: 4 }
})
  .png()
  .toBuffer()

// Step 3: trim transparent border to fit bounding box of the symbol
const trimmed = await sharp(stripped).trim({ threshold: 1 }).toBuffer()

// Step 4: render to each target size with the configured fill ratio
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
  `Extracted symbol at ${fillPercent}% fill written to ${ASSET_DIR} and ${LEGACY_DIR}`
)
