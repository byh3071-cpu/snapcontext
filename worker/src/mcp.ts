import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { listCaptures, DEFAULT_HISTORY_LIMIT } from './history'
import { getSnapPack, SnapPackError } from './pack'
import type { Env } from './env'

/** 테스트에서 인스턴스 생성 횟수 검증용 (요청마다 신규) */
export let mcpServerCreateCount = 0

export function resetMcpServerCreateCount(): void {
  mcpServerCreateCount = 0
}

export function createSnapMcpServer(env: Env, requestUrl: URL): McpServer {
  mcpServerCreateCount += 1
  const server = new McpServer({
    name: 'snapcontext',
    version: '0.3.0'
  })

  server.registerTool(
    'snap_history',
    {
      description:
        'List stored captures newest-first (D1 index). Filters out expired rows.',
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
      const entries = await listCaptures(env.DB, {
        nowIso: new Date().toISOString(),
        limit
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
        'Fetch a single Context Pack (SharedContext) by id from R2. Expired/missing ids return an explicit error.',
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

  return server
}
