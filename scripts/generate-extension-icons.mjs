import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { resolve } from 'path'

const assetDir = resolve('public/assets/icons')
const legacyDir = resolve('public/icons')
mkdirSync(assetDir, { recursive: true })
mkdirSync(legacyDir, { recursive: true })

function iconSvg(size) {
  const stroke = size <= 16 ? 7.5 : 6.5
  const lensStroke = size <= 16 ? 7 : 6
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="8 16 112 112">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 42h20l9-13h28l9 13h20c7.2 0 13 5.8 13 13v39c0 7.2-5.8 13-13 13H21c-7.2 0-13-5.8-13-13V55c0-7.2 5.8-13 13-13Z" fill="#e94560" stroke="#ffffff" stroke-width="${stroke}"/>
    <circle cx="64" cy="75" r="22" fill="#ffffff" stroke="#0f172a" stroke-width="${lensStroke}"/>
    <circle cx="64" cy="75" r="8" fill="#e94560"/>
  </g>
</svg>
`.trim()
}

for (const size of [16, 48, 128]) {
  const buffer = await sharp(Buffer.from(iconSvg(size)))
    .resize(size, size, { fit: 'contain' })
    .png()
    .toBuffer()

  await sharp(buffer).toFile(resolve(assetDir, `icon-${size}.png`))
  await sharp(buffer).toFile(resolve(legacyDir, `icon${size}.png`))
}

console.log('wrote transparent icons to', assetDir, 'and', legacyDir)
