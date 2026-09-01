# W001 Yazma Sahipliği ve Birleştirme Planı

> Historical `WAVE_START_COMMIT` `bde560f182032e1e4ec9f1a1b02db4cd8ec5e99b` olarak değişmez. T04C/T04D/T04I runtime fazı `1dbc81b57e4809ce7ba0f530cab946ee0540ea71` checkpoint'inden üretildi. DEC-026/ADR-0016 uyarınca owner-onaylı ve post-merge doğrulanmış `cd81ee7b36d5bc647bb297e8ede13b21a7f1c8f1`, W001-T04F'nin yeni immutable task-phase base'idir. Path başına tek writer korunur; shared dosyaları yalnız orchestrator birleştirir.

Makine tarafından doğrulanan kesintisiz commit aralıkları `state/W001-OWNERSHIP.json` içindedir. Manifest schema v2 kullanır; son self-referential seal commit'inde yalnız bu JSON değişebilir. Tarihsel `state/W000-*` dosyaları W001 boyunca değiştirilemez.

- Historical runtime ownership seal: manifest `verifiedThrough` `b88b64f31c8f6fcbaab95bff1ee7383cfd2f30c7`; yalnız ownership JSON'unu değiştiren exact runtime input seal `ccb345dd529da6baa7537e516eba205476cec6b2`, tree `e63bb7d32f017f67bede63bc1c707275b9d7f8ed`.
- T04I reviewed seal `89d9632b1fefdd8b0cd2e6c5e9e432076f63836b`; owner-controlled merge `cd81ee7b36d5bc647bb297e8ede13b21a7f1c8f1`. Living manifest, reviewed seal aralığını, 43-path content-identical merge wrapper'ını ve T04F task-open state aralığını bir sonraki manifest-only seal'de kesintisiz kaydeder.

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
- Owned paths: `.github/workflows/ci.yml`, `.github/workflows/r016-trusted-pr.yml`, `.gitleaksignore`, `.gitignore`, `package.json`, `security/**`, `scripts/check-generated.mjs`, `scripts/check-generated.test.mjs`, `scripts/supply-chain/**`, `scripts/fixtures/supply-chain/**`, `tools/osvdbcheck/**`, `delivery/DEPENDENCY-AND-SUPPLY-CHAIN.md`, `delivery/TOOLCHAIN-LOCK.md`, `state/ACTIVE-WAVE.md`, `state/RISK-REGISTER.md`, `state/W001-EVIDENCE.md`, `state/W001-OWNERSHIP.md`, `state/W001-OWNERSHIP.json`.
- Read paths: bütün committed dependency manifests/lockfiles, tracked Go/JavaScript/TypeScript source, current CI ve repository validators.
- Forbidden paths: `apps/**`, `contracts/**`, `infra/**`, database/migration/runtime behavior, `DECISIONS.md`, `architecture/**`, historical `state/W000-*`, secrets ve generated/vendor çıktıları.
- Trusted PR boundary: immutable base SHA ayrı kontrol köküdür ve runner/policy/scanner/rules/schema/fixture/validator byte'larını exact Git blob'larından sağlar; PR head ayrı target köküdür ve yalnız taranacak manifest/lock/source Git blob'larını sağlar. Import öncesi transitive runner modülleri stage-0 `100644` blob/hash/regular-file/realpath olarak doğrulanır; split-root'ta iki exact expected SHA zorunludur. Protected control-plane path/mode/stage/OID parity'si scanner başlamadan zorunludur; target script/action çalıştırılmaz.
- Expected gates: scanner/policy/semantic unit tests; real pinned Semgrep ve OSV integration; npm ile Go advisory canary'leri; disallowed/unknown npm lisansı ile denied Go lisans canary'si; missing/stale/hash-mismatch DB; malformed output, timeout, internal/network/error ve canonical evidence-write fallback; multi-document inventory parity; absolute Git/Docker executable identity; existing `pnpm ci:check`, Go, TOML, actionlint, Gitleaks ve ownership gates.

