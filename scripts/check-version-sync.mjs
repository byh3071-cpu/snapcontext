#!/usr/bin/env node
// 게이트: package.json 버전 === manifest.json 버전.
// 불일치하면 빨간불(exit 1). "말과 숫자가 일치하는가"를 기계가 매번 검사한다.
import { readFileSync } from "node:fs"

function readVersion(path) {
	const json = JSON.parse(readFileSync(path, "utf8"))
	if (!json.version) {
		console.error(`[version-sync] x ${path} 에 version 필드가 없음`)
		process.exit(1)
	}
	return json.version
}

const pkg = readVersion("package.json")
const manifest = readVersion("manifest.json")

if (pkg !== manifest) {
	console.error(`[version-sync] x 불일치: package.json=${pkg} vs manifest.json=${manifest}`)
	console.error("[version-sync] 두 파일의 version을 맞춘 뒤 다시 commit 하세요.")
	process.exit(1)
}

console.log(`[version-sync] OK: ${pkg}`)
