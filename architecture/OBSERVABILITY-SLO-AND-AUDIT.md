# Gözlemlenebilirlik, SLO ve Audit

## Telemetry ilkesi

Metrics, logs ve traces aynı request/correlation ID ile ilişkilidir. Hassas data redaction default'tur.

## Ana SLI'lar

- API availability ve latency,
- auth failure/abuse rate,
- planner generation latency/failure,
- Today view latency,
- River queue age/depth/failure,
- email send/delivery/suppression,
- upload validation time/failure,
- AI cost/latency/schema failure,
- DB pool/lock/deadlock,
- backup freshness ve restore verification,
- deploy/rollback success.

## Başlangıç SLO hedefleri

Launch öncesi load test ile doğrulanmak üzere:

- public/app API aylık availability: ≥99.9%,
- core interactive p95: ≤500 ms origin budget,
- Today page usable p75: ≤2.5 s hedef ağ profili,
- critical queue age p95: ≤60 s,
- backup freshness: policy hedefi içinde,
- zero unresolved critical security finding at release.

SLO sayıları ölçüm olmadan başarı ilanı için kullanılmaz.

## Logging

Structured logs:

- timestamp,
- severity,
- service/process,
- event code,
- request/correlation/job ID,
- actor pseudonymous ID gerekiyorsa,
- outcome/duration

taşır.

Raw token, password, private key, full source content, legal consent body veya sensitive profile loglanmaz.

## Sentry

- release/environment tagging,
- source maps,
- PII scrubbing,
- alert ownership,
- regression detection,
- deploy markers.

Sentry data, audit source-of-truth değildir.

## Audit

Security/admin/legal/data lifecycle eventleri append-only audit'tir. Audit:

- actor,
- action,
- target,
- reason,
- before/after reference veya hash,
- request/operation/attempt,
- time/outcome

taşır.

Audit digest/anchor/verification işleri process ownership ve retention ile birlikte test edilir.
