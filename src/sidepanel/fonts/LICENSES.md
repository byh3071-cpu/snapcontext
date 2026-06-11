# 번들 폰트 라이선스

사이드패널 UI에 self-host로 동봉한 웹폰트. 전부 SIL Open Font License 1.1 (OFL) —
상업적 사용·재배포·번들 허용, 폰트 단독 판매만 금지.

| 파일 | 폰트 | 버전/출처 | 라이선스 |
|---|---|---|---|
| `PretendardVariable.woff2` | Pretendard Variable (길형진, orioncactus) | v1.3.9 — npm `pretendard` | OFL 1.1 |
| `Archivo-wght-latin.woff2` | Archivo Variable (Omnibus-Type) | Google Fonts v25, latin subset | OFL 1.1 |
| `Archivo-Italic-wght-latin.woff2` | Archivo Variable Italic | Google Fonts v25, latin subset | OFL 1.1 |
| `JetBrainsMono-wght-latin.woff2` | JetBrains Mono Variable (JetBrains) | Google Fonts v24, latin subset | OFL 1.1 |

- OFL 전문: https://openfontlicense.org/open-font-license-official-text/
- Pretendard: https://github.com/orioncactus/pretendard (LICENSE)
- Archivo: https://fonts.google.com/specimen/Archivo/license
- JetBrains Mono: https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt

선정 근거: `docs/ui-audit/swiss/snapcontext.html` (디자인 SoT) — Archivo(라틴 디스플레이/워드마크),
Pretendard(한글+UI 본문), JetBrains Mono(숫자·키캡·URL·메타). MV3 CSP·오프라인 충족을 위해 CDN 대신 동봉.
