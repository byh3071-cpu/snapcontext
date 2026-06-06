import { readFileSync } from 'node:fs'
import { assertExists, assertIncludes } from './lib/goal-assert.mjs'

assertExists('wrangler.toml', 'Cloudflare Workers config')
assertIncludes('.env.example', 'R2_')

const wrangler = readFileSync('wrangler.toml', 'utf8')
if (!/r2_buckets|R2/i.test(wrangler)) {
  console.error('FAIL: wrangler.toml should declare R2 bucket binding')
  process.exit(1)
}

console.log('OK: Phase 1 — R2/Workers env scaffold')
