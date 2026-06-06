import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertExists } from './lib/goal-assert.mjs'

function findUploadMarker(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name)
    if (name.isDirectory() && !name.name.startsWith('.')) {
      const hit = findUploadMarker(p)
      if (hit) return hit
      continue
    }
    if (!/\.(ts|tsx|js|mjs)$/.test(name.name)) continue
    const text = readFileSync(p, 'utf8')
    if (/upload.*r2|r2.*upload|cloudUpload|shareLink|presigned/i.test(text)) {
      return p
    }
  }
  return null
}

assertExists('workers', 'workers/')
const workerEntry = ['workers/src/index.ts', 'workers/index.ts'].find(existsSync)
if (!workerEntry) {
  console.error('FAIL: workers entry (index.ts) not found')
  process.exit(1)
}

const marker = findUploadMarker('src')
if (!marker) {
  console.error('FAIL: no upload/share UI in src/ (expected R2 upload flow)')
  process.exit(1)
}

console.log(`OK: Phase 2 — workers + upload code (${marker})`)
