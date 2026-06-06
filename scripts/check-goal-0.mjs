import { assertExists, assertMinLength } from './lib/goal-assert.mjs'

const listing = 'docs/store/v0.2/store-listing.md'

assertExists(listing, 'v0.2 store listing draft')
assertMinLength(listing, 500)

console.log('OK: Phase 0 — store listing draft present')
