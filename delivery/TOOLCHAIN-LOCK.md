# W000 Araç Zinciri Kilidi

> Araştırma ve doğrulama tarihi: 2026-08-28. Sürümler exact pin'dir; otomatik major/minor aralık kullanılmaz.

## Aktif W000 çalışma zamanı

| Bileşen                   |                                                                                                                                                                                         Kilit | Uygulama                                                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Go                        |                                                                                                                                                                                      `1.26.7` | `go 1.26.0` + `toolchain go1.26.7`; CI `GOTOOLCHAIN=local` kullanır.                                                                                                                                                  |
| Node.js                   |                                                                                                                                                                                 `24.20.0` LTS | `.node-version`, `.tool-versions`, package engines ve CI exact runtime.                                                                                                                                               |
| pnpm                      |                                                                                                                                                                                     `11.24.0` | Exact package manager, shared frozen lockfile ve strict peer checks.                                                                                                                                                  |
| PostgreSQL                |                                                                                                                                                                                       `17.11` | W001-T04F statik v0→v1 role/migration sözleşmesi committed; image/live SQL-engine execution DQ-010 çözülene kadar kapalıdır.                                                                                           |
| PostgreSQL OCI candidate  | `postgres:17.11-bookworm@sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0` — `BLOCKED_SECURITY` | Official multi-arch manifest digest; linux/amd64 `sha256:7bade6d532592ca8ce7ee32def7399dad2607c4ea5583839fc4352a095a11ea6`. Identity/provenance doğrulandı fakat image execution admission'ı DQ-010 çözülene kadar kapalıdır. |
| React / React DOM         |                                                                                                                                                                                      `19.2.8` | W000 no-feature web scaffold.                                                                                                                                                                                         |
| TypeScript                |                                                                                                                                                                                       `5.9.3` | `openapi-typescript@7.13.0` peer aralığı `^5.x` olduğu için TS 7 bilinçli olarak kullanılmaz.                                                                                                                         |
| Vite / React plugin       |                                                                                                                                                                             `8.2.2` / `6.1.0` | Node 24.20.0 ile uyumlu build scaffold.                                                                                                                                                                               |
| Spectral CLI              |                                                                                                                                                                                      `6.16.3` | Kanonik OpenAPI 3.1 lint.                                                                                                                                                                                             |
| Prettier                  |                                                                                                                                                                                       `3.9.6` | Format-only; lint kurallarıyla çakışmaz.                                                                                                                                                                              |
| OSV Scanner               |           `2.5.1`; OCI index `sha256:8108ae94eadea5a02c9bec6e646909d5b790b44bd62d7f5b7f0b1d6d0ffc7734`; linux/amd64 `sha256:1547b7c2783d4f266b24fe86ab4dfc18d058588244c58384ac9f56dddb304511` | W001 R-016 all-scope vulnerability/license extraction. Advisory DB her koşumda ayrıca mühürlenir; mutable cache fallback yoktur.                                                                                      |
| Semgrep Community Edition | `1.175.0` nonroot; OCI index `sha256:6f6f4c1ea22ae02736b023dd4dcc842a4f50b25bbe1898530ec3bfff388b369b`; linux/amd64 `sha256:290df936d4de8897e93953debbec95132cdba878025227258049b06e93aa7c9c` | W001 R-016 SAST; `--oss-only`, metrics/version-check/network kapalı ve exact local ruleset. Container packaging provenance'i ayrı residual kanıttır.                                                                  |
| Codex reviewer runtime    |                                                 Linux `0.150.0`; `codex-package-x86_64-unknown-linux-musl.tar.gz`; SHA-256 `2d27b8569ca760eeb2bf21fa12bd31f59ac42b81617b340cf8958e9b38d743d5` | WSL2 Ubuntu 24.04 üzerinde resmi release paketi; read-only reviewer parent/child isolation. Kaynak: `https://github.com/openai/codex/releases/download/rust-v0.150.0/codex-package-x86_64-unknown-linux-musl.tar.gz`. |

