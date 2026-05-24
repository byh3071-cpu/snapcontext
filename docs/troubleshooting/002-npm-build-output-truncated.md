---
id: troubleshoot-002-terminal-build-output
date: 2026-05-07
tags: [troubleshooting, build, vite, powershell]
---

# `npm run build` 출력이 중간에서 끊겨 보일 때 (PowerShell)

## 증상

`vite build`가 `✓ N modules transformed.` 직후로 로그가 잘리거나, 전체 요약(`✓ built in …ms`, `dist/` 목록)이 보이지 않는다.

## 원인

- 터미널 버퍼·창 높이·복사 범위 때문에 **출력 일부만 복사**된 경우가 많다.
- 실제로는 이후 단계(`rendering chunks`, gzip, 산출물 목록)까지 진행되었을 수 있다.

## 확인

PowerShell에서 직후 종료 코드 확인:

```powershell
npm run build; if ($LASTEXITCODE -eq 0) { "build OK" } else { "build FAIL: $LASTEXITCODE" }
```

또는:

```powershell
echo $LASTEXITCODE
```

`0`이면 성공이다.

## 해결

- 로그 전체가 필요하면 같은 명령을 다시 실행하거나, 출력을 파일로 리다이렉트한다.  
  예: `npm run build *>&1 | Tee-Object -FilePath build.log`

## 참고

- 빌드 실패 시에는 보통 **stderr에 오류 스택**이 이어진다. 마지막 수십 줄을 함께 저장하면 원인 파악에 유리하다.
