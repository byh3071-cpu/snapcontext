# SnapContext × Hermès — 디자인 언어 (grounded v2)

> 1차안(maison/nuit/carre)이 "안전한 럭셔리 미니멀"로 개성·감각·완성도가 부족했던 원인을 실제 레퍼런스로 교정한 디자인 언어. lazyweb DB + hermes.com + 브랜드 리서치 grounding.

## 진단 — 1차안이 실패한 이유

| 증상 | 1차안 | 교정 |
|---|---|---|
| 오렌지 사용 | 1px 액센트로 소심 | **오렌지 박스** — 채도 높은 필드로 대담하게 1지점 |
| 세리프 종류 | Fraunces(디도네) | **기하학적 슬랩세리프**(Hermès=Memphis Bold) |
| 텍스처·개성 | 거의 없음(밋밋) | 종이 그레인·가죽 엠보·찢긴 종이·체인 모티프 |
| 여백 철학 | 잔잔하게 바쁨 | **확신있는 절제** — 큰 타입·큰 여백·완벽한 디테일 하나 |

## 실제 Hermès 브랜드 토큰

- **Orange Hermès `#F37021`** — 시그니처. Pantone 없음, 사내 컬러코드 93. 1837 마구 공방 기원.
- **오렌지 박스 듀오톤** — 채도 높은 오렌지 필드 위에 오브제를 띄움(버킨백 룩). → 우리: 미리보기 스테이지·썸네일·primary 액션에 적용.
- **워드마크 = 기하학적 슬랩세리프** (Memphis Bold). OFL 대체: `Rokkitt`(Memphis 근접) 또는 `Zilla Slab`. 캡스 + 레터스페이스. "SNAPCONTEXT" 가능시 "· PARIS" 식 오마주 위계.
- **본문/UI = 클린 산세리프** → 한글 `Pretendard`.
- **잉크 = 가죽 세피아 브라운** (`#3A2A20`~`#2A2018`), 순흑 금지(따뜻하게).
- **모티프**: `Chaîne d'ancre`(앵커 체인 링크) = 구분선·시그니처 아이콘·발행 도장. 새들 스티치(점선) = 하이라인. (Duc 마차는 너무 장식적 → 체인 우선.)

## 레퍼런스 통찰 (refs/ 이미지)

- `01-hermes-birkin-orange` — **오렌지 박스 듀오톤의 정수**. 채도 높은 오렌지 단색 필드 + 오브제. 우리 미리보기/썸네일에 이식.
- `02-lovefrom` (Jony Ive 스튜디오) — near-white + 완벽한 세리프 단어 하나 + 극단 여백. **완성도 = 절제의 확신**.
- `03-opal` — 다크 프리미엄 AI 에이전트. 웜 near-black + 둥근 pill 칩 + 넉넉한 공간. 우리 제품(AI 에이전트 패널)에 제일 근접한 실물.
- `06-niccolo` — 웜 베이지 + 찢긴 종이 텍스처 + 캐릭터풀 디스플레이 세리프 + 오커 그래픽 셰이프. **감각·개성의 출처**.

## v2 방향 3종 (각각 강한 개성, 수렴 금지)

### A. MAISON — "오렌지 박스" (라이트·에디토리얼·텍스처)
크림 화지 `#F4EFE6` + Hermès 오렌지 `#F37021` 박스를 히어로로(미리보기=오브제-온-오렌지 듀오톤, primary=가죽엠보 오렌지 박스) + 가죽 세피아 잉크 + 슬랩 워드마크(Rokkitt 캡스) + Chaîne d'ancre 체인 구분선 + 새들 스티치 + 종이 그레인. 큰 타입·큰 여백·확신.

### B. NOIR — 프리미엄 AI 에이전트 (다크·opal grounded)
웜 near-black `#161412` + 크림 텍스트 `#ECE6DC` + Hermès 오렌지 단일 채도 액센트(primary=오렌지 박스, active) + 둥근 pill 칩(캡처 모드·템플릿) + 넉넉한 수직 공간 + 슬랩 워드마크 + 얇은 체인 링크 구분선. "같은 제품의 프리미엄판" + 개성.

### C. BLANC — lovefrom 극단 절제 (라이트·미니멀)
near-white `#F7F6F2` + 웜 near-black 잉크 + 완벽한 슬랩/세리프 워드마크 한 순간 + 극단 여백 + 오렌지는 **발행 도장/포커스에만**. 숫자·라벨 레터스페이스. 비움으로 완성. 절제-완성도 최고.

## 불변 (1차안과 동일)

9개 섹션 IA·한국어 카피·기능 모티프(발행 도장·핀 배지·캡처 종류·단축키 키캡)·4상태·AA 실측·reduced-motion·외부리소스 0(프리뷰=CDN, 이식=OFL self-host). 폰트 전부 OFL self-hostable: Rokkitt·Zilla Slab·Fraunces·Cormorant·Noto Serif KR·Nanum Myeongjo·Pretendard.

## 출처

- [Hermès Orange #F37021 — encycolorpedia](https://encycolorpedia.com/f37021)
- [Hermès Font (Memphis Bold) — HipFonts](https://hipfonts.com/hermes-font/)
- [The History of Hermès Orange — Madison Avenue Couture](https://madisonavenuecouture.com/blogs/news/the-history-of-hermes-orange)
- hermes.com/us/en (quiet luxury, 여백, 슬랩 워드마크, Chaîne d'ancre)
- lazyweb DB: yoogiscloset(오렌지박스), lovefrom, opal, niccolo-miranda
