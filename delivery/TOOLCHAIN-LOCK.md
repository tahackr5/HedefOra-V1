# W000 Araç Zinciri Kilidi

> Araştırma ve doğrulama tarihi: 2026-08-28. Sürümler exact pin'dir; otomatik major/minor aralık kullanılmaz.

## Aktif W000 çalışma zamanı

| Bileşen                   |                                                                                                                                                                                         Kilit | Uygulama                                                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Go                        |                                                                                                                                                                                      `1.26.7` | `go 1.26.0` + `toolchain go1.26.7`; CI `GOTOOLCHAIN=local` kullanır.                                                                                                                                                  |
| Node.js                   |                                                                                                                                                                                 `24.20.0` LTS | `.node-version`, `.tool-versions`, package engines ve CI exact runtime.                                                                                                                                               |
| pnpm                      |                                                                                                                                                                                     `11.24.0` | Exact package manager, shared frozen lockfile ve strict peer checks.                                                                                                                                                  |
| PostgreSQL                |                                                                                                                                                                                       `17.11` | Yalnız local/staging scaffold; W001 migration davranışı yoktur.                                                                                                                                                       |
| PostgreSQL OCI            |                                                                                             `postgres:17.11-bookworm@sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0` | Official multi-arch manifest digest. Linux/amd64 digest: `sha256:7bade6d532592ca8ce7ee32def7399dad2607c4ea5583839fc4352a095a11ea6`.                                                                                   |
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

| Bileşen                                   |     Planlanan kilit | Sahip wave / neden                                                     |
| ----------------------------------------- | ------------------: | ---------------------------------------------------------------------- |
| River ve `riverpgxv5`                     |            `0.45.0` | W001; job/process sözleşmesi ve migration kanıtıyla birlikte.          |
| pgx                                       |            `5.10.0` | W001; PostgreSQL repository ve River ile aynı dependency hattı.        |
| oapi-codegen                              |             `2.8.0` | W001; ilk operation ve OpenAPI 3.1 compatibility corpus'u ile.         |
| oapi-codegen runtime / nethttp middleware |   `1.7.0` / `1.2.0` | W001; generated server ve gerçek request/security validation birlikte. |
| openapi-typescript                        |            `7.13.0` | W001; boş contract'tan anlamsız generated artifact üretilmez.          |
| openapi-fetch                             |            `0.17.0` | W001; generated `paths` oluşmadan runtime dependency eklenmez.         |
| Testcontainers-Go                         |            `0.44.0` | W001; gerçek PostgreSQL integration suite.                             |
| golang-migrate                            |            `4.19.1` | W001; migration sözleşmesi ve up/down/upgrade testleri.                |
| Playwright / axe                          | `1.62.1` / `4.13.0` | Ürün akışı oluştuğunda E2E/accessibility gate'i.                       |

Redis, ikinci broker, frontend framework/router, global client-state kütüphanesi, Axios, Go web framework'ü, ORM ve `sqlc` W000'a eklenmez. Gerçek ihtiyaç ve ayrı dependency değerlendirmesi olmadan eklenemez.

## Production dependency değerlendirmesi

W000 ürün runtime'ına yalnız React ve React DOM ekler:

| Dependency                 | Gerekçe                                                | Lisans | Risk / çıkış planı                                                                                                                |
| -------------------------- | ------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| React + React DOM `19.2.8` | Kanonik etkileşimli web UI yönü ve buildable scaffold. | MIT    | Public sayfa SSG/SSR kararı açık; W000 shell public launch değildir. API dar tutulur; major yükseltme ayrı compatibility PR'ıdır. |

Spectral, Vite, TypeScript, lint, format ve test paketleri development-only'dir. Install scriptleri deny-by-default tutulur; W000 lock'unda lifecycle script izni verilen paket yoktur. Spectral'ın telemetry amaçlı `@scarf/scarf` script'i açıkça reddedilir. `pnpm-lock.yaml` review edilmeden dependency yükseltilmez.

## W001 için production dependency ön değerlendirmesi

- `pgx/v5 5.10.0` — MIT; PostgreSQL driver/pool. TLS, timeout ve pool davranışı integration test ister.
- River `0.45.0` — MPL-2.0 ve pre-1.0; tüm River modülleri aynı sürümde, migration/retry/rollback kanıtıyla tutulur.
- oapi-codegen runtime/middleware — Apache-2.0; generator ve runtime birlikte yükseltilir, transitive `kin-openapi` keyfî override edilmez.
- `openapi-fetch 0.17.0` — MIT ve pre-1.0; ince local adapter arkasında izole edilir.

Bu kayıt ekleme izni değildir; W001 task'ı gerçek producer/consumer, lisans, SBOM, vulnerability ve rollback kanıtını yeniden doğrular.

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
