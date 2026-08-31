# W001 R-016 Evidence

> Orchestrator-owned living evidence. Bu dosya yalnız exact SHA/tree, literal command/exit ve doğrulanmış artifact kimliğiyle PASS kaydeder.

## Scope

W001 runtime davranışından önce aşağıdaki telafi paketi zorunludur:

1. pinned OSS SAST,
2. pnpm'in iki lock dokümanı ve Go manifest/modül kapsamının tamamı için vulnerability taraması,
3. açık SPDX license allow/deny ve unknown-license fail-closed politikası,
4. scanner/rules/config/advisory DB identity,
5. dev/unknown vulnerability, disallowed/unknown license, missing/stale DB, parse/timeout/internal/network negatif fixture'ları.

CodeQL Default Setup ve Dependency Review kullanılabildiği sürece exact target üzerinde ayrıca çalışır; branch/ruleset enforcement ayrı doğrulanır. Yerel R-016 hiçbir hosted sonucu yeniden adlandırmaz.

> 2026-08-31 geçiş notu: Aşağıdaki `9ec363c`/evidence v1 PASS kayıtları DEC-024 private-only bağlamının tarihsel kanıtıdır. Repository public olduktan sonra bu kayıtlar DEC-025 public use-boundary gate'ini karşılamaz. Evidence/schema v2 remediation exact head'i ve yeni local/hosted/security/cold sonuçları oluşana kadar current verdict `NOT_RUN`dır.

## Opening identity

- Immutable start commit: `bde560f182032e1e4ec9f1a1b02db4cd8ec5e99b`
- Start tree: `7a2ae76ee31b6c85ec5b3839c78306cde2bd3f23`
- Branch/worktree: `codex/w001-supply-chain-gates` / OneDrive dışı W001 worktree
- External mutation: owner repository'yi public yaptı; preflight sırasında Dependency Graph/vulnerability alerts etkinleştirildi, Default CodeQL ile çakışan Advanced workflow GitHub ayarında `disabled_manually` yapıldı. VPS/SSH/Cloudflare/DNS untouched.

## Gate state

| Gate                                    | Status  | Evidence                                                                                                                                                       |
| --------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave opening identity/ownership         | PASS    | Kesintisiz ownership `bde560f` → verified implementation `37543b1`; manifest-only trailing seal `9ec363c`; pinned Go 1.26.7 repolint exit `0`                  |
| Scanner and rules research              | PASS    | OSV 2.5.1, Semgrep CE 1.175.0 nonroot, Go 1.26.7 ve semgrep-rules exact identities; multi-doc false-clean probu `19` vs `19+527`                               |
| Historical SAST implementation          | PASS    | DEC-024/evidence v1 exact `9ec363c`: 36/36 Git kaynağı, CE/OSS-only repository exit `0`; current public use-boundary yerine geçmez                             |
| Dependency vulnerability implementation | PASS    | Exact `9ec363c`: iki pnpm dokümanı + Go manifest, 546 package/2 source parity; production raw exit `0`; npm+Go fresh DB identity/seal                          |
| License implementation                  | PASS    | Exact `9ec363c`: 546 package/2 source exact parity, deps.dev raw exit `0`; npm denied/unknown ve Go GPL canary raw exit `1`                                    |
| Negative fixtures                       | PASS    | Missing DB `127`; npm unknown/development vulnerability, Go advisory, npm/Go denied/unknown license ve Semgrep canary'leri beklenen nonzero exit ile bloklandı |
| Historical exact-target local/full-tree | PASS    | DEC-024/evidence v1 exact `9ec363c`: Node `126/126`, supply-chain `114/114`, web `3/3`; current remediation target yerine geçmez                               |
| Quality evidence review                 | PASS    | Exact `9ec363c` / `1e57e62`; 187 check, 340 raw artifact, DB/source/control/process/terminal bağları; bloklayıcı bulgu yok                                     |
| Security review                         | PASS    | Exact `9ec363c` / `1e57e62`; release-blocking bulgu yok; bir LOW future multi-module slug riski R-017 olarak izlendi                                           |
| Cold review                             | PASS    | Fresh-context exact-tree verdict `PASS`; local blocker/finding yok; hosted/trusted-base sonuçları doğru biçimde ayrıldı                                        |
| Public use-boundary evidence/schema v2  | NOT_RUN | Implementation in progress; exact remediation SHA/tree ve live R-016 henüz mühürlenmedi                                                                        |
| GitHub exact-head quality               | NOT_RUN | Eski `e3ca17d` quality SUCCESS tarihsel; remediation exact head henüz üretilmedi                                                                               |
| Trusted-base PR gate                    | NOT_RUN | Wave-start base `.github/workflows/r016-trusted-pr.yml` ve trusted runner'ı taşımıyor; ilk control-plane bootstrap PR'ında hosted `PASS` iddia edilemez        |
| Hosted security/enforcement             | NOT_RUN | Default CodeQL base `bde560f` ve Dependency Review eski `e3ca17d` için SUCCESS; remediation exact head henüz taranmadı. Branch/ruleset `BLOCKED_EXTERNAL`      |

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

