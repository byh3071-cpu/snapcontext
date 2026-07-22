import { assertIncludes } from './lib/goal-assert.mjs'

const privacy = 'docs/PRIVACY.md'

// v0.4.0: 보관 기간이 1/7/30일로 파라미터화되면서 "7일" 하드 단언은 사실과 어긋난다.
// (0.3.x 는 7일 고정이라 '7일' 존재로 검사했다 — docs/log 참고)
// 이제 "보관 기간"(파라미터화 고지)·"자동"(삭제 정책)·owner 격리 신설 고지를 검사한다.
assertIncludes(privacy, '보관 기간')
assertIncludes(privacy, '자동')
assertIncludes(privacy, 'Cloudflare')
assertIncludes(privacy, '익명')
assertIncludes(privacy, 'owner')

console.log('OK: Phase 3 — PRIVACY.md cloud upload section (v0.4.0 보관 기간·owner)')
