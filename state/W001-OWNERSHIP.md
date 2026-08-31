# W001 Yazma Sahipliği ve Birleştirme Planı

> Tek writer orchestrator'dır. Bütün W001 task branch/worktree'leri immutable `WAVE_START_COMMIT` olan `bde560f182032e1e4ec9f1a1b02db4cd8ec5e99b` üzerinden açılır.

Makine tarafından doğrulanan kesintisiz commit aralıkları `state/W001-OWNERSHIP.json` içindedir. Manifest schema v2 kullanır; son self-referential seal commit'inde yalnız bu JSON değişebilir. Tarihsel `state/W000-*` dosyaları W001 boyunca değiştirilemez.

## W001-T00 — Wave open ve governance state

- Writer: orchestrator.
- Owned paths: `FILE-INDEX.md`, `state/ACTIVE-WAVE.md`, `state/RELEASE-LEDGER.md`, `state/W001-OWNERSHIP.md`, `state/W001-EVIDENCE.md`, `state/W001-OWNERSHIP.json`.
- Read paths: root canonical governance, W001 delivery/architecture ve ilgili agent/skill belgeleri.
- Forbidden paths: product/runtime code, `apps/**`, `contracts/**`, `infra/**`, `.github/**`, historical `state/W000-*`.
- Expected gates: exact base/tree, diff check, ownership seal, clean worktree.

## W001-T01 — R-016 read-only contract, scanner ve test araştırması

- Writers: none.
- Reviewers: architecture/contracts, quality/testing, security/privacy ve infra/release rolleri.
- Scope: current official scanner/rule/advisory DB identity; multi-document pnpm lock coverage; Go module coverage; fail-closed error/timeout/network/DB behavior; negative-fixture matrix.
- Output: structured proposal only; repository mutation yasaktır.

## W001-T00B — Ownership validator manifest adaptation

- Writer: orchestrator.
- Owned paths: `tools/repolint/cmd/repolint/main.go`, `tools/repolint/cmd/repolint/main_test.go`.
- Scope: W001 ve sonraki wave manifest adını aktif wave state'inden dinamik seçmek; W000 exact historical doğrulamasını değiştirmemek.
- Expected gates: pinned Go format/test/vet/race/build, immutable W000 range ve W001 manifest-only seal doğrulaması.

## W001-T02 — R-016 supply-chain gates

- Writer/merge/stage sahibi: orchestrator. Bounded writers yalnız `scripts/supply-chain/inventory.mjs` + `inventory.test.mjs`, `scripts/supply-chain/policy.mjs` + `policy.test.mjs`, `scripts/supply-chain/process.mjs` + `process.test.mjs` ve `tools/osvdbcheck/**` üzerinde çalışabilir; shared state/merge/stage sahibi değildir.
- Owned paths: `.github/workflows/ci.yml`, `.github/workflows/r016-trusted-pr.yml`, `.gitignore`, `package.json`, `security/**`, `scripts/check-generated.mjs`, `scripts/check-generated.test.mjs`, `scripts/supply-chain/**`, `scripts/fixtures/supply-chain/**`, `tools/osvdbcheck/**`, `delivery/DEPENDENCY-AND-SUPPLY-CHAIN.md`, `delivery/TOOLCHAIN-LOCK.md`, `state/ACTIVE-WAVE.md`, `state/RISK-REGISTER.md`, `state/W001-EVIDENCE.md`, `state/W001-OWNERSHIP.md`, `state/W001-OWNERSHIP.json`.
- Read paths: bütün committed dependency manifests/lockfiles, tracked Go/JavaScript/TypeScript source, current CI ve repository validators.
- Forbidden paths: `apps/**`, `contracts/**`, `infra/**`, database/migration/runtime behavior, `DECISIONS.md`, `architecture/**`, historical `state/W000-*`, secrets ve generated/vendor çıktıları.
- Trusted PR boundary: immutable base SHA ayrı kontrol köküdür ve runner/policy/scanner/rules/schema/fixture/validator byte'larını exact Git blob'larından sağlar; PR head ayrı target köküdür ve yalnız taranacak manifest/lock/source Git blob'larını sağlar. Import öncesi transitive runner modülleri stage-0 `100644` blob/hash/regular-file/realpath olarak doğrulanır; split-root'ta iki exact expected SHA zorunludur. Protected control-plane path/mode/stage/OID parity'si scanner başlamadan zorunludur; target script/action çalıştırılmaz.
- Expected gates: scanner/policy/semantic unit tests; real pinned Semgrep ve OSV integration; npm ile Go advisory canary'leri; disallowed/unknown npm lisansı ile denied Go lisans canary'si; missing/stale/hash-mismatch DB; malformed output, timeout, internal/network/error ve canonical evidence-write fallback; multi-document inventory parity; absolute Git/Docker executable identity; existing `pnpm ci:check`, Go, TOML, actionlint, Gitleaks ve ownership gates.

## W001-T03 — Exact-target evidence ve review

