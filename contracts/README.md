# Sözleşme İskeleti

W000 yalnız kanonik OpenAPI 3.1 kökünü oluşturur. Bu değişiklik additive scaffolding sınıfındadır:

- Henüz operation, producer, consumer veya generated artifact yoktur.
- `paths` bilinçli olarak boştur; W001 davranışı placeholder endpoint ile taklit edilmez.
- İlk gerçek operation W001'de auth, typed error seti, idempotency, concurrency ve rate-limit sözleşmesiyle birlikte eklenir.
- Generated Go/TypeScript çıktıları W001'de üretici ve tüketiciler tanımlandıktan sonra oluşturulur.

Rollback, W000 sözleşme scaffold commit'inin geri alınmasıdır. Veri migration'ı veya compatibility window gerekmez; dış tüketici yoktur.