- DEC-024 evidence v1 local compensating control tarihsel `PASS`; DEC-025 evidence v2 current sonucu `NOT_RUN`, risk `MITIGATING`. Semgrep interfile/provenance, deps.dev replay, OSV publisher-signature ve server-side enforcement residual kalır.
- R-017 `OPEN`, non-blocking: mevcut tek kök `go.mod` güvenlidir ve collision fail-closed olur; ikinci Go manifest eklenmeden önce dinamik process/artifact kimliğine path hash suffix ve collision/case fixture'ları zorunludur.
- R-014 `OPEN`: canlı repository'de server-side branch/ruleset enforcement yok; bootstrap merge owner-controlled exact two-parent olmalıdır.
- R-001/R-009/R-013 W007/pre-user sınırına kadar açık; W001'i engellemez.

## Implementation checkpoint

- OSV Scanner `2.5.1`: index `sha256:8108ae94eadea5a02c9bec6e646909d5b790b44bd62d7f5b7f0b1d6d0ffc7734`; linux/amd64 `sha256:1547b7c2783d4f266b24fe86ab4dfc18d058588244c58384ac9f56dddb304511`.
- Semgrep CE `1.175.0` nonroot: index `sha256:6f6f4c1ea22ae02736b023dd4dcc842a4f50b25bbe1898530ec3bfff388b369b`; linux/amd64 `sha256:290df936d4de8897e93953debbec95132cdba878025227258049b06e93aa7c9c`; runtime her scan'de `--oss-only`.
- semgrep-rules commit/tree: `40b8c63f75dc7c22c8a77482d73bfb864b146f7e` / `9b197569a9029ac2731667ef634f119dd61fb7dc`; seçili 21 file ve license SHA-256 ayrı doğrulanır, rule içeriği commit/artifact edilmez.
- Go image `1.26.7`: index `sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514`; linux/amd64 `sha256:659cc38c1a394eeb4dd7e31fff6df128bd33444dcc7afd70e3bed5225749dbc0`.
- Exact clean clone'da Node `24.20.0` / pnpm `11.24.0`: `pnpm ci:check` repository Node `126/126`, supply-chain `114/114`, web `3/3`, build/audit/generated/marker/license kapılarıyla exit `0` verdi.
- Pinned Go `1.26.7` format/module verify/vet/test; Python `3.12.13` TOML validator `4/4`; actionlint `1.7.12`; Gitleaks `8.30.1` committed-history ve artifact taramaları; Compose config ve W001 ownership doğrulaması exit `0` verdi.
- Go advisory ve Go denied-license fixture/process/terminal sözleşmeleri exact live run içinde sırasıyla `GO-2022-1059` ve `GPL-3.0-or-later` bulgularını raw exit `1` ile kanıtladı.
- Semgrep image'in OCI label'ı private packaging repository'sine işaret etse de gate login/pro engine kullanmaz; resmi CLI `--oss-only` sözleşmesi ve LGPL CE engine'i zorlanır. Packaging reproducibility ile interfile false-negative residual riskleri hosted CodeQL `BLOCKED_EXTERNAL` kaydında kalır.
- Advisory DB publisher signature sunmuyor; same-run generation/ETag/Last-Modified/size/MD5/SHA-256 seal + offline rehash origin compromise'ını çözmez. Bu residual risk saklanmaz.
