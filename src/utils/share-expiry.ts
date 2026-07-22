import { getStorageItem, setStorageItem } from '../storage'
import { EXPIRY_DAYS_ALLOWLIST, isExpiryDays, type ExpiryDays } from './upload'

/**
 * 공유 링크 보관 기간 설정 (PRD 0.4.0 F008).
 *
 * storage 키는 `shareExpiryDays`, 업로드 form 필드는 `expiresInDays` — 이름 이원화는 의도적이다
 * (storage=설정 / form=전송). 값 자체는 worker allowlist 와 같은 1·7·30 이다.
 */
export const SHARE_EXPIRY_STORAGE_KEY = 'shareExpiryDays'
export const DEFAULT_SHARE_EXPIRY_DAYS: ExpiryDays = 7

/**
 * 설정이 바뀌었을 때 만료 문구를 쓰는 컴포넌트가 다시 그리도록 알리는 window 이벤트.
 * storage/history.ts 의 `snapcontext:history-updated` 와 같은 방식(선례).
 */
export const SHARE_EXPIRY_CHANGED_EVENT = 'snapcontext:share-expiry-changed'

/** 만료 문구의 단일 소스 — 7곳이 같은 표기를 쓰게 하려고 함수로 묶었다 */
export function formatExpiryDays(days: ExpiryDays): string {
  return `${days}일`
}

/**
 * 업로드 최초 1회 동의 문구.
 *
 * 보관 기간을 반드시 반영해야 한다 — "7일 후 삭제" 라고 동의를 받아놓고 30일로 저장하면
 * 사실과 다른 동의가 된다 (PRD 0.4.0:56 이 명시적으로 지적).
 */
export function buildShareConsentMessage(days: ExpiryDays): string {
  return (
    `공개 링크로 업로드됩니다. 링크를 아는 누구나 볼 수 있고 ${formatExpiryDays(days)} 후 삭제됩니다. ` +
    '컨텍스트 포함을 켜면 소스 주소·핀 메모도 함께 공개됩니다(주소에 토큰·쿼리가 있을 수 있으니 주의). ' +
    '민감한 화면은 주의하세요.'
  )
}

/**
 * 업로드 성공 토스트.
 *
 * 익명(=토큰 발급 실패 또는 서버가 토큰 거부)으로 올라갔으면 반드시 알린다.
 * console.warn 은 개발자만 본다 — 사용자는 owner 스탬프가 조용히 미동작한 걸 모른 채
 * 자기 캡처가 왜 MCP 목록에 안 뜨는지 알 방법이 없다.
 * "익명"만 쓰면 무엇이 안 되는지 모르므로 결과("내 캡처 목록에 안 뜸")를 함께 말한다.
 */
export function buildShareSuccessMessage(
  days: ExpiryDays,
  anonymous: boolean
): string {
  const base = `공유 링크 복사됨 · ${formatExpiryDays(days)} 후 만료`
  return anonymous ? `${base} · 익명 업로드라 내 캡처 목록(MCP)에 안 뜹니다` : base
}

/**
 * 저장된 업로드 동의값 → 동의한 보관 기간. 동의 이력이 없으면 null.
 *
 * 0.3.x 는 boolean 플래그였고 보관 기간이 7일 고정이었으므로 `true` 는 7일 동의로 읽는다
 * (마이그레이션 스크립트 없이 그대로 호환된다 — 다음 동의 때 자연히 숫자로 덮어써진다).
 */
export function readConsentedDays(stored: unknown): ExpiryDays | null {
  if (stored === true) return 7
  if (isExpiryDays(stored)) return stored
  return null
}

/**
 * 재동의가 필요한가.
 *
 * 동의 이력이 없으면 당연히 필요하고, **더 긴 기간으로 올릴 때만** 다시 받는다.
 * "7일 후 삭제"로 동의받고 30일로 저장하면 사실과 다른 동의가 되기 때문.
 * 줄이는 건 사용자에게 불리하지 않으므로 다시 묻지 않는다.
 */
export function needsShareConsent(
  consentedDays: ExpiryDays | null,
  days: ExpiryDays
): boolean {
  if (consentedDays === null) return true
  return days > consentedDays
}

/** 저장값이 없거나 손상됐으면 기본 7일. storage 는 JSON 왕복이라 타입 보장이 없다. */
export async function loadShareExpiryDays(): Promise<ExpiryDays> {
  const stored = await getStorageItem<unknown>(SHARE_EXPIRY_STORAGE_KEY)
  return isExpiryDays(stored) ? stored : DEFAULT_SHARE_EXPIRY_DAYS
}

/**
 * 보관 기간을 저장하고 변경을 알린다.
 *
 * allowlist 밖 값은 조용히 기본값으로 바꾸지 않고 거부한다 — 여기서 흘려보내면
 * 업로드 시점(uploadShare)에 가서야 터지고, 그 사이 사용자는 선택이 반영됐다고 믿는다.
 */
export async function saveShareExpiryDays(days: ExpiryDays): Promise<void> {
  if (!isExpiryDays(days)) {
    throw new Error(
      `보관 기간은 ${EXPIRY_DAYS_ALLOWLIST.join(', ')}일 중에서만 선택할 수 있습니다.`
    )
  }
  await setStorageItem(SHARE_EXPIRY_STORAGE_KEY, days)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SHARE_EXPIRY_CHANGED_EVENT))
  }
}
