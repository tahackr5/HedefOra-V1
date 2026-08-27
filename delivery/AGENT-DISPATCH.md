# Agent Dispatch Matrisi

## Ajanlar

| Ajan | Ana iş | Yazma | Varsayılan sandbox |
|---|---|---|---|
| orchestrator | plan, merge, gates, state | shared/governance | workspace-write + approvals |
| product-ux-content | scope, flows, copy, IA | product/UI docs & owned UI | workspace-write |
| architecture-contracts-data | architecture, OpenAPI, DB | owned contracts/migrations | workspace-write |
| backend-platform-auth | Go use-cases/auth/jobs | owned backend modules | workspace-write |
| content-planning-ai | curriculum/planner/AI | owned domain modules | workspace-write |
| frontend-design-system | React/UI/accessibility | owned frontend files | workspace-write |
| quality-testing | tests/gates/repro | tests/CI proposals | workspace-write or read-only per task |
| infra-release-observability | deploy/telemetry/backups | owned infra | workspace-write + approvals |
| security-privacy-review | threat/auth/privacy review | none | read-only |
| cold-reviewer | independent release review | none | read-only fresh context |
| legal-policy-drafter | legal/privacy/consent policy drafts | assigned legal draft paths | workspace-write; drafts never auto-publish |

## Delegation ilkesi

- Önce explorer/read-only ajanı gerçek code path'i çıkarır.
- Builder, kanıtlı scope üzerinden küçük patch yapar.
- Quality/security ajanı patch'i bağımsız inceler.
- Orchestrator shared contract ve merge'i yönetir.

## Aynı anda çalışma

Örnek güvenli paralellik:

- backend builder: `internal/identity/**`
- frontend builder: `apps/web/**`
- quality agent: yeni test planı/read-only review
- docs researcher: Context7/resmi docs

Güvensiz paralellik:

- iki ajan aynı migration dosyasını düzenliyor,
- iki ajan OpenAPI root'u değiştiriyor,
- frontend ve backend bağımsız enum icat ediyor,
- reviewer patch de yazıyor ve kendi değişikliğini onaylıyor.

## Wave bazlı aktivasyon

- W000: orchestrator, architecture, quality, security, infra, docs research ve legal-agent runtime tanımı.
- W001: architecture, backend, quality, security.
- W002: product/content, architecture, planning, quality.
- W003: backend auth, frontend, quality, security.
- W004: planning, frontend, product, quality.
- W005: sources/AI, backend, security, quality.
- W006: admin/ops, frontend, security, quality.
- W007: infra, observability, security, quality.
- W008: all reviewers; writer only fixes bounded findings.

Legal/policy ajanı ihtiyaç olduğunda wave'den bağımsız çağrılabilir; her çıktısı `DRAFT_NOT_FOR_PRODUCTION` kalır ve aktivasyon owner gate'idir.
