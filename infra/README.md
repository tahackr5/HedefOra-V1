# Yerel altyapı

`compose.dev.yml`, gelecekteki yerel geliştirme/test ortamı için fail-closed
bir aday sözleşmesidir. Staging veya production desired-state'i değildir; gerçek
kullanıcı ya da production verisiyle kullanılmaz.

## Mevcut çalıştırma durumu

Dosya şu anda `services: {}` taşır. PostgreSQL container'ı, port'u, volume'u,
healthcheck'i veya environment mapping'i materialize edilmemiştir. Bu nedenle:

- `up`, `down`, `exec` veya `ps` ile yönetilebilecek service yoktur,
- varsayılan kullanıcı/parola ya da çalışan local database yoktur,
- environment değerleri inert candidate metadata içine render edilmez,
- PostgreSQL image pull/run/start bu checkpoint'te yasaktır.

Exact OCI adayı, planlanan loopback/network/storage ve credential değişken
adları yalnız `x-hedefora-postgres-candidate` metadata'sındadır. Bu metadata
çalıştırılabilir Compose service değildir.

## Güvenli statik doğrulama

Yalnız config parse doğrulaması dış süreç veya service oluşturmaz:

```bash
docker compose --file infra/compose.dev.yml config --quiet
```

Kanonik statik harness ayrıca exact candidate profilini, `services` sayısının
sıfır olduğunu ve synthetic environment değerlerinin render edilmediğini
doğrular:

```bash
node tests/integration/postgres/run.mjs --static
```

`--live` modu owner/security image admission'ı tamamlanana kadar fail-closed
`IMAGE_ADMISSION_BLOCKED` sonucu verir; canlı test `PASS` sayılmaz.

## Aktivasyon kapısı

Bir service ancak exact-digest canonical vulnerability scan, owner/security
admission ve ayrı reviewed materialization değişikliğinden sonra eklenebilir.
Bu değişiklik gerçek secret içermeyen izole test credential mapping'ini,
loopback-only port'u, disposable volume/cleanup sınırını ve canlı PostgreSQL 17
negative-privilege testlerini birlikte taşımak zorundadır. Ayrıntılı rol/init
sözleşmesi `infra/postgres/README.md` içindedir.
