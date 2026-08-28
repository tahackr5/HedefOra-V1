# Active Wave State

> Bu dosyanın tek writer'ı orchestrator'dır.

- Wave ID: W001
- Status: IN_PROGRESS
- Wave start commit: `bde560f182032e1e4ec9f1a1b02db4cd8ec5e99b`
- Wave start tree: `7a2ae76ee31b6c85ec5b3839c78306cde2bd3f23`
- Integration branch: `codex/w001-supply-chain-gates`
- Worktree: external W001 worktree (OneDrive dışında)
- Started at: `2026-08-28T21:50:57+03:00` (`2026-08-28T18:50:57Z`)
- Last checkpoint: W000 post-exit closure PR #2 exact reviewed head `22dbd435c151cf51cb4fd47e29bdba16f4d2d658` ile two-parent/content-identical `bde560f182032e1e4ec9f1a1b02db4cd8ec5e99b` merge'üne ulaştı. Final `main` quality job `98945933590` `PASS`; hosted CodeQL/Dependency Review/branch protection `BLOCKED_EXTERNAL` kalır.
- Current objective: R-016 kapsamında W001 runtime davranışından önce pinned OSS SAST ve pnpm/Go all-scope vulnerability/license telafi kapısını fail-closed kurmak

## Active tasks

| Task | Agent | Branch/worktree | Owned paths | Status | Depends on |
|---|---|---|---|---|---|
| W001-T00 Wave open ve immutable ownership | orchestrator | `codex/w001-supply-chain-gates` / W001 worktree | `FILE-INDEX.md`, `state/ACTIVE-WAVE.md`, `state/RELEASE-LEDGER.md`, `state/W001-*` | IN_PROGRESS | W000 closure merge `bde560f` |
| W001-T01 R-016 contract/research/test design | architecture, quality, security ve infra read-only ajanları | aynı exact base, read-only | none | IN_PROGRESS | W001-T00 |
| W001-T02 R-016 gate implementation | orchestrator | W001 worktree | exact allowlist `state/W001-OWNERSHIP.md` içinde | NOT_RUN | W001-T01 |
| W001-T03 Exact-target quality/security/cold review | read-only reviewers | sealed W001 target | none | NOT_RUN | W001-T02 |
| W001-T04 Platform/DB/contract runtime foundation | atanmadı | immutable-base task worktree'leri | henüz atanmadı | BLOCKED | R-016 `PASS` |

## Gate status

| Gate | Status | Evidence |
|---|---|---|
| W000 exact closure baseline | PASS | `bde560f` / tree `7a2ae76`; GitHub quality job `98945933590`; local clean-clone/full-tree PASS |
| Hosted security/enforcement | BLOCKED_EXTERNAL | CodeQL upload/integration, Dependency Review ve private-plan branch/ruleset protection; DEC-024 telafisi sonucu yeniden adlandırmaz |
| Pinned OSS SAST | NOT_RUN | Semgrep scanner/ruleset identity ve fail-closed wrapper uygulanacak |
| pnpm + Go all-scope vulnerability/license | NOT_RUN | OSV advisory DB identity, multi-document lock coverage ve license allow/deny uygulanacak |
| R-016 negative fixtures | NOT_RUN | dev/unknown vulnerability, disallowed/unknown license, missing/stale DB, parse/timeout/internal/network error |
| W001 runtime behavior | NOT_RUN | R-016 PASS olmadan başlatılamaz |

## Owner kararları ve sınırlar

- Primary remote `https://github.com/tahackr5/HedefOra-V1.git`; repository-local identity `tahackr5 <cak.ihsantaha@gmail.com>`.
- Private/current GitHub planı ve DEC-024 exact-SHA telafisi owner tarafından onaylandı; hosted eksikler `BLOCKED_EXTERNAL` kalır.
- Repository backup/recovery W007 ve en geç ilk gerçek kullanıcı/public launch/production promotion öncesi hard gate'tir; W001 başlangıcını engellemez.
- Mevcut 2 GB/30 GB Ubuntu VPS yalnız staging adayıdır; gerçek kullanıcı/production verisi alamaz. W007/action-specific owner gate öncesi VPS, SSH, Cloudflare veya DNS mutation yapılmaz.
- Password, private key, token, MFA/recovery code ve gerçek `.env` istenmez, okunmaz veya kaydedilmez.

## Resume instruction

On resume, verify exact HEAD/tree against the immutable wave start, this file, decision queue, W001 ownership manifest and every active worktree before changing files. Chat history is not state.
