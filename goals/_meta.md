---
vhk_format: 1
type: meta
project: SnapContext
version: v0.2
---

# Common Gates (SnapContext v0.2)

1. `npm run build` — dist 생성
2. `npm test` — unit tests
3. `npm run test:e2e:all` — E2E (Phase 4+)

## Forbidden Actions

- `vhk sync` on this repo (`.cursorrules` SoT — 덮어쓰기 금지)
- OAuth / Turso / Notion in v0.2 scope
- React or bundle bloat beyond existing ~43kB discipline
