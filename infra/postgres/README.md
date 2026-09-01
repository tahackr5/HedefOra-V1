# Yerel PostgreSQL bootstrap

Bu dizin, ileride owner-admitted `infra/compose.dev.yml` değişikliğiyle açılabilecek disposable local/CI PostgreSQL 17 ortamının ilk kurulum girdilerini taşır. Staging veya production desired-state'i değildir; gerçek ya da başka ortamlarla paylaşılan credential kullanılmaz.

> **Çalıştırma kapısı:** Compose'taki exact `17.11-bookworm` adayı için supplemental tarama kritik/yüksek OS-package bulguları üretti. Scanner ve advisory DB kanonik pinli olmadığı için sonuç final vulnerability kararı değildir; yine de image yürütme admission'ı fail-closed blokludur. Dosya aktif service taşımaz: `services` boş, aday kimliği ve planlanan service yalnız inert `x-hedefora-postgres-candidate` metadata'sındadır. Explicit service seçimiyle dahi container oluşturulamaz. Canonical exact-digest scan ile owner/security admission tamamlanıp ayrı reviewed değişiklik service'i materialize etmeden aşağıdaki komutlar çalıştırılmaz.

## Roller ve sınırlar

`hedefora_dev`, official image'in local bootstrap ve database-owner rolüdür. Uygulama veya worker runtime'ı bu rolle bağlanmaz.

| Rol                  | Amaç                                   | Oturum / database yetkisi   |
| -------------------- | -------------------------------------- | --------------------------- |
| `hedefora_migration` | Immutable migration uygulama           | LOGIN / `CONNECT`, `CREATE` |
| `hedefora_app`       | API runtime                            | LOGIN / `CONNECT`           |
| `hedefora_worker`    | Worker runtime                         | LOGIN / `CONNECT`           |
| `hedefora_readonly`  | Gelecekteki salt-okunur capability ACL | NOLOGIN / yok               |

Üç login rolü superuser, database/role oluşturma, replication, row-level-security bypass ve role inheritance yetkilerinden yoksundur; dört yönetilen rolün hiçbirinde membership yoktur. `hedefora_readonly` parola veya LOGIN taşımaz. PostgreSQL'in değiştirilebilir `default_transaction_read_only` ayarı güvenlik sınırı sayılmaz; support erişimi ancak fiziksel/servis düzeyinde salt-okunurluğu ayrıca admitted edilmiş endpoint ve ayrı reviewed login tasarımıyla açılabilir.

`PUBLIC` hedef database `CONNECT`/`TEMPORARY` ve `public` schema yetkilerini taşımaz. Yönetilen rollerin hedef dışındaki bütün connectable database bağlantı/TEMP yetkileri (`postgres` ve `template1` dahil) bootstrap sırasında katalogdan bulunup kaldırılır. Sonraki database oluşturma akışı aynı deny-by-default politikayı yeniden uygulamak zorundadır. `hedefora_migration` yalnız migration'ların `hedefora` ve `hedefora_meta` schema'larını oluşturabilmesi için hedef database `CREATE` yetkisi alır. Bütün built-in advisory-lock alma imzaları `PUBLIC` ve yönetilen rollerden kaldırılır; yalnız `hedefora_migration`, transaction-scoped `pg_advisory_xact_lock(bigint)` imzasını çalıştırabilir. Bu function ACL değişikliği cluster-wide olduğundan yalnız HedefOra'ya ayrılmış cluster sözleşmesinde uygulanır. Schema ve object-level grant'lerin source of truth'u immutable migration dosyalarıdır.

## Local-only parola girdileri

Planlanan Compose service sözleşmesi aşağıdaki environment değişkenlerini init script'ine aktarır:

- `HEDEFORA_DEV_POSTGRES_MIGRATION_PASSWORD`
- `HEDEFORA_DEV_POSTGRES_APP_PASSWORD`
- `HEDEFORA_DEV_POSTGRES_WORKER_PASSWORD`

Inert candidate metadata yalnız bu değişken adlarını taşır; `${...}` interpolation'ı veya credential değeri içermez. Bu nedenle `docker compose config` çağıranın environment değerlerini render edemez. Gerçek environment mapping'i ancak exact image admission sonrasında owner-reviewed service materialization değişikliğinde eklenebilir.

Materialize edilen local/test service yalnız açıkça production secret'ı olmayan izole test credential'ları kullanır. Init script üç LOGIN rolü girdisinin de en az 12 byte taşımasını client output'una değeri yazmadan doğrular; boş veya kısa bir değer role creation başlamadan SQLSTATE `22023` ve `ON_ERROR_STOP` kaynaklı nonzero psql sonucu ile fail-closed durur. `hedefora_readonly` için parola girdisi yoktur. Değerler yalnız izole local/test shell environment'ında verilir; gerçek staging/production credential'ı, `.env` dosyası veya paylaşılmış parola bu akışta kullanılmaz.

## Init ve migration davranışı

Service admission sonrasında official PostgreSQL entrypoint, `initdb/010_roles.sql` dosyasını yalnız boş data volume'unun ilk açılışında çalıştırır. Script sabit rol adlarıyla fail-closed çalışır; var olan cluster'a sessizce rol ekleme veya parola döndürme mekanizması değildir.

Admitted service contract'ı migration dizinini container içinde salt-okunur `/opt/hedefora/migrations` yoluna bağlar. Init script migration çalıştırmaz. Test veya geliştirici migration'ı explicit olarak migration login'iyle çağırır; parola host process argümanına yazılmaz:

```bash
docker compose --project-name hedefora-local --file infra/compose.dev.yml exec --no-TTY postgres \
  sh -ceu 'PGPASSWORD="$HEDEFORA_DEV_POSTGRES_MIGRATION_PASSWORD" exec psql --host=127.0.0.1 --username=hedefora_migration --dbname=hedefora_dev --no-password --no-psqlrc --set=ON_ERROR_STOP=1 --set=migration_checksum=86768275fac32ba13bb235f9a10599e430e3b4f5bd6fec3a1f27c6403256bea7 --file=/opt/hedefora/migrations/000001_database_foundation.up.sql'
```

Bu SHA-256 değeri committed `db/migrations/SHA256SUMS` ve kanonik migration manifestiyle exact eşleşmelidir. Desteklenen runner dosya inventory'sini ve digest'leri database bağlantısından önce ayrıca doğrular; bu düşük seviyeli `psql` örneği o preflight'ın yerine geçmez.

Image admission ve reviewed service materialization tamamlandıktan sonra integration testleri benzersiz Compose project adı ve disposable volume kullanır. `down --volumes` yalnız bu izole test project'i için cleanup'tır; korunması gereken local volume veya başka ortamda çalıştırılmaz.
