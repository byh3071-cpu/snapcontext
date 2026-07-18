# SnapContext 0.3.0 Phase 0 리서치 R3 — 저장소·수집 경로·무료 한도

> 질문 D/E/F 조사 결과. 확인일: **2026-07-18 (KST)**  
> 조사 범위: `docs/PRD-0.3.0.md`, `worker/src/index.ts`, `worker/src/lib.ts`, Cloudflare·Chrome·MITRE 공식 문서. 아래 웹 자료는 모두 확인일 기준 1년 이내에 갱신되었거나, 2026년 현행 문서로 다시 확인했다. `UNVERIFIED` 항목은 없다.

## D/E/F 권고 요약

| 질문 | 권고 | 핵심 근거 |
|---|---|---|
| **D — 메타데이터 인덱스** | **R2에는 이미지/Context JSON을 유지하고, 캡처 메타데이터 인덱스는 D1을 사용한다.** 단일 `index.json` read-modify-write는 사용하지 않는다. | D1은 동시 요청을 DB에서 직렬 처리하고 `INSERT`·PRIMARY KEY·트랜잭션으로 lost update를 피할 수 있으며, SQL `ORDER BY`/`WHERE`와 인덱스를 지원한다. 무료 한도도 개인용 캡처 메타데이터에 충분하다. R2 `list()`는 강한 정합성이지만 사전순/prefix만 제공하고, KV는 eventual consistency와 동일 키 초당 1회 제한이 있다. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 API](https://developers.cloudflare.com/d1/worker-api/d1-database/), [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/), [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/) (모두 2026-07-18 확인) |
| **E — 수집 경로·인증** | **0.3.0은 기존 Worker `POST /upload`를 확장해 재사용한다.** Worker에서 bearer를 검증하고 기존 PNG/크기 검증 → R2 저장 → D1 메타데이터 `INSERT` 순으로 처리한다. R2 장기 access key는 확장에 넣지 않는다. | 현재 라우트가 이미 10MB 제한, PNG magic 검증, UUID, R2 이미지·컨텍스트 저장을 중앙화한다. presigned PUT은 대용량/고트래픽에는 유리하지만 URL 발급·R2 CORS·업로드 완료 확인·D1 반영의 추가 프로토콜이 필요하다. presigned URL 생성용 자격증명은 Worker secret에만 둬야 한다. [R2 direct upload guidance](https://developers.cloudflare.com/r2/objects/upload-objects/), [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/) (2026-07-18 확인) |
| **F — 무료 한도** | Workers Free의 **100,000 요청/일**은 hard stop이며 초과 시 Error 1027이다. KV/D1 무료 일일 한도도 해당 연산이 실패한다. 반면 R2의 무료 구간은 월별 usage-based allowance라 초과분이 과금된다. 보안 라우트는 Workers 한도 초과 시 **fail closed**로 둔다. | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [usage-based billing](https://developers.cloudflare.com/billing/understand/usage-based-billing/) (2026-07-18 확인) |

---

## D. 캡처 메타데이터 인덱스 저장소 비교

### 비교표

| 항목 | R2 objects + `list()` | Workers KV | D1 |
|---|---|---|---|
| 무료 구간 | Standard storage **10 GB-month/월**, Class A **1M/월**, Class B **10M/월**, egress 무료. `PutObject`와 `ListObjects`는 Class A, `GetObject`/`HeadObject`는 Class B다. [R2 pricing](https://developers.cloudflare.com/r2/pricing/) (2026-07-18 확인) | 읽기 **100K/일**, 쓰기 **1K/일**, 삭제 **1K/일**, list **1K/일**, 저장 **1GB**. 동일 키 쓰기는 Free/Paid 모두 **초당 1회**다. [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), [KV limits](https://developers.cloudflare.com/kv/platform/limits/) (2026-07-18 확인) | row read **5M/일**, row write **100K/일**, 저장 **계정 합계 5GB**. Free는 DB **10개**, DB당 **500MB**, Worker 호출당 query **50개**다. 인덱스 열 갱신은 추가 row write로 계산될 수 있다. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) (2026-07-18 확인) |
| 동시 업로드 정합성 | R2 객체 쓰기와 객체 목록은 **강한 전역 정합성**이다. 업로드별 고유 키에 별도 객체를 쓰면 서로 덮어쓰지 않는다. 그러나 여러 요청이 하나의 `index.json`을 읽고 수정해 다시 쓰면, 동일 키 동시 PUT은 **마지막 완료 writer 승리**이므로 앞선 항목이 사라질 수 있다. [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/) (2026-07-18 확인) | eventual consistency다. 다른 지역에서 변경 관측까지 **최대 60초 이상** 걸릴 수 있고 atomic read-modify-write/transaction 용도가 아니다. 동일 키 동시 쓰기는 서로 덮어쓰며 마지막 write가 우선한다. 항목별 고유 키를 쓰면 lost update는 줄지만 목록은 잠시 stale할 수 있다. [How KV works](https://developers.cloudflare.com/kv/concepts/how-kv-works/), [KV write guidance](https://developers.cloudflare.com/kv/api/write-key-value-pairs/) (2026-07-18 확인) | 한 D1 DB는 single-threaded이며 query를 한 번에 하나씩 처리한다. 개별 `INSERT`와 PRIMARY KEY/UNIQUE 제약으로 중복 ID를 명시적 오류로 만들 수 있다. `batch()`는 순차 실행되는 SQL transaction이고 하나가 실패하면 전체가 rollback된다. 따라서 공유 JSON read-modify-write 없이 행 단위로 갱신할 수 있다. [D1 limits — concurrency](https://developers.cloudflare.com/d1/platform/limits/), [D1 `batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/) (2026-07-18 확인) |
| 정렬 | 결과는 객체 키 **사전순**이고 1회 최대 1,000개다. 최신순은 전체 페이지를 읽어 `uploaded`로 애플리케이션 정렬하거나, 별도 인덱스 객체 키에 역시간 값을 넣는 설계가 필요하다. [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) (2026-07-18 확인) | 키의 UTF-8 byte 기준 **사전순**, 1회 최대 1,000개다. 최신순에는 역시간 키 등 키 설계가 필요하다. [KV list](https://developers.cloudflare.com/kv/api/list-keys/) (2026-07-18 확인) | `ORDER BY created_at DESC`, cursor 조건 등을 SQL로 직접 표현할 수 있다. 자주 쓰는 날짜/필터 열에 index를 만들 수 있다. [D1 query](https://developers.cloudflare.com/d1/best-practices/query-d1/), [D1 indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/) (2026-07-18 확인) |
| 필터 | `prefix`/`delimiter` 중심이다. `captureType`, URL, 제목, pin 수 같은 임의 조건은 서버 측 질의가 없으므로 객체를 가져와 애플리케이션에서 거르거나 조건마다 키를 중복 설계해야 한다. `include`로 custom metadata를 목록에 포함할 수 있지만 응답 크기 때문에 1,000개보다 적게 올 수 있다. [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) (2026-07-18 확인) | `prefix` 외 임의 조건 질의가 없다. list 결과에는 최대 1KB의 key metadata를 실을 수 있지만, 복합 필터는 키 중복 설계 또는 전수 후처리가 필요하다. [KV list](https://developers.cloudflare.com/kv/api/list-keys/), [KV limits](https://developers.cloudflare.com/kv/platform/limits/) (2026-07-18 확인) | `WHERE capture_type = ?`, URL/기간 조건, `ORDER BY`, `LIMIT`을 결합할 수 있다. 적절한 단일/복합 index로 scan row와 지연을 줄일 수 있다. [D1 indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/) (2026-07-18 확인) |
| 초과 동작 | 월 무료 구간을 넘은 Standard storage/operations는 usage-based **과금**된다. 무료 구간은 Infrequent Access에 적용되지 않는다. [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Cloudflare usage billing](https://developers.cloudflare.com/billing/understand/usage-based-billing/) (2026-07-18 확인) | Free에서 해당 일일 연산 한도를 넘으면 **그 연산 유형이 오류로 실패**하며 00:00 UTC에 리셋된다. 저장 1GB는 Free platform limit다. [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), [KV limits](https://developers.cloudflare.com/kv/platform/limits/) (2026-07-18 확인) | read/write 일일 한도 초과 시 query가 오류로 실패하고 00:00 UTC 리셋 후 재개된다. 5GB 총 저장 한도에 도달하면 새 data/table/index/trigger를 쓸 수 없고 정리 또는 Paid 전환이 필요하다. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 release notes](https://developers.cloudflare.com/d1/platform/release-notes/) (2026-07-18 확인) |

### 결론과 최소 모델

**D1을 택한다.** SnapContext의 `snap_history`는 기본 최신순뿐 아니라 이후 URL·캡처 유형·기간 필터가 자연스럽게 추가될 가능성이 높다. 이 요구는 SQL/인덱스에 맞고, 캡처당 한 행 쓰기는 Free의 100K row writes/day보다 매우 작다. 이미지와 원본 context는 기존처럼 R2에 둔다. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/) (2026-07-18 확인)

권장 최소 테이블은 `captures(id TEXT PRIMARY KEY, created_at TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, capture_type TEXT NOT NULL, pin_count INTEGER NOT NULL, expires_at TEXT NOT NULL)`이며, 첫 index는 `(created_at DESC)` 하나로 시작한다. 실제 query가 생기기 전에는 조건별 index를 미리 늘리지 않는다. D1 문서도 자주 질의하는 열에만 index를 만들도록 권고하며, index 유지가 write/storage를 추가로 사용한다고 명시한다. [D1 indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/) (2026-07-18 확인)

R2와 D1 사이에는 단일 cross-service transaction이 없다. 따라서 동시 업로드의 **D1 내부 lost update는 해결**되지만, R2 PUT 성공 후 D1 INSERT 실패 시 orphan object 같은 부분 실패는 별도 문제다. 구현 단계에서는 `id`를 idempotency key로 사용하고, 명시적 오류 반환 및 재시도/정합성 점검 정책을 정해야 한다. 이 판단은 R2가 동일 키 last-writer-wins이고 D1 transaction이 D1 statement 묶음에 한정된다는 문서에서 도출한 아키텍처 추론이다. [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/), [D1 `batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/) (2026-07-18 확인)

차선책은 별도 `index.json`이 아니라 업로드별 고유 R2 인덱스 객체(`index/{reverse-time}/{id}` 등) + `list()`다. 이 경우 목록 정합성은 강하고 공유 키 race는 없지만, 복합 필터와 키 스키마/페이지네이션 부담이 남는다. Phase 0의 조회가 영구히 “최근 N개”뿐이라면 가장 적은 제품 수라는 장점이 있으나, PRD의 메타데이터 모델에는 D1이 더 단순하다. [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/), [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) (2026-07-18 확인)

---

## E. 확장 → 저장소 수집 경로와 최소 인증

### 경로 비교

| 항목 | 확장 → presigned PUT → R2 | 확장 → 기존 Worker `POST /upload` → R2/D1 |
|---|---|---|
| 자격증명 노출 | **안전한 형태는 Worker가 URL을 서명해 확장에 짧게 전달하는 방식뿐이다.** `aws4fetch`를 확장 안에서 장기 R2 access key/secret과 함께 실행하면 배포된 client에 credential을 하드코딩하는 셈이다. presigned URL 자체도 만료 전까지 재사용 가능한 bearer token이다. [R2 aws4fetch](https://developers.cloudflare.com/r2/examples/aws/aws4fetch/), [R2 presigned security](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [CWE-798](https://cwe.mitre.org/data/definitions/798.html) (2026-07-18 확인) | R2 binding은 Worker에 내장된 권한을 사용하므로 확장에 R2 key가 전혀 필요 없다. 확장에는 범위가 Worker API로 제한된 개인 bearer만 둔다. Worker secret은 encrypted binding으로 관리한다. [Workers bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/), [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/) (2026-07-18 확인) |
| 요청 흐름 | 최소 `1) 인증된 presign 발급 2) R2 PUT 3) 인증된 complete 호출/D1 INSERT`가 필요하다. complete 없이 D1을 먼저 쓰면 실패한 upload가 history에 남고, PUT 뒤 별도 반영이 실패하면 orphan이 생긴다. 이 부분은 R2 PUT과 D1 transaction이 서로 다른 서비스라는 점에서 나온 설계 추론이다. [R2 direct upload](https://developers.cloudflare.com/r2/objects/upload-objects/), [D1 `batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/) (2026-07-18 확인) | 인증된 POST 하나에서 기존 검증·R2 저장·D1 INSERT를 조정한다. cross-service 완전 atomic은 아니지만 한 request에서 성공/실패를 명시하고 idempotency를 적용하기 쉽다. 기존 코드 근거: `worker/src/index.ts:58-92`, `worker/src/lib.ts:2`. 외부 제약 근거: [R2 Workers binding](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) (2026-07-18 확인) |
| 검증 | 서명된 `Content-Type: image/png`는 header를 제한할 뿐 실제 PNG magic을 검사하지 않는다. direct upload 후 서버 검증/격리 절차가 추가로 필요하다. URL은 지정 key/method/expiry로 제한할 수 있고 PUT은 지원하지만 HTML form POST는 지원하지 않는다. [R2 aws4fetch](https://developers.cloudflare.com/r2/examples/aws/aws4fetch/), [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) (2026-07-18 확인) | 현재 `/upload`가 content-length/실제 file size, 10MB, PNG magic, UUID를 검사한 뒤 R2에 넣는다. 이 로직을 유지할 수 있다. Cloudflare Free zone의 request body 상한은 100MB라 현재 10MB 정책은 platform body 한도 아래다. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (2026-07-18 확인) |
| CORS·운영 복잡도 | 브라우저가 S3 API domain에 직접 PUT하므로 R2 bucket CORS에 extension origin, PUT, `Content-Type` 등을 별도로 설정해야 한다. URL 수명·재사용·완료 확인·미완료 object 정리도 관리한다. [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/), [R2 presigned security](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) (2026-07-18 확인) | Worker CORS만 관리한다. 현재 `Access-Control-Allow-Origin: *`와 `Allow-Headers: Content-Type`이므로 구현 시 정확한 extension origin으로 좁히고 `Authorization`을 추가해야 한다. CORS는 인증 수단이 아니므로 bearer 검증은 별도다. [Chrome extension security](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure), [Workers timing-safe auth](https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/) (2026-07-18 확인; Chrome의 오래된 안내는 2026년 현재 페이지와 Cloudflare 현행 보안 문서로 재확인) |
| 언제 유리한가 | 큰 파일·높은 업로드 트래픽에서 Worker가 body를 proxy하지 않게 할 때 유리하다. Cloudflare도 browser/mobile direct upload가 필요할 때 server-side presigned URL 발급을 안내한다. [R2 direct upload](https://developers.cloudflare.com/r2/objects/upload-objects/) (2026-07-18 확인) | 개인용, PNG 최대 10MB, 기존 라우트/검증 재사용, 빠른 0.3.0 완성에 유리하다. Workers Free 10ms CPU 제한은 유의해야 하지만 현재 검사는 magic byte와 R2 I/O 중심이고 I/O 대기는 CPU time에 포함되지 않는다. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (2026-07-18 확인) |

### 결론: 기존 `/upload` 재사용

0.3.0에서는 `POST /upload`에 인증과 D1 insert를 더하는 것이 권장안이다. 현재 구현은 `worker/src/index.ts:58-92`에서 multipart image/context를 받고, `worker/src/lib.ts:2`의 10MB 제한과 `isPngMagic`을 적용하며, UUID 이미지와 `${id}.json`을 R2에 저장한다. 이 경로를 버리고 presigned 프로토콜을 새로 만들 이득이 현재 파일 크기와 개인용 트래픽에서는 작다. Direct PUT은 업로드 크기/빈도가 Worker proxy를 실제 병목으로 만들 때 후속 최적화로 둔다. [R2 direct upload](https://developers.cloudflare.com/r2/objects/upload-objects/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (2026-07-18 확인)

### “내 데이터만” 조회용 최소 bearer 패턴

1. 256-bit 이상 난수 token 하나를 개인 계정용으로 발급한다. 예상 token은 `SNAPCONTEXT_BEARER_TOKEN` 같은 **Worker secret binding**에 두고 `vars`/소스/커밋에는 넣지 않는다. Cloudflare는 API key와 auth token을 secret에 저장하도록 명시한다. [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/) (2026-07-18 확인)
2. 확장은 HTTPS로 `Authorization: Bearer <token>`을 보낸다. token을 확장 bundle에 상수로 하드코딩하지 말고 사용자별 설정/프로비저닝으로 넣는다. 단, client에 존재하는 bearer는 로컬 사용자나 손상된 확장 환경에서 추출될 수 있으므로 **개인용 접근 게이트**이지 강한 사용자 신원 증명은 아니다. 다중 사용자 제품이 되면 OAuth/Cloudflare Access 등으로 교체하고 token → `owner_id`를 서버에서 매핑해야 한다. [CWE-798](https://cwe.mitre.org/data/definitions/798.html), [Chrome extension security](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure) (2026-07-18 확인)
3. Worker는 header 전체와 `Bearer ${env.SNAPCONTEXT_BEARER_TOKEN}`을 각각 SHA-256으로 고정 길이 digest한 뒤 `crypto.subtle.timingSafeEqual()`로 비교한다. 단순 `===` 비교와 길이 불일치 조기 반환은 피한다. secret 누락은 500으로 **fail closed**, 불일치는 401과 `WWW-Authenticate: Bearer`로 응답한다. Cloudflare의 현행 best practice가 같은 digest + timing-safe 패턴을 제공한다. [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [timingSafeEqual example](https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/) (2026-07-18 확인)
4. 인증을 `/upload`, `snap_history`, `snap_pack` 및 private raw-object route에 공통 적용한다. 현재 `/i/{id}`와 `/s/{id}`는 무인증 공개 route다(`worker/src/index.ts:98-138`). `/s/{id}`를 의도적 공유 링크로 유지할 수는 있지만, 이 경우 “bearer 보유자만 내 데이터 조회” 정책의 예외임을 명시해야 한다. 엄격한 private 모드라면 두 route도 보호한다. 최소 bearer는 단일 owner만 표현하므로 D1의 별도 `owner_id` 없이도 시작할 수 있지만, 다중 token/사용자로 확장할 때는 모든 query에 owner 조건이 필요하다. [Workers auth comparison guidance](https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/) (2026-07-18 확인)
5. CORS는 알려진 `chrome-extension://<extension-id>` origin만 허용하고 `Access-Control-Allow-Headers`에 `Content-Type, Authorization`을 넣는다. `OPTIONS`는 통과시켜도 실제 route에서는 bearer를 반드시 검증한다. R2 access key가 필요한 presign 방식을 나중에 도입해도 access key/secret은 Worker secret에만 두고, presigned URL은 짧은 만료·고정 key·PUT·고정 `Content-Type`으로 제한한다. [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/), [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/) (2026-07-18 확인)

검증 형태 예시는 다음과 같다. 이는 구현안이 아니라 Worker 검증 규칙을 고정하기 위한 최소 패턴이다.

```ts
async function verifyBearer(request: Request, expectedToken: string): Promise<boolean> {
  const provided = request.headers.get('Authorization') ?? ''
  const expected = `Bearer ${expectedToken}`
  const encoder = new TextEncoder()
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ])
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash)
}
```

출처: [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) 및 [timingSafeEqual API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/#timingsafeequal) (2026-07-18 확인).

---

## F. Cloudflare Workers 무료 플랜 현재 한도와 초과 동작

| 제품 | 2026-07-18 현재 무료 한도 | 기간/리셋 | 초과 시 동작 | 근거 |
|---|---|---|---|---|
| Workers | 계정당 **100,000 requests/day**, HTTP request당 CPU **10ms**, memory **128MB**, subrequest **50/request**. Free/Pro zone request body는 **100MB**다. | 요청 한도는 매일 **00:00 UTC** 리셋. | 일일 요청 초과 시 **Error 1027**. route가 fail open이면 Worker를 우회하고, fail closed면 1027 error page를 반환한다. 인증·데이터 route는 우회가 보안 경계를 제거하므로 fail closed 권장. CPU/memory 초과는 Error 1102다. | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (확인 2026-07-18) |
| R2 Standard | storage **10 GB-month/월**, Class A **1M operations/월**, Class B **10M operations/월**, egress 무료. Class A에는 PUT/LIST, Class B에는 GET/HEAD가 포함된다. | 월별 포함량. storage는 일별 peak 평균 기반 GB-month. Free tier는 Standard에만 적용. | hard stop이 아니라 포함량 초과분이 usage-based 과금된다. 현행 Standard 단가는 storage **$0.015/GB-month**, Class A **$4.50/M ops**, Class B **$0.36/M ops**이며 billing unit으로 올림된다. Infrequent Access는 이 무료 구간 대상이 아니다. | [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [usage-based billing](https://developers.cloudflare.com/billing/understand/usage-based-billing/) (확인 2026-07-18) |
| Workers KV | read **100K/일**, write **1K/일**, delete **1K/일**, list **1K/일**, storage **1GB/account·namespace**. 동일 key write **1/초**, value **25MiB**, metadata **1KB**. | 연산 한도 매일 **00:00 UTC** 리셋. | 해당 연산 유형의 일일 한도를 넘으면 이후 그 연산은 오류로 실패한다. storage 1GB는 Free platform limit이며 Free 초과 저장 단가가 제공되지 않는다. | [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), [KV limits](https://developers.cloudflare.com/kv/platform/limits/) (확인 2026-07-18) |
| D1 | rows read **5M/일**, rows written **100K/일**, storage **5GB/account total**. Free는 DB **10개**, DB당 **500MB**, Worker 호출당 query **50개**. | 일일 row 한도는 **00:00 UTC** 리셋. | read/write 한도 도달 후 query는 오류로 실패한다. storage 한도 도달 시 새 data insert나 table/index/trigger 생성이 막히며, 정리하거나 Workers Paid로 전환해야 한다. | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 release notes](https://developers.cloudflare.com/d1/platform/release-notes/) (확인 2026-07-18) |

### SnapContext 용량 관점

- Workers의 100K/day는 `/upload`, MCP/history/pack, `/i`, `/s` 등 Worker를 실제 실행한 inbound request가 공유한다. Free 초과 시 자동 과금되어 계속되는 구조가 아니라 1027 hard stop이다. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (2026-07-18 확인)
- 캡처 한 건이 현재처럼 PNG 1 PUT + context JSON 1 PUT이면 R2 Class A 두 건이며, R2 `list()`도 Class A다. D1 권장안에서는 history list가 R2 LIST 대신 D1 rows read를 소비하고, 캡처마다 최소 D1 row write 한 건(+유지하는 index 수만큼 추가 write 가능)을 소비한다. [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) (2026-07-18 확인)
- 현재 7일 보관 정책(`worker/src/lib.ts:1`)은 R2 storage를 낮추지만, lifecycle 삭제가 D1 row를 자동 삭제하지는 않는다. D1 history query는 `expires_at > now`를 적용하고, 만료 row 정리 또는 R2 `head` 재확인 정책을 구현 단계에서 정해야 한다. 이는 서로 다른 저장 제품의 lifecycle이 자동 연동되지 않는다는 아키텍처 추론이며, D1/R2 개별 동작 근거는 [D1 query docs](https://developers.cloudflare.com/d1/best-practices/query-d1/)와 [R2 consistency docs](https://developers.cloudflare.com/r2/reference/consistency/)다 (2026-07-18 확인).
- R2는 초과 과금형이므로 “완전 무과금 hard cap”이 필요하면 Cloudflare billable usage/budget alert를 모니터링해야 한다. budget alert는 비용 발생을 막는 차단 장치가 아니라 threshold 통지다. [Billable usage](https://developers.cloudflare.com/billing/manage/billable-usage/), [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/) (2026-07-18 확인)

## 최종 결정 문장

**0.3.0은 R2를 이미지/Context blob 저장소로 유지하고, D1을 캡처 메타데이터 인덱스로 채택한다. 수집은 기존 `POST /upload`를 bearer-protected endpoint로 확장하며, Worker secret + SHA-256 digest + `timingSafeEqual`로 token을 검증한다. Presigned PUT은 Worker body proxy가 실제 병목으로 확인될 때 server-side URL 발급/complete 프로토콜과 함께 도입한다. Workers/KV/D1 Free 초과는 실패, R2 free allowance 초과는 과금이라는 차이를 운영 문서와 fail-closed 설정에 반영한다.** [D1 docs](https://developers.cloudflare.com/d1/), [R2 upload guidance](https://developers.cloudflare.com/r2/objects/upload-objects/), [Workers auth guidance](https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/), [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/) (모두 2026-07-18 확인)
