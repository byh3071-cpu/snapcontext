import { createMcpHandler } from 'agents/mcp'
import type { McpAuthResult } from './auth'
import { createSnapMcpServer } from './mcp'
import type { Env } from './env'

/** agents SDK는 cloudflare: 모듈을 쓰므로 index에서 동적 import로만 로드 */
export async function handleMcpRequest(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  auth: McpAuthResult
): Promise<Response> {
  const url = new URL(req.url)
  const server = createSnapMcpServer(env, url, auth)
  return createMcpHandler(server, {
    route: '/mcp',
    enableJsonResponse: true
  })(req, env, ctx)
}
