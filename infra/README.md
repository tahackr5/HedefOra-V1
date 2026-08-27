# Yerel altyapı

`compose.dev.yml` yalnız yerel geliştirme ve test içindir. Staging veya production desired-state'i değildir; gerçek kullanıcı ya da production verisiyle kullanılmaz.

## Başlatma

Docker Compose v2 veya daha yenisi gerekir.

```bash
docker compose --project-name hedefora-local --file infra/compose.dev.yml up --detach --wait
```

PostgreSQL varsayılan olarak şu yerel değerlerle açılır:

- host: `127.0.0.1`
- port: `5432`
- database: `hedefora_dev`
- user: `hedefora_dev`
- password: `local-dev-only-not-a-secret`

Parola açıkça secret olmayan bir local placeholder'dır; başka bir ortamda kullanılmaz. Gerektiğinde `HEDEFORA_DEV_POSTGRES_PASSWORD`, port çakışmasında `HEDEFORA_DEV_POSTGRES_PORT` yalnız yerel shell environment'ında değiştirilebilir. Gerçek credential veya `.env` içeriği repoya eklenmez.

Port yalnız `127.0.0.1` üzerinde publish edilir; bunun tek amacı host üzerinde çalışan geliştirme araçları ve testlerin PostgreSQL'e erişmesidir. Uzak ağ erişimi bilinçli olarak açık değildir.

`postgres_data` named volume'u container yeniden oluşturulduğunda yerel veriyi korur. Normal durdurma volume'u silmez:

```bash
docker compose --project-name hedefora-local --file infra/compose.dev.yml down
```

## Doğrulama

Compose dosyasını servis başlatmadan doğrulamak için:

```bash
docker compose --project-name hedefora-local --file infra/compose.dev.yml config --quiet
```

Servis durumunu ve healthcheck sonucunu görmek için:

```bash
docker compose --project-name hedefora-local --file infra/compose.dev.yml ps
```
