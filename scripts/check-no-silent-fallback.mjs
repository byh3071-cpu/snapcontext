#!/usr/bin/env node
// 게이트(프로토타입): 에러를 조용히 삼키는 catch 블록을 잡아낸다.
// 실패하면 에러 그대로 노출하는 원칙을 기계가 강제한다.
// throw / console.error|warn|log / logger / reportError 중 하나도 없는 catch = 적신호.
// 의도된 무시는 해당 catch 본문 또는 바로 위에 // allow-silent-catch 주석.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, extname } from "node:path"

const ROOTS = ["src", "worker/src"]
const EXTS = new Set([".ts", ".tsx", ".js", ".mjs"])

function walk(dir) {
	if (!existsSync(dir)) return []
	let files = []
	for (const name of readdirSync(dir)) {
		const p = join(dir, name)
		if (statSync(p).isDirectory()) files = files.concat(walk(p))
		else if (EXTS.has(extname(p))) files.push(p)
	}
	return files
}

function findSilentCatches(file) {
	const src = readFileSync(file, "utf8")
	const issues = []
	const re = /catch\s*(\([^)]*\))?\s*\{/g
	let m
	while ((m = re.exec(src)) !== null) {
		const bodyStart = re.lastIndex
		let depth = 1
		let i = bodyStart
		for (; i < src.length && depth > 0; i++) {
			const ch = src[i]
			if (ch === "{") depth++
			else if (ch === "}") depth--
		}
		const body = src.slice(bodyStart, i - 1)
		const before = src.slice(Math.max(0, m.index - 80), m.index)
		if (/allow-silent-catch/.test(body) || /allow-silent-catch/.test(before)) continue
		const handled = /\bthrow\b/.test(body) || /console\.(error|warn|log)/.test(body) || /logger|reportError|captureException/.test(body)
		if (!handled) {
			const line = src.slice(0, m.index).split("\n").length
			const snippet = body.trim().slice(0, 60).replace(/\s+/g, " ")
			issues.push({ line, snippet })
		}
	}
	return issues
}

const files = ROOTS.flatMap(walk)
let total = 0
for (const f of files) {
	for (const it of findSilentCatches(f)) {
		total++
		console.error(`[no-silent-fallback] x ${f}:${it.line} - 에러를 삼키는 catch (throw/로그 없음): { ${it.snippet} ... }`)
	}
}
if (total > 0) {
	console.error(`\n[no-silent-fallback] ${total}건 발견. 실패는 에러로 노출하거나, 의도된 경우 해당 catch 위에 // allow-silent-catch 주석을 다세요.`)
	process.exit(1)
}
console.log(`[no-silent-fallback] OK (${files.length}개 파일 스캔, 조용한 catch 0건)`)
