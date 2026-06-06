import { assertIncludes } from './lib/goal-assert.mjs'

const privacy = 'docs/PRIVACY.md'

assertIncludes(privacy, '7일')
assertIncludes(privacy, 'Cloudflare')
assertIncludes(privacy, '익명')

console.log('OK: Phase 3 — PRIVACY.md cloud upload section')
