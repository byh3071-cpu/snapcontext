#!/usr/bin/env node
/**
 * R2 list()로 기존 {id}.json 열거 → D1 captures INSERT (ADR-009 backfill)
 *
 * 실행은 배포·D1 실생성(Phase 4 사람 게이트) 이후:
 *   node scripts/backfill-d1.mjs
 *
 * 환경:
 *   CF_ACCOUNT_ID, CF_API_TOKEN (R2+D1 권한)
 *   R2_BUCKET=snapcontext-uploads
 *   D1_DATABASE_NAME=snapcontext-captures
 *
 * 이 스크립트는 wrangler CLI를 호출하지 않고 HTTP API를 쓴다.
 * 로컬 단위 로직은 scripts/lib/backfill-d1.mjs — worker/test/backfill-d1.test.ts 참조.
 */

import {
  collectBackfillRows,
  isContextJsonKey,
  captureIdFromKey
} from './lib/backfill-d1.mjs'

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID
const API_TOKEN = process.env.CF_API_TOKEN
const BUCKET = process.env.R2_BUCKET ?? 'snapcontext-uploads'
const D1_NAME = process.env.D1_DATABASE_NAME ?? 'snapcontext-captures'

function requireEnv() {
  if (!ACCOUNT_ID || !API_TOKEN) {
    throw new Error(
      'CF_ACCOUNT_ID and CF_API_TOKEN are required (run after deploy; Phase 4 human gate for D1 create)'
    )
  }
}

async function cf(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  })
  const body = await res.json()
  if (!res.ok || body.success === false) {
    throw new Error(`CF API ${path}: ${JSON.stringify(body.errors ?? body)}`)
  }
  return body.result
}

async function listAllR2Keys() {
  const keys = []
  let cursor = undefined
  for (;;) {
    const q = new URLSearchParams({ per_page: '1000' })
    if (cursor) q.set('cursor', cursor)
    const result = await cf(
      `/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects?${q}`
    )
    const objects = result?.objects ?? result ?? []
    for (const o of objects) {
      const key = typeof o === 'string' ? o : o.key
      if (key) keys.push(key)
    }
    const next = result?.cursor
    if (!next) break
    cursor = next
  }
  return keys
}

async function getR2Json(id) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(`${id}.json`)}`,
    { headers: { Authorization: `Bearer ${API_TOKEN}` } }
  )
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`R2 GET ${id}.json failed: ${res.status}`)
  }
  return await res.json()
}

async function resolveD1Id() {
  const list = await cf(`/accounts/${ACCOUNT_ID}/d1/database`)
  const found = (list ?? []).find((d) => d.name === D1_NAME)
  if (!found) {
    throw new Error(
      `D1 database "${D1_NAME}" not found — create via wrangler d1 create (Phase 4 human gate)`
    )
  }
  return found.uuid
}

async function insertRows(d1Id, rows) {
  let inserted = 0
  for (const row of rows) {
    const sql = `INSERT OR REPLACE INTO captures (id, created_at, url, title, capture_type, pin_count, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
    await cf(`/accounts/${ACCOUNT_ID}/d1/database/${d1Id}/query`, {
      method: 'POST',
      body: JSON.stringify({
        sql,
        params: [
          row.id,
          row.created_at,
          row.url,
          row.title,
          row.capture_type,
          row.pin_count,
          row.expires_at
        ]
      })
    })
    inserted += 1
  }
  return inserted
}

export async function runBackfill(deps = {}) {
  requireEnv()
  const listKeys = deps.listKeys ?? listAllR2Keys
  const getJson = deps.getJson ?? getR2Json
  const d1Id = deps.d1Id ?? (await resolveD1Id())
  const rows = await collectBackfillRows({ listKeys, getJson })
  const inserted = await (deps.insertRows ?? insertRows)(d1Id, rows)
  return { scanned: rows.length, inserted }
}

async function main() {
  const result = await runBackfill()
  console.log(
    `backfill-d1: scanned=${result.scanned} inserted=${result.inserted}`
  )
}

const isDirect =
  process.argv[1] &&
  (process.argv[1].endsWith('backfill-d1.mjs') ||
    process.argv[1].includes('backfill-d1'))

if (isDirect) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}

export { isContextJsonKey, captureIdFromKey, collectBackfillRows }
