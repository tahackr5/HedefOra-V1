# Yerel PostgreSQL bootstrap

Bu dizin, ileride owner-admitted `infra/compose.dev.yml` değişikliğiyle açılabilecek disposable local/CI PostgreSQL 17 ortamının ilk kurulum girdilerini taşır. Staging veya production desired-state'i değildir; gerçek ya da başka ortamlarla paylaşılan credential kullanılmaz.

> **Çalıştırma kapısı:** Compose'taki exact `17.11-bookworm` adayı için supplemental tarama kritik/yüksek OS-package bulguları üretti. Scanner ve advisory DB kanonik pinli olmadığı için sonuç final vulnerability kararı değildir; yine de image yürütme admission'ı fail-closed blokludur. Dosya aktif service taşımaz: `services` boş, aday kimliği ve planlanan service yalnız inert `x-hedefora-postgres-candidate` metadata'sındadır. Explicit service seçimiyle dahi container oluşturulamaz. Canonical exact-digest scan ile owner/security admission tamamlanıp ayrı reviewed değişiklik service'i materialize etmeden aşağıdaki komutlar çalıştırılmaz.

## Roller ve sınırlar

Güncel Phase B stratejisi owner-approved DQ-010 B / repository-owned kaynak
derlemesidir; `image/README.md` exact failed preparation ve canonical builder
blocker'larını kaydeder. Aşağıdaki official-image anlatımı mevcut inert Phase A
adayının tarihsel sözleşmesidir; bu aday aktif seçilmiş güvenli image değildir.
Yeni kaynak-built image için de aynı immutable rol SQL'i, engine privilege
kanıtı ve ayrı materialization gate'i zorunludur.

`hedefora_dev`, official image'in local bootstrap ve database-owner rolüdür. Uygulama veya worker runtime'ı bu rolle bağlanmaz.

| Rol                  | Amaç                                   | Oturum / database yetkisi   |
| -------------------- | -------------------------------------- | --------------------------- |
| `hedefora_migration` | Immutable migration uygulama           | LOGIN / `CONNECT`, `CREATE` |
| `hedefora_app`       | API runtime                            | LOGIN / `CONNECT`           |
| `hedefora_worker`    | Worker runtime                         | LOGIN / `CONNECT`           |
| `hedefora_readonly`  | Gelecekteki salt-okunur capability ACL | NOLOGIN / yok               |

Üç login rolü superuser, database/role oluşturma, replication, row-level-security bypass ve role inheritance yetkilerinden yoksundur; dört yönetilen rolün hiçbirinde membership yoktur. `hedefora_readonly` parola veya LOGIN taşımaz. PostgreSQL'in değiştirilebilir `default_transaction_read_only` ayarı güvenlik sınırı sayılmaz; support erişimi ancak fiziksel/servis düzeyinde salt-okunurluğu ayrıca admitted edilmiş endpoint ve ayrı reviewed login tasarımıyla açılabilir.

`PUBLIC` hedef database `CONNECT`/`TEMPORARY` ve `public` schema yetkilerini taşımaz. Yönetilen rollerin hedef dışındaki bütün connectable database bağlantı/TEMP yetkileri (`postgres` ve `template1` dahil) bootstrap sırasında katalogdan bulunup kaldırılır. Sonraki database oluşturma akışı aynı deny-by-default politikayı yeniden uygulamak zorundadır. `hedefora_migration` yalnız migration'ların `hedefora` ve `hedefora_meta` schema'larını oluşturabilmesi için hedef database `CREATE` yetkisi alır. Bütün built-in advisory-lock alma imzaları `PUBLIC` ve yönetilen rollerden kaldırılır; yalnız `hedefora_migration`, transaction-scoped `pg_advisory_xact_lock(bigint)` imzasını çalıştırabilir. Function ACL değişikliği `hedefora_dev` database'iyle sınırlıdır; ileride admitted edilen her ayrı database aynı exact ACL bootstrap'ını taşımalıdır. Schema ve object-level grant'lerin source of truth'u immutable migration dosyalarıdır.

## Local-only parola girdileri

Planlanan Compose service sözleşmesi aşağıdaki environment değişkenlerini init script'ine aktarır:

- `HEDEFORA_DEV_POSTGRES_MIGRATION_PASSWORD`
- `HEDEFORA_DEV_POSTGRES_APP_PASSWORD`
- `HEDEFORA_DEV_POSTGRES_WORKER_PASSWORD`

Inert candidate metadata yalnız bu değişken adlarını taşır; `${...}` interpolation'ı veya credential değeri içermez. Bu nedenle `docker compose config` çağıranın environment değerlerini render edemez. Gerçek environment mapping'i ancak exact image admission sonrasında owner-reviewed service materialization değişikliğinde eklenebilir.

Materialize edilen local/test service yalnız açıkça production secret'ı olmayan izole test credential'ları kullanır. Init script üç LOGIN rolü girdisinin de en az 12 byte taşımasını client output'una değeri yazmadan doğrular; boş veya kısa bir değer role creation başlamadan SQLSTATE `22023` ve `ON_ERROR_STOP` kaynaklı nonzero psql sonucu ile fail-closed durur. `hedefora_readonly` için parola girdisi yoktur. Değerler yalnız izole local/test shell environment'ında verilir; gerçek staging/production credential'ı, `.env` dosyası veya paylaşılmış parola bu akışta kullanılmaz.

