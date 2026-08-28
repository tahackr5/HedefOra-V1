# Wave and Release Ledger

> Append-only event summary; orchestrator-owned. Önceki satır güncellenmez veya silinmez; aynı wave'in daha yeni olayı güncel durumu taşır.

| Entry | Type | Start SHA | End SHA | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| W000 | WAVE | NOT_SET | NOT_SET | NOT_STARTED | — | Clean-start bootstrap |
| W000-OPEN-20260828 | WAVE_EVENT | `2efca6c8b65e3342ad5309076b7cd0dedf816943` | `f2597c9` | IN_PROGRESS | `state/ACTIVE-WAVE.md` | Git/state bootstrap opened on `codex/w000-bootstrap` |
| W000-LOCAL-GATES-20260828 | WAVE_EVENT | `2efca6c8b65e3342ad5309076b7cd0dedf816943` | `9758685` | IN_PROGRESS | `state/W000-EVIDENCE.md` | Local merged-tree and security re-review PASS; cold review and GitHub-hosted gates pending |
| W000-COLD-REMEDIATION-20260828 | WAVE_EVENT | `8d445875ce63b43eae9056149e7841380a5f3b66` | `31d65b8d1287f8caadd276f65f3567eb4af12ca5` | IN_PROGRESS | `state/W000-EVIDENCE.md` | Initial cold review FAIL; remediation, WSL/Linux isolation diagnostic and exact-target local full-tree gates PASS; final security/cold re-review and GitHub-hosted gates pending |
| W000-EVIDENCE-CORRECTION-20260828 | WAVE_EVENT | `8d445875ce63b43eae9056149e7841380a5f3b66` | `2492e6f014ea4eb0ee7b7d89f4fcb686f36cbe14` | IN_PROGRESS | `state/W000-EVIDENCE.md`; `state/DECISION-QUEUE.md` | Initial cold matrix corrected; finding 6 is reviewer isolation; strengthened exact isolation diagnostic and local full-tree gates PASS at `2492e6f`; final security/cold and GitHub-hosted gates `NOT_RUN`; DQ-004 open |
| W000-FINAL-SECURITY-FAIL-20260828 | WAVE_EVENT | `1bd1729fc9bb1f8ec86d381bc9ff947c03685b17` | `5886a978df491e5a0212472183c49100b705f205` | IN_PROGRESS | `state/W000-EVIDENCE.md` | Security session `01a04744-b2a7-70c2-8a15-4ae79a5c3372` at exact `1bd1729` reported `FAIL` (F-001/F-002); wrapper validator also failed closed and cold was `NOT_RUN`. Code and regression-test remediation landed at `5886a97` / tree `3327e526`; bounded Node/Go checks `PASS`, while sealed-target clean-clone, security, cold and GitHub quality remain `NOT_RUN`; hosted CodeQL/dependency/protection remain `BLOCKED_EXTERNAL` |
