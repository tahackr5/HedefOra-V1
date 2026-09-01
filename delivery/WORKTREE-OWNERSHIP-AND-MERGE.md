# Worktree, Ownership ve Merge Protokolü

## Immutable base

Wave açılırken `WAVE_START_COMMIT` ve tree tarihsel provenance olarak kaydedilir ve değiştirilmez. Aynı task fazındaki tüm writer branch/worktree'leri `state/ACTIVE-WAVE.md` içindeki tek `TASK_PHASE_BASE` SHA'sından açılır; hareket eden `HEAD` base olarak kullanılmaz.

Task-phase base yalnız owner-onaylı exact head'in two-parent, content-identical merge'i uzak `main`e girdikten; ordered parent/tree doğrulandıktan; post-merge local+hosted full-tree ve R-016 ile uygulanabilir hosted security gate'leri geçtikten sonra ilerletilebilir. İlk control-plane bootstrap'ının base runner yokluğundan kaynaklanan trusted-PR `NOT_RUN` sonucu tek seferlik ve açık kayıtlıdır; runtime target'ta tekrar edemez. Eski wave start kaydı silinmez; merge/gate/ownership continuity kanıtı checkpoint ile tutulur. Farklı writer'lar farklı checkpoint kullanamaz.

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

## SHA-mühürlü wave entegrasyonu

Commit SHA'larını kanıt zinciri olarak kullanan wave'lerde GitHub entegrasyonu yalnız iki-parent merge commit ile yapılır. Squash ve rebase merge, mühürlenmiş task SHA'larını yeniden yazdığı için kapalı tutulur. Merge commit:

- birinci parent olarak güncel `main` commit'ini,
- ikinci parent olarak required check'leri geçen exact PR head'ini

taşır. Birinci parent ikinci parent'ın atası olmalı ve merge commit tree'si ikinci parent tree'siyle aynı olmalıdır; conflict-resolution veya wrapper-only içerik kabul edilmez. PR branch'i yalnız `READY_TO_MERGE` olabilir. Wave ancak final `main` push workflow'u merge-wrapper doğrulamasıyla ve full-tree gate'lerle geçince `COMPLETED` olur.

İlgili GitHub repository ayarlarında merge commit açık, squash/rebase/linear-history/force-push/delete kapalı, PR ve required checks zorunlu olmalıdır. Bu dış ayarlar API veya UI kanıtı olmadan etkin varsayılmaz.

Canlı repository ayarları branch/ruleset enforcement sağlamıyorsa bu eksik `BLOCKED_EXTERNAL` ve `R-014` olarak kalır. Owner-onaylı geçici akış yalnız exact PR-head clean-clone/quality/security/cold ve kullanılabilir hosted gate kanıtı, head-SHA kilitli owner merge'i, two-parent content-identical merge commit, `repolint -merge-wrapper` ve final `main` push full-tree gate'i ile ilerleyebilir. Bu client-side akış direct/force push veya branch deletion'ı server tarafında engellemez; hosted protection ile eşdeğer değildir ve uygun plan/entegrasyon sağlanınca kaldırılır.

Public repository güvenlik workflow'u rollback edilecekse önce progression durur; owner repository'yi private yapar; exact repository kimliği, visibility ve hosted capability'ler yeniden doğrulanır. Eski workflow tree'sine public durumdayken ham revert yapılmaz ve source boundary mümkünse rollback boyunca korunur.
