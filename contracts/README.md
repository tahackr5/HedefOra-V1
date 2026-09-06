# HTTP API Sözleşmesi

`contracts/openapi/openapi.yaml`, HedefOra HTTP API'sinin kanonik OpenAPI 3.1 kaynağıdır. W001-T04C'nin `GET /health/live` davranışı korunur; DQ-009 A kapsamında W001-T04F ikinci additive operation olan `GET /health/ready` davranışını ekler.

- Her iki endpoint public'tir; kimlik doğrulama veya authorization sonucu üretmez.
- Tekrarlanan `GET` çağrısı doğası gereği idempotent'tir ve concurrency precondition istemez.
- Edge uygulanana kadar sözleşmedeki `health` rate-limit sınıfı davranış metadata'sıdır; origin sınırsız trafik vaadi vermez.
- `/health/live`, process serving durumundayken typed `200`, graceful drain başladıktan sonra `service_unavailable`, `retryable: true`, zorunlu bounded retry süresi ve `Retry-After` taşıyan typed `503` döner.
- Liveness PostgreSQL durumundan bağımsızdır. Readiness yalnız bounded PostgreSQL bağlantı probe'u başarılıysa ve process drain'e geçmemişse `200 {"status":"ready"}` döner. Unavailable/closed pool, timeout, cancellation ve drain aynı generic typed `503` üretir. Yanıtlar database, connection, DSN veya SQL ayrıntısı taşımaz.
- Readiness bu foundation diliminde bağlantı kullanılabilirliğidir; migration veya domain readiness iddiası değildir. Runtime rollerine kapalı `hedefora_meta` schema'sına erişim gerektirmez.
- Hata yanıtları stable `code`, kullanıcıya güvenli `message`, `request_id` ve retryability metadata içeren kapalı şemalar kullanır.

`.spectral.yaml` W001 boyunca tam iki path/GET operation, operation ID, callback, response/status/media/header ve component/schema yüzeyini allowlist eder. `scripts/fixtures/openapi-negative-mutations.mjs`, kanonik dosyaya tam bir eşleşme üzerinden tek değişiklik uygulayan negatif corpus'tur; doğrulama yalnız beklenen exact `w001-*` tanısı oluşursa geçer. Yinelenen operation metinleri sabit operation bloklarıyla sınırlanır; hem blok içi anchor hem bütün kaynakta blok eşleşmesi tam bir olmalıdır. External veya obfuscated reference Spectral resolver'a ulaşmadan raw preflight'ta bloklanır.

Hedef üretim sırası kanonik sözleşme → generated Go server/types → gerçek frontend consumer açıldığında generated TypeScript paths şeklindedir. `internal/generated/openapi/**` ve `apps/web/src/generated/api/**` elle değiştirilmez. Planned `oapi-codegen 2.8.0`, unpatched `GHSA-9c2f-gr95-7wqw` nedeniyle `BLOCKED_EXTERNAL` durumunda ve dependency/tool graph'ı dışındadır.

DEC-027'nin ilk tek-operation sınırından DQ-009 A kapsamında ayrı compiler task'ıyla ilerlenen Go artifact'ı, `scripts/generate-openapi.mjs` sabit iki-operation sealed renderer'ıyla üretilir. Renderer yalnız bu dosyanın LF byte boyutu `8383` ve SHA-256 `7781c1c2a11b65664bf53d8691c8b2b2602789c4e56f22d901df63763ca451ac` kimliğini kabul eder; spec kaynaklı code/import/path interpolation yapmaz ve tek `internal/generated/openapi/openapi.gen.go` çıktısını üretir. Yalnız doğrulanmış lowercase source SHA-256 yorum satırına eklenir. Her contract byte değişikliği fail-closed olur; üçüncü operation veya başka schema genişlemesi yeni compiler/security kapsamı ister. `pnpm generated:check` source seal, exact output inventory ve byte drift'i birlikte doğrular.

Bu değişiklik HTTP tüketicileri için additive'dir ve veri migration'ı gerektirmez. Internal Go strict interface'inin gerçek implementasyonu ve test stub'ları yeni readiness metoduyla birlikte güncellenir. Rollback, readiness runtime wiring'i ile iki-operation contract/compiler/generated artifact değişikliğini birlikte geri alıp mevcut liveness dilimine dönmektir.
