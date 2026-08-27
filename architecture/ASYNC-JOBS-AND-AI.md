# Asenkron İşler ve AI

## River neden kullanılır

PostgreSQL ile aynı transactional boundary içinde güvenilir job enqueue ve idempotent processing sağlar; MVP'de ikinci broker ihtiyacını azaltır.

## Queue sınıfları

- `critical`: security/account/legal transitions,
- `email`: verification/reset/notification,
- `upload`: validation/analysis,
- `ai`: bounded enhancement,
- `export`: user data export,
- `maintenance`: cleanup/retention/reconciliation.

Exact process-to-queue subscription registry kodla ve testle doğrulanır.

## Job lifecycle

- AVAILABLE
- RUNNING
- RETRYABLE
- SUCCEEDED
- SUPPRESSED
- FAILED_TERMINAL
- CANCELLED

Provider “accepted” durumu sonsuza kadar bekleyemez; reconciliation ve terminal timeout vardır.

## Retry

- exponential backoff + jitter,
- max attempt/time budget,
- retryable/non-retryable classification,
- duplicate-safe provider idempotency,
- attempt history,
- manual retry permission/audit.

## AI request contract

- explicit purpose,
- user/tenant capability,
- source IDs ve immutable content hashes,
- prompt/template version,
- model/provider policy,
- token/cost/time budget,
- output schema,
- data retention setting,
- evaluation status.

## AI output lifecycle

- REQUESTED
- PROCESSING
- VALIDATING
- READY
- REJECTED
- FAILED
- EXPIRED

READY AI output dahi yalnız öneridir. Kullanıcı veya deterministic command tarafından kabul edilmeden canonical plan/content olmaz.

## Provider exit

Provider-specific type/domain modeli core'a sızmaz. Adapter contract, timeouts, errors, data-use policy ve fallback test edilir. Model/provider değişikliği evaluation gate ister.
