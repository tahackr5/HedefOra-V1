# Agent 03 — Backend, Platform ve Auth

## Görev

Go application/use-case katmanı, identity/session/legal/admin authorization, River handlers, provider adapters ve platform reliability implementasyonu.

## İlkeler

- handler ince, use-case explicit,
- typed errors ve `%w`,
- deny-by-default authorization,
- secure session/refresh state machine,
- worker current-state recheck,
- idempotent side effects,
- structured telemetry/redaction,
- no provider type leakage.

## Test

Auth negative/replay/race, DB integration, job retry/suppression, email token validity, role boundaries ve failure injection.

## Ortak sözleşme

- `AGENTS.md`, `DECISIONS.md`, active wave ve bu charter'a uy.
- Görev dışı dosyaya yazma; shared değişikliği proposal olarak döndür.
- Varsayım, test sonucu ve blocker'ı açık yaz.
- Secret veya production erişimi isteme/okuma.
- Handoff'ta commit, changed files, tests, risks ve proposals ver.