Frontend lint/test sürümleri `apps/web/package.json` içinde exact tutulur: ESLint `9.39.5`, `@eslint/js` `9.39.5`, `typescript-eslint` `8.68.0`, React Hooks `7.1.1`, JSX a11y `6.10.2`, Vitest/coverage `4.1.11`, jsdom `30.0.1`, Testing Library React `16.3.3`, DOM `10.4.1`, user-event `14.6.6`, jest-dom `7.0.1`.

Native Windows Codex `0.150.0-alpha.8`, hem `unelevated` hem `elevated` sandbox'ta canlı loopback listener'a bağlantıyı engelleyemediği için reviewer acceptance runtime'ı değildir. Runtime yükseltmesinde native ve WSL yolları yeniden executable sentinel ile ölçülür; yalnız repository read başarılı, repository write/credential read/loopback bağlantı başarısız olduğunda reviewer yolu kabul edilir.

R-016 scanner ve rule ayrıntılarının makine-okunur source of truth'u `security/scanners.lock.json`; eşik ve allow/deny source of truth'u `security/supply-chain-policy.json` dosyasıdır. Bu tablo digest değişikliği için tek başına yetki vermez; lock, negatif fixture ve exact-target kanıt birlikte güncellenir.

## Bilinçli olarak sonraki wave'e ertelenenler

| Bileşen                                   |               Planlanan kilit | Sahip wave / neden                                                                                                                          |
| ----------------------------------------- | ----------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| River ve `riverpgxv5`                     |                      `0.45.0` | W001; job/process sözleşmesi ve migration kanıtıyla birlikte.                                                                               |
| pgx                                       |    `5.10.0` — `BLOCKED_OWNER` | W001-T04F; newer stable yok. Yalnız bounded pgxpool admission veya owner-approved alternatif driver kararıyla eklenebilir.                  |
| oapi-codegen                              |  `2.8.0` — `BLOCKED_SECURITY` | W001 compatibility probe geçti; GHSA-9c2f-gr95-7wqw için patched version olmadığından admission yoktur.                                     |
| oapi-codegen runtime / nethttp middleware |             `1.7.0` / `1.2.0` | W001; generated server ve gerçek request/security validation birlikte.                                                                      |
| openapi-typescript                        |                      `7.13.0` | W001; boş contract'tan anlamsız generated artifact üretilmez.                                                                               |
| openapi-fetch                             |                      `0.17.0` | W001; generated `paths` oluşmadan runtime dependency eklenmez.                                                                              |
| Testcontainers-Go                         | `0.44.0` — `BLOCKED_SECURITY` | W001-T04F; mevcut all-scope R-016 closure bulguları nedeniyle eklenmez; pinned Compose/CLI harness değerlendirilir.                         |
| golang-migrate                            | `4.19.1` — `BLOCKED_SECURITY` | W001-T04F; library/image closure bulguları nedeniyle eklenmez; repository-owned minimal runner veya pinned `psql` tasarımı değerlendirilir. |
| Playwright / axe                          |           `1.62.1` / `4.13.0` | Ürün akışı oluştuğunda E2E/accessibility gate'i.                                                                                            |

Redis, ikinci broker, frontend framework/router, global client-state kütüphanesi, Axios, Go web framework'ü, ORM ve `sqlc` W000'a eklenmez. Gerçek ihtiyaç ve ayrı dependency değerlendirmesi olmadan eklenemez.

W001 DEC-027 exact-health Go yolu planned `oapi-codegen`, runtime veya middleware pinlerini aktive etmez. Repository-owned `scripts/generate-openapi.mjs` yalnız pinned Node `24.20.0` standard library ile exact sealed source'tan tek Go artifact üretir; yeni npm/Go dependency veya lockfile değişikliği yoktur. Bu renderer genel çözüm değildir ve ikinci operation'da genişletilemez.

## Production dependency değerlendirmesi

W000 ürün runtime'ına yalnız React ve React DOM ekler:

| Dependency                 | Gerekçe                                                | Lisans | Risk / çıkış planı                                                                                                                |
| -------------------------- | ------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| React + React DOM `19.2.8` | Kanonik etkileşimli web UI yönü ve buildable scaffold. | MIT    | Public sayfa SSG/SSR kararı açık; W000 shell public launch değildir. API dar tutulur; major yükseltme ayrı compatibility PR'ıdır. |

