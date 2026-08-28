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

| Gate | Status | Evidence |
|---|---|---|
| Wave opening identity/ownership | IN_PROGRESS | Açılış state commit'i ve manifest-only seal bekleniyor |
| Scanner and rules research | IN_PROGRESS | Resmi primary-source ve runtime identity doğrulaması sürüyor |
| SAST implementation | NOT_RUN | — |
| Dependency vulnerability implementation | NOT_RUN | — |
| License implementation | NOT_RUN | — |
| Negative fixtures | NOT_RUN | — |
| Exact-target local/full-tree | NOT_RUN | — |
| Security review | NOT_RUN | — |
| Cold review | NOT_RUN | — |
| GitHub exact-head quality | NOT_RUN | — |
| Hosted security/enforcement | BLOCKED_EXTERNAL | DEC-024 / R-014 / R-016 |

## Acceptance notes

- Scanner success with zero parsed inputs/targets is failure.
- pnpm multi-document lock'un tek belgesini taramak failure'dır; package-manager/config ve workspace graph'ları ayrı source identity ve inventory parity taşır.
- Go'da third-party module sayısının sıfır olması yalnız `go list -m all` ve scanner kapsamı gerçekten çalıştıysa PASS olabilir.
- Advisory DB missing, stale, future-dated, hash-mismatch veya parse edilemezse failure'dır.
- Scanner raw exit, signal, timeout, malformed JSON, internal veya network error başarıya map edilmez.
- Önceki koşum cache/output/evidence'ı yeni koşuma fallback olamaz.

## Açık riskler

- R-016 `OPEN`: implementation ve exact-target kanıtı yok.
- R-014 `OPEN`: server-side merge enforcement private planda yok.
- R-001/R-009/R-013 W007/pre-user sınırına kadar açık; W001'i engellemez.
