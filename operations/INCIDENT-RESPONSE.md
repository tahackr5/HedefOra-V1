# Incident Response

## Seviyeler

- SEV-1: aktif veri ihlali, geniş erişilemezlik, veri kaybı/corruption.
- SEV-2: kritik kullanıcı akışı bozuk, güvenlik açığı exposure ihtimali, queue/DB ciddi degradation.
- SEV-3: sınırlı bug/degradation, workaround var.

## İlk 15 dakika

- incident ID/severity/commander,
- etkilenen environment/release,
- user impact,
- evidence preservation,
- deploy/change freeze,
- containment seçenekleri,
- owner/security notification.

## Triage kaynakları

- Sentry,
- metrics/logs/traces,
- recent GitHub PR/deploy,
- Cloudflare events,
- River queue/attempts,
- PostgreSQL locks/replication/backup,
- Resend delivery,
- OS/auth logs.

## Değişiklik onayı

Production restart/rollback, feature disable, key rotation, DB repair/restore ve traffic change owner/incident approval ister. Acil break-glass eylem sonradan tam audit/postmortem ister.

## Communication

Bilinen, bilinmeyen, etki, mitigation ve next update time ayrı yazılır. Spekülasyon ve kullanıcı verisini ifşa eden ayrıntı yoktur.

## Kapanış

- user/system recovery verified,
- backlog/queue reconciled,
- data integrity check,
- credentials risk review,
- timeline/root cause/contributing factors,
- missing tests/alerts/runbook fixes,
- owner sign-off.
