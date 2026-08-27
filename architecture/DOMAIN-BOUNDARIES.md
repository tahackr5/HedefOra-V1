# Domain Sınırları

## Modüller

1. **Identity** — users, credentials, sessions, email verification, re-auth.
2. **Legal & Privacy** — legal documents, consent history, export/delete.
3. **Profile & Availability** — learner profile, timezone, availability, preferences.
4. **Curriculum** — exam packages, subject/topic graph, approvals.
5. **Sources** — source metadata, upload lifecycle, ownership, abuse.
6. **Planning** — plans, revisions, tasks, planner reasons.
7. **Progress** — completion, skip, reschedule, aggregates.
8. **AI Enhancement** — requests, budget, provider result, evaluation.
9. **Notifications** — email intent, immutable envelope, delivery state.
10. **Operations & Admin** — operations, attempts, retries, audit, support.

## Kurallar

- Her tablo ve domain command tek modül sahibine sahiptir.
- Başka modülün tablosuna doğrudan write yasaktır.
- Cross-module değişiklik application service/command ile veya internal event/outbox ile yapılır.
- Import graph içeri doğru akar; infrastructure domain'i sahiplenmez.
- Shared utility yalnız gerçekten domain-agnostic ise `platform` katmanına çıkar.
- “common” klasörüne business rule gömülmez.
- HTTP handler business transaction yürütmez; use-case çağırır.
- Worker aynı use-case veya bounded job handler üzerinden ilerler.

## Public vs internal contract

- Public API OpenAPI ile versionlanır.
- Internal Go interface, yalnız iki gerçek implementasyon/consumer veya test boundary gerektiriyorsa çıkarılır.
- Event schema owner modüldedir; consumer compatibility test edilir.
- DB enum ile API enum arasında manual duplicate registry tutulmaz; generation/parity gerekir.

## Mimari fitness

CI aşağıdakileri executable biçimde denetlemelidir:

- forbidden imports,
- package cycles,
- cross-domain repository usage,
- generated-file edits,
- registry drift,
- migration ownership,
- exported API büyümesi,
- dependency direction.
