import { existsSync, readFileSync } from 'node:fs'

export function assertExists(path, label = path) {
  if (!existsSync(path)) {
    console.error(`FAIL: missing ${label}`)
    console.error(`  → ${path}`)
    process.exit(1)
  }
}

export function assertIncludes(path, needle) {
  assertExists(path)
  const text = readFileSync(path, 'utf8')
  if (!text.includes(needle)) {
    console.error(`FAIL: ${path} must include: ${needle}`)
    process.exit(1)
  }
}

export function assertMinLength(path, minChars) {
  assertExists(path)
  const len = readFileSync(path, 'utf8').trim().length
  if (len < minChars) {
    console.error(`FAIL: ${path} too short (${len} < ${minChars} chars)`)
    process.exit(1)
  }
}
