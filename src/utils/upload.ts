import type { SharedContext } from '../types'

/**
 * 캡처 PNG(+선택 컨텍스트)를 공유 worker에 업로드하고 공유 URL을 반환한다.
 * 엔드포인트는 빌드 타임 .env의 VITE_UPLOAD_ENDPOINT에서 읽는다.
 */
export async function uploadShare(
  imageBlob: Blob,
  context?: SharedContext
): Promise<string> {
  const endpoint = import.meta.env.VITE_UPLOAD_ENDPOINT
  if (!endpoint) {
    throw new Error('업로드 엔드포인트가 설정되지 않았습니다.')
  }
  const form = new FormData()
  form.append('image', imageBlob, 'capture.png')
  if (context) {
    form.append('context', JSON.stringify(context))
  }
  const base = endpoint.replace(/\/+$/, '')
  const res = await fetch(`${base}/upload`, {
    method: 'POST',
    body: form
  })
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
