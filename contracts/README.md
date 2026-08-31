# HTTP API Sözleşmesi

`contracts/openapi/openapi.yaml`, HedefOra HTTP API'sinin kanonik OpenAPI 3.1 kaynağıdır. W001-T04C ilk additive operation olan `GET /health/live` davranışını tanımlar.

- Endpoint public'tir; kimlik doğrulama veya authorization sonucu üretmez.
- Tekrarlanan `GET` çağrısı doğası gereği idempotent'tir ve concurrency precondition istemez.
- Edge uygulanana kadar sözleşmedeki `health` rate-limit sınıfı davranış metadata'sıdır; origin sınırsız trafik vaadi vermez.
- Process serving durumundayken typed `200`, graceful drain başladıktan sonra `service_unavailable`, `retryable: true`, zorunlu bounded retry süresi ve `Retry-After` taşıyan typed `503` döner.
- Hata yanıtları stable `code`, kullanıcıya güvenli `message`, `request_id` ve retryability metadata içeren kapalı şemalar kullanır.

`.spectral.yaml` W001 boyunca path/method/operation/callback, response/status/media/header ve component/schema yüzeyini allowlist eder. `scripts/fixtures/openapi-negative-mutations.mjs`, kanonik dosyaya tam bir eşleşme üzerinden tek değişiklik uygulayan negatif corpus'tur; doğrulama yalnız beklenen exact `w001-*` tanısı oluşursa geçer. External veya obfuscated reference Spectral resolver'a ulaşmadan raw preflight'ta bloklanır.

Hedef üretim sırası kanonik sözleşme → generated Go server/types → gerçek frontend consumer açıldığında generated TypeScript paths şeklindedir. `internal/generated/openapi/**` ve `apps/web/src/generated/api/**` elle değiştirilmez. Planned `oapi-codegen 2.8.0`, unpatched `GHSA-9c2f-gr95-7wqw` nedeniyle `BLOCKED_EXTERNAL` durumunda ve dependency/tool graph'ı dışındadır.

DEC-027 kapsamında ilk Go artifact'ı genel OpenAPI generator ile değil, `scripts/generate-openapi.mjs` exact-health sealed renderer'ıyla üretilir. Renderer yalnız bu dosyanın LF byte boyutu `5604` ve SHA-256 `5d157cd1d6627d781030212454ceaa075e994cdfa22a6f1f1929d26265af85ab` kimliğini kabul eder; spec kaynaklı code/import/path interpolation yapmaz ve tek `internal/generated/openapi/openapi.gen.go` çıktısını üretir. Her contract byte değişikliği fail-closed olur; ikinci operation/schema yeni owner-approved compiler/security task'ı ister. `pnpm generated:check` source seal, exact output inventory ve byte drift'i birlikte doğrular.

Bu değişiklik additive'dir ve dış tüketici compatibility window'u gerektirmez. Rollback, runtime process'iyle birlikte bu operation ve generated artifact'ları geri almaktır; veri migration'ı yoktur.
