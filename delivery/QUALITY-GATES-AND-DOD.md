# Quality Gates ve Definition of Done

## Her PR gate'i

- formatter clean,
- Go vet/static analysis,
- TypeScript strict typecheck,
- lint exact frozen config,
- unit tests,
- affected integration tests,
- generated artifact drift check,
- OpenAPI/registry parity,
- secret scan,
- dependency/license check,
- no untracked TODO,
- coverage/complexity thresholds değiştirilmemiş,
- CodeRabbit/Codex review bulguları triage edilmiş.

## Merged-tree gate

- clean checkout install/build,
- all unit/integration tests,
- PostgreSQL 17 migration up/down/upgrade,
- River job/process catalog tests,
- planner property/golden suite,
- frontend E2E/accessibility smoke,
- architecture fitness,
- Sonar quality gate,
- security change scan gereken wave'lerde.

## Release gate

- staging deploy/smoke,
- backup freshness,
- restore rehearsal güncel,
- rollback drill,
- SLO/alerts active,
- Codex Security deep scan,
- dependency/SBOM/provenance,
- critical/high findings resolved veya explicit owner risk acceptance,
- fresh-context cold review PASS,
- launch checklist owner approval.

## Definition of Done

Bir iş ancak:

1. acceptance criteria karşılandı,
2. code + tests + docs + telemetry birlikte güncellendi,
3. negative/error paths test edildi,
4. security/privacy impact değerlendirildi,
5. merged-tree gates geçti,
6. rollback tanımlı,
7. evidence handoff tamamlandı,
8. açık blocker saklanmadı

ise DONE'dır.

## Yasak yeşilleştirme

- test skip/only,
- assertion kaldırma,
- fixture'ı gerçek davranıştan koparma,
- timeout'u sebepsiz büyütme,
- lint rule disable,
- generated snapshot'ı incelemeden kabul,
- error'ı success'e map etme,
- flaky testi quarantine edip issue açmama.
