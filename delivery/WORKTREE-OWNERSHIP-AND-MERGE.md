# Worktree, Ownership ve Merge Protokolü

## Immutable base

Wave açılırken:

- `WAVE_START_COMMIT` kaydedilir,
- tüm task branch/worktree'leri bu SHA'dan oluşturulur,
- wave içinde hareket eden `HEAD` base olarak kullanılmaz.

## İsimlendirme

- branch: `wave/<wave-id>/<task-id>-<slug>`
- worktree: `.worktrees/<wave-id>/<task-id>` veya dış güvenli dizin
- commit: conventional, task ID içerir.

## File ownership

Her task için:

- `owned_paths`,
- `read_paths`,
- `forbidden_paths`,
- `shared_proposals`,
- expected tests

belirlenir.

Bir path yalnız bir active writer'a atanır. Generated/vendor/secret paths ayrı policy'dir.

## Shared-file proposal

OpenAPI root, migration index, dependency lock, root config, AGENTS, decisions, registry ve release state gibi dosyalar orchestrator-owned olabilir.

Builder önerisi şunları taşır:

- task ID,
- base SHA,
- hedef path,
- amaç,
- exact patch veya semantic change,
- dependency/order,
- test etkisi,
- conflict riski.

Orchestrator proposal'ı current merged tree üzerinde uygular, regenerate eder ve test eder.

## Merge sırası

1. contracts/data boundary,
2. backend implementation,
3. generated client/artifacts,
4. frontend,
5. tests/docs,
6. infra/release.

Gerçek dependency graph farklıysa state'e yazılır.

## Conflict

Ajan conflict'i kendi branch'inde `ours/theirs` ile kör çözmez. Orchestrator canonical docs ve current tree üzerinden çözer; davranış değişiyorsa ADR/decision gerekir.

## Merge sonrası

Worktree testleri yeterli değildir. Full merged tree'de:

- generation drift,
- architecture fitness,
- unit/integration/E2E,
- migration,
- security/quality

yeniden çalışır.
