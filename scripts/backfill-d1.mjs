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
 */

import {
  collectBackfillRows,
  isContextJsonKey,
  captureIdFromKey,
  parseCfEnvelope,
  listAllR2ObjectsFromPages,
  insertRowsWithCheckpoint
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

/** Cloudflare API — result + result_info envelope 보존 (BLOCKER-1) */
export async function cf(path, init = {}, fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.cloudflare.com/client/v4${path}`, {
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
  return parseCfEnvelope(body)
}

export async function listAllR2Objects(fetchPage) {
  const doFetch =
    fetchPage ??
    (async (cursor) => {
      const q = new URLSearchParams({ per_page: '1000' })
      if (cursor) q.set('cursor', cursor)
      return cf(`/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects?${q}`)
    })
  return listAllR2ObjectsFromPages(doFetch)
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
  const { result } = await cf(`/accounts/${ACCOUNT_ID}/d1/database`)
  const found = (result ?? []).find((d) => d.name === D1_NAME)
  if (!found) {
    throw new Error(
      `D1 database "${D1_NAME}" not found — create via wrangler d1 create (Phase 4 human gate)`
    )
  }
  return found.uuid
}

async function insertOneRow(d1Id, row) {
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
}

export async function runBackfill(deps = {}) {
  requireEnv()
  const listObjects = deps.listObjects ?? (() => listAllR2Objects())
  const getJson = deps.getJson ?? getR2Json
  const d1Id = deps.d1Id ?? (await resolveD1Id())
  const rows = await collectBackfillRows({ listObjects, getJson })
  const insertOne =
    deps.insertOne ?? ((row) => insertOneRow(d1Id, row))
  return insertRowsWithCheckpoint(rows, insertOne)
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
    if (err && typeof err === 'object' && 'failedId' in err) {
      console.error(
        `checkpoint: inserted=${err.inserted} failedId=${err.failedId} scanned=${err.scanned}`
      )
      console.error('re-run: node scripts/backfill-d1.mjs')
    }
    process.exit(1)
  })
}

export {
  isContextJsonKey,
  captureIdFromKey,
  collectBackfillRows,
  parseCfEnvelope,
  listAllR2ObjectsFromPages,
  insertRowsWithCheckpoint
}