## W001-T03 — Exact-target evidence ve review

- State/evidence writer: orchestrator only.
- Security ve cold reviewer: fresh-context, read-only, exact sealed SHA/tree.
- Owned paths: `state/ACTIVE-WAVE.md`, `state/RELEASE-LEDGER.md`, `state/RISK-REGISTER.md`, `state/W001-EVIDENCE.md`, `state/W001-OWNERSHIP.md`, `state/W001-OWNERSHIP.json`.
- R-016 yalnız target ve control source seal'leri, protected control-plane parity'si, scanner image/binary, rule tree, policy/config ve npm/Go advisory DB kimlikleriyle; literal commands/exits ve negative fixture kanıtıyla `PASS` olabilir.

## W001-T03A — Gitleaks fingerprint control-plane remediation

- Immutable task base: post-merge trusted control checkpoint `1dbc81b57e4809ce7ba0f530cab946ee0540ea71`; writer/merge/stage sahibi orchestrator'dır. Runtime PR #4 exact `ccb345dd529da6baa7537e516eba205476cec6b2` hosted quality koşumunun üç sentetik UUIDv4 RequestID fixture'ını `generic-api-key` olarak yakalaması bu ayrı control-plane task'ını açtı.
- Owned paths: `.gitleaksignore`, `delivery/DEPENDENCY-AND-SUPPLY-CHAIN.md`, `scripts/supply-chain/contracts.mjs`, `scripts/supply-chain/contracts.test.mjs`, `scripts/supply-chain/run.mjs`, `scripts/supply-chain/run.test.mjs`, `state/ACTIVE-WAVE.md`, `state/RELEASE-LEDGER.md`, `state/RISK-REGISTER.md`, `state/W001-EVIDENCE.md`, `state/W001-OWNERSHIP.md`, `state/W001-OWNERSHIP.json`.
- Boundary: yalnız doğrulanmış üç false-positive için exact commit:path:rule:line fingerprint'i kabul edilir. `.gitleaksignore` exact byte'ları ve Git path/mode/stage/OID kimliği protected parity kapsamındadır; rule, path, commit veya üç parçalı global istisna, scan-range daraltma ve history rewrite yasaktır.
- Compatibility: public `GET /health/live`, RequestID üretimi ve test fixture davranışı değişmez; OpenAPI, DB, event ve River sözleşmesi etkilenmez. Pinned Gitleaks full-history taraması gerçek/sibling finding'lerde fail-closed kalmalıdır.
- Owner gate: protected kontrol değişikliği eski base ile trusted `PASS` sayılmaz. Control-plane-only exact head local/full-tree/security/cold ve uygulanabilir hosted kapılardan sonra ayrı owner SHA onayıyla birleşir; runtime PR ancak yeni post-merge trusted base üzerinde yeniden bütünleştirilip bütün exact-head kapıları tekrar geçtiğinde ilerler.
- Rollback: merge öncesi PR'ı birleştirmemek; public repository'de merge sonrası ham control-plane revert yapmamak, progression stop + owner-approved private-first rollback sözleşmesini uygulamak.
- Implementation checkpoint: `b930446ce3abe9a18e8656faa6ebfe81680e677c` / tree `b1703d9a7327dbe3341f037646ba87b8af820c29`; parent `1dbc81b57e4809ce7ba0f530cab946ee0540ea71`. Promotion commit'i yalnız atanmış state/evidence yollarını, ardından gelen self-referential seal yalnız `state/W001-OWNERSHIP.json` yolunu değiştirebilir.

## W001-T02B — Public repository use-boundary remediation

