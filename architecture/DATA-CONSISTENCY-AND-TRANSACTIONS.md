# Veri, Tutarlılık ve Transaction Politikası

## PostgreSQL

- PostgreSQL 17 kanoniktir.
- Runtime role DB owner değildir.
- Migration role, app role, worker role ve read-only support role ayrılır.
- Extension ve version ihtiyaçları migration/infra contract'ında görünürdür.

## Migration

- Sıralı, immutable ve review edilmiş migration.
- Up ve down veya güvenli forward-fix stratejisi açık.
- Empty DB, previous release upgrade ve rollback rehearsal test edilir.
- Destructive migration expand/migrate/contract ile yapılır.
- App deploy ve migration compatibility window taşır.
- Production migration owner approval ister.

## Transaction kuralları

- State transition ve audit/outbox aynı transaction'da yazılır.
- External provider çağrısı transaction içinde yapılmaz.
- Idempotency key actor + operation + normalized request scope'una bağlıdır.
- Replay aynı sonucu döndürebilir; farklı payload aynı key ile conflict üretir.
- Lock ordering dokümante ve test edilir.
- Long transaction, user think-time veya network wait yoktur.

## Optimistic concurrency

User-editable aggregate'lar version taşır. Mutation:

- current version/If-Match ister,
- stale write typed conflict verir,
- “last write wins” ile veri ezmez.

## Audit

Audit event append-only'dir. Base audit tablosu runtime rolleri tarafından UPDATE/DELETE edilemez. Retention, legal hold ve user hard-delete sınırları ayrı sözleşmedir.

## Hard delete

- User-owned FK graph önceden test edilir.
- Cleanup manifest user row'a bağımlı kalmaz.
- User session/token/capability revoke önce olur.
- Required legal/security retention pseudonymized veya ayrılmış boundary'de tutulur.
- Hard-delete job idempotent, resumable ve evidence üretir.

## Backup consistency

- DB backup yalnız dosya kopyası değildir; PostgreSQL-native consistent backup/WAL yaklaşımı kullanılır.
- Object storage ve DB referansları restore testinde birlikte doğrulanır.
