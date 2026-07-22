import { vi } from 'vitest'

/**
 * chrome.storage.local 인메모리 mock.
 *
 * vitest environment 가 'node' 라 chrome 전역이 아예 없다 — 스텁하지 않으면 ReferenceError.
 * 테스트 파일끼리 import 하면 describe 가 중복 등록되므로 여기(비-test 파일)에 둔다.
 * vitest.config.ts 의 include 는 `tests/**\/*.test.ts` 라 이 파일은 수집되지 않는다.
 */
export function stubChromeStorage(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial))
  const get = vi.fn(async (key: string): Promise<Record<string, unknown>> => {
    return store.has(key) ? { [key]: store.get(key) } : {}
  })
  const set = vi.fn(async (items: Record<string, unknown>): Promise<void> => {
    for (const [k, v] of Object.entries(items)) store.set(k, v)
  })
  const remove = vi.fn(async (key: string): Promise<void> => {
    store.delete(key)
  })
  vi.stubGlobal('chrome', { storage: { local: { get, set, remove } } })
  return { store, get, set, remove }
}