- Immutable task base: `e3ca17d9ed000f7758cdb43d28dd22862b20cdd3`; writer/merge/stage sahibi orchestrator'dır. Read-only architecture, infra, quality ve security reviewers proposal döndürür.
- Owner gate: repository public kalacak; DEC-024 ve R-016 public-repository remediation'ı 2026-08-31 tarihinde açıkça onaylandı.
- Initial implementation commit: `62c1f7d5201da56f240f3e04fc6f5969190320eb` / tree `4855e422bafcc7f088d480514702bdf57124e83a`. Final-security remediation implementation commit'i `26a8515ee008c34a551d172abc7646c3ce8f74b3` / tree `dd506acfb39cc494fdde9e65d2f11d7021c13c20`; bu state bookkeeping commit'i task range'e dahil edilir ve ayrı manifest-only commit ile mühürlenir.
- Owned paths: `DECISIONS.md`, `architecture/ADR-REGISTER.md`, `state/DECISION-QUEUE.md`, `delivery/DEPENDENCY-AND-SUPPLY-CHAIN.md`, `delivery/WORKTREE-OWNERSHIP-AND-MERGE.md`, `operations/REPOSITORY-BACKUP-POLICY.md`, `.github/workflows/ci.yml`, `.github/workflows/r016-trusted-pr.yml`, `.github/workflows/codeql.yml` (silme), `security/scanners.lock.json`, `security/supply-chain-policy.json`, `security/r016-evidence.schema.json`, `scripts/supply-chain/contracts.mjs`, `scripts/supply-chain/contracts.test.mjs`, `scripts/supply-chain/run.mjs`, `scripts/supply-chain/run.test.mjs`, `state/ACTIVE-WAVE.md`, `state/RISK-REGISTER.md`, `state/W001-EVIDENCE.md`, `state/RELEASE-LEDGER.md`, `state/W001-OWNERSHIP.md`, `state/W001-OWNERSHIP.json`.
- Boundary: GitHub repository ID `1349011765` ve full name `tahackr5/HedefOra-V1` birlikte exact eşleşir. Hosted artifact yalnız externally-unverified `github-context-claim`, yerel artifact `local-declaration` taşır; authenticated GitHub run/artifact provenance doğrulaması detached artifact dışındadır. Normal `pull_request` enforcement yasaktır; first-party push ve base-controlled `pull_request_target` boundary'leri fork/foreign head checkout ve scanner/rule/image/DB acquisition öncesi bloklar. Rule byte'ları repository/artifact'e konmaz ve scanning-as-a-service sunulmaz.
- Expected gates: evidence/schema v2 unit/negative tests, workflow/actionlint, frozen full tree, exact public local R-016, rule artifact redaction/rehash, ownership range+seal, hosted quality/Dependency Review/Default CodeQL, fresh security ve cold review. Yeni exact SHA ayrı owner merge onayı almadan birleşmez.

## W001-T04A — Trusted runtime checkpoint ve ownership freeze

- Writer: orchestrator.
- Immutable task-phase base: `1dbc81b57e4809ce7ba0f530cab946ee0540ea71`; tree `8e6973a69f8f9551a29c8f301d59961113cf4e70`.
- Owned paths: `AGENTS.md`, `DECISIONS.md`, `FILE-INDEX.md`, `architecture/ADR-REGISTER.md`, `delivery/WORKTREE-OWNERSHIP-AND-MERGE.md`, `state/ACTIVE-WAVE.md`, `state/DECISION-QUEUE.md`, `state/RELEASE-LEDGER.md`, `state/RISK-REGISTER.md`, `state/W001-EVIDENCE.md`, `state/W001-OWNERSHIP.md`, `state/W001-OWNERSHIP.json`.
- Scope: DQ-006/DEC-026/ADR-0016 çelişki çözümü; exact post-merge local/hosted kanıt; T04 DAG, writer/path ve gate matrisi. API/DB/job davranışı yoktur.
- Expected gates: governance validation, diff check, W000 immutability, W001 continuous ownership plus manifest-only seal, clean worktree.

## W001-T04B — Dependency ve compatibility freeze

