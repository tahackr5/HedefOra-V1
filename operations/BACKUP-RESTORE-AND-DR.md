# Backup, Restore ve Disaster Recovery

## Varlıklar

- Git repository ve release artifacts,
- PostgreSQL data/WAL,
- object storage,
- environment desired-state,
- Cloudflare/DNS config inventory,
- encrypted secrets inventory/rotation metadata,
- legal/curriculum/source registry artifacts,
- audit evidence.

## 3-2-1

En az üç kopya, iki farklı ortam, bir off-site/immutable kopya. Aynı sunucudaki ikinci disk off-site değildir.

## Başlangıç hedefleri

Launch gate için ölçülmek üzere:

- source/docs RPO: near-zero Git push + günlük encrypted mirror,
- DB RPO: ≤15 dakika hedef PITR,
- production RTO: ≤4 saat,
- restore test: en az quarterly; büyük migration/release öncesi ek prova.

Hedefler altyapı/bütçe onayıyla revize edilebilir; ölçülmeden sağlandı denmez.

## Restore rehearsal

1. Isolated recovery environment.
2. Exact backup set/checksum.
3. DB restore/PITR.
4. Object artifact restore/reference validation.
5. Migration/app compatible release deploy.
6. Data integrity queries.
7. Critical user/admin flow smoke.
8. Measured RPO/RTO.
9. Secret rotation/cleanup.
10. Evidence ve bulgu düzeltmesi.

## Felaket senaryoları

- origin host kaybı,
- DB corruption/operator delete,
- compromised SSH key,
- bad migration,
- Cloudflare/account loss,
- object storage loss,
- GitHub account/repo loss,
- ransomware/credential compromise.

Her senaryo owner/incident rolü, restore source, DNS/traffic action ve verification taşır.
