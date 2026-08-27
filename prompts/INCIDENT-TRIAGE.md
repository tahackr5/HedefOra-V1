# Incident Triage Prompt

```text
Bu HedefOra incident'ını $hedefora-incident-triage skill'iyle yönet.

Environment: <ENV>
Observed impact: <IMPACT>
Start time: <TIME>

Önce evidence'ı koru ve değişiklik freeze öner. Sentry, metrics/logs/traces, recent deploy/config/migration, River queues, PostgreSQL ve ilgili Cloudflare/Resend sinyallerini hedefli incele. En az iki olası hipotez kur; en az invaziv doğrulamadan başla.

Production restart/rollback/key rotation/DB repair/restore/traffic change çalıştırmadan önce exact command, blast radius, verification ve rollback ile owner approval iste. Secret yazdırma. Recovery sonrası timeline, root cause status ve follow-up tests/alerts/runbook değişikliklerini ver.
```