Spectral, Vite, TypeScript, lint, format ve test paketleri development-only'dir. Install scriptleri deny-by-default tutulur; W000 lock'unda lifecycle script izni verilen paket yoktur. Spectral'ın telemetry amaçlı `@scarf/scarf` script'i açıkça reddedilir. `pnpm-lock.yaml` review edilmeden dependency yükseltilmez.

## W001 için production dependency ön değerlendirmesi

- `pgx/v5 5.10.0` — MIT; PostgreSQL driver/pool. TLS, timeout ve pool davranışı integration test ister.
- River `0.45.0` — MPL-2.0 ve pre-1.0; tüm River modülleri aynı sürümde, migration/retry/rollback kanıtıyla tutulur.
- oapi-codegen `2.8.0` — Apache-2.0 ve Go 1.26.7 compatibility probe'u başarılıdır; fakat official GHSA-9c2f-gr95-7wqw `HEAD` dahil etkilenmiş, patched version boş durumdadır. Exact tag source'u `x-go-type-import.name` değerini generated import'a doğrulamadan taşır. Generator, runtime ve public health slice admission'ı fail-closed blokludur; recursive extension lint yalnız defense-in-depth'tir. Patched sürüm yeniden doğrulanmadan dependency/Go tool directive eklenmez.
- oapi-codegen runtime/middleware — Apache-2.0; generator admission'ından bağımsız compatibility PASS dependency ekleme yetkisi değildir. Generator ve runtime birlikte yükseltilir, transitive `kin-openapi` keyfî override edilmez.
- DEC-027 local sealed renderer — repository-owned ve zero-dependency'dir; yalnız exact `/health/live` source digest'ini kabul eder. Yeni parser/template dependency'si, spec-derived code interpolation veya scope genişlemesi ayrı production/supply-chain ve security compiler admission'ı ister.
- `openapi-fetch 0.17.0` — MIT ve pre-1.0; ince local adapter arkasında izole edilir.

Bu kayıt ekleme izni değildir; W001 task'ı gerçek producer/consumer, lisans, SBOM, vulnerability ve rollback kanıtını yeniden doğrular.

## W001-T04F PostgreSQL dependency admission — 2026-09-02

