# Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Owner | Status |
|---|---|---:|---:|---|---|---|
| R-001 | Tek kopya/repo kaybı | Medium | Critical | Primary GitHub remote + ikinci şifreli off-site mirror/bundle + recovery test; gate zamanlaması DQ-004 owner kararı bekliyor, DEC-016 uyarınca en geç launch öncesi | Owner/Infra | OPEN |
| R-002 | Codex'e aşırı SSH/root yetkisi | Medium | Critical | Dedicated account, allowlisted sudo, approvals | Owner/Security | OPEN |
| R-003 | Tek production host failure | Medium | High | Off-site PITR/restore, measured RTO, scale plan | Infra | OPEN |
| R-004 | Curriculum doğruluğu/onay eksikliği | Medium | High | Versioned package, reviewer gate | Content Owner | OPEN |
| R-005 | Legal/KVKK metni AI tarafından yanlış aktif edilir | Low | Critical | `DRAFT_NOT_FOR_PRODUCTION` state + public launch öncesi owner/legal review | Owner | MITIGATING |
| R-006 | Parallel agents create drift/conflicts | Medium | High | Immutable base, single writer, shared proposal | Orchestrator | OPEN |
| R-007 | Plugin/MCP supply-chain or over-privilege | Medium | High | Minimal set, permissions, vendor review | Security | OPEN |
| R-008 | AI provider cost/outage/injection | Medium | High | Bounded async, quotas, schema, fallback | AI/Backend | OPEN |
| R-009 | Backup exists but restore fails | Medium | Critical | Sıfırdan clone/restore, object integrity ve bootstrap gate provası; gate zamanlaması DQ-004 owner kararı bekliyor, DEC-016 uyarınca en geç launch öncesi | Infra | OPEN |
| R-010 | Public landing SPA harms indexing/onboarding | Medium | Medium | Static/server render public pages | Frontend/Product | OPEN |
| R-011 | Küçük staging VPS'in production gibi kullanılmasına bağlı kapasite/veri riski | Medium | High | VPS'i yalnız staging olarak etiketle; gerçek kullanıcı/veri alma; ölçüm ve gate sonrası ayrı production hostuna taşı | Owner/Infra | MITIGATING |
| R-012 | Native Windows Codex sandbox'ları loopback network izolasyonunu uygulamıyor | High | High | Reviewer'ları yalnız executable sentinel geçmiş WSL/Linux `bwrap + seccomp`, hash-doğrulanmış resmi paket, isolated `CODEX_HOME` ve resolved absolute credential deny ile çalıştır; her runtime yükseltmesinde native ve WSL sentinel'larını tekrarla | Owner/Orchestrator | MITIGATING |
| R-013 | Aktif checkout'un OneDrive altında olması sync/lock/performans ve tek-makine kurtarma riski yaratır | Medium | High | W000 doğrulamasını OneDrive dışı temiz clone'da yap; kalıcı kanonik clone'u Dev Drive veya `C:\Projeler\HedefOra` altına taşı; backup/recovery gate zamanlaması DQ-004 owner kararı bekliyor ve en geç launch öncesi tamamlanır | Owner/Orchestrator | MITIGATING |
| R-014 | GitHub merge yöntemi veya main koruması SHA-mühürlü ownership kanıtını yeniden yazar ya da bypass eder | Medium | Critical | GitHub üzerinde yalnız two-parent merge commit; squash/rebase/linear history/force push/delete kapalı; required PR checks; exact PR-head ve final main merge-wrapper gate kanıtı | Owner/Orchestrator | OPEN |
| R-015 | Final reviewer harness runtime-wrapper grammar drift'i veya verdict correlation hatası gerçek bulguyu maskeleyebilir ya da geçerli koşumu reddedebilir | Medium | High | Gerçek `0.150.0` wrapper fixture'larıyla eval'siz semantic parser; direct function-call/output correlation; sıralı skill-first mandatory read; `PASS`/`FAIL`/`BLOCKED_EVIDENCE` ayrımı; validator hata verse de reviewer `FAIL` artifact'ını koruma; rerun öncesi adversarial ve no-model regresyon | Orchestrator/Security | OPEN |
