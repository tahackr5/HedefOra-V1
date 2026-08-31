# HTTP API Sözleşmesi

`contracts/openapi/openapi.yaml`, HedefOra HTTP API'sinin kanonik OpenAPI 3.1 kaynağıdır. W001-T04C ilk additive operation olan `GET /health/live` davranışını tanımlar.

- Endpoint public'tir; kimlik doğrulama veya authorization sonucu üretmez.
- Tekrarlanan `GET` çağrısı doğası gereği idempotent'tir ve concurrency precondition istemez.
- Edge uygulanana kadar sözleşmedeki `health` rate-limit sınıfı davranış metadata'sıdır; origin sınırsız trafik vaadi vermez.
- Process serving durumundayken typed `200`, graceful drain başladıktan sonra `service_unavailable`, `retryable: true`, zorunlu bounded retry süresi ve `Retry-After` taşıyan typed `503` döner.
- Hata yanıtları stable `code`, kullanıcıya güvenli `message`, `request_id` ve retryability metadata içeren kapalı şemalar kullanır.

`.spectral.yaml` W001 boyunca path/method/operation/callback, response/status/media/header ve component/schema yüzeyini allowlist eder. `scripts/fixtures/openapi-negative-mutations.mjs`, kanonik dosyaya tam bir eşleşme üzerinden tek değişiklik uygulayan negatif corpus'tur; doğrulama yalnız beklenen exact `w001-*` tanısı oluşursa geçer. External veya obfuscated reference Spectral resolver'a ulaşmadan raw preflight'ta bloklanır.

Hedef üretim sırası kanonik sözleşme → generated Go server/types → generated TypeScript paths şeklindedir. `internal/generated/openapi/**` ve `apps/web/src/generated/api/**` elle değiştirilmez. Ancak planned `oapi-codegen 2.8.0`, unpatched `GHSA-9c2f-gr95-7wqw` nedeniyle `BLOCKED_EXTERNAL` durumundadır. DQ-007 çözülmeden generator dependency, generated artifact veya public runtime üretilmez; mevcut `pnpm generated:check` hâlâ pre-runtime boundary'sidir ve generation parity PASS'i değildir.

Bu değişiklik additive'dir ve dış tüketici compatibility window'u gerektirmez. Rollback, runtime process'iyle birlikte bu operation ve generated artifact'ları geri almaktır; veri migration'ı yoktur.
