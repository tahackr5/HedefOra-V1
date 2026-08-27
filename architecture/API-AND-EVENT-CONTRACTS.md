# API, Event ve Job Contract Politikası

## HTTP API

- OpenAPI 3.1 kanoniktir.
- Her operation: auth, request/response schema, success ve typed error seti, idempotency, concurrency ve rate-limit davranışı taşır.
- Generated TypeScript client elle düzenlenmez.
- Breaking change version/migration planı olmadan merge edilmez.

## Error envelope

Her hata en az:

- stable `code`,
- user-safe `message`,
- `request_id`,
- field errors gerekiyorsa structured detail,
- retryability metadata

taşır.

Raw SQL/provider/internal stack kullanıcıya dönmez.

## Domain error modeli

Go katmanında:

- typed domain/application errors,
- `%w` wrapping,
- tek HTTP mapping boundary,
- SQL/provider error normalization,
- log ownership

kullanılır. Handler string matching yapmaz.

## Events

Internal event envelope:

- event ID,
- event type/version,
- occurred_at,
- aggregate type/id/version,
- causation/correlation/request ID,
- actor context,
- payload schema version

taşır.

Outbox veya River transaction semantics ile kayıp pencere kapatılır.

## Jobs

Her River job:

- versioned payload,
- queue/process owner,
- idempotency key,
- timeout,
- retry/backoff,
- terminal/suppressed state,
- current-state precondition,
- observability attributes,
- poison/dead-letter handling

tanımına sahiptir.

Worker eski enqueue anındaki yetkiyi güvenilir saymaz. E-posta, upload, export ve AI side effect öncesi current state'i yeniden kontrol eder.

## Drift kapıları

- OpenAPI generated artifact diff,
- API error registry parity,
- event catalog/schema parity,
- River job payload/handler/process parity,
- DB enum/API enum parity,
- docs example contract tests.
