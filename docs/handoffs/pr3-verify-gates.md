# 핸드오프 — PR #3 검증 게이트 통과시키기

> 클로드 코드(Cursor)에게 그대로 주고 실행. 이 문서 하나로 작업 완결되게 만들어 둠.

- **레포**: byh3071-cpu/SnapContext
- **브랜치**: `chore/verification-gates-prototype` (base `master`)
- **PR**: #3
- **목표**: 검증 게이트 4종을 CI까지 초록으로 통과시키고 master에 머지 + 브랜치 보호로 강제

---

## 실행 순서

```bash
# 1. 브랜치 체크아웃
git checkout chore/verification-gates-prototype && git pull

# 2. (아래 ## CI 워크플로 파일 섹션 내용으로) .github/workflows/verify-gates.yml 생성

# 3. 의존성 설치
npm install

# 4. pre-commit 훅 실행권한
chmod +x .githooks/pre-commit

# 5. 로컬 검증 — 반드시 초록
npm run verify
#  ↑ 빨간불이면 멈추고 에러 메시지 그대로 보고할 것.
#    절대 fallback/우회 만들지 말 것. 실패는 실패대로 드러낼 것.

# 6. 워크플로 파일 커밋·푸시 (로컬 권한으로 push)
git add .github/workflows/verify-gates.yml
git commit -m "ci: add verify-gates workflow"
git push
```

7. GitHub에서 PR #3 의 `verify` 체크가 초록인지 확인 → `master`로 머지
8. **Settings → Branches → `master` 보호 규칙**에 `verify` 체크를 **필수(required)**로 지정 → 이걸 해야 "검증 실패 PR 머지 차단"까지 완성됨

> ⚠️ 노뚝이(Notion AI)는 GitHub workflow 쓰기 권한이 없어 6번의 워크플로 파일을 원격에 못 올림 → **2·6번은 로컬에서 직접** 해야 함.

---

## CI 워크플로 파일

`.github/workflows/verify-gates.yml` 로 아래 그대로 저장:

```yaml
name: verify-gates

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci || npm install
      - run: node scripts/check-version-sync.mjs
      - run: node scripts/check-no-silent-fallback.mjs
      - run: npx tsc --noEmit
      - run: npx vitest run
```

> job 이름이 `verify` → 8번 브랜치 보호의 필수 체크 이름과 일치시킬 것.

---

## 게이트 구성 (이미 브랜치에 푸시됨)

| 파일 | 역할 |
|---|---|
| `scripts/check-version-sync.mjs` | package.json ↔ manifest.json 버전 불일치 차단 |
| `scripts/check-no-silent-fallback.mjs` | 에러 삼키는 catch 적발 (의도 시 `// allow-silent-catch`) |
| `.githooks/pre-commit` | 커밋 전 위 검사 + `npx vitest run`, 실패 시 커밋 차단 (`--no-verify`로 우회 가능) |
| `package.json` scripts | `verify` / `check:version` / `check:fallback` / `prepare`(훅 자동연결) |

---

## 통과 후 — 다음 핸드오프 (vhk 흡수)

PR #3가 초록·머지되면, 검증된 게이트를 vhk로 흡수한다. 작업 지시는 vhk 이슈에 고정돼 있음:

- vhk #128 — silent fallback 린트 → 흡수 타깃 = `goals/_meta.md` 공통 게이트
- vhk #129 — test-first 게이트 (별도, PR #3 미포함)

흡수 경로: 게이트 파일 vhk로 이식 → `goals/_meta.md` 공통 게이트에 등록 → `vhk init`/`sync`로 전 프로젝트 자동 전파.
