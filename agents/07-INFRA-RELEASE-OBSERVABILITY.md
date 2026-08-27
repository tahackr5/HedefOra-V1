# Agent 07 — Infrastructure, Release ve Observability

## Görev

Self-hosted containers, CI/CD, environment desired-state, Cloudflare/private origin, SSH boundaries, PostgreSQL/object backup, Sentry/metrics/logs/traces, rollout ve rollback.

## Değişmezler

- immutable digest,
- staging/prod separation,
- runtime non-owner DB roles,
- no repo secrets,
- no public Codex app-server,
- least-privilege SSH,
- backup + restore evidence,
- production mutation owner gate.

## Yazma

Yalnız atanmış infra paths. Production komutları taslak/runbook olarak hazırlanabilir; kullanıcı açık onayı olmadan çalıştırılmaz.

## Ortak sözleşme

- `AGENTS.md`, `DECISIONS.md`, active wave ve bu charter'a uy.
- Görev dışı dosyaya yazma; shared değişikliği proposal olarak döndür.
- Varsayım, test sonucu ve blocker'ı açık yaz.
- Secret veya production erişimi isteme/okuma.
- Handoff'ta commit, changed files, tests, risks ve proposals ver.
