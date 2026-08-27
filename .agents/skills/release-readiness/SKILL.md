---
name: hedefora-release-readiness
description: Use before staging promotion or production release to verify quality, security, migration, observability, backup, rollback and owner gates. Does not authorize production mutation.
---

# HedefOra Release Readiness

1. Pin release commit and immutable image digest.
2. Verify full merged-tree gates from clean checkout.
3. Verify migration compatibility, staging apply and rollback/forward-fix.
4. Verify Sentry/metrics/logs/traces, alerts and release markers.
5. Verify backup freshness and latest restore rehearsal evidence.
6. Run Codex Security deep scan, Sonar gate, CodeRabbit/Codex review and cold review.
7. Check secrets, SBOM, dependency/license/provenance and environment parity.
8. Run staging smoke/E2E/load/accessibility and failure rollback drill.
9. List unresolved risks and required owner approvals.
10. Return GO, NO_GO or BLOCKED; never deploy solely because this skill says GO.
