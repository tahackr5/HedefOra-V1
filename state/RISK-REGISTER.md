# Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Owner | Status |
|---|---|---:|---:|---|---|---|
| R-001 | Tek kopya/repo kaybı | Medium | Critical | Primary GitHub remote + ikinci şifreli off-site mirror/bundle + recovery test; W001 ön koşulu | Owner/Infra | OPEN |
| R-002 | Codex'e aşırı SSH/root yetkisi | Medium | Critical | Dedicated account, allowlisted sudo, approvals | Owner/Security | OPEN |
| R-003 | Tek production host failure | Medium | High | Off-site PITR/restore, measured RTO, scale plan | Infra | OPEN |
| R-004 | Curriculum doğruluğu/onay eksikliği | Medium | High | Versioned package, reviewer gate | Content Owner | OPEN |
| R-005 | Legal/KVKK metni AI tarafından yanlış aktif edilir | Low | Critical | `DRAFT_NOT_FOR_PRODUCTION` state + public launch öncesi owner/legal review | Owner | MITIGATING |
| R-006 | Parallel agents create drift/conflicts | Medium | High | Immutable base, single writer, shared proposal | Orchestrator | OPEN |
| R-007 | Plugin/MCP supply-chain or over-privilege | Medium | High | Minimal set, permissions, vendor review | Security | OPEN |
| R-008 | AI provider cost/outage/injection | Medium | High | Bounded async, quotas, schema, fallback | AI/Backend | OPEN |
| R-009 | Backup exists but restore fails | Medium | Critical | Sıfırdan clone/restore, object integrity ve bootstrap gate provası; W001 ön koşulu | Infra | OPEN |
| R-010 | Public landing SPA harms indexing/onboarding | Medium | Medium | Static/server render public pages | Frontend/Product | OPEN |
| R-011 | Küçük staging VPS'in production gibi kullanılmasına bağlı kapasite/veri riski | Medium | High | VPS'i yalnız staging olarak etiketle; gerçek kullanıcı/veri alma; ölçüm ve gate sonrası ayrı production hostuna taşı | Owner/Infra | MITIGATING |
| R-012 | Native Windows Codex sandbox'ları loopback network izolasyonunu uygulamıyor | High | High | Reviewer'ları yalnız executable sentinel geçmiş WSL/Linux `bwrap + seccomp`, hash-doğrulanmış resmi paket, isolated `CODEX_HOME` ve resolved absolute credential deny ile çalıştır; her runtime yükseltmesinde native ve WSL sentinel'larını tekrarla | Owner/Orchestrator | MITIGATING |
| R-013 | Aktif checkout'un OneDrive altında olması sync/lock/performans ve tek-makine kurtarma riski yaratır | Medium | High | W000 doğrulamasını OneDrive dışı temiz clone'da yap; W001 öncesi kalıcı kanonik clone'u Dev Drive veya `C:\Projeler\HedefOra` altına taşı ve ikinci şifreli off-site recovery testini tamamla | Owner/Orchestrator | MITIGATING |
| R-014 | GitHub merge yöntemi veya main koruması SHA-mühürlü ownership kanıtını yeniden yazar ya da bypass eder | Medium | Critical | GitHub üzerinde yalnız two-parent merge commit; squash/rebase/linear history/force push/delete kapalı; required PR checks; exact PR-head ve final main merge-wrapper gate kanıtı | Owner/Orchestrator | OPEN |
