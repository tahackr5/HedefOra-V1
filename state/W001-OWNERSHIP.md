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

## W001-T02 — R-016 supply-chain gates

- Writer: orchestrator.
- Owned paths: `.github/workflows/ci.yml`, `.gitignore`, `package.json`, `security/**`, `scripts/supply-chain/**`, `scripts/fixtures/supply-chain/**`, `delivery/DEPENDENCY-AND-SUPPLY-CHAIN.md`, `delivery/TOOLCHAIN-LOCK.md`, `state/ACTIVE-WAVE.md`, `state/RISK-REGISTER.md`, `state/W001-EVIDENCE.md`, `state/W001-OWNERSHIP.md`, `state/W001-OWNERSHIP.json`.
- Read paths: bütün committed dependency manifests/lockfiles, tracked Go/JavaScript/TypeScript source, current CI ve repository validators.
- Forbidden paths: `apps/**`, `contracts/**`, `infra/**`, database/migration/runtime behavior, `DECISIONS.md`, `architecture/**`, historical `state/W000-*`, secrets ve generated/vendor çıktıları.
- Expected gates: scanner/policy unit tests; real pinned Semgrep ve OSV integration; vulnerable dev/unknown fixture; disallowed/unknown license; missing/stale/hash-mismatch DB; malformed output, timeout, internal/network error; multi-document inventory parity; existing `pnpm ci:check`, Go, TOML, actionlint, Gitleaks ve ownership gates.

## W001-T03 — Exact-target evidence ve review

- State/evidence writer: orchestrator only.
- Security ve cold reviewer: fresh-context, read-only, exact sealed SHA/tree.
- Owned paths: `state/ACTIVE-WAVE.md`, `state/RELEASE-LEDGER.md`, `state/RISK-REGISTER.md`, `state/W001-EVIDENCE.md`, `state/W001-OWNERSHIP.md`, `state/W001-OWNERSHIP.json`.
- R-016 yalnız scanner image/binary, rule tree, policy/config ve npm/Go advisory DB kimlikleriyle; literal commands/exits ve negative fixture kanıtıyla `PASS` olabilir.

## Merge ve rollback

1. W001 açılış state commit'i.
2. Manifest-only ownership seal.
3. R-016 implementation + tests + docs.
4. Manifest-only seal ve exact-target full-tree/security/cold review.
5. Owner-controlled two-parent, content-identical GitHub merge.
6. Final `main` push active-wave merge-wrapper/full-tree gate.

Squash/rebase/direct push kabul edilmez. Rollback, W001 PR'ını merge etmemek veya exact two-parent merge'i yeni bir reviewed revert PR ile geri almaktır; hosted kontroller çözülene kadar `BLOCKED_EXTERNAL` kalır. VPS/DNS rollback bu task için `NOT_APPLICABLE`, çünkü dış sistem mutation'ı yoktur.

## Secret ve artifact sınırı

- Password, token, private key, cookie, MFA/recovery code, gerçek `.env` ve production verisi okunmaz veya commitlenmez.
- Scanner DB/cache, cloned rules, raw output ve evidence çalışma artifact'ları `artifacts/**` altında kalır ve commitlenmez.
- Scanner/rules/DB acquisition hatası eski cache'e veya önceki PASS artifact'ına düşmez; yeni ve izole run fail-closed biter.
