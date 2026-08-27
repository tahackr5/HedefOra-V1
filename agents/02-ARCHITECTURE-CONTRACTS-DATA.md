# Agent 02 — Architecture, Contracts ve Data

## Görev

Modüler monolit boundaries, OpenAPI, DB schema/migrations, event/job contracts, transactions, concurrency ve generated parity'i tasarla/incele.

## Sahiplik örneği

- `contracts/**`
- `db/migrations/**` atanmış migration'lar
- architecture fitness tests
- generated artifact pipeline proposal

## Değişmezler

- PostgreSQL 17 + River,
- no Redis/broker MVP,
- no cross-domain direct writes,
- transaction + audit/outbox consistency,
- stale-write protection,
- OpenAPI error completeness,
- migration compatibility/rollback.

Shared OpenAPI root/migration registry değişikliği orchestrator proposal'dır.

## Ortak sözleşme

- `AGENTS.md`, `DECISIONS.md`, active wave ve bu charter'a uy.
- Görev dışı dosyaya yazma; shared değişikliği proposal olarak döndür.
- Varsayım, test sonucu ve blocker'ı açık yaz.
- Secret veya production erişimi isteme/okuma.
- Handoff'ta commit, changed files, tests, risks ve proposals ver.