- Writers: none; architecture/backend/quality/security read-only proposal verir.
- Scope: official exact version, license, maintenance, vulnerability/SBOM ve exit planı; OpenAPI 3.1 generator compatibility; additive API sınıflaması; ilerideki DB/River migration/replay penceresi.
- Boundary: `delivery/TOOLCHAIN-LOCK.md` içindeki planned W001 sürümleri ekleme izni değildir. İlk health dilimi yalnız gerçek producer/consumer'ı olan minimum generator/runtime dependency'lerini ekler; pgx/River/migrate/Testcontainers sonraki owning task'a kadar eklenmez.
- Current verdict: affected `oapi-codegen 2.8.0` için kalıcı `NO-GO/BLOCKED_EXTERNAL`; owner DEC-027 ile onu dependency/tool graph'ına almayan ayrı T04E sealed-renderer task'ını açtı. Recursive extension lint yalnız defense-in-depth'tir.

## W001-T04E — Exact-health sealed security compiler

- Writer/merge/stage sahibi: orchestrator; architecture, quality ve security ajanları read-only proposal/review verir.
- Owned paths: `DECISIONS.md`, `FILE-INDEX.md`, `architecture/ADR-REGISTER.md`, `contracts/README.md`, `delivery/TOOLCHAIN-LOCK.md`, `package.json`, `scripts/check-generated.mjs`, `scripts/check-generated.test.mjs`, `scripts/generate-openapi.mjs`, `scripts/generate-openapi.test.mjs`, `scripts/fixtures/openapi-generator-negative-mutations.mjs`, `internal/generated/openapi/openapi.gen.go`, `state/ACTIVE-WAVE.md`, `state/DECISION-QUEUE.md`, `state/RELEASE-LEDGER.md`, `state/RISK-REGISTER.md`, `state/W001-EVIDENCE.md`, `state/W001-OWNERSHIP.md`, `state/W001-OWNERSHIP.json`.
- Input/output contract: yalnız exact `contracts/openapi/openapi.yaml` LF bytes, size `5604`, SHA-256 `5d157cd1d6627d781030212454ceaa075e994cdfa22a6f1f1929d26265af85ab`; tek hardcoded output `internal/generated/openapi/openapi.gen.go`. CLI yalnız `--check` veya `--write`; path/package/template/config/stdin override yoktur.
- TCB boundary: Node standard library dışında dependency yok; YAML parser, subprocess, network, environment-derived path, eval/dynamic import/plugin/template engine yok. Spec'ten source code, identifier, import, output path veya comment interpolation yok. Second operation/schema fail-closed yeni owner/security compiler task'ı ister.
- Expected gates: fatal/bounded input preflight; 33 canonical single-mutation rejection; generator-specific injection/ref/extension/duplicate/alias/tag/merge/multi-doc/UTF-8/NUL/CR/size corpus; rejected inputte zero-output; same-process ve fresh-process deterministic byte parity; exact output inventory/symlink/non-regular/drift; gofmt, pinned Go compile/vet/test/race; no dependency/lock drift; R-016; independent security ve cold review.
- Rollback: merge öncesi task branch'ini terk etmek. Patched upstream'e geçiş ancak generated public Go API + HTTP golden parity ve ayrı dependency/security admission sonrasında atomik yapılır.
- Current state: exact `959e128ea5fd0191b4283293fbe49f2a854b0aa6` / tree `42069f70d14626ece232b4184c7e80f776fa8e2a` üzerinde generator/full-tree/pinned-Go/R-016/security/quality `PASS`; T04E `COMPLETED`.

## W001-T04C — Additive liveness contract ve generated parity

