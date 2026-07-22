import type { SharedContext } from '../types'

/**
 * 보관 기간 allowlist — worker `EXPIRY_DAYS_ALLOWLIST`(worker/src/lib.ts)와 같은 값이어야 한다.
 * 서버가 최종 방어선이지만(범위 밖이면 400) 클라가 먼저 걸러야 사용자가 400 을 안 본다.
 */
export const EXPIRY_DAYS_ALLOWLIST = [1, 7, 30] as const
export type ExpiryDays = (typeof EXPIRY_DAYS_ALLOWLIST)[number]

/** storage·UI 등 타입이 보장되지 않는 경로에서 넘어온 값을 좁힐 때 쓴다 */
export function isExpiryDays(value: unknown): value is ExpiryDays {
  if (typeof value !== 'number') return false
  return EXPIRY_DAYS_ALLOWLIST.some((allowed) => allowed === value)
}

export type UploadShareOptions = {
  /**
   * ensureUserToken() 결과를 그대로 넘기면 된다(null 허용 = 발급 실패 시 익명 업로드).
   * uploadShare 안에서 직접 발급하지 않는 이유: chrome API 에 묶이면 이 모듈이
   * 순수 함수가 아니게 되고, chrome mock 없이 도는 기존 업로드 테스트가 전부 깨진다.
   */
  token?: string | null
  /** 미지정 = 서버 기본(7일). 필드를 아예 안 보낸다 — 빈 문자열은 worker 가 400 으로 막는다. */
  expiresInDays?: ExpiryDays
}

/**
 * 캡처 PNG(+선택 컨텍스트)를 공유 worker에 업로드하고 공유 URL을 반환한다.
 * 엔드포인트는 빌드 타임 .env의 VITE_UPLOAD_ENDPOINT에서 읽는다.
 *
 * 응답에는 `{ id, url }` 뿐이라 만료 시각은 오지 않는다(ADR-013). 만료 표시가 필요하면
 * 호출측이 여기 넘긴 보관 기간으로 직접 계산해야 한다.
 */
export async function uploadShare(
  imageBlob: Blob,
  context?: SharedContext,
  options: UploadShareOptions = {}
): Promise<string> {
  const endpoint = import.meta.env.VITE_UPLOAD_ENDPOINT
  if (!endpoint) {
    throw new Error('업로드 엔드포인트가 설정되지 않았습니다.')
  }
  const { token, expiresInDays } = options
  // 범위 밖 값을 기본값으로 슬쩍 바꾸면 사용자가 고른 보관 기간과 실제가 갈린다 →
  // 조용히 치환하지 않고 네트워크 전에 드러낸다
  if (expiresInDays !== undefined && !isExpiryDays(expiresInDays)) {
    throw new Error(
      `보관 기간은 ${EXPIRY_DAYS_ALLOWLIST.join(', ')}일 중에서만 선택할 수 있습니다.`
    )
  }

  const form = new FormData()
  form.append('image', imageBlob, 'capture.png')
  if (context) {
    form.append('context', JSON.stringify(context))
  }
  // 부재만 "기본 7일"로 받는다. 빈 문자열을 보내면 worker 가 400 이라 append 자체를 건너뛴다.
  if (expiresInDays !== undefined) {
    form.append('expiresInDays', String(expiresInDays))
  }

  const base = endpoint.replace(/\/+$/, '')
  const init: RequestInit = {
    method: 'POST',
    body: form
  }
  // 토큰이 없을 때 헤더 키를 만들지 않는다 — worker 는 Authorization 이 존재하는데
  // 값이 무효면 401 이라, 빈 문자열이나 'Bearer ' 만 보내면 익명 200 이 아니라 실패한다.
  // ensureUserToken() 은 형식 검증을 통과한 문자열 아니면 null 만 주므로 falsy = 토큰 없음.
  if (token) {
    init.headers = { Authorization: `Bearer ${token}` }
  }

  const res = await fetch(`${base}/upload`, init)
  if (!res.ok) {
    throw new Error(`업로드 실패 (${res.status})`)
  }
  let data: { url?: string }
  try {
    data = (await res.json()) as { url?: string }
  } catch {
    throw new Error('서버 응답을 해석할 수 없습니다.')
  }
  if (!data.url) {
    throw new Error('서버 응답에 URL이 없습니다.')
  }
  return data.url
}
