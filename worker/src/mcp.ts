import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  ANALYZE_MODES,
  DEFAULT_ANALYZE_MODE,
  snapAnalyze,
  SnapAnalyzeError
} from './analyze'
import type { McpAuthResult } from './auth'
import { listCaptures, DEFAULT_HISTORY_LIMIT } from './history'
import { getSnapPack, SnapPackError } from './pack'
import type { Env } from './env'

/**
 * 서버 instructions — 클라이언트가 시스템 프롬프트에 실어 툴을 자발적으로 꺼내게 하는 힌트.
 * 원문 SoT = docs/PRD-0.4.0.md. SDK 는 truthy 가드라 빈 문자열이면 필드 자체가 응답에서 빠진다.
 */
const SERVER_INSTRUCTIONS =
  "SnapContext stores the user's annotated web screenshots: page captures with " +
  'numbered pin memos marking specific UI elements. Whenever the user mentions a ' +
  "screenshot, capture, snap, pin memo, or refers to something they 'just captured' " +
  "or 'shared a link to', use these tools instead of asking them to paste an image. " +
  'Typical flow: call snap_history to find the capture id, then snap_analyze ' +
  '(preferred, returns an analysis-ready digest) or snap_pack (raw structured ' +
  'context). Digests include an image URL — fetch it to view the screenshot.'

/** 툴 3종 전부 read-only — 쓰기·부작용이 없음을 클라이언트에 광고한다 */
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: false
} as const

/** 테스트에서 인스턴스 생성 횟수 검증용 (요청마다 신규) */
export let mcpServerCreateCount = 0

export function resetMcpServerCreateCount(): void {
  mcpServerCreateCount = 0
}

export function createSnapMcpServer(
  env: Env,
  requestUrl: URL,
  auth: McpAuthResult = { scope: 'admin' }
): McpServer {
  mcpServerCreateCount += 1
  const server = new McpServer(
    {
      name: 'snapcontext',
      version: '0.4.0'
    },
    { instructions: SERVER_INSTRUCTIONS }
  )

  server.registerTool(
    'snap_history',
    {
      description:
        "List the user's recent SnapContext screenshot captures, newest first. " +
        'Use this whenever the user refers to a recent capture, screenshot, or snap ' +
        "(e.g. 'the page I just captured') to find its id before calling snap_pack " +
        'or snap_analyze.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        limit: z
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .describe(`Max entries (default ${DEFAULT_HISTORY_LIMIT})`)
      }
    },
    async ({ limit }) => {
      // user 스코프: 본인 owner만. admin: 전체(NULL 레거시 포함). snap_pack/analyze는 owner 무검사.
      const entries = await listCaptures(env.DB, {
        nowIso: new Date().toISOString(),
        limit,
        ...(auth.scope === 'user' ? { owner: auth.owner } : {})
      })
      return {
        content: [{ type: 'text', text: JSON.stringify(entries) }]
      }
    }
  )

  server.registerTool(
    'snap_pack',
    {
      description:
        'Fetch the full Context Pack for one capture id: source URL, title, viewport, ' +
        'and the numbered pin memos exactly as the user annotated them. Use after ' +
        'snap_history when you need raw structured context rather than a prepared digest.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        id: z.string().min(1).describe('Capture id (R2 object key)'),
        includeImage: z
          .boolean()
          .optional()
          .describe('If true, include imageUrl pointing to /i/{id} (not base64)')
      }
    },
    async ({ id, includeImage }) => {
      try {
        const pack = await getSnapPack(env.BUCKET, {
          id,
          origin: requestUrl.origin,
          includeImage: includeImage === true,
          now: Date.now()
        })
        return {
          content: [{ type: 'text', text: JSON.stringify(pack) }]
        }
      } catch (err) {
        const message =
          err instanceof SnapPackError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err)
        return {
          isError: true,
          content: [{ type: 'text', text: message }]
        }
      }
    }
  )

  server.registerTool(
    'snap_analyze',
    {
      description:
        'Build an analysis-ready markdown digest (page metadata + pin memos + mode ' +
        'instructions + image URL) for a capture. Preferred entry point when the user ' +
        'asks to debug, review, refactor, or implement something from a screenshot. ' +
        `Modes: ${ANALYZE_MODES.join(' | ')}.`,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        id: z.string().min(1).describe('Capture id (R2 object key)'),
        mode: z
          .string()
          .optional()
          .describe(
            `Analysis mode allowlist: ${ANALYZE_MODES.join('|')} (default ${DEFAULT_ANALYZE_MODE})`
          )
      }
    },
    async ({ id, mode }) => {
      try {
        const digest = await snapAnalyze(env.BUCKET, {
          id,
          origin: requestUrl.origin,
          now: Date.now(),
          mode
        })
        return {
          content: [{ type: 'text', text: digest }]
        }
      } catch (err) {
        const message =
          err instanceof SnapAnalyzeError || err instanceof SnapPackError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err)
        return {
          isError: true,
          content: [{ type: 'text', text: message }]
        }
      }
    }
  )

  return server
}