## Phase B API bağlantı sözleşmesi

Bu adapter yalnız disposable geliştirme kimliğini kabul eder: database
`hedefora_dev`, LOGIN rolü `hedefora_app`. Worker/migration kimliği, DSN,
URL, Unix socket, çoklu host ve ortamdan keşfedilen libpq varsayılanları yoktur.
Aşağıdaki alanlar environment üzerinden açıkça sağlanır; burada gerçek
credential veya çalıştırılabilir service komutu yayımlanmaz:

- `HEDEFORA_POSTGRES_HOST`, `HEDEFORA_POSTGRES_DATABASE`,
  `HEDEFORA_POSTGRES_USER`, `HEDEFORA_POSTGRES_PASSWORD`,
  `HEDEFORA_POSTGRES_ROOT_CA_PEM` zorunludur.
- Port varsayılanı 5432; `HEDEFORA_POSTGRES_PORT` ile 1–65535 seçilebilir.
- `HEDEFORA_POSTGRES_MAX_CONNECTIONS` varsayılan 4, sınır 1–8;
  başlangıçta minimum/idle bağlantı 0'dır.
- `HEDEFORA_POSTGRES_CONNECT_TIMEOUT` varsayılan 1s,
  `HEDEFORA_POSTGRES_ACQUIRE_TIMEOUT` 500ms,
  `HEDEFORA_POSTGRES_PROBE_TIMEOUT` 2s; her biri 100ms–5s.
- `HEDEFORA_POSTGRES_CLOSE_TIMEOUT` varsayılan 5s, sınır 1s–10s.
  `HEDEFORA_API_READINESS_TIMEOUT` varsayılan 2s, sınır 100ms–5s ve
  HTTP write timeout'undan küçüktür.

Alan adları exact büyük harflidir; tekrarlı, bilinmeyen veya case-variant
`HEDEFORA_POSTGRES_*` alanları ile boş olsa dahi case-insensitive `PG*`
ortam girdileri reddedilir. Parola boş olamaz; geçerli UTF-8, NUL'suz ve
en fazla 4096 byte olmalıdır. CA girdisi en fazla 64 KiB, yalnız geçerli
CA certificate PEM bloklarıdır. System trust store veya plaintext fallback
yoktur: TLS en az 1.2, explicit CA ve özgün hostname/IP doğrulaması zorunludur.
Config bütün değer olarak formatlandığında/slog'da redacted'dır; ayrı exported
alanları loglamak yasaktır.

Havuz yalnız `pgxpool` üzerinden acquire/probe/release yapar. DNS sorgusu ve
tek seçilen IP bağlantısı ayrı connect bütçeleri kullanır; arka plan bağlantısı
yaklaşık 2× connect timeout sürebilir. Probe toplam bütçesi ve çağıran context'i
ayrıca korunur. İlk IP başarısızsa başka IP'ye geçiş yapılmaz; HA failover
bu checkpoint kapsamında değildir. Parser seed'i discovery dosyası içeriğini
okumaz; OS user/appdata metadata sorgusu yapabileceğinden “sıfır filesystem
erişimi” iddiası yoktur.

`/health/live` database'den bağımsızdır. `/health/ready` her istekte bounded
probe yapar; unavailable/cancel/drain/late-success durumları generic 503 olur,
provider hata/credential bilgisi response veya log'a taşınmaz. Startup ilk
database probe'unu zorunlu tutmaz. Drain readiness'i kapatır, sonra HTTP ve
havuz kapanır; typed-nil havuz constructor sonucu fail-closed reddedilir.
Pool close kendi/çağıran bütçesini aşarsa timeout döner; pgx'in 15s destructor
bütçesi nedeniyle bu actual provider completion demek değildir. Sonraki
`Close` aynı gerçek tamamlanma olayını gözler. Başarı uydurulmaz.

Bu kaynak sözleşmesi gerçek PG17 authentication/role/migration/TLS engine
kanıtı yerine geçmez. Image admission `BLOCKED_EXTERNAL` olduğundan gerçek
engine testleri ve service materialization çalıştırılmamıştır.

## Init ve migration yürütme sınırı

Service admission sonrasında official PostgreSQL entrypoint, `initdb/010_roles.sql` dosyasını yalnız boş data volume'unun ilk açılışında çalıştırır. Script sabit rol adlarıyla fail-closed çalışır; var olan cluster'a sessizce rol ekleme veya parola döndürme mekanizması değildir.

Admitted service contract'ı migration dizinini container içinde salt-okunur `/opt/hedefora/migrations` yoluna bağlayacaktır. Init script migration çalıştırmaz. Bu checkpoint `services: {}` taşıdığı için çalıştırılabilir `docker compose exec`, `up`, `down` veya `psql` komutu yayımlamaz. Image admission ve ayrı service-materialization review'u tamamlandığında repository-owned runner; migration login'ini explicit seçmeli, parolayı process argümanına yazmamalı ve committed `db/migrations/SHA256SUMS` inventory/digest parity'sini database bağlantısından önce doğrulamalıdır. Raw `psql` çağrısı desteklenen preflight'ın yerine geçmez.

Image admission ve reviewed service materialization tamamlandıktan sonra integration testleri benzersiz Compose project adı ve disposable volume kullanmalıdır. Cleanup yalnız bu izole test project/volume kimliğini hedeflemeli; korunması gereken local volume veya başka ortam için çalıştırılabilir komut üretmemelidir.