- Writer/merge/stage sahibi: orchestrator; builder ajanlar yalnız proposal verir.
- Owned paths: `contracts/openapi/**`, `contracts/README.md`, `.spectral.yaml`, `scripts/fixtures/openapi-negative-mutations.mjs`, `scripts/validate-contracts.mjs`, `scripts/validate-contracts.test.mjs`, T04E generation paths, generated Go root `internal/generated/openapi/**`; generated TypeScript root `apps/web/src/generated/api/**` yalnız gerçek frontend consumer task'ında ayrıca açılır.
- Contract: `GET /health/live`; public/no-auth, inherently idempotent, concurrency precondition'i yok, explicit health rate-limit class. Serving sırasında typed `200`; drain sırasında `service_unavailable`, `retryable: true`, bounded zorunlu retry süresi ve `Retry-After` taşıyan dedicated typed `503`.
- Generated boundary: kanonik OpenAPI elle değiştirilir; generated dosya elle düzenlenmez. Exact sealed regeneration byte-diff, Go compile ve schema/generator negative fixture'ları zorunludur. TypeScript parity bu Go slice'ıyla `PASS` olmaz.
- Current state: contract preflight, T04E sealed generated Go parity ve T04D HTTP integration exact S3 üzerinde `PASS`; bounded T04C Go/HTTP dilimi `COMPLETED`. Gerçek TypeScript consumer task/gate'i açılmadı ve `NOT_RUN`; TypeScript parity `PASS` değildir.

## W001-T04D — API/config/telemetry/health runtime

- Writer: orchestrator; ilk vertical slice boyunca T04C ile aynı integration worktree'sinde sıralı çalışır, paralel writer yoktur.
- Owned paths: `cmd/hedefora/**`, `internal/platform/app/**`, `internal/platform/config/**`, `internal/platform/http/**`, `internal/platform/health/**`, `internal/platform/telemetry/**`; runtime activation boundary için exact `scripts/check-generated.mjs`, `scripts/check-generated.test.mjs` ve `scripts/list-repository-files.mjs`.
- Acceptance: explicit `api` process mode, allowlisted environment config, secret/raw-header loglamama, cryptographic request ID, structured request outcome, bounded server timeouts, graceful drain/shutdown, generated strict handler ve `200/503` unit/integration tests.
- Boundary: PostgreSQL, River, object storage, VPS, DNS, Cloudflare ve staging mutation yoktur; readiness DB sahibi T04F'ye kadar eklenmez.
- Current state: implementation/remediation head F3 `759e338cbc868e63bc10d0b70ae4fe2836f4cc83`; manifest-only ownership seal S3 `057a1976dd157b0225e3e7530998e7ac6abae217`, tree `a6cd96a1b9721b75fc222d11b97289457ae3ce05`. Exact S3 local ownership/full-tree/pinned-Go/R-016/security/cold kapıları ve T04D vertical slice `PASS`; T04D `COMPLETED`. Runtime trusted-base PR/R-016, hosted Dependency Review ve hosted CodeQL `NOT_RUN`; exact-head owner merge gate'i pending; R-014 branch/ruleset enforcement `BLOCKED_EXTERNAL`.

## W001-T04I — Trusted-control graph integration ve CodeQL fixture remediation

