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

## Wave applicability ve durum sözlüğü

Her wave başında orchestrator, gate'i owning artifact ve acceptance criterion ile eşler. Kanıt durumu yalnız şunlardan biri olabilir:

- `PASS`: uygulanabilir gate çalıştı ve başarılı oldu,
- `FAIL`: uygulanabilir gate çalıştı ve başarısız oldu,
- `NOT_RUN`: uygulanabilir gate henüz çalışmadı,
- `NOT_APPLICABLE`: owning artifact/behavior aktif wave'de henüz yok; wave planı ve path kanıtı yazıldı,
- `BLOCKED_EXTERNAL`: gerekli dış servis/entegrasyon doğrulanamadı.

`NOT_APPLICABLE` PASS değildir. Mevcut bir artifact, acceptance criterion veya değişen davranış için kullanılamaz; gelecekteki suite'i sahte bir stub ile yeşil göstermez. W000'da migration, River catalog, planner property/golden ve ürün E2E gate'leri kendi owning wave'lerine kadar kanıtlı `NOT_APPLICABLE` kalabilir. Mevcut config, scaffolding, validator, dependency ve CI artifact'larının bütün gate'leri ise uygulanır.

## Hosted gate için telafi kontrolü

Bir hosted kontrol plan/entegrasyon nedeniyle çalışmıyorsa yalnız owner-onaylı, süreli telafi sözleşmesi wave progression'a izin verebilir. Kayıt şunları taşır:

- çalışmayan capability ve `BLOCKED_EXTERNAL` sonucu,
- exact source SHA/tree,
- yerel/OSS telafi kontrolü ile kapsanan ve kapsanmayan tehdit sınıfları,
- pinned scanner/rule/advisory DB kimlikleri ve fail-closed negatif testler,
- residual risk owner'ı, son tarih/owning wave ve kaldırma koşulu,
- owner risk acceptance ve literal gate kanıtı.

Telafi kontrolü hosted sonucu `PASS` yapmaz. Branch protection yokluğu, client-side merge prosedürüyle yalnız azaltılır; server-side enforcement kanıtı oluşana kadar açık risk kalır. W001 runtime davranışından önce pinned OSS SAST ve all-scope dependency vulnerability/license kapısı uygulanır.

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
