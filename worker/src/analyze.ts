import { getSnapPack, SnapPackError, type SnapPackResult } from './pack'

/** mode allowlist — 확장 템플릿 3종에 대응 (bug-report|refactor|reference) */
export const ANALYZE_MODES = ['bug-report', 'refactor', 'reference'] as const
export type AnalyzeMode = (typeof ANALYZE_MODES)[number]
export const DEFAULT_ANALYZE_MODE: AnalyzeMode = 'bug-report'

export class SnapAnalyzeError extends Error {
  readonly code: 'INVALID_MODE'

  constructor(code: 'INVALID_MODE', message: string) {
    super(message)
    this.name = 'SnapAnalyzeError'
    this.code = code
  }
}

function isAnalyzeMode(value: string): value is AnalyzeMode {
  return (ANALYZE_MODES as readonly string[]).includes(value)
}

/** allowlist 대조. 미지정 → bug-report. 위반 → 명시적 SnapAnalyzeError */
export function assertAnalyzeMode(mode: string | undefined): AnalyzeMode {
  const resolved = mode ?? DEFAULT_ANALYZE_MODE
  if (!isAnalyzeMode(resolved)) {
    throw new SnapAnalyzeError(
      'INVALID_MODE',
      `Invalid mode: ${resolved}. Allowed modes (allowlist): ${ANALYZE_MODES.join(', ')}`
    )
  }
  return resolved
}

/** 확장 prompts/templates 취지를 worker 내 자체 재구현 (src import 금지) */
const MODE_INSTRUCTIONS: Record<AnalyzeMode, string> = {
  'bug-report': [
    '위 스크린샷에서 표시된 핀 위치의 문제를 분석해주세요.',
    '',
    '1. 각 핀 위치에서 발생한 버그의 **원인 추정**',
    '2. 재현 조건 (어떤 상황에서 발생하는지)',
    '3. **수정 코드** 제안 (해당 컴포넌트 기준)',
    '4. 동일 패턴의 다른 위치에도 같은 문제가 있는지 점검'
  ].join('\n'),
  refactor: [
    '위 스크린샷의 UI/코드를 개선해주세요.',
    '',
    '1. 각 핀 위치에서 지적한 부분의 **현재 문제점**',
    '2. 개선 방향 제안 (UX / 코드 구조 / 성능)',
    '3. **리팩토링 코드** (before → after)',
    '4. 변경 시 영향 범위 (사이드이펙트 체크)'
  ].join('\n'),
  reference: [
    '위 스크린샷을 레퍼런스로 참고하여 구현해주세요.',
    '',
    '1. 핀으로 표시한 부분의 **디자인 패턴/구조 분석**',
    '2. 우리 프로젝트에 적용할 때의 **변환 포인트** (그대로 vs 변형)',
    '3. **구현 코드** (해당 컴포넌트/스타일)',
    '4. 원본과 다르게 가져가야 할 부분이 있으면 이유와 함께'
  ].join('\n')
}

const MODE_TITLES: Record<AnalyzeMode, string> = {
  'bug-report': '버그 리포트',
  refactor: '리팩토링 요청',
  reference: '레퍼런스 참고 구현'
}

function formatPinMemo(memo: string): string {
  const trimmed = memo.trim()
  return trimmed.length > 0 ? trimmed : '(메모 없음)'
}

/**
 * snap_pack 데이터를 마크다운 다이제스트로 가공.
 * ①캡처 메타 ②핀 메모 ③mode별 분석 지시 ④이미지 URL
 */
export function buildAnalyzeDigest(
  pack: SnapPackResult,
  mode: AnalyzeMode
): string {
  const vp = pack.viewport
  const pins = Array.isArray(pack.pins) ? pack.pins : []
  const pinLines =
    pins.length === 0
      ? '- (핀 없음)'
      : pins
          .map((p) => `- **핀 ${p.id}**: ${formatPinMemo(p.memo)}`)
          .join('\n')

  // imageUrl 은 snapAnalyze → getSnapPack(includeImage:true) 가 항상 채움
  return [
    `# SnapContext Analyze — ${MODE_TITLES[mode]}`,
    '',
    '## ① 캡처 메타',
    `- id: ${pack.id}`,
    `- title: ${pack.sourceTitle || '(제목 없음)'}`,
    `- url: ${pack.sourceUrl}`,
    `- captureType: ${pack.captureType}`,
    `- capturedAt: ${pack.capturedAt}`,
    `- viewport: ${vp?.width ?? '?'}×${vp?.height ?? '?'}`,
    '',
    '## ② 핀 메모',
    pinLines,
    '',
    `## ③ 분석 지시 (${mode})`,
    MODE_INSTRUCTIONS[mode],
    '',
    '## ④ 이미지',
    pack.imageUrl,
    ''
  ].join('\n')
}

export interface SnapAnalyzeOptions {
  id: string
  origin: string
  now: number
  mode?: string
}

/**
 * snap_analyze: getSnapPack 재사용 → 마크다운 다이제스트.
 * Worker 는 LLM 을 호출하지 않는다 (분석 위치 = 클라이언트 에이전트).
 */
export async function snapAnalyze(
  bucket: R2Bucket,
  opts: SnapAnalyzeOptions
): Promise<string> {
  const mode = assertAnalyzeMode(opts.mode)
  const pack = await getSnapPack(bucket, {
    id: opts.id,
    origin: opts.origin,
    includeImage: true,
    now: opts.now
  })
  return buildAnalyzeDigest(pack, mode)
}

export { SnapPackError }
