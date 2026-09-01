# PostgreSQL sözleşmesi

Bu dizin, W001-T04F için PostgreSQL 17 rol ve migration sözleşmesinin
kanonik kaynağıdır. Değişiklik mevcut bir veritabanı sözleşmesini bozmaz;
`v0` (boş veritabanı) üzerine eklenen ilk, internal ve additive sözleşmedir.

## Üretenler ve tüketenler

- `infra/postgres/**`, ortam bootstrap yöneticisiyle database privilege'larını
  ve `contracts/database/roles.yaml` içindeki üç LOGIN rolü ile bir NOLOGIN
  salt-okunur capability rolünü üretir.
- `db/migrations/**`, yalnız `hedefora_migration` rolüyle schema ve migration
  ledger'ını üretir.
- PostgreSQL 17 ve `tests/integration/postgres/**`, rol/migration sözleşmesinin
  doğrudan tüketicileridir.
- Gelecekteki API ve worker adapter'ları sırasıyla `hedefora_app` ve
  `hedefora_worker` tüketicileridir. `hedefora_readonly`, primary üzerinde
  oturum açamaz ve membership taşımaz; ancak fiziksel/servis düzeyinde
  salt-okunurluğu ayrıca admitted edilmiş bir endpoint için yeni bir support
  login'i açıkça tasarlandığında capability rolü olarak değerlendirilebilir.

Uygulama ve worker runtime'ı database, schema, tablo, sequence, function veya
type sahibi olamaz. `hedefora_meta` yalnız migration rolüne açıktır. Ortam
bootstrap admin'i runtime credential değildir ve uygulama process'ine verilmez.
Yönetilen roller hedef dışındaki hiçbir connectable database'e (ilk cluster'da
`postgres` ve `template1` dahil) bağlanamaz. Sonraki database oluşturma akışı
aynı deny-by-default politikayı yeniden uygulamak zorundadır. Built-in
advisory-lock alma fonksiyonları `PUBLIC` ve runtime rollerinden kaldırılır;
migration rolü yalnız migration dosyalarının kullandığı
`pg_advisory_xact_lock(bigint)` imzasını çalıştırabilir.

## Migration protokolü

`contracts/database/migrations.yaml` sıralama, transaction, advisory-lock,
ledger ve compatibility kurallarını tanımlar. `db/migrations/SHA256SUMS`, bütün
ve yalnız versioned `*.up.sql` / `*.down.sql` dosyalarının lowercase SHA-256
kimliğini dosya adı sırasıyla taşır. Runner, manifest inventory'sini ve her
digest'i **database bağlantısı açmadan önce** doğrular; eksik, fazla, duplicate,
symlink, non-regular veya digest'i uyuşmayan dosyada fail-closed olur.

Migration dosyaları `psql` 17 ile çalışır, kendi `BEGIN` / `COMMIT` sınırını
taşır ve `pg_advisory_xact_lock(5216686130049544801)` alır. Her dosya lock'tan
önce transaction-local `lock_timeout = 3s`, `statement_timeout = 15s` ve
`idle_in_transaction_session_timeout = 15s` uygular. Timeout hatası
`ON_ERROR_STOP` ile fail-closed olur ve açık transaction bağlantı kapanırken
rollback edilir. Aynı database için tek migration writer vardır. `psqlrc`,
search path, caller transaction'ı veya caller timeout'una güvenilmez.

Up komut biçimi (connection parametreleri environment/secret store üzerinden
ayrıca sağlanır):

```text
psql --no-psqlrc --set=ON_ERROR_STOP=1 --set=migration_checksum=<000001-up-sha256> --file=db/migrations/000001_database_foundation.up.sql
```

Down komut biçimi:

```text
psql --no-psqlrc --set=ON_ERROR_STOP=1 --set=expected_up_checksum=<000001-up-sha256> --file=db/migrations/000001_database_foundation.down.sql
```

Runner down dosyasının kendi digest'ini de bağlantıdan önce doğrular. Down
dosyası ledger'daki up digest'ini ayrıca karşılaştırır. Checksum, lock veya
ledger kontrolünü atlayan doğrudan SQL çalıştırma desteklenen migration yolu
değildir.

## Compatibility ve rollback

- `000001` yalnız schema, default privilege ve migration ledger'ı oluşturur;
  domain tablosu veya extension eklemez.
- Empty/up ve ilk upgrade aynı `v0 -> v1` yoludur. Runner yalnız pending
  version'ı uygular; aynı up dosyasını ikinci kez çalıştırmak hatadır.
- Down yalnız `000001` son migration iken ve `hedefora` schema'sı boşken
  geçerlidir. `CASCADE` kullanılmaz; sonraki migration veya object varsa bütün
  transaction rollback olur.
- Production migration her durumda ayrı owner approval ister. Sonraki
  destructive değişiklikler expand/migrate/contract ve backward-compatible
  deploy penceresi taşır; eski SQL dosyası değiştirilmez, yeni version eklenir.

Bu slice driver, connection pool, River, `/health/ready`, staging/production
mutation veya credential içermez. Backend ve readiness acceptance'ı ayrı owner
gate'lerinde kalır.
