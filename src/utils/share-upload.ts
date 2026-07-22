import type { SharedContext } from '../types'
import { clearUserToken, ensureUserToken } from './token'
import {
  isUnauthorizedUploadError,
  uploadShare,
  type ExpiryDays
} from './upload'

export type ShareUploadResult = {
  url: string
  /**
   * true = owner 없이 올라갔다(토큰 발급 실패 또는 서버가 토큰 거부).
   * 업로드 자체는 성공이지만 MCP 내 캡처 목록에는 안 뜨므로 호출측이 사용자에게 알려야 한다.
   * 익명 업로드는 폐기된 경로가 아니라 정상 계약이다(PRD: /upload 는 영구 optional) —
   * 그래서 막지 않고 알리기만 한다.
   */
  anonymous: boolean
}

/**
 * 토큰을 붙여 공유 업로드하고, 서버가 그 토큰을 거부하면(401) 폐기 후 익명으로 1회만 재시도한다.
 *
 * upload.ts 가 아니라 여기 있는 이유: uploadShare 는 chrome API 에 묶이지 않은 순수 전송
 * 함수로 유지해야 한다(그래야 chrome mock 없이 계약을 테스트할 수 있다). 토큰 수명주기가
 * 얽히는 오케스트레이션만 이 모듈로 분리한다.
 *
 * 401 복구가 필요한 이유: TOKEN_SIGNING_SECRET 로테이션·dev↔prod 엔드포인트 전환이 일어나면
 * 저장된 토큰이 통째로 무효가 된다. 폐기 경로가 없으면 익명이면 200 이 나올 업로드를
 * 확장이 스스로 401 로 만들고 영구히 반복한다.
 */
export async function uploadShareWithToken(
  imageBlob: Blob,
  context: SharedContext | undefined,
  expiresInDays: ExpiryDays
): Promise<ShareUploadResult> {
  const token = await ensureUserToken()
  try {
    const url = await uploadShare(imageBlob, context, { token, expiresInDays })
    // 발급 실패로 토큰이 없었으면 이 업로드는 owner 없이 올라갔다
    return { url, anonymous: token === null }
  } catch (e) {
    // 애초에 토큰을 안 붙였으면 401 은 토큰 탓이 아니다 → 재시도해봐야 같은 결과
    if (token === null || !isUnauthorizedUploadError(e)) throw e

    console.warn('[share-upload] 서버가 토큰을 거부했습니다(401). 폐기 후 익명으로 재시도합니다.')
    await clearUserToken()
    // 재시도는 정확히 1회 — 여기서 또 실패하면 그대로 던져 사용자에게 알린다.
    // 보관 기간은 토큰과 무관하므로 그대로 유지한다.
    const url = await uploadShare(imageBlob, context, { expiresInDays })
    return { url, anonymous: true }
  }
}
