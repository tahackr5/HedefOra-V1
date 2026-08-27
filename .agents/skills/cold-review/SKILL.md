---
name: hedefora-cold-review
description: Use for fresh-context read-only independent review at wave or release exit. It must not implement fixes or rely on builder summaries without checking evidence.
---

# HedefOra Cold Review

1. Start a fresh read-only agent thread.
2. Read only canonical requirements, target diff/tree, test evidence and known blockers.
3. Reconstruct intended behavior independently.
4. Inspect incomplete states, hidden placeholders, contract drift, race/data/security risks, test gaps and rollback.
5. Verify evidence freshness and exact commit association.
6. Return PASS, FAIL or BLOCKED_EVIDENCE.
7. For every finding include severity, file/symbol, evidence and required acceptance test.
8. Do not edit code, negotiate severity with the builder or convert NOT_RUN to PASS.
