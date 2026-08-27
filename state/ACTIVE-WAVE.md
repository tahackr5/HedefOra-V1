# Active Wave State

> Bu dosyanın tek writer'ı orchestrator'dır.

- Wave ID: W000
- Status: IN_PROGRESS
- Wave start commit: `2efca6c8b65e3342ad5309076b7cd0dedf816943`
- Integration branch: `codex/w000-bootstrap`
- Started at: `2026-08-28T02:13:12+03:00` (`2026-08-27T23:13:12Z`)
- Last checkpoint: Initial blueprint committed and pushed to `origin/main`; W000 integration branch pushed.
- Current objective: Blueprint audit, exact toolchain lock, Codex runtime generation and monorepo bootstrap

## Active tasks

| Task | Agent | Branch/worktree | Owned paths | Status | Depends on |
|---|---|---|---|---|---|
| W000-T01 Blueprint audit | `infra_contracts` | read-only / shared checkout | none | IN_PROGRESS | — |
| W000-T02 Toolchain lock research | `provider_research` | read-only / shared checkout | none | IN_PROGRESS | — |
| W000-T03 Codex runtime governance audit | `security_owner` | read-only / shared checkout | none | IN_PROGRESS | — |
| W000-T04 Git and state bootstrap | orchestrator | `codex/w000-bootstrap` / repository root | `.git` metadata, `state/*` | IN_PROGRESS | W000-T01..T03 for final state |
| W000-T05 Runtime and monorepo implementation | NOT_ASSIGNED | immutable-base worktrees | NOT_SET | NOT_STARTED | W000-T01..T03 |
| W000-T06 Merged-tree gates | orchestrator + read-only reviewers | `codex/w000-bootstrap` / repository root | orchestrator-owned shared evidence/state | NOT_STARTED | W000-T05 |

## Shared proposals

None.

## Gate status

| Gate | Status | Evidence |
|---|---|---|
| Blueprint consistency | IN_PROGRESS | W000-T01 salt-okunur denetimi |
| Codex runtime config | IN_PROGRESS | W000-T03 + resmi OpenAI belge doğrulaması |
| Clean build/test | NOT_RUN | — |
| Security review | NOT_RUN | — |
| Cold review | NOT_RUN | — |

## Blockers / owner input

- Owner provided the primary GitHub repository: `https://github.com/tahackr5/HedefOra-V1.git`.
- Repository-local commit identity: `tahackr5 <cak.ihsantaha@gmail.com>`.
- Existing small VPS is classified as staging/pre-production only. It must not receive real-user or production data; production promotion remains a separate owner gate after quality, security, backup and restore evidence.
- Legal/KVKK content may be AI-assisted during development but remains `DRAFT_NOT_FOR_PRODUCTION`. The owner is the review owner until a later legal review is commissioned; no draft may silently become active public policy.
- Owner must still provide non-secret staging server inventory before bootstrap: provider, IP/hostname, SSH port, Linux distribution/version, vCPU/RAM/disk, current workloads, backup/snapshot capability and desired staging hostname. Passwords, private keys, tokens, MFA/recovery codes and real `.env` values must not be sent.

## Resume instruction

On resume, verify Git HEAD/tree, this file, decision queue and all active worktrees before making changes. Chat history alone is not state.
