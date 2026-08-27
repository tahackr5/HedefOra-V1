---
name: hedefora-security-review
description: Use for read-only threat modeling, secure code review, Codex Security finding validation, auth/privacy review and release security assessment. Never use to change production or develop exploits against unauthorized targets.
---

# HedefOra Security Review

1. Confirm authorized repository/scope and read-only mode.
2. Map trust boundaries, attacker-controlled inputs and sensitive actions/data.
3. Review authentication, authorization, session/replay, CSRF/CORS/CSP, upload/parser/SSRF, job capabilities, AI prompt injection, logs/secrets and deployment.
4. Review race/idempotency/state-machine abuse, not only static patterns.
5. Use Codex Security for changes or deep scan when specified; validate reachability and evidence.
6. Report findings with severity, confidence, precondition, evidence, impact, remediation and test.
7. Separate false positive, accepted risk and blocked evidence; never dismiss silently.
8. Re-review fixes and preserve independent verdict.