- State/evidence writer: orchestrator only.
- Security ve cold reviewer: fresh-context, read-only, exact sealed SHA/tree.
- Owned paths: `state/ACTIVE-WAVE.md`, `state/RELEASE-LEDGER.md`, `state/RISK-REGISTER.md`, `state/W001-EVIDENCE.md`, `state/W001-OWNERSHIP.md`, `state/W001-OWNERSHIP.json`.
- R-016 yalnız target ve control source seal'leri, protected control-plane parity'si, scanner image/binary, rule tree, policy/config ve npm/Go advisory DB kimlikleriyle; literal commands/exits ve negative fixture kanıtıyla `PASS` olabilir.

## W001-T02B — Public repository use-boundary remediation

- Immutable task base: `e3ca17d9ed000f7758cdb43d28dd22862b20cdd3`; writer/merge/stage sahibi orchestrator'dır. Read-only architecture, infra, quality ve security reviewers proposal döndürür.
- Owner gate: repository public kalacak; DEC-024 ve R-016 public-repository remediation'ı 2026-08-31 tarihinde açıkça onaylandı.
- Implementation commit: `62c1f7d5201da56f240f3e04fc6f5969190320eb` / tree `4855e422bafcc7f088d480514702bdf57124e83a`; bunu izleyen state bookkeeping commit'i task range'e dahil edilir ve ayrı manifest-only commit ile mühürlenir.
- Owned paths: `DECISIONS.md`, `architecture/ADR-REGISTER.md`, `state/DECISION-QUEUE.md`, `delivery/DEPENDENCY-AND-SUPPLY-CHAIN.md`, `delivery/WORKTREE-OWNERSHIP-AND-MERGE.md`, `operations/REPOSITORY-BACKUP-POLICY.md`, `.github/workflows/ci.yml`, `.github/workflows/r016-trusted-pr.yml`, `.github/workflows/codeql.yml` (silme), `security/scanners.lock.json`, `security/supply-chain-policy.json`, `security/r016-evidence.schema.json`, `scripts/supply-chain/contracts.mjs`, `scripts/supply-chain/contracts.test.mjs`, `scripts/supply-chain/run.mjs`, `scripts/supply-chain/run.test.mjs`, `state/ACTIVE-WAVE.md`, `state/RISK-REGISTER.md`, `state/W001-EVIDENCE.md`, `state/RELEASE-LEDGER.md`, `state/W001-OWNERSHIP.md`, `state/W001-OWNERSHIP.json`.
- Boundary: GitHub repository ID `1349011765` ve full name `tahackr5/HedefOra-V1` birlikte exact eşleşir. Hosted artifact yalnız externally-unverified `github-context-claim`, yerel artifact `local-declaration` taşır; authenticated GitHub run/artifact provenance doğrulaması detached artifact dışındadır. Normal `pull_request` enforcement yasaktır; first-party push ve base-controlled `pull_request_target` boundary'leri fork/foreign head checkout ve scanner/rule/image/DB acquisition öncesi bloklar. Rule byte'ları repository/artifact'e konmaz ve scanning-as-a-service sunulmaz.
- Expected gates: evidence/schema v2 unit/negative tests, workflow/actionlint, frozen full tree, exact public local R-016, rule artifact redaction/rehash, ownership range+seal, hosted quality/Dependency Review/Default CodeQL, fresh security ve cold review. Yeni exact SHA ayrı owner merge onayı almadan birleşmez.

## Merge ve rollback

1. W001 açılış state commit'i.
2. Manifest-only ownership seal.
3. R-016 control-plane implementation + tests + docs.
4. Manifest-only seal ve exact-target full-tree/security/cold review.
5. İlk bootstrap PR'ı için explicit owner approval ve owner-controlled two-parent, content-identical GitHub merge; wave-start base trusted workflow/runner taşımadığı için hosted trusted gate bu PR'da `NOT_RUN` kalır.
6. Yeni base üzerinde ayrı target/runtime PR'ı; trusted-base gate `PASS` olmadan ilerlemez. Protected control-plane değişikliği gerekiyorsa yine önce control-only owner-approved bootstrap, sonra ayrı target PR yapılır.
7. Final `main` push active-wave merge-wrapper/full-tree gate.

Squash/rebase/direct push kabul edilmez. Merge öncesi güvenli rollback W001 PR'ını merge etmemektir. Merge sonrasında repository public iken eski workflow tree'sine ham revert yasaktır: progression durdurulur, owner onayıyla repository private yapılır, exact ID/full-name/visibility ve hosted capability yeniden doğrulanır, ancak bundan sonra reviewed revert PR değerlendirilebilir; source boundary mümkünse korunur. Hosted CodeQL/Dependency Review kullanılabildiği sürece gerçek gate'tir; branch/ruleset enforcement doğrulanana kadar `BLOCKED_EXTERNAL` kalır. VPS/DNS rollback bu task için `NOT_APPLICABLE`, çünkü dış sistem mutation'ı yoktur.

## Secret ve artifact sınırı

- Password, token, private key, cookie, MFA/recovery code, gerçek `.env` ve production verisi okunmaz veya commitlenmez.
- Scanner DB/cache, redacted raw output ve evidence çalışma artifact'ları `artifacts/**` altında kalır ve commitlenmez. Cloned rule byte'ları yalnız run-specific OS temp kökünde tutulur, artifact'e taşınmaz ve cleanup ile silinir.
- Scanner/rules/DB acquisition hatası eski cache'e veya önceki PASS artifact'ına düşmez; yeni ve izole run fail-closed biter.