- Writer/merge/stage sahibi: orchestrator; security ve quality reviewer'lar read-only.
- Immutable inputs: sealed runtime `ccb345dd529da6baa7537e516eba205476cec6b2`; owner-approved trusted control merge `ecf71c0eb8139c0d7ff911ebb9f33afa6a1164ee`.
- Integration: `54a7b709bcda9ceecccb6898c23e3e19f65dcea2`, ordered parents `ccb345dd` + `ecf71c0`; rebase/cherry-pick/history rewrite yok. Protected `.gitleaksignore`, R-016 runner/contracts/fixtures ve tool byte'ları `ecf71c0` ile exact kalır.
- Graph-reconciliation envelope: living schema-v2 manifest ortak prefix'i `W001-T03-bootstrap-merge-wrapper` dahil korur; `1dbc81b → 54a7b709` aralığını yalnız gerçek endpoint union'ındaki exact 49 path ile doğrular. Bu aggregate kayıt, tarihsel T03A/T04 dar sealed manifestlerini Git tarihinden silmez ve gelecekte aynı 49 path'e yazma yetkisi vermez.
- CodeQL remediation: `54a7b709 → 8a007b12e39478932387c2107c6dfc8665c0fea8` yalnız `scripts/generate-openapi.test.mjs`; complete CRLF fixture exact `SOURCE_CARRIAGE_RETURN_FORBIDDEN` ile fail-closed kalır. Production generator/runtime path'i değişmez.
- State promotion owned paths: `state/ACTIVE-WAVE.md`, `state/RELEASE-LEDGER.md`, `state/RISK-REGISTER.md`, `state/W001-EVIDENCE.md`, `state/W001-OWNERSHIP.md`. Final seal yalnız `state/W001-OWNERSHIP.json` değiştirebilir.
- Required gates: exact sealed head'de ownership, Node/pnpm full-tree, generated/OpenAPI drift, pinned Go build/vet/shuffle/race, pinned Gitleaks history+sibling canary, local R-016, fresh security/cold; PR #4 üzerinde trusted-base R-016, Dependency Review ve CodeQL. Ayrı owner exact-head onayı olmadan merge yoktur.

## W001-T04F — PostgreSQL 17 roles, migration ve readiness foundation

- Immutable task-phase base: `cd81ee7b36d5bc647bb297e8ede13b21a7f1c8f1`; tree `ce3cf10a186071f1f7c3fcb91347651fe0408b0d`. Branch/worktree: `codex/w001-t04f-postgres-foundation` / `C:\Users\ihsan\.codex\worktrees\HedefOra\W001\T04F`.
- Orchestrator task-open/state owner: `delivery/TOOLCHAIN-LOCK.md`, `state/ACTIVE-WAVE.md`, `state/DECISION-QUEUE.md`, `state/RELEASE-LEDGER.md`, `state/RISK-REGISTER.md`, `state/W001-EVIDENCE.md`, `state/W001-OWNERSHIP.md`, `state/W001-OWNERSHIP.json`.
- Dependency-free Phase A disjoint owners: architecture `contracts/database/**` + `db/migrations/**`; infra `infra/compose.dev.yml` + `infra/postgres/**`; quality `tests/integration/postgres/**`. Shared source-boundary değişikliği yalnız orchestrator: `scripts/check-generated.mjs` + `scripts/check-generated.test.mjs`.
- Dependency-gated backend owner: `internal/platform/postgres/**`; dependency manifests `go.mod` + `go.sum` yalnız orchestrator. DQ-008 owner/security kararı ve exact dependency R-016 admission'ı olmadan bu yollar için writer açılmaz.
- Readiness HTTP/compiler owner: `contracts/openapi/**`, sealed generator/generated roots ve mevcut `cmd`/`internal/platform/{app,config,health,http}` yolları bu task'a örtük dahil değildir. `/health/ready` ikinci operation'ı DQ-009 owner/security compiler admission'ı olmadan uygulanmaz.
- Acceptance: migration/app/worker/read-only roller ayrı; runtime DB owner değil; empty/up/down/upgrade ve privilege-negative PostgreSQL 17 testleri; TLS/timeout/pool; generic DB detail sızdırmayan `/health/ready`. Phase A yalnız role/migration/infra/test contract'ını karşılar; backend pool ve HTTP readiness tamamlanmadan T04F `COMPLETED` olamaz.
- Dependency verdict: PostgreSQL `17.11` exact OCI identity `CONDITIONAL`; daha yeni stable pgx yok. `pgx v5.10.0`, Testcontainers `v0.44.0` ve golang-migrate `v4.19.1` mevcut kanıtla default `NO-GO`; R-016 policy veya test eşiği düşürülemez. River T04G dışında tutulur.
- Exit: exact ownership seal; full-tree; migration/privilege/TLS/pool; local/hosted R-016; trusted-base PR; Dependency Review; CodeQL; fresh security/cold; ayrı exact-head owner merge ve post-merge doğrulama zorunludur. T04G ancak bu merge'in açtığı yeni immutable checkpoint'ten başlar.

