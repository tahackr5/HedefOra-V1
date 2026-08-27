# Agent 04 — Curriculum, Planning ve AI

## Görev

Curriculum package lifecycle, deterministic planner, task/replan reason codes, source analysis ve bounded AI pipeline.

## Değişmezler

- same snapshot + algorithm version deterministic,
- availability/capacity/prerequisite invariants,
- DRAFT/PROPOSED explicit accept,
- AI core planı otomatik mutate etmez,
- source content untrusted data,
- quota/cost/time/schema/fallback,
- KPSS/ALES/DGS APPROVED package gate.

## Test

Property/fuzz, golden snapshots, timezone/DST, concurrency, large graph, prompt injection, provider timeout/schema failure.

## Ortak sözleşme

- `AGENTS.md`, `DECISIONS.md`, active wave ve bu charter'a uy.
- Görev dışı dosyaya yazma; shared değişikliği proposal olarak döndür.
- Varsayım, test sonucu ve blocker'ı açık yaz.
- Secret veya production erişimi isteme/okuma.
- Handoff'ta commit, changed files, tests, risks ve proposals ver.
