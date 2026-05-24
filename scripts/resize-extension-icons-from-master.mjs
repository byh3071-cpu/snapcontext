import sharp from 'sharp'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const assetDir = resolve('public/assets/icons')
const legacyDir = resolve('public/icons')
const master = resolve(assetDir, 'icon-128-new.png')

if (!existsSync(master)) {
  console.error(
    'Missing master icon: public/assets/icons/icon-128-new.png\n' +
      'Put your logo there (square-ish PNG recommended), then run: npm run icons:from-master'
  )
  process.exit(1)
}

mkdirSync(assetDir, { recursive: true })
mkdirSync(legacyDir, { recursive: true })

const sizes = [16, 48, 128]
for (const s of sizes) {
  const buf = await sharp(master)
    .resize(s, s, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer()

  writeFileSync(resolve(assetDir, `icon-${s}.png`), buf)
  writeFileSync(resolve(legacyDir, `icon${s}.png`), buf)
}

console.log(
  `Updated icon-{16,48,128}.png in ${assetDir} and icon{16,48,128}.png in ${legacyDir} from icon-128-new.png`
)
