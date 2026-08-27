# Security Scan Prompt

```text
HedefOra'nın yetkili repository/branch kapsamını read-only güvenlik açısından tara.

$hedefora-security-review skill'ini kullan. Önce trust boundaries ve attacker-controlled inputs çıkar. Auth/session/replay, authorization, admin/worker capability, CSRF/CORS/CSP, upload/parser/SSRF, prompt injection, secrets/logging/privacy, dependencies ve self-hosted deployment'ı kapsa.

Codex Security mevcutsa:
- PR/değişiklik için changes scan,
- milestone/release için deep scan
çalıştır. Model gpt-5.6-sol ve önerilen yüksek reasoning ayarını kullan; scan ID ve exact commit'i kaydet.

Bulguları reachability/evidence ile doğrula. Kod değiştirme. False positive veya accepted risk varsa gerekçeyi yaz. Sonuç: findings, evidence gaps, recommended tests ve PASS/FAIL/BLOCKED_EVIDENCE.
```
