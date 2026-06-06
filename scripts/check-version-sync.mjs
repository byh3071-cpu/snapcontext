#!/usr/bin/env node
// 게이트: package.json === manifest.json === package-lock.json(top + packages[""]) 버전 일치.
// 불일치하면 빨간불(exit 1). "말과 숫자가 일치하는가"를 기계가 매번 검사한다.
// 원본: ddaef81 chore(gate) — package-lock 2개 위치 검사까지 보강(v0.2.0 릴리스 라인).
import { readFileSync } from "node:fs"

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"))
}

function requireVersion(value, label) {
	if (!value) {
		console.error(`[version-sync] x ${label} 에 version 필드가 없음`)
		process.exit(1)
	}
	return value
}

const pkg = readJson("package.json")
const manifest = readJson("manifest.json")
const lock = readJson("package-lock.json")

// 검사 대상 4값: package.json / manifest.json / lock.version / lock.packages[""].version
const entries = [
	["package.json", requireVersion(pkg.version, "package.json")],
	["manifest.json", requireVersion(manifest.version, "manifest.json")],
	["package-lock.json(top)", requireVersion(lock.version, "package-lock.json(top)")],
	["package-lock.json(packages[''])", requireVersion(lock.packages?.[""]?.version, "package-lock.json(packages[''])")],
]

const expected = entries[0][1]
const mismatches = entries.filter(([, v]) => v !== expected)

if (mismatches.length > 0) {
	console.error(`[version-sync] x 불일치 (기준 ${entries[0][0]}=${expected}):`)
	for (const [label, v] of entries) {
		console.error(`  ${v === expected ? "·" : "x"} ${label}=${v}`)
	}
	console.error("[version-sync] 네 값을 모두 맞춘 뒤 다시 commit/build 하세요.")
	process.exit(1)
}

console.log(`[version-sync] OK: ${expected} (4값 일치)`)
