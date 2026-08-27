---
name: hedefora-incident-triage
description: Use for production or staging incident triage, containment planning, evidence preservation and recovery coordination. Any destructive or production-changing action requires the configured owner approval.
---

# HedefOra Incident Triage

1. Declare incident severity, environment, start time and user impact.
2. Preserve evidence; do not delete logs/jobs/data.
3. Check recent deploy/config/migration, Sentry, metrics, logs, queue and DB health.
4. Form competing hypotheses and test the least invasive first.
5. Propose containment with blast radius and rollback.
6. Request owner approval for production mutation, credential rotation, restore or data repair.
7. Verify recovery via user-facing and system signals.
8. Open follow-up for root cause, tests, monitoring and runbook updates.
9. Produce timeline and exact command/evidence record with secret redaction.
