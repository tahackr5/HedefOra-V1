# W001 R-016 Evidence

> Orchestrator-owned living evidence. Bu dosya yalnız exact SHA/tree, literal command/exit ve doğrulanmış artifact kimliğiyle PASS kaydeder.

## Scope

W001 runtime davranışından önce aşağıdaki telafi paketi zorunludur:

1. pinned OSS SAST,
2. pnpm'in iki lock dokümanı ve Go manifest/modül kapsamının tamamı için vulnerability taraması,
3. açık SPDX license allow/deny ve unknown-license fail-closed politikası,
4. scanner/rules/config/advisory DB identity,
5. dev/unknown vulnerability, disallowed/unknown license, missing/stale DB, parse/timeout/internal/network negatif fixture'ları.

CodeQL Default Setup ve Dependency Review kullanılabildiği sürece exact target üzerinde ayrıca çalışır; branch/ruleset enforcement ayrı doğrulanır. Yerel R-016 hiçbir hosted sonucu yeniden adlandırmaz. R-016 artifact'ındaki `github-context-claim` ve `visibilityProof=false` hosted kanıt değildir; hosted `PASS` authenticated GitHub run/job/artifact digest'i ile indirilen internal evidence SHA-256/source seal'i dışarıdan bağlanmadan verilemez.

> 2026-08-31 geçiş notu: Aşağıdaki `9ec363c`/evidence v1 PASS kayıtları DEC-024 private-only bağlamının tarihsel kanıtıdır ve current DEC-025 sonucunun yerine geçmez. Current public use-boundary verdict'i exact bootstrap head `ac637de`, merge `1dbc81b` ve aşağıdaki local/hosted evidence/schema v2 replay zincirinde `PASS`tir.

## Gitleaks fingerprint protected-control remediation

