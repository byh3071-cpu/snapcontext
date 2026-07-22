---
id: troubleshoot-009-npm-eresolve-workers-types-peer
date: 2026-07-22
tags: [troubleshooting, npm, wrangler, cloudflare, peer-dependency]
---

# worker 에서 npm install / npm ci 가 ERESOLVE 로 멈춘다

## 증상

`worker/` 에서 의존성을 설치하면 아래처럼 멈춘다. `npm ci` 도 동일하게 실패해서
**커밋된 lock 으로도 환경을 재현할 수 없다.**

```
npm error code ERESOLVE
npm error While resolving: wrangler@4.112.0
npm error Found: @cloudflare/workers-types@4.20260702.1
npm error   peer @cloudflare/workers-types@"^4.20260424.1" from partyserver@0.5.8
npm error Could not resolve dependency:
npm error peerOptional @cloudflare/workers-types@"^5.20260714.1" from wrangler@4.112.0
```

설치된 `node_modules` 가 남아 있으면 unit 테스트는 통과하므로, `test-d1` 만
`Cannot find package '@cloudflare/vitest-pool-workers'` 로 죽는 형태로 뒤늦게 드러난다.

## 원인

두 의존성이 같은 패키지의 서로 다른 메이저를 요구한다.

| 요구자 | 요구 범위 | 경로 |
|--------|-----------|------|
| `wrangler@4.112.0` | `@cloudflare/workers-types@^5.20260714.1` (peerOptional) | `wrangler` ← `@cloudflare/vitest-pool-workers` |
| `partyserver@0.5.8` | `@cloudflare/workers-types@^4.20260424.1` (peer) | `partyserver` ← `agents` |

`package.json` 이 `wrangler: ^4.16.0` 으로 범위를 열어둔 탓에 시간이 지나면서
4.112.0 이 딸려 들어왔고, 그 버전부터 타입 패키지 메이저가 v5 로 올라가면서
`agents` 계열이 요구하는 v4 와 동시에 만족될 수 없게 됐다.

특정 커밋이 만든 회귀가 아니라 **범위 의존성이 시간에 따라 터진 경우**다.
`wrangler` 를 핀으로 낮춰도 `@cloudflare/vitest-pool-workers@0.18.6` 이
`wrangler@4.112.0` 을 직접 물고 오므로 해결되지 않는다.

## 해결

`worker/package.json` 에 overrides 를 넣어 트리 전체에서 타입 패키지를
루트가 선언한 v4 로 통일한다. `$` 접두는 루트 의존성 범위를 그대로 참조하는 npm 문법이라
버전을 두 군데 적지 않아도 된다.

```json
"overrides": {
  "@cloudflare/workers-types": "$@cloudflare/workers-types"
}
```

`wrangler` 쪽 요구가 `peerOptional` 이라 v4 로 눌러도 설치·타입체크·테스트가 모두 정상이다.

### 왜 .npmrc 가 아닌가

`legacy-peer-deps=true` 로도 넘어가지만, 그건 peer 검사 자체를 꺼서 **다른 충돌까지
같이 숨긴다.** overrides 는 이 패키지 하나만 고정하므로 새로 생기는 충돌은 그대로 드러난다.

## 검증

```
npm ci          # 플래그 없이 통과
npm test        # unit + test-d1 전부 green
npx tsc --noEmit
```
