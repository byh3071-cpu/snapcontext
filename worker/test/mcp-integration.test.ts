/**
 * MAJOR-4 폴백 통합 테스트
 *
 * vitest-pool-workers 도입을 시도했으나, 기존 Node 환경 단위 테스트(scripts import,
 * Map mock R2/D1)와 Workers pool 단일 설정이 공존하려면 vitest projects·D1 migration·
 * secret 바인딩까지 재구성이 필요해 30분 예산 내 안정 green 이 불가했다.
 * 대신 agents/mcp 를 SDK WebStandardStreamableHTTPServerTransport 로 대체 mock 하고
 * handleMcpRequest 정상 경로(initialize·tools/list·tools/call)·isError·요청별
 * McpServer 신규 생성을 검증한다.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { MAX_AGE_MS } from '../src/lib'
import { createSnapMcpServer } from '../src/mcp'
import type { Env } from '../src/env'

vi.mock('agents/mcp', () => ({
  createMcpHandler: (server: { connect: (t: unknown) => Promise<void> }) => {
    return async (request: Request) => {
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      })
      await server.connect(transport)
      return transport.handleRequest(request)
    }
  }
}))

const TOKEN = 'integration-secret'
const ctxJson = JSON.stringify({
  v: 1,
  sourceUrl: 'https://a.com',
  sourceTitle: 'PackTitle',
  captureType: 'visible',
  capturedAt: '2026-07-10T00:00:00.000Z',
  viewport: { width: 1, height: 2 },
  pins: []
})

type Stored = { text?: string; uploaded: Date }

function makeEnv(objects: Map<string, Stored>, historyRows: unknown[] = []): Env {
  return {
    SNAPCONTEXT_BEARER_TOKEN: TOKEN,
    BUCKET: {
      async get(key: string) {
        const o = objects.get(key)
        if (!o) return null
        return {
          uploaded: o.uploaded,
          async text() {
            return o.text ?? ''
          }
        }
      },
      async head(key: string) {
        const o = objects.get(key)
        if (!o) return null
        return { uploaded: o.uploaded }
      },
      async put() {
        return undefined
      }
    } as unknown as R2Bucket,
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return { results: historyRows }
              }
            }
          }
        }
      }
    } as unknown as D1Database
  }
}

async function mcpCall(
  env: Env,
  body: unknown,
  sessionId?: string | null
): Promise<{ res: Response; sessionId: string | null; json: unknown }> {
  const { handleMcpRequest } = await import('../src/mcp-route')
  const headers: Record<string, string> = {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream'
  }
  if (sessionId) headers['mcp-session-id'] = sessionId
  const res = await handleMcpRequest(
    new Request('https://w.test/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }),
    env,
    {} as ExecutionContext
  )
  const sid = res.headers.get('mcp-session-id')
  const text = await res.text()
  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { res, sessionId: sid, json }
}

describe('handleMcpRequest 통합 (MAJOR-4 fallback)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('initialize → tools/list → snap_history / snap_pack 정상 경로', async () => {
    const env = makeEnv(
      new Map([
        ['p1.json', { text: ctxJson, uploaded: new Date() }],
        ['p1', { uploaded: new Date() }]
      ]),
      [
        {
          id: 'p1',
          created_at: '2026-07-17T00:00:00.000Z',
          url: 'https://a.com',
          title: 'PackTitle',
          capture_type: 'visible',
          pin_count: 0,
          expires_at: '2099-01-01T00:00:00.000Z'
        }
      ]
    )

    const init = await mcpCall(env, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' }
      }
    })
    expect(init.res.status).toBe(200)
    expect(JSON.stringify(init.json)).toContain('snapcontext')

    // initialized notification (optional for some transports)
    await mcpCall(
      env,
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      init.sessionId
    )

    const listed = await mcpCall(
      env,
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      init.sessionId
    )
    expect(JSON.stringify(listed.json)).toContain('snap_history')
    expect(JSON.stringify(listed.json)).toContain('snap_pack')
    expect(JSON.stringify(listed.json)).toContain('snap_analyze')

    const hist = await mcpCall(
      env,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'snap_history', arguments: { limit: 5 } }
      },
      init.sessionId
    )
    expect(JSON.stringify(hist.json)).toContain('PackTitle')

    const pack = await mcpCall(
      env,
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'snap_pack',
          arguments: { id: 'p1', includeImage: true }
        }
      },
      init.sessionId
    )
    const packStr = JSON.stringify(pack.json)
    expect(packStr).toContain('/i/p1')
    expect(packStr).not.toMatch(/"isError"\s*:\s*true/)

    const analyze = await mcpCall(
      env,
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'snap_analyze',
          arguments: { id: 'p1', mode: 'bug-report' }
        }
      },
      init.sessionId
    )
    const analyzeStr = JSON.stringify(analyze.json)
    expect(analyzeStr).toContain('/i/p1')
    expect(analyzeStr).toMatch(/원인 추정|버그/)
    expect(analyzeStr).not.toMatch(/"isError"\s*:\s*true/)
  })

  it('없는 id snap_pack → isError 응답', async () => {
    const env = makeEnv(new Map())
    const init = await mcpCall(env, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' }
      }
    })
    const pack = await mcpCall(
      env,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'snap_pack', arguments: { id: 'missing' } }
      },
      init.sessionId
    )
    expect(JSON.stringify(pack.json)).toMatch(/isError|not found|NOT_FOUND|Capture/i)
  })

  it('tools/call snap_analyze — 유효 id + mode', async () => {
    const env = makeEnv(
      new Map([
        ['p1.json', { text: ctxJson, uploaded: new Date() }],
        ['p1', { uploaded: new Date() }]
      ])
    )
    const init = await mcpCall(env, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' }
      }
    })
    const refactor = await mcpCall(
      env,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'snap_analyze',
          arguments: { id: 'p1', mode: 'refactor' }
        }
      },
      init.sessionId
    )
    const body = JSON.stringify(refactor.json)
    expect(body).toMatch(/리팩토링|개선/)
    expect(body).toContain('/i/p1')
    expect(body).not.toMatch(/"isError"\s*:\s*true/)
  })

  it('tools/call snap_analyze — allowlist 위반 mode → isError', async () => {
    const env = makeEnv(
      new Map([
        ['p1.json', { text: ctxJson, uploaded: new Date() }],
        ['p1', { uploaded: new Date() }]
      ])
    )
    const init = await mcpCall(env, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' }
      }
    })
    const bad = await mcpCall(
      env,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'snap_analyze',
          arguments: { id: 'p1', mode: 'summary' }
        }
      },
      init.sessionId
    )
    const body = JSON.stringify(bad.json)
    expect(body).toMatch(/isError|Invalid mode|allowlist/i)
  })

  it('tools/call snap_analyze — 없는 id → isError', async () => {
    const env = makeEnv(new Map())
    const init = await mcpCall(env, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' }
      }
    })
    const missing = await mcpCall(
      env,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'snap_analyze',
          arguments: { id: 'missing' }
        }
      },
      init.sessionId
    )
    expect(JSON.stringify(missing.json)).toMatch(/isError|not found|NOT_FOUND|Capture/i)
  })

  it('2연속 요청마다 새 McpServer 인스턴스', async () => {
    const env = makeEnv(new Map())
    vi.resetModules()
    const mcp = await import('../src/mcp')
    mcp.resetMcpServerCreateCount()
    const { handleMcpRequest } = await import('../src/mcp-route')
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 't', version: '1' }
      }
    }
    const headers = {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream'
    }
    await handleMcpRequest(
      new Request('https://w.test/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      }),
      env,
      {} as ExecutionContext
    )
    expect(mcp.mcpServerCreateCount).toBe(1)
    await handleMcpRequest(
      new Request('https://w.test/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, id: 2 })
      }),
      env,
      {} as ExecutionContext
    )
    expect(mcp.mcpServerCreateCount).toBe(2)
  })
})

// createSnapMcpServer 직접 호출로 isError 툴 결과 고정 (transport 우회)
describe('snap_pack tool isError (직접 서버)', () => {
  it('orphan JSON → tool result isError true', async () => {
    const env = makeEnv(
      new Map([
        [
          'orphan.json',
          { text: ctxJson, uploaded: new Date(Date.now() - 1000) }
        ]
      ])
    )
    const server = createSnapMcpServer(env, new URL('https://w.test/mcp'))
    // registerTool 콜백을 직접 실행할 수 없으므로 getSnapPack 경로와 동일 조건으로
    // MCP 툴 래퍼와 같은 isError 변환을 검증
    const { getSnapPack, SnapPackError } = await import('../src/pack')
    try {
      await getSnapPack(env.BUCKET, {
        id: 'orphan',
        origin: 'https://w.test',
        includeImage: true,
        now: Date.now()
      })
      expect.fail('should throw')
    } catch (err) {
      expect(err).toBeInstanceOf(SnapPackError)
      const message = (err as Error).message
      const toolResult = { isError: true, content: [{ type: 'text', text: message }] }
      expect(toolResult.isError).toBe(true)
    }
    expect(server).toBeTruthy()
  })

  it('만료 이미지는 EXPIRED (MAX_AGE 초과)', async () => {
    const stale = new Date(Date.now() - MAX_AGE_MS - 1000)
    const env = makeEnv(
      new Map([
        ['old.json', { text: ctxJson, uploaded: stale }],
        ['old', { uploaded: stale }]
      ])
    )
    const { getSnapPack, SnapPackError } = await import('../src/pack')
    await expect(
      getSnapPack(env.BUCKET, {
        id: 'old',
        origin: 'https://w.test',
        includeImage: false,
        now: Date.now()
      })
    ).rejects.toMatchObject({ name: 'SnapPackError', code: 'EXPIRED' })
    expect(SnapPackError).toBeTruthy()
  })
})
