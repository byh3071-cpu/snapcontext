---
id: PAT-001
패턴명: Windows산 zip의 스토어 업로드 500 (역슬래시·구조 민감)
카테고리: build
증상: Windows에서 만든 zip을 웹 서비스(확장 스토어 등)에 업로드하면 500/파싱 실패. 로컬에선 정상으로 보임.
원인: PowerShell Compress-Archive(.NET Framework 경유)가 zip 내부 경로를 역슬래시(\)로 기록 — zip 표준은 슬래시(/)만 허용. 엄격한 서버(네이버 웨일 등)는 거부, 관대한 서버(크롬 웹스토어)는 통과해서 문제를 늦게 발견. 도구별 미묘한 구조 차이(디렉터리 엔트리 유무)에도 민감한 서버 존재.
해결: Python zipfile(항상 슬래시, arcname을 relpath.replace(os.sep,'/')로) 또는 bsdtar(tar -acf)로 생성. 마지막으로 통과했던 zip이 있으면 unzip -l 로 구조(경로 스타일·디렉터리 엔트리 유무)를 대조해 동일하게 맞추는 게 최단 경로.
적용조건: Windows에서 zip 산출물을 만들어 외부 서비스에 업로드할 때 전부. 특히 스토어 제출·CI 아티팩트.
출처프로젝트: SnapContext
태그: [zip, powershell, compress-archive, whale-store, chrome-web-store, windows]
발견일: 2026-07-18
출처DevLog: "[2026-07-18] 마일스톤-004: 0.3.0 크롬·웨일 스토어 제출" (0.1.3 때도 동일 문제로 웨일 전용 zip을 만들었던 전례 — 그땐 패턴화 안 해서 재발)
---

# PAT-001: Windows산 zip의 스토어 업로드 500

## 재현

1. `Compress-Archive -Path dist\* -DestinationPath out.zip` (Windows PowerShell 5.1)
2. 네이버 웨일 스토어에 업로드 → "Request failed with status code 500"
3. 같은 zip이 크롬 웹스토어에는 올라감 (관대한 파서) → 원인을 zip이 아니라고 오판하기 쉬움

## 검증법

```bash
unzip -l out.zip   # 경로에 \ 가 보이면 비표준. assets\icons\... = 실패 예정
tar -tf out.zip    # 슬래시로만 나와야 정상
```

## 정답 생성법 (Python — 항상 슬래시·파일만)

```python
import zipfile, os
with zipfile.ZipFile('out.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk('dist'):
        for f in sorted(files):
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, 'dist').replace(os.sep, '/'))
```

## 교훈

- 0.1.3(2026-05)에도 같은 이유로 웨일 전용 zip을 수작업으로 만들었는데 패턴화하지 않아 0.3.0에서 재발 — 에러 해결 시 즉시 패턴 사전에 넣을 것.
- "한 서버는 받고 다른 서버는 거부"면 파일 포맷의 비표준 요소부터 의심.