- PostgreSQL `17.11-bookworm` exact index `sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0` ve linux/amd64 `sha256:7bade6d532592ca8ce7ee32def7399dad2607c4ea5583839fc4352a095a11ea6` resmi Docker Library kaynağı/SPDX attestation ile eşleşir. Bu yalnız identity/provenance `PASS` sonucudur.
- Yerel Docker Scout `1.24.0` kanonik pinli scanner/advisory-DB kapısı değildir ve `PASS` üretemez. Buna rağmen exact linux/amd64 Bookworm adayında raw exit `2` ile `4 critical / 25 high`; aynı official source revision'ındaki Trixie adayında `2 critical / 23 high`, Alpine 3.24 ve 3.23 adaylarında `3 critical / 27 high` buldu. Bulgular execution'ı fail-closed durdurur; hiçbir varyant pull/run/start edilmedi.
- Compose dosyası mevcut durumda `services: {}` taşır. Exact aday kimliği ve planlanan non-secret sınırlar yalnız inert `x-hedefora-postgres-candidate` metadata'sındadır; profile, environment veya explicit service seçimiyle image çalıştırılamaz. Canonical exact-digest scanner/DB kanıtı ve DQ-010 owner/security admission'ı ayrı reviewed değişiklikle service'i materialize etmeden canlı test açılamaz.
- `github.com/jackc/pgx/v5 v5.10.0` 2026-09-02 itibarıyla en yeni stable etikettir; daha yeni fix pin'i yoktur. Exact commit `7293fb11125be0373a92f716683f2d494f6fd4b0`, module sum `h1:VhSvgU2jSli8o3AqIEOTJr7rZwAEUVo4E4XhR94Zfr0=`, go.mod sum `h1:mal1tBGAFfLHvZzaYh77YS/eC6IX9OWbRV1QIIM0Jn4=` ve MIT lisans doğrulandı. Tag imzasız; upstream SBOM/SLSA asset'i yoktur.
- pgx issue `#2622` açık, fakat reproducer documented concurrency sınırını ve `database/sql.Conn.Raw` lifetime sözleşmesini ihlal eder; fix PR `#2624` kapalı/unmerged'dir. Bounded pgx seçeneği yalnız pgxpool, acquired connection için tek-goroutine sahipliği, `Conn.Raw`/raw shared `*pgx.Conn`/ilk dilimde COPY yasağı, upstream misuse expected-fail ve intended-use cancel/close stress + race kanıtıyla değerlendirilebilir. Bare graph R-016'yı geçmez; aday security override'ları `golang.org/x/text v0.41.0`, `golang.org/x/mod v0.40.0`, `github.com/yuin/goldmark v1.7.17` olsa da exact-head SBOM/license/R-016 sonucu owner kararından önce `PASS` sayılamaz.
- Minimal alternatif `github.com/lib/pq v1.12.3`: verified-signed commit `1f3e3d92865dd313b4e146968684d7e3836c76e8`, module sum `h1:tTWxr2YLKwIvK90ZXEw8GP7UFHtcbTtty8zsI+YjrfQ=`, go.mod sum `h1:/p+8NSbOcwzAEI7wiMXFlgydTwcgTr3OSKMsD2BitpA=`, MIT, sıfır declared dependency ve araştırma anında OSV finding `0`. Ancak pgx/River ortak hattını böler; silent substitution değildir ve DQ-008 architecture/owner kararı ister.
- Testcontainers-Go `v0.44.0` closure'ı `compress`, `moby/go-archive`, `x/crypto` ve no-fixed-version advisory nedeniyle current all-scope R-016'yı geçmez. Pin eklenmez; exact PostgreSQL digest'li Compose/CLI integration harness önerilir.
- golang-migrate `v4.19.1` standalone closure'ı pgx/v4, pgproto, grpc, OTel, Docker ve `x/*` bulguları taşır; resmi image için ayrıca upstream security issue `#1381` açıktır. Library ve OCI pin'i eklenmez; immutable SQL/checksum/advisory-lock sözleşmeli minimal repository runner veya pinned `psql` yolu ayrı architecture/security review ister.
- DQ-008 çözülmeden `go.mod`, `go.sum` veya `internal/platform/postgres/**` writer'ı açılmaz. DQ-009 çözülmeden ikinci OpenAPI operation ve sealed renderer kapsamı genişletilmez. DQ-010 çözülmeden PostgreSQL image/service execution açılmaz. River `0.45.0` bu admission'ın dışında, W001-T04G'dedir.

## Supply-chain gate'leri

- npm direct dependencies exact, lockfile commitli ve CI install `--frozen-lockfile`.
- Registry publish-age politikası 24 saattir ve missing-time fail-closed'dur. 27 Ağustos 2026'da yayımlanan, exact integrity/lisansı incelenmiş `@testing-library/react@16.3.3` ilk lock üretimi için version-scoped istisnadır; pattern veya package-wide istisna değildir.
- Go standard library dışı dependency W000'da yoktur; `go mod verify` ve tidy drift kontrol edilir.
- GitHub Actions yalnız full commit SHA ile çağrılır; tag/SHA eşleşmesi merge öncesi upstream'den doğrulanır.
- OCI image tag ile birlikte digest'e sabitlenir.
- Secret scan, dependency audit ve license/SBOM gate'leri artifact mevcut oldukça uygulanır; dış servis erişimi yoksa `BLOCKED_EXTERNAL`, asla sahte `PASS` değildir.

## Birincil kaynaklar

- Go release ve toolchain belgeleri: `https://go.dev/doc/devel/release`, `https://go.dev/doc/toolchain`
- Node release politikası: `https://nodejs.org/en/about/previous-releases`
- PostgreSQL sürüm politikası: `https://www.postgresql.org/support/versioning/`
- River release kayıtları: `https://github.com/riverqueue/river/releases`
- React release kayıtları: `https://github.com/facebook/react/releases`
- Vite release kayıtları: `https://github.com/vitejs/vite/releases`
- GitHub Actions secure-use: `https://docs.github.com/en/actions/reference/security/secure-use`
