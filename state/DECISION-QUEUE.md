# Decision Queue

> Orchestrator records unresolved canonical decisions here. Owner resolution is copied to `DECISIONS.md` or ADR and this item is closed.

## Closed

### DQ-001 — W000 buildable skeleton / application-code boundary

- Opened by / date: orchestrator + `infra_contracts` / 2026-08-28
- Conflicting files/sections: `MASTER-TRIGGER.md` steps 5 and 9; `delivery/WAVE-PLAN.md` W000/W001
- Decision needed: Define which executable artifacts may exist in W000 without implementing W001 product/platform behavior.
- Options: configuration-and-test harness only; or minimal buildable bootstrap code with no domain/API/DB/River/health behavior.
- Security/privacy/cost/migration impact: Starting W001 behavior early can bypass contract and gate ordering; a non-buildable skeleton cannot satisfy W000 exit.
- Work that can continue safely: Git/state, Codex runtime, toolchain lock, CI configuration and non-feature validators.
- Blocking wave/gate: W000 clean build/test.
- Owner decision: NOT_REQUIRED unless scope expands; orchestrator may choose the smallest reversible interpretation and record it in ADR/`DECISIONS.md`.
- Resolution: No-feature executable scaffolding/tooling is permitted in W000; W001 runtime and product behavior remains gated. Recorded as DEC-021 / ADR-0011.
- Closed commit: `525134128a8d5c83dedc87be046440416375bb95`

### DQ-002 — Wave-aware merged-tree gate semantics

- Opened by / date: orchestrator + `infra_contracts` / 2026-08-28
- Conflicting files/sections: `delivery/QUALITY-GATES-AND-DOD.md` merged-tree gate; `delivery/WAVE-PLAN.md` staged feature delivery
- Decision needed: Define evidence status for suites whose owning feature/artifact does not exist in the active wave.
- Options: require every future suite in W000; or allow explicit `NOT_APPLICABLE` with scope/path evidence while never converting `NOT_RUN` to PASS.
- Security/privacy/cost/migration impact: False PASS hides missing coverage; requiring future suites makes honest W000 exit impossible.
- Work that can continue safely: Implement and run every gate applicable to W000 artifacts; retain absent feature gates as non-PASS.
- Blocking wave/gate: W000 merged-tree/cold-review verdict.
- Owner decision: NOT_REQUIRED unless a current acceptance criterion would be waived; orchestrator may clarify process without lowering an existing applicable gate.
- Resolution: Explicit `NOT_APPLICABLE` requires wave/path evidence, is never PASS and cannot cover an existing artifact or acceptance. Recorded as DEC-022 / ADR-0011.
- Closed commit: `525134128a8d5c83dedc87be046440416375bb95`

### DQ-003 — Static package manifest lifecycle

- Opened by / date: orchestrator + `infra_contracts` / 2026-08-28
- Conflicting files/sections: `PACKAGE-MANIFEST.md` scope; `PACKAGE-VALIDATION.md` Important boundary; Wave 000 code generation
- Decision needed: Decide whether the v0.1.0 manifest is an immutable handoff baseline or must be regenerated after every repository change.
- Options: immutable baseline tied to initial commit plus release manifests; or living full-tree manifest updated on every commit.
- Security/privacy/cost/migration impact: A living self-referential manifest creates routine drift and weakens provenance; an unlabeled static manifest produces misleading failures after legitimate development.
- Work that can continue safely: Preserve original hashes and Git history; do not recalculate them silently.
- Blocking wave/gate: Blueprint consistency and repository validator design.
- Owner decision: NOT_REQUIRED; lifecycle clarification is reversible and does not change product scope.
- Resolution: The v0.1.0 manifest is immutable and tied to the initial blueprint commit; later provenance uses Git/release manifests. Recorded as DEC-023 / ADR-0012.
- Closed commit: `525134128a8d5c83dedc87be046440416375bb95`

## Open

None.

## Item template

- ID:
- Opened by / date:
- Conflicting files/sections:
- Decision needed:
- Options:
- Security/privacy/cost/migration impact:
- Work that can continue safely:
- Blocking wave/gate:
- Owner decision:
- Closed commit:
