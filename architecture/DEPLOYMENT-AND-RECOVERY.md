# Dağıtım ve Recovery Mimarisi

## Ortamlar

- local
- CI/test
- staging
- production

Staging ve production:

- ayrı DB/object storage,
- ayrı secrets,
- ayrı Cloudflare bindings/routes,
- ayrı SSH key/account veya en az ayrı authorized key policy,
- ayrı Sentry environment,
- ayrı Resend sender/test policy

kullanır.

## Artifact

- CI'da üretilen immutable OCI image,
- digest ile deploy,
- SBOM ve provenance,
- generated frontend assets aynı release ID,
- mutable `latest` production source of truth değildir.

## Deploy sırası

1. preflight ve backup freshness,
2. compatible migration expand,
3. API/worker canary veya controlled rollout,
4. smoke + synthetic checks,
5. migration/data verification,
6. traffic promotion,
7. post-deploy telemetry,
8. contract step sonrası cleanup.

## Rollback

- previous image digest hazır,
- backward-compatible DB window,
- feature flag/config rollback,
- worker queue compatibility,
- rollback decision/evidence.

DB destructive rollback otomatik varsayılmaz.

## Private origin

Cloudflare public entry'dir. Origin yalnız gerekli Cloudflare/VPN/admin network path'lerinden erişilir. App-server veya Codex remote transport public listener olarak açılmaz.

## Recovery

- encrypted DB base backup + WAL/point-in-time strategy,
- object storage backup/versioning,
- Git/source mirror,
- secrets inventory/rotation runbook,
- DNS/config desired-state,
- quarterly restore rehearsal,
- evidence ve measured RPO/RTO.