- Runtime PR [#4](https://github.com/tahackr5/HedefOra-V1/pull/4) exact `ccb345dd529da6baa7537e516eba205476cec6b2` için push CI run `33539918465`: R-016 first-party source boundary ve supply-chain job'ları `SUCCESS`; `W001 quality gates` yalnız pinned Gitleaks `v8.30.1` full-history taramasında `101 commits scanned`, `leaks found: 3`, exit `1` nedeniyle `FAIL`. Aynı head için trusted PR run `33540214177` ve CodeQL run `33540211506` `SUCCESS`; bu sonuçlar farklı bir head'e taşınmaz.
- Redacted exact-finding replay, üç bulgunun `dbfa70715f5b684b34d743ecd05e2827fe8a60e9` commit'indeki aynı public UUIDv4 RequestID fixture'ı olduğunu doğruladı: `internal/platform/health/service_test.go:13`, `internal/platform/http/handler_test.go:20`, `internal/platform/telemetry/telemetry_test.go:80`; rule `generic-api-key`. Değer authentication/authorization/entitlement/credential akışına ulaşmaz; güvenlik etkisi `INFO`, CI bloke etkisi `MEDIUM`, confidence `HIGH` olarak sınıflandırıldı. Hosted FAIL, patch öncesinde PASS olarak yeniden adlandırılmadı.
- İlk target-controlled `.gitleaksignore` + standalone test adayı full-history scan'i temizledi; fresh bypass review bu iki girdinin birlikte genişletilebildiğini `FAIL` buldu ve aday runtime worktree'den kaldırıldı. R-022, exact ignore byte'larının R-016 base-controlled protected path/mode/stage/OID parity'sine alınmasını ve control-plane-only iki-aşamalı owner gate'ini zorunlu kılar.
- W001-T03A canonical patch yalnız üç exact commit:path:rule:line fingerprint'i, protected `run/contracts` parity listeleri ve protected exact-byte/mutation testlerini kapsar. OpenAPI/runtime/DB/event/job davranışı değişmez. Yeni implementation/seal SHA'ları, pinned Node/full-tree, Gitleaks history+sibling canary, ownership, local R-016, security/cold ve uygulanabilir hosted sonuçlar oluşana kadar final verdict `NOT_RUN`dır.
- Control implementation `b930446ce3abe9a18e8656faa6ebfe81680e677c`; tree `b1703d9a7327dbe3341f037646ba87b8af820c29`; parent exact trusted base `1dbc81b57e4809ce7ba0f530cab946ee0540ea71`. Değişen on path yalnız `.gitleaksignore`, protected R-016 runner/contract testleri ve atanmış delivery/state kayıtlarıdır; runtime/API/DB/event/job source değişmedi.
- Clean disposable clone exact implementation taraması pinned `ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f` ile `109 commits scanned`, yaklaşık `1.85 MB`, `no leaks found`, exit `0`; aynı `generic-api-key` kuralındaki ignore dışı sibling stdin canary `leaks found: 1`, raw exit `1` verdi. İlk linked-worktree/target-controlled aday probu bu exact clean-clone sonucu yerine kullanılmadı.
- Exact implementation full-tree: Node `24.20.0` / pnpm `11.24.0` `pnpm ci:check` repository `132/132`, web `3/3`, build `16` module, generated/work-marker/license/production audit exit `0`. İlk wrapper çağrısı alt süreç PATH'inden Node `24.19.0` bulup source testlerinden önce exit `1` verdi; exact tool PATH düzeltildikten sonra kanonik koşum geçti. Pinned Go `1.26.7`/linux-amd64, network-none/read-only source/nonroot/cap-drop container'da format/mod/list/build/vet/shuffled test/race exit `0`; önceki VCS-stamp ve `noexec` tmpfs harness denemeleri PASS sayılmadı.
- Bu implementation checkpoint final seal değildir. State promotion, continuous ownership manifest + manifest-only seal, sealed-head local R-016/full-tree, fresh security/cold review ve uygulanabilir hosted sonuçlar `NOT_RUN` kalır; eski base protected bytes değiştiği için bu control PR'ın trusted-base R-016 sonucu beklenen fail-closed'dur ve `PASS` diye adlandırılamaz.

## Opening identity

- Immutable start commit: `bde560f182032e1e4ec9f1a1b02db4cd8ec5e99b`
- Start tree: `7a2ae76ee31b6c85ec5b3839c78306cde2bd3f23`
- Branch/worktree: `codex/w001-supply-chain-gates` / OneDrive dışı W001 worktree
- External mutation: owner repository'yi public yaptı; preflight sırasında Dependency Graph/vulnerability alerts etkinleştirildi, Default CodeQL ile çakışan Advanced workflow GitHub ayarında `disabled_manually` yapıldı. VPS/SSH/Cloudflare/DNS untouched.

## Trusted runtime checkpoint `1dbc81b`

- PR #3 reviewed head `ac637de57d4f7c3a7f51c4933365f596e0b3817b`, tree `8e6973a69f8f9551a29c8f301d59961113cf4e70`; owner tarafından exact SHA ile onaylandı. Merge commit `1dbc81b57e4809ce7ba0f530cab946ee0540ea71`, ordered parents `bde560f182032e1e4ec9f1a1b02db4cd8ec5e99b` + `ac637de...`; merge tree approved head ile content-identical. PR #3 GitHub state `MERGED`.
- Pre-merge exact head local full-tree, public R-016, hosted CI/R-016 provenance, dört dilli CodeQL, final security ve fresh cold review `PASS`; release-blocking finding `0`. Bootstrap base trusted runner taşımadığı için PR trusted-base gate'i `NOT_RUN` kaldı.
- Post-merge clean detached clone: exact Node `24.20.0`/pnpm `11.24.0` frozen install; repository `132/132`, web `3/3`, `%100` coverage, build ve audit; pinned Go `1.26.7`, Python `3.12.13`, actionlint, Gitleaks, Compose, W000 history, W001 `-merge-wrapper`, Git diff/status/fsck exit `0`.
- Local R-016 run `20260831T031233883Z-23152-26b0ce37`: `PASS/0`; evidence SHA-256 `4719905fe860ca51a217d7c14051c9760b2c91e7a4bb344d43e0c29c600effb0`; DB seal `5e4001de9709bada5da22a5d637bc4fdfe6b4128fd3d1e172a19381f65ce4f52`. Independent replay: 340/340 raw, 170 process + 18 terminal, 34/34 cleanup, schema/error `0`, artifact Gitleaks temiz.
- Hosted CI run `33352637930` attempt 1 `push/main`: source boundary `99368813059`, quality `99368829744`, R-016 `99368829653`, tüm step'ler `success`. Artifact `9744156010`; GitHub digest ve indirilen ZIP SHA-256 `13a192f983be2972d90ec47fb35b961fb2cd3e5105fcbcdc2b93ddaedbb50be1`; 342 safe entry.
- Hosted evidence run `20260831T030446435Z-2164-0f7702c6`: evidence SHA-256 `ae5a6468fe2f09cf57a0483aaf5b882f4ce9a1b24d45e0caa1b7c8adef857975`; DB seal `f23efb4709eb555e58fc13cb0e78843e7991032bee076f60089d15d045eddb13`; 52 repository input, 188 check, 340/340 raw ve 34/34 cleanup yeniden doğrulandı.
- CodeQL Default Setup run `33352636921`: Actions `99368812989`, JavaScript/TypeScript `99368813096`, Go `99368813151`, Python `99368813167`; dört analiz `success`, result count `0`, `main` açık alert `0`.
- Residual: server-side branch/ruleset enforcement `R-014/BLOCKED_EXTERNAL`. Yeni runtime PR'ı trusted-base R-016 + Dependency Review + CodeQL ve ayrı exact-head owner merge onayı almadan ilerlemez. VPS/SSH/DNS/Cloudflare mutation yapılmadı.

## Gate state

### T04B oapi-codegen dependency admission — BLOCKED_EXTERNAL

- Exact assessment base: `dd0189f3f42e1dfea5929c8aa5f5c3050199c797`, tree `0648bee989c4caf64dc2a17731334732bb3b082e`.
- `oapi-codegen v2.8.0`, `runtime v1.7.0`, `nethttp-middleware v1.2.0` ve `openapi-typescript 7.13.0` hedef Go `1.26.7` / Node `24.20.0` / pnpm `11.24.0` compatibility probe'larında çalıştı; lisanslar sırasıyla Apache-2.0/Apache-2.0/Apache-2.0/MIT olarak doğrulandı.
- Dependency admission sonucu `NO-GO`: official `GHSA-9c2f-gr95-7wqw`, `oapi-codegen` için affected range `HEAD`, patched version boş bildiriyor. Exact `v2.8.0` source incelemesi `x-go-type-import.name` değerinin generated Go import alanına doğrulanmadan taşındığını bağımsız teyit etti.
- Recursive `x-go-type-import` Spectral yasağı ve exact negative fixture defense-in-depth'tir; known-vulnerable generator admission'ını PASS yapmaz. `oapi-codegen`, Go runtime/middleware, `openapi-typescript` veya başka runtime dependency lock'a eklenmedi; generated Go/TypeScript, `cmd/**` ve `internal/**` artifact'ı üretilmedi.
- Independent security verdict `SEC-PRE-001 HIGH / release-blocking`: patched pinned upstream beklemek önerilir. Local generator mevcut task'a örtük ikame olamaz; DQ-007 owner kararıyla ayrı security-critical compiler task'ı, exact-health-only input, interpolation/ref/extension rejection corpus'u, deterministic byte parity ve fresh security review ister.

#### T04C contract-only preflight — PASS

- Safe T04C contract-only preflight, `GET /health/live` için exact path/method/callback-free operation, `200` ve dedicated `503 ServiceUnavailableError`, closed error/request-id/header/component allowlist'leri tanımlar. `503` şeması `service_unavailable`, `retryable: true` ve bounded zorunlu retry süresini; response `Retry-After`, `no-store`, `nosniff`, `Vary: Accept` ve yeni request ID sınırını korur.
- Resolver öncesi raw preflight dış/obfuscated/dynamic/recursive reference, kaçış syntax'ı, NUL/bare-CR, invalid UTF-8 ve 512 KiB üstü girdiyi bloklar; Spectral subprocess 15 saniye/2 MiB ile bounded ve boş/bozuk/non-array JSON, stderr, timeout veya launch failure fail-closed'dur. Kanonik kaynağın tek doğrulanmış byte snapshot'ından üretilen 33 mutation'ın her biri yalnız kendi exact `w001-*` tanısını üretti; external server origin ile RequestId `nullable`/`x-go-type` drift'leri ayrıca kapatıldı.
- Exact Node `24.20.0` / pnpm `11.24.0`: validator unit `18/18`; `pnpm ci:check` exit `0`, repository `150/150`, web `3/3` ve `%100` coverage, 16-module build, generated/work-marker/license ve production audit `PASS`. Frozen install lock drift üretmedi; `package.json`, `pnpm-lock.yaml`, Go modülleri ve runtime root'ları değişmedi.
- Final read-only security re-review, staged code snapshot `379ac5c07994d1113630e773cdff74cc69b8ea81`, `.spectral.yaml` blob `3e3143e2dc46ca36cccbab185ae3562fde9ff39c` ve mutation corpus blob `6576b39f71900b002ee8df91d835e55ddf92e49c` için contract-only `PASS` verdi. İlk incelemedeki iki LOW bulgu — external server origin ve RequestId ek keyword/`x-go-type` drift'i — üç bağımsız in-memory probeda kendi exact kuralıyla exit `1` üreterek kapandı; yeni finding `0`. Reviewer Node `24.20.0` full-CI kanıtını orchestrator kanıtı olarak tuttu ve repository/index/ref'i değiştirmedi.
- Bu tarihsel contract-only preflight kendi başına generated parity veya runtime PASS değildi. Güncel generated-Go ve public runtime sonucu aşağıdaki T04C/T04D exact checkpoint'inde kaydedilir; runtime PR/hosted gate'leri ayrıdır. VPS/SSH/DNS/Cloudflare mutation yapılmadı.

### T04E exact-health sealed renderer — PASS

- Owner 2026-08-31'de upstream patch beklemek yerine affected `oapi-codegen` hiç kullanılmadan güvenlik-kritik local generator stratejisini açıkça onayladı. DQ-007, DEC-027/ADR-0017 ile exact-health-only, zero-dependency ve tek-output sealed renderer olarak çözüldü.
- Canonical input `contracts/openapi/openapi.yaml`: LF-only `5604` byte, SHA-256 `5d157cd1d6627d781030212454ceaa075e994cdfa22a6f1f1929d26265af85ab`. Planned output yalnız `internal/generated/openapi/openapi.gen.go`; spec kaynaklı identifier/import/path/template interpolation yasaktır.
- Initial implementation `b25ff7d8df8690d69d7333fc7a52482de6ab1fbf`, first seal `06aac2c89390b438cde7c8c12c91e3e228a23bf8` üzerinde independent review filesystem okumasının limitten önce tüm dosyayı belleğe aldığını `SEC-GEN-007/QA-T04E-001` olarak release-blocking buldu; exact head `FAIL` kaldı. Remediation `0bbea9532ebf3b76d27e5dd9e7be9abaf3e7e3e2`, ownership seal `959e128ea5fd0191b4283293fbe49f2a854b0aa6`, tree `42069f70d14626ece232b4184c7e80f776fa8e2a`.
- Filesystem source/output okumaları artık pre-open ve handle `stat` limitini, `O_NOFOLLOW`, `dev/ino/size` kimliğini, en çok `limit+1` byte short-read-aware döngüyü ve post-read growth/shrink kontrolünü uygular. Filesystem-backed `64 KiB+1` source ve `32 KiB+1` output fixture'ları stable error, zero-output ve mevcut output digest korunmasını doğrular. Temp dosya izni açık handle üzerinden uygulanır; rename/cleanup öncesi single-link ve exact inode kimliği yeniden doğrulanır.
- Exact Node `24.20.0` / pnpm `11.24.0`: canonical Spectral + `33/33` contract mutation; generator-specific `20/20` mutation; generator/boundary suite `16/16`; full `pnpm ci:check` repository `163/163`, web `3/3`, `%100` scaffold coverage, 16-module build, deterministic generated hash `d5dbb7623e3c9603be2f580ccae07600fa3f86df8b03a740f9a1c9a068a872bd`, audit/license/work-marker/drift kapıları exit `0`.
- Pinned Go `1.26.7`, network kapalı ve repository read-only: gofmt, module verify, `go build -mod=readonly -trimpath ./...`, vet, uncached test ve race exit `0`. İki önceki harness denemesinde Docker Desktop tmpfs test binary'lerini çalıştırmadığı için permission-denied `FAIL` oluştu; bayrağı değiştirmek yeterli olmadı, tmpfs mount kaldırılan üçüncü exact koşum `PASS` verdi. Bu iki sonuç geriye dönük yeniden adlandırılmadı.
- Exact local R-016 run `20260831T072320728Z-5884-699083a3`: `PASS/0`, source/control `959e128...`, tree `42069f7...`, 194 check ve 352 raw artifact; evidence SHA-256 `8e4b057c75a14c2fdd59c53e89426022fbbb2d0c3921659f335006d9466fe015`, DB seal `17dc3b8600ee6a33da68ba21728f3a4d59a16e3a3ae3e354f3327856197376c2`. Önceki yanlış Docker path `FAIL/21` ve geçici DB DNS `FAIL/22` artifact'ları korunur; sonraki PASS onları yeniden adlandırmaz.
- Post-fix independent security ve quality verdict'leri exact `959e128...` için `PASS`; generator blocker `0`. Trusted single-writer boundary'sini ihlal eden eşzamanlı yerel writer'ın final identity-check ile rename/unlink arasındaki dar TOCTOU penceresi LOW/non-blocking residual olarak açıkça tutulur.
- `oapi-codegen`, runtime ve nethttp middleware manifest/lock/tool directive'ine eklenmedi ve çağrılmayacaktır. TypeScript consumer parity ayrı task/gate'tir; T04D public HTTP davranışının güncel sonucu aşağıdaki exact checkpoint'te tutulur. VPS/SSH/DNS/Cloudflare mutation yoktur.

### T04C bounded Go parity ve T04D sealed runtime — PASS

- Runtime task base `f9dbf65c767d2f19a5381fff8607536239c3a4a9`; implementation `dbfa70715f5b684b34d743ecd05e2827fe8a60e9`. Kaydedilen üç remediation/seal çevriminin son kod head'i F3 `759e338cbc868e63bc10d0b70ae4fe2836f4cc83`, manifest-only ownership seal'i S3 `057a1976dd157b0225e3e7530998e7ac6abae217`, tree `a6cd96a1b9721b75fc222d11b97289457ae3ce05`'tir. Manifest `verifiedThrough=F3` taşır; S3 yalnız `state/W001-OWNERSHIP.json` dosyasını değiştirir.
- Explicit `api` process mode, exact environment allowlist, bounded server/drain timeout'ları, `crypto/rand` ile seed edilen HMAC-SHA256/counter UUIDv4 request ID, allowlisted structured telemetry, raw header/server-error bastırma, exact path/method/query/body/Accept sınırı, typed `200/503`, one-way drain, inflight wait ve bounded shutdown/forced close unit ve gerçek-listener integration testleriyle doğrulandı. PostgreSQL/readiness, River ve scope dışı altyapı eklenmedi.
- İlk source-boundary review bulgusu `csf_0cea8102b59b600c83e3c041` ve takip eden `SEC-CMD-PATH-001` ile `SEC-INTERNAL-INVENTORY-002` F3'te `FIXED` oldu. Validator recursive physical `cmd` + `internal` inventory, literal-backslash alias reddi ve exact allowlist ↔ regular physical path ↔ tracked Git index ↔ blob OID parity uygular; intent-to-add, hidden index tag'leri, invalid stage/mode, symlink/gitlink/unmerged ve nonregular girdiler fail-closed'dur. `.s`, `.S`, `.syso`, extensionless ve ignored/embed hostile regression'ları Windows ve Linux'ta kapsanır.
- Pinned Node `24.20.0` / pnpm `11.24.0`: Windows boundary suite `13` testte `11` pass + `2` Linux-only skip; pinned Linux suite `13/13`. Full `pnpm ci:check` exit `0`: repository `172` testte `170` pass + `2` platform skip, web `3/3`, coverage/build, contract/generated drift, marker, license ve production audit `PASS`. İlk nested-pnpm denemesi yanlış Node `24.19` çözümlediği için test başlamadan başarısız oldu; exact PATH rerun sonucu değiştirmeden `PASS` verdi.
- Pinned Go `1.26.7`, network kapalı/read-only/cap-drop container: gofmt, `go mod verify`, `go list -m all`, build, vet, uncached shuffled test ve race testlerinin tamamı exit `0`. Repolint, historical wave start'tan F3'e kesintisiz ownership ve S3'e tek allowlisted JSON endpoint ile exit `0`; ilk repolint çağrısındaki eksik zorunlu `-base` invocation hatası korunup doğru literal çağrı ile tekrarlandı.
- Exact local R-016 run `20260901T105938160Z-11036-15ac993a`: `PASS/0`; source/control S3, evidence SHA-256 `586c6048498ac5a614d9d5e19ec1b729cfd0b5e54c343c68829c51ae630caa07`, DB seal SHA-256 `d17d8b4d99fb9d67fb5694de1968efa85f762612645dba7d7a8ac0726f6bdd3f`. Bağımsız stdlib replay exit `0`: `190` process + `18` terminal, `380/380` raw, `34` cleanup ve `192` tracked dosya; disk/index/source/control/DB bağlarında mismatch `0`. Artifact `local-declaration` ve `visibilityProof=false`; hosted authority değildir.
- Exact S3 bağımsız security ve fresh cold review verdict'leri `PASS`; yerel release blocker `0`. Dar handler-scope alt raporunun RequestID/drain/timeout negatifleri, production telemetry ve app-level gerçek-listener kanıtı üzerinden bağımsız ana incelemede yanlış negatif olarak adjudicate edildi. Multi-read Git/filesystem kontrolünün eşzamanlı yerel writer altındaki dar TOCTOU penceresi R-021 residualıdır.
- Gerçek TypeScript consumer task/gate'i açılmadı; `NOT_RUN` ve `PASS` dışıdır. Runtime trusted-base PR/R-016, Dependency Review ve CodeQL bu henüz push/PR yapılmamış target için `NOT_RUN`; bootstrap sonuçları S3'e taşınmaz. R-014 branch/ruleset enforcement `BLOCKED_EXTERNAL` kalır ve exact-head owner merge gate'i pending'dir.
- Reviewer'ın bıraktığı repository dışı tek bir geçici `.tar` dosyasını kaldırma denemesi desktop güvenlik politikası tarafından execution öncesinde reddedildi; repository/artifact değişmedi ve bu cleanup olayı hiçbir gate'i `PASS` olarak yeniden adlandırmadı. VPS/SSH/DNS/Cloudflare mutation yapılmadı.

| Gate                                    | Status           | Evidence                                                                                                                                                       |
| --------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave opening identity/ownership         | PASS             | Kesintisiz ownership `bde560f` → verified implementation `37543b1`; manifest-only trailing seal `9ec363c`; pinned Go 1.26.7 repolint exit `0`                  |
| Scanner and rules research              | PASS             | OSV 2.5.1, Semgrep CE 1.175.0 nonroot, Go 1.26.7 ve semgrep-rules exact identities; multi-doc false-clean probu `19` vs `19+527`                               |
| Historical SAST implementation          | PASS             | DEC-024/evidence v1 exact `9ec363c`: 36/36 Git kaynağı, CE/OSS-only repository exit `0`; current public use-boundary yerine geçmez                             |
| Dependency vulnerability implementation | PASS             | Exact `9ec363c`: iki pnpm dokümanı + Go manifest, 546 package/2 source parity; production raw exit `0`; npm+Go fresh DB identity/seal                          |
| License implementation                  | PASS             | Exact `9ec363c`: 546 package/2 source exact parity, deps.dev raw exit `0`; npm denied/unknown ve Go GPL canary raw exit `1`                                    |
| Negative fixtures                       | PASS             | Missing DB `127`; npm unknown/development vulnerability, Go advisory, npm/Go denied/unknown license ve Semgrep canary'leri beklenen nonzero exit ile bloklandı |
| Historical exact-target local/full-tree | PASS             | DEC-024/evidence v1 exact `9ec363c`: Node `126/126`, supply-chain `114/114`, web `3/3`; current remediation target yerine geçmez                               |
| Quality evidence review                 | PASS             | Exact `9ec363c` / `1e57e62`; 187 check, 340 raw artifact, DB/source/control/process/terminal bağları; bloklayıcı bulgu yok                                     |
| Bootstrap security review               | PASS             | Exact bootstrap head `ac637de` / tree `8e6973a`; final read-only verdict `PASS`, local finding ve release blocker `0`; R-014 residual ayrı tutuldu             |
| Bootstrap cold review                   | PASS             | Fresh-context exact `ac637de` / tree `8e6973a` verdict `PASS`; runtime foundation tamamlandı iddiası yapılmadı                                                 |
| Public use-boundary evidence/schema v2  | PASS             | Exact `ac637de` pre-merge ve content-identical `1dbc81b` post-merge local/hosted R-016; iki evidence replay 340/340 raw, 34/34 cleanup, schema v2 `PASS/0`     |
| GitHub exact-head/main quality          | PASS             | Pre-merge run `33349062559`; post-merge run `33352637930`, exact `1dbc81b`: source boundary, quality ve R-016 jobs `success`                                   |
| Bootstrap trusted-base PR gate          | NOT_RUN          | Wave-start base trusted workflow/runner taşımıyordu; bu PR için hosted trusted `PASS` iddia edilmez ve geriye dönük yeniden adlandırılmaz                      |
| Bootstrap hosted CI/CodeQL/provenance   | PASS             | CI `33352637930`, CodeQL `33352636921`, artifact `9744156010`; authenticated run/job/workflow/artifact/evidence zinciri exact merge SHA'ya bağlandı            |
| T04D ownership/full-tree                | PASS             | Exact F3/S3; repolint, Node full tree, pinned Linux boundary ve pinned Go build/vet/test/race exit `0`                                                         |
| T04D local R-016                        | PASS             | Run `20260901T105938160Z-11036-15ac993a`; evidence `586c6048...`; DB seal `d17d8b4d...`; independent replay mismatch `0`                                       |
| T04D security/cold review               | PASS             | Exact S3 / tree `a6cd96a`; üç boundary finding `FIXED`, yerel release blocker `0`                                                                              |
| Runtime trusted PR/R-016                | NOT_RUN          | Exact S3 committed/sealed fakat push/PR yapılmadı; merge öncesi trusted-base hard gate                                                                         |
| Runtime Dependency Review               | NOT_RUN          | Yeni runtime PR yok; bootstrap sonucu runtime target'a taşınmaz                                                                                                |
| Runtime CodeQL                          | NOT_RUN          | Yeni runtime PR yok; bootstrap CodeQL sonucu runtime target'a taşınmaz                                                                                         |
| Branch/ruleset enforcement              | BLOCKED_EXTERNAL | `R-014`; owner-controlled exact-head/two-parent protokolü server-side direct/force/delete koruması değildir                                                    |

## Public remediation implementation checkpoint

- DEC-025/ADR-0015 ve evidence/schema v2 implementation commit'i `62c1f7d5201da56f240f3e04fc6f5969190320eb`; tree `4855e422bafcc7f088d480514702bdf57124e83a`.
- Exact Node `24.20.0` / pnpm `11.24.0` dirty-worktree preflight `pnpm ci:check`: Node `129/129`, web `3/3`, build, generated/work-marker/license ve production audit exit `0`.
- Pinned Go `1.26.7` format/module verify/vet/test; Python `3.12.13` validator `4/4`; actionlint `1.7.12`; Compose config exit `0`. Exact Gitleaks `8.30.1` history/all-refs/current diff ve tarihsel `artifacts/r016` taramalarında leak bulmadı.
- Pre-commit architecture/contracts ve security review ilk fork-head checkout açığını yakaladı; ilk düzeltme aynı normal PR workflow'u içinde checkout'suz boundary ekledi. Sealed `c59a46e` final security review'u workflow dosyasının kendisi head-kontrollü olduğundan bu yaklaşımı yetersiz buldu; sonraki remediation first-party push/base-controlled PR ayrımına geçti. Preliminary verdictler final security verdicti yerine geçmez.
- Bu checkpoint final kanıt değildir: ownership manifest seal, clean exact-target live R-016 evidence v2, full-tree, hosted CodeQL/Dependency Review/quality, final security ve fresh cold review `NOT_RUN` kalır.
- İlk sealed head `64817bf` GitHub run `33346034408`: checkout'suz source boundary ve Dependency Review `PASS`; quality Node `129/129`, web `3/3` ve build sonrası `state/W001-EVIDENCE.md` içindeki literal marker'ı reddederek exit `1` verdi. Bu sonuç yeniden adlandırılmaz; metin düzeltmesi yeni exact SHA'da tüm gate'leri tekrarlar.

## Sealed `c59a46e` doğrulaması ve güvenlik reddi

- Exact target `c59a46e8cd466620f5654708a2b1cac8c0371683`; tree `aaeb2b9a64c3b3bbb442ef2a4136e90450bf95ef`; W001 trailing ownership seal ve temiz worktree doğrulandı.
- Clean exact-target quality: Node `24.20.0` / pnpm `11.24.0`, frozen install ve `pnpm ci:check` exit `0`; repository `129/129`, web `3/3` ve `%100` coverage; build `16` module. Pinned Go `1.26.7` format/mod/vet/test, Python `3.12.13` `4/4`, actionlint `1.7.12`, Gitleaks `8.30.1`, Compose, W000/W001 ownership ve Git integrity exit `0`.
- Live public R-016 run `20260831T010437018Z-5720-b60278dd`: `PASS/0`; evidence SHA-256 `7fbefe300fb4e04dc40cf82e4249580b217677e192d76fbe899b1e140645438d`; exact source/control SHA/tree, `local-declaration`, public, same-repository/non-fork. Bağımsız rehash `340/340`, extras/missing `0`; `170` process + `18` terminal; `36` source; `22` rule/license lock; `2` DB. Rule stream'leri redacted, on-disk locked rule byte eşleşmesi `0`; artifact Gitleaks `737855` byte üzerinde exit `0`.
- GitHub CI run `33346361363` `SUCCESS`; source boundary, W001 quality ve Dependency Review başarılı. Default CodeQL run `33346359820` exact head'i Actions, Go, JavaScript/TypeScript ve Python için taradı; dört analiz de `SUCCESS`, open alert `0`. R-016 supply-chain job PR olayında skipped olduğundan hosted R-016 `PASS` sayılmadı.
- Final security verdict `FAIL`: `F01/HIGH` normal `pull_request` workflow dosyasının PR merge-ref'inden gelmesi nedeniyle kendi boundary'sini uygulayamaz; `F02/MEDIUM` environment kaynaklı detached artifact `github-event/visibilityProof=true` iddiası gerçek run provenance'ı değildir; `F03/MEDIUM` public durumdayken ham revert eski foreign checkout'u geri açabilir. Runtime JSON Schema `maximum` parity'si ve Semgrep `engineLicense` lock enforcement eksikliği LOW olarak kaydedildi.
- Remediation normal `pull_request` tetikleyicisini kaldırır; CI yalnız owner repository `main` + `codex/**` push'larında çalışır. PR enforcement default-branch kontrollü `pull_request_target` boundary'sidir; Dependency Review head checkout etmeden API karşılaştırması yapar. Artifact authority `github-context-claim`/`visibilityProof=false` olur ve hosted verdict dış authenticated provenance bağı ister. Rollback public durumda yasaktır; private-first sırası zorunludur. Schema `maximum` ve supported-keyword parity'si ile exact Semgrep engine-license lock'u enforce edilir.
- Dirty-worktree preflight: targeted exact Node `57/57`; full `pnpm ci:check` repository `130/130`, web `3/3`, build/generated/marker/license/production audit exit `0`; `git diff --check` exit `0`. Bu preflight yeni commit/seal/full review yerine geçmez.
- Security remediation implementation commit'i `26a8515ee008c34a551d172abc7646c3ce8f74b3`; tree `dd506acfb39cc494fdde9e65d2f11d7021c13c20`. Commit, normal PR trigger'ını kaldırır; base-controlled Dependency Review'u checkout'suz yapar; artifact authority'sini claim'e düşürür; private-first rollback, schema `maximum`/keyword parity ve Semgrep engine-license lock'unu enforce eder. Bookkeeping/manifest-only seal ve bu seal üzerindeki exact local/hosted/security/cold kanıtı `NOT_RUN` kalır.

## Sealed `f435545` Linux hosted tanısı

- Exact target `f43554592428a2a0d779a110c66bff2af9c68d6a`; tree `85f4d99d96bd60e9759b6db10fa542fd67a26634`; security remediation ownership seal'i ve clean detached clone doğrulandı.
- Clean detached local R-016 run `20260831T013636767Z-17728-b1f5ba0c`: `PASS/0`; canonical evidence SHA-256 `fe566e2f04ba32443205c2066df22b869b12ebe7db8d8d8942b70ff5210f9723`; exact source/control SHA/tree, `local-declaration`, public, same-repository/non-fork; `188` check ve `340` raw artifact. Bu yerel tanı hosted sonucu yeniden adlandırmaz.
- GitHub push run `33348065572` exact head'de `FAIL`: checkout'suz source boundary `PASS`; quality job `99355934319` tek-parent branch push'ına `-merge-wrapper` uyguladığı için ownership doğrulamasında bloklandı; supply-chain job `99355934326` gate'i çalıştırdı ve artifact yükledi, fakat final temporary cleanup host `osv-empty-cache` dizinini `0555` yaptığı için Linux `EACCES` ile başarısız oldu.
- Pinned-image Linux ownership probu, Go ve DB validator cache host bind'lerine UID/GID `65534:65534` ile yazılan nested `0755`/`0644` girdilerin de runner tarafından recursive silinemeyeceğini doğruladı. Yalnız ilk görülen empty-cache hatasını düzeltmek yeterli değildir.
- Remediation quality merge-wrapper'ını yalnız `refs/heads/main` için etkinleştirir; empty cache'i deterministik host-owned `0755` tutup container'a read-only bağlar; `go-module-cache`, `go-build-cache`, `dbcheck-build-cache` ve `dbcheck-module-cache` host RW bind'lerini kaldırır. `GOCACHE=/tmp/gocache` ve `GOMODCACHE=/tmp/gomodcache`; Go inventory mevcut bounded `128m/noexec`, DB `go run` mevcut `512m/exec` tmpfs'i kullanır. Sabit nonroot UID ve read-only source/DB mount'ları korunur.
- Dirty-worktree targeted exact Node `59/59`, pinned actionlint ve `git diff --check` exit `0`. `f435545` hosted sonucu `FAIL` kalır; remediation implementation/bookkeeping commit'i, manifest-only seal, clean exact local/full-tree/hosted/security/cold sonuçları `NOT_RUN`dır.

## Exact live PASS

- Run: `20260830T161336169Z-21508-ba1aab96`
- Target/control: commit `9ec363c6515de20eea5bd9c9ffd036dad957da6b`; tree `1e57e62768d0e73e1797f64933e31ed5d658da74`; tracked file count `175`; source ve control index SHA-256 `9a0639b25863fe12ed34ca6ea91e45e02e3aca9c11d1198fee63044546d9827f`.
- Artifact: ignored local path `artifacts/r016/20260830T161336169Z-21508-ba1aab96`; canonical `evidence.json` SHA-256 `3e6baec0ce13551233c39e0fca7897ddce34bbbb63bd246fd3d6b61c0de29fb4`; `db-seal.json` SHA-256 `70dedc5a218e20bb040566aad87fb5b03684903f775467c0993e365c391ef278`.
- Inventory: `187` check = `170` process + `17` terminal/seal; `340/340` raw artifact; `36` Semgrep Git source (`30` JavaScript/TypeScript + `6` Go); `29` protected control-plane file; `546` dependency package ve `2` source.
- Production verdicts: vulnerability raw exit `0`, threshold `7`; license raw exit `0`; Semgrep repository raw exit `0`; iki advisory DB archive'ını kapsayan ZIP doğrulaması raw exit `0`.
- Live negatives: missing DB `127`; npm vulnerability unknown/development, Go `GO-2022-1059`, npm denied/unknown license, Go `GPL-3.0-or-later` ve Semgrep blocking fixture raw exit `1`. Büyük/minified Semgrep fixture'ı `1,050,108` byte, `4` satır, ortalama `262,527` byte/satır ve SHA-256 `a62cb7a2da7169d4a075a92fcb05251685b068ad1d3379501c01b09a035fbec3`; 5 exact path üzerinde 7 finding üretildi.
- Advisory DB: npm SHA-256 `f1e71c9bb6c0fc17f7d7ffda9d78359c35be715032b60749cb5c25baeed58b2b`; Go SHA-256 `49b2410b903ae009b3a89ab9be5245d531d0c176b6809931f2182b5ee6bc1204`; same-run generation/header/MD5/SHA-256 ve offline ZIP rehash ile mühürlendi.
- Bağımsız verification: JSON Schema + canonical serialization, 340 raw size/hash, disk inventory, 170 process ownership/reference, 12 process-backed terminal raw/hash korelasyonu, Semgrep/control Git object+byte identity ve DB seal yeniden hesaplandı; sonuç `PASS`, exit `0`. Exact-digest Gitleaks bütün korunmuş R-016 artifact kökünde yaklaşık `3.44 MB` taradı, leak bulmadı, exit `0`.

Canonical evidence, R-016 alt süreçlerinin absolute executable, literal argument ve raw exit'lerini taşır. Clean clone'da ek full-tree komut ledger'ı:

```text
C:\Users\ihsan\AppData\Local\Temp\hedefora-r016-exact-tools-1d171e7\pnpm.cmd install --frozen-lockfile
                                                                    # exit 0; 502 package
C:\Users\ihsan\AppData\Local\Temp\hedefora-r016-exact-tools-1d171e7\pnpm.cmd ci:check
                                                                    # exit 0; Node 126/126, web 3/3
C:\Users\ihsan\AppData\Local\pnpm\store\v11\links\@\node\24.20.0\ef13d213a8cf1ec8966fbd7993e4caf206ef5a991104df60594dc5ed8b99de66\node_modules\node\node.exe --test scripts/supply-chain/*.test.mjs
                                                                    # exit 0; 114/114
$env:EXPECTED_CHECKOUT_SHA='9ec363c6515de20eea5bd9c9ffd036dad957da6b'; $env:EXPECTED_CONTROL_SHA='9ec363c6515de20eea5bd9c9ffd036dad957da6b'; node.exe scripts/supply-chain/run.mjs '--git-binary=C:\Program Files\Git\cmd\git.exe' '--docker-binary=C:\Users\ihsan\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe'
                                                                    # exit 0; PASS R-016
golang@sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514 gofmt/go mod verify/go vet/go test ./...
                                                                    # exit 0
golang@sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514 go run ./tools/repolint/cmd/repolint -manifest state/W001-OWNERSHIP.json -all -base bde560f182032e1e4ec9f1a1b02db4cd8ec5e99b -head HEAD
                                                                    # exit 0
python@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2 python3 scripts/validate_toml.py
                                                                    # exit 0
python@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2 python3 -m unittest scripts/test_validate_toml.py
                                                                    # exit 0; 4/4
rhysd/actionlint@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color
                                                                    # exit 0
ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f git . --redact --no-banner --no-color
                                                                    # exit 0; 62 commit, leak yok
ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f dir artifacts/r016 --redact --no-banner --no-color
                                                                    # exit 0; yaklaşık 3.44 MB, leak yok
docker.exe compose -f infra/compose.dev.yml config --quiet           # exit 0
git diff --check; git status --porcelain=v1; git fsck --no-dangling --no-reflogs
                                                                    # exit 0; temiz
```

## Tarihsel fail-closed live zinciri

Her başarısız artifact korundu; hiçbiri `PASS` olarak yeniden adlandırılmadı. İlk satır dirty-worktree negatif probudur, sonraki yedi satır temiz klon canlı gate iterasyonlarıdır.

| Run                                  | Exact target                         | Exit/artifact SHA-256                                                             | Kök neden ve kapatılan sözleşme                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260828T201807746Z-16588-7d2f8964` | source identity oluşmadan reddedildi | `20`; `9a7040839470177b3ef4f3e73f94c2a1bee12ed06b6bfe7187fb573a4981feb2`          | Dirty repository live gate başlamadan fail-closed reddedildi.                                                                                                                                               |
| `20260830T140610439Z-27892-575e3771` | `1d171e7` / `04a1bf3`                | `21`; `f20af5672b2a61ca2cabd2eeb9a3cc88a297cef5c121f246600f43dab38c0419`          | Docker Buildx bağımlılığı ortamda yoktu; zorunlu olmayan Buildx probe'u kaldırılarak Docker Engine sözleşmesi korundu.                                                                                      |
| `20260830T142637158Z-11960-b3f4d832` | `f631af2` / `5291073`                | `20`; `baf006857aff8dd46c127b58a3352d564dda88dad16266e88ab34a2409b2ff58`          | CRLF normalize edilmiş Semgrep rule hash'i exact Git blob byte'ıyla uyuşmadı; 21/21 rule byte hash'i düzeltildi.                                                                                            |
| `20260830T143307591Z-16368-307318ff` | `28cdd95` / `cbb6884`                | `21`; `12dda84123ea643da4e765c551b6072fff5814a5615803426f864ab5955b5539`          | OSV ZIP entry sınırı gerçek npm DB'yi reddetti; ölçülmüş, bounded `300,000` entry sözleşmesi ve boundary testleri eklendi.                                                                                  |
| `20260830T145211335Z-9796-5846730c`  | `9ba25b2` / `5ea2eba`                | `20`; `56df865da45845ae717099fcbe339073a76d560d9b5faab2f91f38b9ce10d1cb`          | OSV JSON scope taşımadığı halde development scope bekleniyordu; fixture-derived `development` ve scanner-derived `unknown` provenance ayrıldı.                                                              |
| `20260830T152114358Z-26776-e721848a` | `058d2ac` / `01d897c`                | `21`; `e137773e431dc63cdb6f1b466f01d0e9e580145f13abc168263fa6e696358486`          | Semgrep yardımında görünmesine rağmen parser'ın reddettiği `--no-exclude-minified-files` exit `2` üretti; unsupported flag kaldırıldı, default include davranışı büyük/minified live canary ile mühürlendi. |
| `20260830T154550248Z-7556-20775908`  | `adba095` / `b3e8b4f`                | `21`; fallback `8c6e44db775e4925518ad4e71cc6bf94e59645e4a8f68920710f286f23f4d808` | Producer locale-aware, consumer default sıralama kullandığı için control inventory finalization reddedildi; tek `localeCompare(..., "en")` kanoniğine bağlandı.                                             |
| `20260830T155726197Z-22356-a8e40adc` | `22112f6` / `34d58fc`                | `21`; fallback `7b450226b006f602494e35147e8b95c9fc747c1df41a6b4bdb6c78c2ebd28581` | Go container producer `HOME=/tmp/home` gönderirken consumer beklemiyordu; üç etkilenen process için producer-derived golden ve HOME eksiltme mutasyonları eklendi.                                          |

İlk beş temiz-klon failure canonical `evidence.json`, son iki finalization failure bounded `evidence-finalization-failure.json` üretti. Bu zincirde scanner/control hatası, parse/contract hatası veya finalization hatası hiçbir zaman success'e çevrilmedi.

## Bağımsız review verdictleri

- Quality/evidence: `PASS`; exact `9ec363c` / `1e57e62`; 187 check, 340/340 raw artifact, process başına iki stream, 12 process-backed terminal korelasyonu, DB seal ve initial/final source/control seal'leri bağımsız doğrulandı; blocker yok.
- Security: `PASS`; release-blocking bulgu yok. `R016-SEC-01` LOW future multi-module slug collision riski R-017 olarak kaydedildi. Upstream publisher/deps.dev ve hosted enforcement sınırları residual/BLOCKED_EXTERNAL bırakıldı.
- Fresh-context cold review: `PASS`; exact SHA/tree, canonical evidence, source/blob/process semantiği, Node/pnpm full tree ve pinned Go/ownership bağımsız doğrulandı; local finding/blocker yok. Reviewer'ın ilk Go tekrarında `/tmp` yanlışlıkla `noexec` mount edildiği için harness exit `1` verdi; aynı image/kod executable tmpfs ile tekrarlandığında exit `0`, dolayısıyla ürün testi failure'ı değildir.
- Reviewer runtime model/effort metadata'sı platform tarafından expose edilmedi; `UNKNOWN/UNKNOWN` olarak dürüstçe kaydedildi. Review'lar salt-okunur kaldı ve external mutation yapmadı.

## Acceptance notes

- Scanner success with zero parsed inputs/targets is failure.
- pnpm multi-document lock'un tek belgesini taramak failure'dır; package-manager/config ve workspace graph'ları ayrı source identity ve inventory parity taşır.
- Go'da third-party module sayısının sıfır olması yalnız `go list -m all` ve scanner kapsamı gerçekten çalıştıysa PASS olabilir.
- Advisory DB missing, stale, future-dated, hash-mismatch veya parse edilemezse failure'dır.
- Scanner raw exit, signal, timeout, malformed JSON, internal veya network error başarıya map edilmez.
- OSV vulnerability ID'leri severity group'larıyla birebir eşleşir; eksik/duplicate/extra mapping, noncanonical CVSS ve raw-exit/output tutarsızlığı failure'dır.
- Trusted PR koşumunda base SHA checkout'u runner/policy/scanner/rules/schema/fixture/validator Git blob'larını sağlayan kontrol kökü; PR head checkout'u yalnız taranan manifest/lock/source Git blob'larını sağlayan target köküdür. Target script veya action'ı çalıştırılmaz; iki kök ayrıdır ve birbirini içeremez.
- Base runner importundan önce current transitive production module setinin tamamı stage-0 `100644` Git blob, working-tree hash equality, regular/non-link dosya ve control-root realpath olarak bootstrap shell tarafından doğrulanır; test bootstrap listesini gerçek import closure'ına bağlar. Her split-root koşum target ve control için exact expected SHA ister; local koşum bu bağı atlayamaz.
- Split-root koşumunda protected control-plane path, mode, stage ve Git object ID seti base ile target arasında birebir eşleşmeden config okunamaz veya scanner başlatılamaz. Target ve control HEAD/tree/index/status/hidden-flag kimlikleri ayrı mühürlenir.
- Ağ açık container'lar repository içeriğini mount edemez; Semgrep tracked source parity ve cleanup sonucu evidence yazılmadan doğrulanır.
- Yerel koşum absolute `--git-binary` ve `--docker-binary` ister; hosted koşum yalnız `/usr/bin/git`, `/usr/bin/docker` ve trusted toolcache Node'unu kabul eder. Executable'lar regular/non-link, root sınırları dışında ve hash-mühürlüdür; Git/Docker config/routing environment'ı temizlenir.
- Detached artifact hiçbir zaman hosted authority üretmez. `github-context-claim` ve `visibilityProof=false`, yalnız workflow'un beyanıdır; hosted `PASS` authenticated GitHub API run/repository/event/workflow/head/job/artifact digest bağını, raw ZIP rehash'ini ve internal evidence SHA/source seal eşleşmesini ayrıca ister.
- Normal `pull_request` workflow'u güvenlik boundary'si olamaz. First-party quality/R-016 yalnız owner repository push'unda; PR boundary, Dependency Review ve trusted split-root R-016 yalnız default-branch controlled `pull_request_target` workflow'unda çalışır. Public rollback private-first sıra doğrulanmadan eski workflow tree'sine dönemez.
- PASS evidence zorunlu her process için literal command, raw exit ve iki raw stream artifact'ını; terminal scanner verdict'leri için aynı raw exit korelasyonunu taşır.
- Docker cleanup ana scanner/recording/control hatasını gölgeleyemez; iki hata da bounded structured cause zincirinde korunur ve üst sonuç `INTERNAL/docker-cleanup` olur.
- Canonical `evidence.json` finalize/yazım hatası original root cause'u koruyarak exit `21` ile FAIL olur; bounded ve raw-output/secret içermeyen `evidence-finalization-failure.json` atomik-exclusive fallback'tır. Bir koşum artifact'ında canonical evidence ile fallback'ın tam olarak biri bulunabilir ve fallback `PASS` değildir.
- Offline Go advisory canary exact `golang.org/x/text@v0.3.7` → `GO-2022-1059`; online Go license canary exact `github.com/MichaelMure/git-bug@v0.8.0` → denied `GPL-3.0-or-later` sonucunu, extraction/package parity ve raw exit `1` ile kanıtlamalıdır.
- Önceki koşum cache/output/evidence'ı yeni koşuma fallback olamaz.

## Trusted control bootstrap sınırı

- Wave-start base commit'i trusted workflow/runner taşımadığından bu ilk R-016 control-plane PR'ının `pull_request_target` gate'i koşulmuş sayılamaz; durum `NOT_RUN` kalır ve başka local/hosted gate sonucu onu `PASS` olarak yeniden adlandıramaz.
- İlk aşama yalnız control-plane bootstrap'ıdır: clean exact-target/full-tree, fresh security/cold review ve owner onayı gerekir. Yeni kontrol base'e alındıktan sonra ayrı target/runtime PR'ı base kontrol koduyla taranmalı ve trusted PR gate'i `PASS` üretmelidir.
- Sonraki protected control-plane değişiklikleri aynı owner-onaylı iki aşamalı modeli izler; eski base'in yeni runner/policy/schema byte'larını aynı PR'da güvenilmiş saymasına izin verilmez.

## Açık ve residual riskler

- DEC-024 evidence v1 local compensating control tarihsel `PASS`; DEC-025 evidence v2 bootstrap/post-merge sonucu `PASS`. Exact S3 local R-016 ayrıca `PASS`; runtime trusted PR/R-016, Dependency Review ve CodeQL yeni PR olmadığı için `NOT_RUN`. Semgrep interfile/provenance, deps.dev replay, OSV publisher-signature ve server-side enforcement residual kalır.
- R-017 `OPEN`, non-blocking: mevcut tek kök `go.mod` güvenlidir ve collision fail-closed olur; ikinci Go manifest eklenmeden önce dinamik process/artifact kimliğine path hash suffix ve collision/case fixture'ları zorunludur.
- R-014 `OPEN`: canlı repository'de server-side branch/ruleset enforcement yok; exact S3 local sonuçları bu boşluğu kapatmaz ve runtime merge owner-controlled exact two-parent olmalıdır.
- R-001/R-009/R-013 W007/pre-user sınırına kadar açık; W001'i engellemez.

## Implementation checkpoint

- OSV Scanner `2.5.1`: index `sha256:8108ae94eadea5a02c9bec6e646909d5b790b44bd62d7f5b7f0b1d6d0ffc7734`; linux/amd64 `sha256:1547b7c2783d4f266b24fe86ab4dfc18d058588244c58384ac9f56dddb304511`.
- Semgrep CE `1.175.0` nonroot: index `sha256:6f6f4c1ea22ae02736b023dd4dcc842a4f50b25bbe1898530ec3bfff388b369b`; linux/amd64 `sha256:290df936d4de8897e93953debbec95132cdba878025227258049b06e93aa7c9c`; runtime her scan'de `--oss-only`.
- semgrep-rules commit/tree: `40b8c63f75dc7c22c8a77482d73bfb864b146f7e` / `9b197569a9029ac2731667ef634f119dd61fb7dc`; seçili 21 file ve license SHA-256 ayrı doğrulanır, rule içeriği commit/artifact edilmez.
- Go image `1.26.7`: index `sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514`; linux/amd64 `sha256:659cc38c1a394eeb4dd7e31fff6df128bd33444dcc7afd70e3bed5225749dbc0`.
- Exact clean clone'da Node `24.20.0` / pnpm `11.24.0`: `pnpm ci:check` repository Node `126/126`, supply-chain `114/114`, web `3/3`, build/audit/generated/marker/license kapılarıyla exit `0` verdi.
- Pinned Go `1.26.7` format/module verify/vet/test; Python `3.12.13` TOML validator `4/4`; actionlint `1.7.12`; Gitleaks `8.30.1` committed-history ve artifact taramaları; Compose config ve W001 ownership doğrulaması exit `0` verdi.
- Go advisory ve Go denied-license fixture/process/terminal sözleşmeleri exact live run içinde sırasıyla `GO-2022-1059` ve `GPL-3.0-or-later` bulgularını raw exit `1` ile kanıtladı.
- Semgrep image'in OCI label'ı private packaging repository'sine işaret etse de gate login/pro engine kullanmaz; resmi CLI `--oss-only` sözleşmesi ve LGPL CE engine'i zorlanır. Packaging reproducibility ile interfile false-negative residual riskleri kalır; bootstrap CodeQL `PASS`, yeni runtime target CodeQL ise PR oluşana kadar `NOT_RUN`dır.
- Advisory DB publisher signature sunmuyor; same-run generation/ETag/Last-Modified/size/MD5/SHA-256 seal + offline rehash origin compromise'ını çözmez. Bu residual risk saklanmaz.
