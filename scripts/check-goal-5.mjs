import { readdirSync, readFileSync } from 'node:fs'
import { assertExists } from './lib/goal-assert.mjs'

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
if (!manifest.version.startsWith('0.2')) {
  console.error(`FAIL: manifest.json version must be 0.2.x (got ${manifest.version})`)
  process.exit(1)
}

const logs = readdirSync('docs/log')
const v02Log = logs.find((f) => /v0\.?2|v02/i.test(f))
if (!v02Log) {
  console.error('FAIL: docs/log/* v0.2 submission log missing')
  process.exit(1)
}

assertExists('docs/store/v0.2/store-listing.md')

console.log(`OK: Phase 5 — v${manifest.version} + log ${v02Log}`)
