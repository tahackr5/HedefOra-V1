# W001 R-016 Evidence

> Orchestrator-owned living evidence. Bu dosya yalnız exact SHA/tree, literal command/exit ve doğrulanmış artifact kimliğiyle PASS kaydeder.

## Scope

W001 runtime davranışından önce aşağıdaki telafi paketi zorunludur:

1. pinned OSS SAST,
2. pnpm'in iki lock dokümanı ve Go manifest/modül kapsamının tamamı için vulnerability taraması,
3. açık SPDX license allow/deny ve unknown-license fail-closed politikası,
4. scanner/rules/config/advisory DB identity,
5. dev/unknown vulnerability, disallowed/unknown license, missing/stale DB, parse/timeout/internal/network negatif fixture'ları.

Hosted CodeQL, Dependency Review ve branch/ruleset enforcement ayrı `BLOCKED_EXTERNAL` sonuçlarıdır; bu paket onları `PASS` yapmaz.

## Opening identity

- Immutable start commit: `bde560f182032e1e4ec9f1a1b02db4cd8ec5e99b`
- Start tree: `7a2ae76ee31b6c85ec5b3839c78306cde2bd3f23`
- Branch/worktree: `codex/w001-supply-chain-gates` / OneDrive dışı W001 worktree
- External mutation: none; VPS/SSH/Cloudflare/DNS untouched

## Gate state

| Gate                                    | Status           | Evidence                                                                                                                                                  |
| --------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave opening identity/ownership         | PASS             | Açılış `c9fcb16`, repolint fix `4d958a2`, manifest seal `02caed4`; implementation range henüz seal edilmedi                                               |
| Scanner and rules research              | PASS             | OSV 2.5.1, Semgrep CE 1.175.0 nonroot, Go 1.26.7 ve semgrep-rules exact identities; multi-doc false-clean probu `19` vs `19+527`                          |
| SAST implementation                     | NOT_RUN          | Digest/OSS-only/rules/timeout/coverage wrapper kodlandı; clean-target live run bekleniyor                                                                 |
| Dependency vulnerability implementation | NOT_RUN          | Fresh DB seal + offline/network-none + all-source parity kodlandı; clean-target live run bekleniyor                                                       |
| License implementation                  | NOT_RUN          | Ayrı online deps.dev run + explicit SPDX/parity kodlandı; clean-target live run bekleniyor                                                                |
| Negative fixtures                       | IN_PROGRESS      | Go advisory ve Go denied-license canary'leri dahil exact Node `24.20.0` supply-chain suite `98/98` geçti; live pinned SAST/OSV/ZIP doğrulaması bekleniyor |
| Exact-target local/full-tree            | NOT_RUN          | —                                                                                                                                                         |
| Security review                         | NOT_RUN          | —                                                                                                                                                         |
| Cold review                             | NOT_RUN          | —                                                                                                                                                         |
| GitHub exact-head quality               | NOT_RUN          | —                                                                                                                                                         |
| Trusted-base PR gate                    | NOT_RUN          | Wave-start base `.github/workflows/r016-trusted-pr.yml` ve trusted runner'ı taşımıyor; ilk control-plane bootstrap PR'ında hosted `PASS` iddia edilemez   |
| Hosted security/enforcement             | BLOCKED_EXTERNAL | DEC-024 / R-014 / R-016                                                                                                                                   |

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

## Açık riskler

- R-016 `OPEN`: implementation kodlandı ve pre-commit regresyonları temiz; clean exact-target canlı scanner/review kanıtı henüz yok.
- R-014 `OPEN`: server-side merge enforcement private planda yok.
- R-001/R-009/R-013 W007/pre-user sınırına kadar açık; W001'i engellemez.

## Implementation checkpoint

- OSV Scanner `2.5.1`: index `sha256:8108ae94eadea5a02c9bec6e646909d5b790b44bd62d7f5b7f0b1d6d0ffc7734`; linux/amd64 `sha256:1547b7c2783d4f266b24fe86ab4dfc18d058588244c58384ac9f56dddb304511`.
- Semgrep CE `1.175.0` nonroot: index `sha256:6f6f4c1ea22ae02736b023dd4dcc842a4f50b25bbe1898530ec3bfff388b369b`; linux/amd64 `sha256:290df936d4de8897e93953debbec95132cdba878025227258049b06e93aa7c9c`; runtime her scan'de `--oss-only`.
- semgrep-rules commit/tree: `40b8c63f75dc7c22c8a77482d73bfb864b146f7e` / `9b197569a9029ac2731667ef634f119dd61fb7dc`; seçili 21 file ve license SHA-256 ayrı doğrulanır, rule içeriği commit/artifact edilmez.
- Go image `1.26.7`: index `sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514`; linux/amd64 `sha256:659cc38c1a394eeb4dd7e31fff6df128bd33444dcc7afd70e3bed5225749dbc0`.
- Exact Node `24.20.0` ile `node --test scripts/*.test.mjs scripts/supply-chain/*.test.mjs` sonucu `110/110 PASS` (supply-chain `98/98`), exit `0`; exact Prettier root+web ve pinned actionlint exit `0` verdi. Bunlar dirty pre-commit regresyon kanıtıdır; clean exact-target canlı gate veya release `PASS` yerine geçmez.
- Go advisory ve Go denied-license fixture/process/terminal sözleşmeleri kodlanmıştır; pinned live canary sonucu exact-target koşumu tamamlanmadan `PASS` değildir.
- Semgrep image'in OCI label'ı private packaging repository'sine işaret etse de gate login/pro engine kullanmaz; resmi CLI `--oss-only` sözleşmesi ve LGPL CE engine'i zorlanır. Packaging reproducibility ile interfile false-negative residual riskleri hosted CodeQL `BLOCKED_EXTERNAL` kaydında kalır.
- Advisory DB publisher signature sunmuyor; same-run generation/ETag/Last-Modified/size/MD5/SHA-256 seal + offline rehash origin compromise'ını çözmez. Bu residual risk saklanmaz.
