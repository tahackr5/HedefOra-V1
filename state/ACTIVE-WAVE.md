# Active Wave State

> Bu dosyanın tek writer'ı orchestrator'dır.

- Wave ID: W000
- Status: IN_PROGRESS
- Wave start commit: `2efca6c8b65e3342ad5309076b7cd0dedf816943`
- Integration branch: `codex/w000-bootstrap`
- Started at: `2026-08-28T02:13:12+03:00` (`2026-08-27T23:13:12Z`)
- Last checkpoint: Exact local full-tree ve WSL/Linux isolation diagnostic `PASS @ 1bd1729`; GitHub quality job `PASS @ 1bd1729`, plan-kısıtlı hosted güvenlik kapıları `BLOCKED_EXTERNAL`. Fresh final security review `FAIL @ 1bd1729` ile F-001/F-002'yi açtı; kod/test remediation'ı `5886a97`, fresh full-tree/security/cold tekrarları bekleniyor.
- Current objective: Blueprint audit, exact toolchain lock, Codex runtime generation and monorepo bootstrap

## Active tasks

| Task | Agent | Branch/worktree | Owned paths | Status | Depends on |
|---|---|---|---|---|---|
| W000-T01 Blueprint audit | `infra_contracts` | read-only / shared checkout | none | COMPLETED | — |
| W000-T02 Toolchain lock research | `provider_research` | read-only / shared checkout | none | COMPLETED | — |
| W000-T03 Codex runtime governance audit | `security_owner` | read-only / shared checkout | none | COMPLETED | — |
| W000-T04 Git and state bootstrap | orchestrator | `codex/w000-bootstrap` / repository root | `.git` metadata, `state/*` | COMPLETED | W000-T01..T03 for final state |
| W000-T05A Shared runtime/contracts/repository scaffold | orchestrator | `codex/w000-bootstrap` / repository root | root/shared paths in `state/W000-OWNERSHIP.md` | COMPLETED | W000-T01..T03 |
| W000-T05B Frontend no-feature scaffold | `provider_research` | immutable-base worktree | `apps/web/**` | COMPLETED | W000-T01..T02 |
| W000-T05C CI/local-infra scaffold | `infra_contracts` | immutable-base worktree | `.github/**`, `infra/**` | COMPLETED | W000-T01..T03 |
| W000-T06R Cold-review remediation ve reviewer isolation | orchestrator + read-only reviewers | `codex/w000-bootstrap` / WSL2 isolated runtime | exact task allowlist'leri `state/W000-OWNERSHIP.json` içinde | IN_PROGRESS | İlk cold review `FAIL @ 8d44587`; final security `FAIL @ 1bd1729`; remediation `5886a97`; fresh reviews açık |
| W000-T06 Merged-tree gates | orchestrator + read-only reviewers | `codex/w000-bootstrap` / repository root | orchestrator-owned shared evidence/state | IN_PROGRESS | W000-T05 |

## Shared proposals

Writer kapsamları, proposal kuralları, testler ve merge sırası `state/W000-OWNERSHIP.md` içinde kayıtlıdır.

## Gate status

| Gate | Status | Evidence |
|---|---|---|
| Blueprint consistency | PASS | DEC-021..023, ADR-0011..0012; W000 exit'i bloke etmeyen DQ-004 açık |
| Codex runtime config | PASS | 11/11 discovery; güçlendirilmiş WSL/Linux parent-child read/write/credential/loopback/tool-inventory sentinel `PASS @ 1bd1729`; R-012 açık; final review değildir |
| Historical clean build/test | PASS | `state/W000-EVIDENCE.md`; exact `1bd1729` / tree `ce55605`; `5886a97` remediation'ını kapsamaz |
| Current-target clean build/test | NOT_RUN | `5886a97` üzerinde yalnız bounded Node/Go remediation kontrolleri `PASS`; sealed target temiz-clone full gate'i bekleniyor |
| Historical security review | PASS | `SECURITY_FIX_VERDICT:PASS`, target `9758685`; final hedefi kapsamaz |
| Final security attempt | FAIL | `gpt-5.6-sol + ultra`, session `01a04744-b2a7-70c2-8a15-4ae79a5c3372`, exact `1bd1729`: F-001 lisans envanteri ve F-002 ownership history |
| Remediation security re-review | NOT_RUN | F-001/F-002 `5886a97` ile remediated; manifest-sealed exact target üzerinde fresh rerun bekleniyor |
| Initial cold review | FAIL | target `8d44587`; sekiz remediation grubu kaydedildi |
| Cold fix re-review | NOT_RUN | security FAIL nedeniyle başlatılmadı; fresh remediation hedefinde WSL/Linux `ultra` koşumu bekleniyor |
| Historical GitHub quality | PASS | PR #1, run `33143640272`, quality job `98759826096`, exact head `1bd1729`; `5886a97` değişikliklerini kapsamaz |
| Current-target GitHub quality | NOT_RUN | `5886a97` henüz origin head değildir; sealed target push'u bekleniyor |
| Hosted security/enforcement | BLOCKED_EXTERNAL | Dependency review plan özelliği yok; CodeQL upload integration erişimi yok; private/free repo branch protection API `403` |

## Blockers / owner input

- Owner provided the primary GitHub repository: `https://github.com/tahackr5/HedefOra-V1.git`.
- Repository-local commit identity: `tahackr5 <cak.ihsantaha@gmail.com>`.
- Existing small VPS is classified as staging/pre-production only. It must not receive real-user or production data; production promotion remains a separate owner gate after quality, security, backup and restore evidence.
- Legal/KVKK content may be AI-assisted during development but remains `DRAFT_NOT_FOR_PRODUCTION`. The owner is the review owner until a later legal review is commissioned; no draft may silently become active public policy.
- W000 exit blockers: `5886a97` sonrası exact full-tree/GitHub quality yenilemesi, fresh security PASS, fresh cold PASS, GitHub enforcement alternatifi owner kararı ve final `main` merge-wrapper gate'i.
- W001'e otomatik geçiş, backup/recovery ve kalıcı checkout gate zamanlamasını çözecek DQ-004 owner kararı gelene kadar durur; bu karar W000 exit'ini bloke etmez. DEC-016 uyarınca ikinci şifreli off-site kopya ve recovery testi en geç launch öncesi zorunludur.
- Deferred to staging/W007: owner must provide non-secret server inventory before server bootstrap: provider, IP/hostname, SSH port, Linux distribution/version, vCPU/RAM/disk, current workloads, backup/snapshot capability and desired staging hostname. This is not a W000 blocker. Passwords, private keys, tokens, MFA/recovery codes and real `.env` values must not be sent.

## Resume instruction

On resume, verify Git HEAD/tree, this file, decision queue and all active worktrees before making changes. Chat history alone is not state.
