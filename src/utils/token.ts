import { getStorageItem, setStorageItem } from '../storage'

/**
 * per-user 토큰 클라이언트 (PRD 0.4.0 F007).
 *
 * 저장 위치는 chrome.storage.local 만 쓴다 — 토큰은 시크릿이라 sync 로 기기 간 자동
 * 전파시키면 안 된다(다른 기기로 옮기는 건 P6 붙여넣기 UI 의 명시적 사용자 행위).
 *
 * 발급은 서비스워커가 아니라 이 모듈을 부르는 표면(사이드패널)에서 lazy 로 일어난다.
 * chrome.runtime.onInstalled 를 쓰지 않는 이유: (1) 확장에 onInstalled/onStartup
 * 핸들러가 하나도 없어 새 표면을 여는 비용이 크고, (2) e2e 의 fetch mock 이
 * 사이드패널 페이지 window.fetch 에만 걸려 있어 서비스워커 발급은 mock 을 우회한다.
 */
export const TOKEN_STORAGE_KEY = 'snapcontextToken'

/**
 * 토큰 형식 검증 — `sc_<body>.<sig>` (점 하나로 갈라지는 2조각, 양쪽 다 비어있지 않음).
 * HMAC 유효성은 서버만 판정할 수 있으므로 여기서는 형식만 본다.
 * 손상된 저장값 폐기와 P6(다른 기기 토큰 붙여넣기) 입력 검증이 이 함수를 공유한다.
 */
export function isValidTokenFormat(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (!value.startsWith('sc_')) return false
  const parts = value.slice(3).split('.')
  if (parts.length !== 2) return false
  return parts[0].length > 0 && parts[1].length > 0
}

// 동시 발급 방지용 in-flight 가드. 사이드패널 오픈과 업로드 직전이 겹칠 수 있는데,
// worker 에 분당 10회 rate-limit 이 있고 중복 발급은 owner 파편화(같은 사용자가
// 서로 다른 owner 로 나뉨)로 이어진다. 정착되면 null 로 되돌려 재시도를 허용한다.
let inFlight: Promise<string | null> | null = null

/**
 * 저장된 토큰을 돌려주고, 없거나 손상됐으면 worker 에서 발급받아 저장한다.
 *
 * 실패 시 throw 하지 않고 null — 호출측이 익명 업로드로 계속 갈 수 있어야 한다.
 * (fallback 금지 규칙은 "실패를 성공으로 위장하지 마라"는 뜻이고, 토큰은 선택 기능이라
 *  degradation 자체는 금지 대상이 아니다. 대신 사유를 반드시 console.warn 으로 드러낸다.)
 */
export async function ensureUserToken(): Promise<string | null> {
  if (inFlight) return inFlight
  inFlight = resolveUserToken()
  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}

async function resolveUserToken(): Promise<string | null> {
  const stored = await getStorageItem<unknown>(TOKEN_STORAGE_KEY)
  if (isValidTokenFormat(stored)) return stored
  if (stored !== undefined) {
    // 손상된 값은 폐기하고 재발급. 발급이 실패하면 잔존하지만 다음 호출에서 다시
    // 이 분기로 떨어지고, 성공하면 덮어써진다 — 별도 remove 는 불필요.
    console.warn('[token] 저장된 토큰 형식이 올바르지 않아 폐기하고 재발급합니다.')
  }

  const issued = await requestUserToken()
  if (issued === null) return null
  await setStorageItem(TOKEN_STORAGE_KEY, issued)
  return issued
}

async function requestUserToken(): Promise<string | null> {
  // 업로드와 같은 소스에서 베이스를 읽는다 (src/utils/upload.ts 와 동일)
  const endpoint: string | undefined = import.meta.env.VITE_UPLOAD_ENDPOINT
  if (!endpoint) {
    console.warn('[token] 업로드 엔드포인트가 없어 토큰 발급을 건너뜁니다. (익명 업로드로 진행)')
    return null
  }
  const base = endpoint.replace(/\/+$/, '')

  let res: Response
  try {
    // 헤더를 직접 붙이지 않는다 — worker 는 chrome-extension:// Origin 을 요구하는데
    // Origin 은 forbidden header 라 브라우저가 자동으로 붙여줘야 통과한다.
    res = await fetch(`${base}/token`, { method: 'POST' })
  } catch (e) {
    console.warn('[token] 발급 요청이 네트워크 단계에서 실패했습니다. (익명 업로드로 진행)', e)
    return null
  }

  if (!res.ok) {
    console.warn(
      `[token] 발급 실패 (${res.status}) — 익명 업로드로 진행합니다.`
    )
    return null
  }

  let data: { token?: unknown }
  try {
    data = (await res.json()) as { token?: unknown }
  } catch {
    console.warn('[token] 발급 응답을 해석할 수 없습니다. (익명 업로드로 진행)')
    return null
  }
  if (!isValidTokenFormat(data.token)) {
    console.warn('[token] 발급 응답의 토큰 형식이 올바르지 않습니다. (익명 업로드로 진행)')
    return null
  }
  return data.token
}
