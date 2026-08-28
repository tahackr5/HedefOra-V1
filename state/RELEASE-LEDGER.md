# Wave and Release Ledger

> Append-only event summary; orchestrator-owned. Önceki satır güncellenmez veya silinmez; aynı wave'in daha yeni olayı güncel durumu taşır.

| Entry | Type | Start SHA | End SHA | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| W000 | WAVE | NOT_SET | NOT_SET | NOT_STARTED | — | Clean-start bootstrap |
| W000-OPEN-20260828 | WAVE_EVENT | `2efca6c8b65e3342ad5309076b7cd0dedf816943` | `f2597c9` | IN_PROGRESS | `state/ACTIVE-WAVE.md` | Git/state bootstrap opened on `codex/w000-bootstrap` |
| W000-LOCAL-GATES-20260828 | WAVE_EVENT | `2efca6c8b65e3342ad5309076b7cd0dedf816943` | `9758685` | IN_PROGRESS | `state/W000-EVIDENCE.md` | Local merged-tree and security re-review PASS; cold review and GitHub-hosted gates pending |
| W000-COLD-REMEDIATION-20260828 | WAVE_EVENT | `8d445875ce63b43eae9056149e7841380a5f3b66` | `31d65b8d1287f8caadd276f65f3567eb4af12ca5` | IN_PROGRESS | `state/W000-EVIDENCE.md` | Initial cold review FAIL; remediation, WSL/Linux isolation diagnostic and exact-target local full-tree gates PASS; final security/cold re-review and GitHub-hosted gates pending |
