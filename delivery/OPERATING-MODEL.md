# Çalışma Modeli

## Roller

- Owner: scope, legal, provider, production ve irreversible kararları onaylar.
- Orchestrator: DAG, context, agents, ownership, merge, gates ve evidence sahibi.
- Builder agents: bounded file ownership içinde implementasyon.
- Review agents: correctness/security/quality; read-only veya no-code-change.
- CI: deterministic gate runner.

## Owner gate gerektirenler

- production deploy/rollback,
- production migration veya restore,
- secret/key rotation ve erişim politikası,
- DNS/Cloudflare production değişikliği,
- legal document ACTIVE yapma,
- scope genişletme veya breaking API,
- yeni yüksek-risk provider/dependency,
- veri silme/retention/legal hold değişikliği,
- security incident containment kararı,
- bütçe veya ücretli hizmet taahhüdü.

## Owner gate gerektirmeyenler

- test ekleme,
- refactor davranışı koruyorsa,
- geri alınabilir local/staging config,
- minor dependency patch güncellemesi gate'ler geçiyorsa,
- docs/typo,
- implementation ayrıntıları kanonik sınırlar içindeyse.

## Wave döngüsü

1. Scope ve acceptance freeze.
2. `WAVE_START_COMMIT` kaydı.
3. Task DAG ve file ownership.
4. Read-heavy discovery/review.
5. Isolated worktree implementation.
6. Shared proposal merge.
7. Merged-tree gates.
8. Plugin reviews/security scan gerektiği kadar.
9. Fresh-context cold review.
10. Evidence + end commit + exit decision.

## Status

- NOT_STARTED
- IN_PROGRESS
- BLOCKED_EXTERNAL
- BLOCKED_OWNER
- FAILED
- PASS
- ROLLED_BACK

“PARTIAL PASS” exit gate değildir.

## Kesinti ve resume

Orchestrator her anlamlı aşamada `state/ACTIVE-WAVE.md` günceller. Yeni oturum yalnız bu state, start commit ve Git tree'den devam eder; sohbet hafızasına güvenmez.
