---
name: hedefora-feature-delivery
description: Use for implementing or changing a HedefOra feature from brief through contract, code, tests, review, evidence and rollback. Do not use for production deployment or pure research.
---

# HedefOra Feature Delivery

1. Read `AGENTS.md`, `DECISIONS.md`, active wave, feature brief and affected canonical contracts.
2. Restate scope, out-of-scope, acceptance and owner gates.
3. Map affected domains, API, DB, jobs/events, UI, security/privacy, telemetry and migration.
4. Ask orchestrator for immutable base, task ID and path ownership.
5. Use read-only exploration before editing.
6. Change contracts first when public behavior changes; regenerate artifacts.
7. Implement the smallest complete vertical slice, including negative/error states.
8. Add unit/integration/E2E/property tests according to risk.
9. Run affected gates, then merged-tree gates after integration.
10. Request independent review and fresh cold review when wave exit requires it.
11. Produce structured handoff with exact commands, exit results, risks and rollback.

Never broaden scope, weaken tests, edit generated files manually or perform production mutations.
