---
name: hedefora-contract-change
description: Use when changing OpenAPI, database migrations, event schemas, River job payloads, enums or shared registries. Requires compatibility, generation, migration and drift evidence.
---

# HedefOra Contract Change

1. Identify contract owner and all producers/consumers.
2. Classify additive, compatible behavioral, or breaking.
3. Record base SHA and request orchestrator ownership for shared root files.
4. Define migration/compatibility window and rollback/forward-fix.
5. Update the canonical contract, not generated outputs.
6. Regenerate clients/types/catalogs.
7. Test old/new compatibility, error sets, enum parity, migrations and job replay.
8. Run merged-tree drift gates.
9. Update docs/ADR if semantics changed.
10. Return proposal/patch, affected consumers and exact evidence.

Never reuse a removed enum/status silently or ship a breaking change without owner-approved migration plan.
