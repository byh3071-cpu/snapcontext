import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  DEFAULT_SHARE_EXPIRY_DAYS,
  SHARE_EXPIRY_CHANGED_EVENT,
  SHARE_EXPIRY_STORAGE_KEY,
  buildShareConsentMessage,
  buildShareSuccessMessage,
  formatExpiryDays,
  loadShareExpiryDays,
  needsShareConsent,
  readConsentedDays,
  saveShareExpiryDays
} from '../src/utils/share-expiry'
import type { ExpiryDays } from '../src/utils/upload'
import { stubChromeStorage } from './helpers/chrome-storage'

describe('formatExpiryDays', () => {
  it('보관 기간을 "N일" 문구로 만든다', () => {
    expect(formatExpiryDays(1)).toBe('1일')
    expect(formatExpiryDays(7)).toBe('7일')
    expect(formatExpiryDays(30)).toBe('30일')
  })
})

describe('buildShareConsentMessage', () => {
  // PRD 0.4.0:56 — "7일 후 삭제" 라고 동의를 받아놓고 30일로 저장하면 사실과 다른 동의가 된다
  it('선택한 보관 기간을 동의 문구에 반영한다', () => {
    const msg = buildShareConsentMessage(30)
    expect(msg).toContain('30일')
    expect(msg).not.toContain('7일')
  })

  it('1일을 고르면 1일로 고지한다', () => {
    const msg = buildShareConsentMessage(1)
    expect(msg).toContain('1일')
    expect(msg).not.toContain('7일')
    expect(msg).not.toContain('30일')
  })

  it('공개 링크·컨텍스트 고지는 기간과 무관하게 유지된다', () => {
    for (const days of [1, 7, 30] as const) {
      const msg = buildShareConsentMessage(days)
      expect(msg).toContain('공개 링크')
      expect(msg).toContain('컨텍스트')
    }
  })
})

describe('buildShareSuccessMessage', () => {
  it('토큰이 붙은 업로드는 만료 안내만 한다', () => {
    expect(buildShareSuccessMessage(7, false)).toBe('공유 링크 복사됨 · 7일 후 만료')
    expect(buildShareSuccessMessage(30, false)).toBe('공유 링크 복사됨 · 30일 후 만료')
  })

  // CodeRabbit(Major) — console.warn 은 개발자만 본다. 익명으로 올라가면 사용자는
  // 자기 캡처가 왜 MCP 목록에 안 뜨는지 알 방법이 없다.
  it('익명 업로드는 무엇이 안 되는지 알려준다', () => {
    const msg = buildShareSuccessMessage(7, true)
    expect(msg).toContain('7일 후 만료')
    expect(msg).toContain('익명')
    // "익명"만으로는 뭐가 안 되는지 모른다 — 내 캡처 목록에 안 뜬다는 걸 명시해야 한다
    expect(msg).toContain('내 캡처 목록')
  })

  it('익명 여부가 문구를 실제로 가른다', () => {
    expect(buildShareSuccessMessage(30, true)).not.toBe(
      buildShareSuccessMessage(30, false)
    )
  })
})

describe('동의 기간 추적 (N3)', () => {
  // 0.3.x 는 boolean 플래그였고 보관 기간이 7일 고정이었다 → true = 7일 동의로 읽는다
  it('구버전 boolean 동의값을 7일 동의로 마이그레이션한다', () => {
    expect(readConsentedDays(true)).toBe(7)
  })

  it('미동의·손상값은 null 이다', () => {
    for (const value of [false, undefined, null, 3, '7', {}, 0]) {
      expect(readConsentedDays(value), JSON.stringify(value)).toBeNull()
    }
  })

  it('저장된 allowlist 기간을 그대로 읽는다', () => {
    expect(readConsentedDays(1)).toBe(1)
    expect(readConsentedDays(7)).toBe(7)
    expect(readConsentedDays(30)).toBe(30)
  })

  it('동의 이력이 없으면 물어본다', () => {
    expect(needsShareConsent(null, 1)).toBe(true)
    expect(needsShareConsent(null, 7)).toBe(true)
    expect(needsShareConsent(null, 30)).toBe(true)
  })

  it('더 긴 기간으로 올릴 때만 재동의를 받는다', () => {
    expect(needsShareConsent(7, 30)).toBe(true)
    expect(needsShareConsent(1, 7)).toBe(true)
    expect(needsShareConsent(1, 30)).toBe(true)
  })

  it('같거나 짧은 기간은 다시 묻지 않는다 (사용자에게 불리하지 않다)', () => {
    expect(needsShareConsent(7, 7)).toBe(false)
    expect(needsShareConsent(30, 7)).toBe(false)
    expect(needsShareConsent(30, 1)).toBe(false)
    expect(needsShareConsent(7, 1)).toBe(false)
  })

  it('구버전 boolean 사용자가 30일로 올리면 재동의를 받는다', () => {
    expect(needsShareConsent(readConsentedDays(true), 30)).toBe(true)
    // 7일 유지면 계속 안 묻는다
    expect(needsShareConsent(readConsentedDays(true), 7)).toBe(false)
  })
})

describe('loadShareExpiryDays', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('저장값이 없으면 기본 7일이다', async () => {
    stubChromeStorage()
    expect(DEFAULT_SHARE_EXPIRY_DAYS).toBe(7)
    await expect(loadShareExpiryDays()).resolves.toBe(7)
  })

  it('저장된 allowlist 값을 그대로 읽는다', async () => {
    stubChromeStorage({ [SHARE_EXPIRY_STORAGE_KEY]: 30 })
    await expect(loadShareExpiryDays()).resolves.toBe(30)
  })

  // storage 는 JSON 왕복이라 문자열·구버전 값이 섞일 수 있다 → 타입가드로 기본값 복귀
  it('손상된 저장값은 기본 7일로 떨어진다', async () => {
    for (const broken of ['30', 3, 0, null, {}, [7]]) {
      stubChromeStorage({ [SHARE_EXPIRY_STORAGE_KEY]: broken })
      await expect(loadShareExpiryDays(), JSON.stringify(broken)).resolves.toBe(7)
    }
  })
})

describe('saveShareExpiryDays', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('storage 에 저장하고 다시 읽으면 같은 값이다 (왕복)', async () => {
    const storage = stubChromeStorage()
    await saveShareExpiryDays(1)

    expect(storage.store.get(SHARE_EXPIRY_STORAGE_KEY)).toBe(1)
    await expect(loadShareExpiryDays()).resolves.toBe(1)
  })

  it('변경 이벤트를 dispatch 해서 다른 컴포넌트가 문구를 갱신할 수 있게 한다', async () => {
    stubChromeStorage()
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })

    await saveShareExpiryDays(30)

    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    const event = dispatchEvent.mock.calls[0][0] as Event
    expect(event.type).toBe(SHARE_EXPIRY_CHANGED_EVENT)
  })

  it('allowlist 밖 값은 저장하지 않고 거부한다 (조용한 치환 금지)', async () => {
    const storage = stubChromeStorage()
    // 타입을 우회해 들어온 값(손상된 UI·구버전 storage)까지 막는지 보는 테스트라 as 가 필요하다
    const invalid = 3 as ExpiryDays

    await expect(saveShareExpiryDays(invalid)).rejects.toThrow(
      '보관 기간은 1, 7, 30일 중에서만 선택할 수 있습니다.'
    )
    expect(storage.set).not.toHaveBeenCalled()
    expect(storage.store.has(SHARE_EXPIRY_STORAGE_KEY)).toBe(false)
  })
})
