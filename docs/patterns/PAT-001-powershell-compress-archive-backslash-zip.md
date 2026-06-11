---
id: PAT-001
패턴명: PowerShell Compress-Archive 백슬래시 zip — 리눅스 서버 업로드 500
카테고리: build
증상: Windows에서 만든 zip을 웹 서비스(스토어·배포 서버)에 업로드하면 "Request failed with status code 500" 등 서버 오류. 로컬(Windows) 압축 해제는 정상이라 원인 추적이 어려움.
원인: PowerShell 5.1 `Compress-Archive`(.NET Framework ZipArchive)가 zip 엔트리 경로 구분자를 `\`로 기록. ZIP 규격(APPNOTE 4.4.17)은 `/`만 허용 — 리눅스 측 압축 해제기가 `assets\icons\icon.png`를 구분자 없는 단일 파일명으로 취급해 디렉터리 구조가 무너지고 서버 검증기가 500을 반환.
해결: |
  엔트리명을 직접 지정해 압축 (PowerShell 5.1):
  ```powershell
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $root = (Resolve-Path dist).Path
  $zip = [System.IO.Compression.ZipFile]::Open("$PWD\out.zip", 'Create')
  Get-ChildItem dist -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($root.Length + 1).Replace([char]92, [char]47)
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel)
  }
  $zip.Dispose()
  ```
  검증: 엔트리 나열해서 `\` 포함 0건 확인. 대안 — PowerShell 7+(.NET Core, 버그 수정됨) 또는 `tar -a -cf out.zip ...`(bsdtar).
적용조건: Windows PowerShell 5.1에서 만든 zip을 비-Windows 시스템이 풀 때 전부 (확장 스토어 제출, CI 아티팩트, 서버 배포 패키지).
출처프로젝트: SnapContext
태그: [powershell, zip, compress-archive, chrome-extension, whale-store, windows]
발견일: 2026-06-11
출처DevLog: 웨일 스토어 v0.2.0 zip 업로드 500 → 엔트리 구분자 검사로 즉시 재현·해결
---

# PAT-001: PowerShell Compress-Archive 백슬래시 zip

`Compress-Archive`로 만든 zip은 Windows에서만 멀쩡하다. 서버가 리눅스면 업로드 단계에서 깨진다.
엔트리명 직접 제어(`CreateEntryFromFile` + `/` 치환)가 가장 확실하고, PowerShell 7 이상이면 버그 자체가 없다.

검증 한 줄:

```powershell
([System.IO.Compression.ZipFile]::OpenRead("out.zip")).Entries.FullName -match '\\'  # 결과 없어야 정상
```
