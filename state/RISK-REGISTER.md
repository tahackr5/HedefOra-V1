# Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Owner | Status |
|---|---|---:|---:|---|---|---|
| R-001 | Tek kopya/repo kaybı | Medium | Critical | Primary + off-site mirror + recovery test | Owner/Infra | OPEN |
| R-002 | Codex'e aşırı SSH/root yetkisi | Medium | Critical | Dedicated account, allowlisted sudo, approvals | Owner/Security | OPEN |
| R-003 | Tek production host failure | Medium | High | Off-site PITR/restore, measured RTO, scale plan | Infra | OPEN |
| R-004 | Curriculum doğruluğu/onay eksikliği | Medium | High | Versioned package, reviewer gate | Content Owner | OPEN |
| R-005 | Legal/KVKK metni AI tarafından yanlış aktif edilir | Low | Critical | `DRAFT_NOT_FOR_PRODUCTION` state + public launch öncesi owner/legal review | Owner | MITIGATING |
| R-006 | Parallel agents create drift/conflicts | Medium | High | Immutable base, single writer, shared proposal | Orchestrator | OPEN |
| R-007 | Plugin/MCP supply-chain or over-privilege | Medium | High | Minimal set, permissions, vendor review | Security | OPEN |
| R-008 | AI provider cost/outage/injection | Medium | High | Bounded async, quotas, schema, fallback | AI/Backend | OPEN |
| R-009 | Backup exists but restore fails | Medium | Critical | Scheduled restore rehearsal | Infra | OPEN |
| R-010 | Public landing SPA harms indexing/onboarding | Medium | Medium | Static/server render public pages | Frontend/Product | OPEN |
| R-011 | Küçük staging VPS'in production gibi kullanılmasına bağlı kapasite/veri riski | Medium | High | VPS'i yalnız staging olarak etiketle; gerçek kullanıcı/veri alma; ölçüm ve gate sonrası ayrı production hostuna taşı | Owner/Infra | MITIGATING |
