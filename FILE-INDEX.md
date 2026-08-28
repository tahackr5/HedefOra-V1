# File Index ve Progressive-Disclosure Read Map

## Her görevde

- `AGENTS.md`
- `DECISIONS.md`
- `state/ACTIVE-WAVE.md`

## Product/scope/UI

- `product/PRODUCT-VISION.md`
- `product/MVP-SCOPE.md`
- `product/USERS-AND-JOURNEYS.md`
- `product/INFORMATION-ARCHITECTURE-AND-CONTENT.md`
- `product/ACCEPTANCE-CRITERIA.md`
- `agents/01-PRODUCT-UX-CONTENT.md`

## Legal, privacy ve policy taslakları

- `architecture/AUTH-SECURITY-PRIVACY.md`
- `product/INFORMATION-ARCHITECTURE-AND-CONTENT.md`
- `agents/10-LEGAL-POLICY-DRAFTER.md`
- Her ajan çıktısı `DRAFT_NOT_FOR_PRODUCTION`; aktivasyon owner gate'idir.

## Planner/curriculum/AI

- `product/PLANNING-ENGINE.md`
- `product/CURRICULUM-AND-SOURCE-BOUNDARY.md`
- `architecture/ASYNC-JOBS-AND-AI.md`
- `agents/04-CONTENT-PLANNING-AI.md`

## Backend/auth/data/contracts

- `architecture/DOMAIN-BOUNDARIES.md`
- `architecture/DATA-CONSISTENCY-AND-TRANSACTIONS.md`
- `architecture/API-AND-EVENT-CONTRACTS.md`
- `architecture/AUTH-SECURITY-PRIVACY.md`
- `agents/02-ARCHITECTURE-CONTRACTS-DATA.md`
- `agents/03-BACKEND-PLATFORM-AUTH.md`

## Frontend

- product IA/content/acceptance docs
- `architecture/SYSTEM-ARCHITECTURE.md`
- `agents/05-FRONTEND-DESIGN-SYSTEM.md`
- plugin design docs

## Delivery/review

- `delivery/OPERATING-MODEL.md`
- `delivery/WORKTREE-OWNERSHIP-AND-MERGE.md`
- `delivery/QUALITY-GATES-AND-DOD.md`
- `delivery/TEST-STRATEGY.md`
- `delivery/REVIEW-COLD-REVIEW-AND-EVIDENCE.md`

## Infra/deploy/incident

- `architecture/DEPLOYMENT-AND-RECOVERY.md`
- `architecture/OBSERVABILITY-SLO-AND-AUDIT.md`
- `operations/**`
- `agents/07-INFRA-RELEASE-OBSERVABILITY.md`
- `agents/08-SECURITY-PRIVACY-REVIEW.md`

## Codex bootstrap

- `MASTER-TRIGGER.md`
- `delivery/CODEX-RUNTIME-GENERATION-SPEC.md`
- `delivery/TOOLCHAIN-LOCK.md`
- `state/W000-OWNERSHIP.md` (yalnız W000 boyunca aktif yazma sahipliği)
- `state/W000-OWNERSHIP.json` (W000 commit aralığı ve path allowlist kanıtı)
- `state/W000-EVIDENCE.md` (W000 gate, security, risk ve exit kanıt paketi)
- `agents/**`
- `.agents/skills/**/SKILL.md`
- `plugins/**`

## Aktif W001 supply-chain kapısı

- `state/W001-OWNERSHIP.md` (W001 immutable-base yazma sahipliği ve görev DAG'ı)
- `state/W001-OWNERSHIP.json` (W001 commit aralığı ve path allowlist kanıtı)
- `state/W001-EVIDENCE.md` (R-016 scanner, rule, advisory DB, fixture ve gate kanıtı)
- `security/**` (supply-chain policy, exact scanner/ruleset pinleri ve açık istisnalar)
- `scripts/supply-chain/**` ve `scripts/fixtures/supply-chain/**`
- `.github/workflows/ci.yml`

## Kural

Ana oturum bütün dosyaları her görevde okumaz. İlgili read map kullanılır; alt ajanlar kısa sonuç ve file references döndürür.
