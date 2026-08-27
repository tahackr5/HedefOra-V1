# Test Stratejisi

## Test piramidi

### Unit

- domain state machines,
- planner rules,
- reason/error mapping,
- validation,
- authorization policy.

### Property/fuzz

- planner capacity/overlap/determinism,
- timezones and intervals,
- parser/untrusted inputs,
- idempotency/replay.

### Integration

- real PostgreSQL 17,
- migrations,
- River enqueue/worker/retry,
- repository transactions/locks,
- object storage adapter contract,
- provider adapters with controlled fakes.

### Contract

- OpenAPI request/response/error examples,
- generated client compatibility,
- event/job schema,
- provider webhook signature/replay.

### E2E

- register → verify → onboard → draft → accept → Today,
- complete/skip/reschedule/replan,
- upload quarantine → validation → ready/failure,
- export/delete,
- admin step-up and retry,
- accessibility keyboard paths.

### Non-functional

- load/latency,
- queue backpressure,
- DB lock/deadlock,
- backup/restore,
- security negative/DAST,
- chaos/restart/idempotency.

## Deterministik ortam

- pinned dependency/tool versions,
- fixed timezone/clock helpers,
- seeded random tests with replay seed,
- isolated DB schema/database,
- no production network dependency,
- provider fakes fail closed.

## Evidence

Her suite command, environment, duration, exit code ve artifact location kaydedilir. “Testler geçti” cümlesi komut/sonuç olmadan kanıt değildir.