## W001-T04G — River ve process baseline

- Future disjoint owners: architecture `contracts/jobs/**`; backend `internal/platform/jobs/**`; quality `tests/integration/river/**`.
- Base/exit: yalnız T04F owner merge ve post-merge kapılarının açtığı tek immutable checkpoint'ten başlar; kendi exact ownership seal/review/owner merge/post-merge exit'ini taşır.
- Acceptance: versioned payload/catalog parity, exact queue/process subscriptions, transactional enqueue/rollback, retry/restart/failure injection. Test-only probe River mekaniğini doğrulayabilir; fake production job üretmez. Gerçek product job yokken production catalog boş kalır.

## W001-T04H — Integrated review ve runtime owner merge gate

- State/evidence writer: orchestrator; security ve cold reviewer fresh-context/read-only.
- State: `PENDING`; yalnız T04F ve T04G owner merge/post-merge checkpoint'lerinden sonra final W001 integrated exit olarak açılır.
- Required: full-tree + generated drift + migration/River applicability, local/hosted R-016, hosted security, exact ownership seal, final security/cold verdict ve gerekiyorsa state-only ayrı exact-head owner merge onayı.
- Protected R-016 control-plane path'i değişirse runtime target ile karıştırılmaz; ayrı control-only bootstrap ve owner gate'i gerekir.

## Merge ve rollback

1. W001 açılış state commit'i.
2. Manifest-only ownership seal.
3. R-016 control-plane implementation + tests + docs.
4. Manifest-only seal ve exact-target full-tree/security/cold review.
5. İlk bootstrap PR'ı explicit owner approval ile owner-controlled two-parent, content-identical merge edildi; bootstrap trusted gate'i `NOT_RUN`, post-merge local/hosted full-tree `PASS` kaydedildi.
6. Runtime checkpoint/DAG governance commit'i ve manifest-only ownership seal.
7. Yeni base üzerinde ayrı target/runtime PR'ı; trusted-base gate `PASS` olmadan ilerlemez. Protected control-plane değişikliği gerekiyorsa yine önce control-only owner-approved bootstrap, sonra ayrı target PR yapılır.
8. Ayrı exact runtime head owner onayı, two-parent content-identical merge ve final `main` push merge-wrapper/full-tree gate.

Squash/rebase/direct push kabul edilmez. Merge öncesi güvenli rollback W001 PR'ını merge etmemektir. Merge sonrasında repository public iken eski workflow tree'sine ham revert yasaktır: progression durdurulur, owner onayıyla repository private yapılır, exact ID/full-name/visibility ve hosted capability yeniden doğrulanır, ancak bundan sonra reviewed revert PR değerlendirilebilir; source boundary mümkünse korunur. Hosted CodeQL/Dependency Review kullanılabildiği sürece gerçek gate'tir; branch/ruleset enforcement doğrulanana kadar `BLOCKED_EXTERNAL` kalır. VPS/DNS rollback bu task için `NOT_APPLICABLE`, çünkü dış sistem mutation'ı yoktur.

## Secret ve artifact sınırı

- Password, token, private key, cookie, MFA/recovery code, gerçek `.env` ve production verisi okunmaz veya commitlenmez.
- Scanner DB/cache, redacted raw output ve evidence çalışma artifact'ları `artifacts/**` altında kalır ve commitlenmez. Cloned rule byte'ları yalnız run-specific OS temp kökünde tutulur, artifact'e taşınmaz ve cleanup ile silinir.
- Scanner/rules/DB acquisition hatası eski cache'e veya önceki PASS artifact'ına düşmez; yeni ve izole run fail-closed biter.
