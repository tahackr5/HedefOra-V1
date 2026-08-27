# Deployment Runbook

## Pre-deploy

- release commit/digest sabit,
- CI/full-tree gates PASS,
- security/review status,
- migration compatibility,
- backup freshness,
- rollback artifact,
- change window/owner approval,
- incident communication readiness.

## Staging

1. Immutable artifact deploy.
2. Migration preflight/apply.
3. Health/readiness.
4. Critical smoke/E2E.
5. Queue/email/upload/provider controlled tests.
6. Sentry/metrics/log release marker.
7. Rollback drill gerektiğinde.

## Production

Production komutları yalnız owner approval sonrası uygulanır.

1. Confirm environment/host/commit/digest.
2. Freeze concurrent deploy.
3. Record pre-state.
4. Apply compatible migration.
5. Start canary/new release.
6. Run synthetic critical flow.
7. Observe error/latency/queue/DB.
8. Promote or rollback.
9. Record post-state and evidence.

## Abort koşulları

- backup stale,
- unknown migration state,
- wrong environment/commit/digest,
- critical/high unaccepted finding,
- health/synthetic failure,
- DB error/lock/queue runaway,
- telemetry unavailable,
- owner approval missing.

## Rollback

- traffic previous release'e,
- workers compatible previous image'e,
- irreversible DB mutation varsa automatic rollback yok; recovery plan,
- verify critical flow,
- preserve failed release evidence,
- incident/postmortem aç.
