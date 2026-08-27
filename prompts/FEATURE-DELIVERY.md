# Feature Delivery Prompt

```text
Bu feature'ı HedefOra repository sözleşmelerine göre uçtan uca teslim et.

Feature brief: <PATH_OR_TEXT>
Wave/task ID: <ID>

Önce AGENTS.md, DECISIONS.md, state/ACTIVE-WAVE.md, feature brief ve etkilenen kanonik product/architecture/delivery docs'u hedefli oku. $hedefora-feature-delivery skill'ini kullan.

Ana oturum orchestrator olsun. Önce read-only explorer ile gerçek code path ve etkileri çıkar; sonra conflict-free writer worktree'leri ata. Aynı dosyaya iki writer verme. Shared OpenAPI/migration/config/registry değişiklikleri proposal olarak orchestrator'a dönsün.

Contract, DB, jobs/events, security/privacy, UI/accessibility, telemetry, migration/rollback ve test etkisini kapsa. En küçük complete vertical slice'ı üret. Placeholder success, test skip, threshold düşürme, generated-file edit veya scope expansion yapma.

Merged-tree gates ve bağımsız review çalıştır. Sonuçta acceptance mapping, changed files, exact test commands/exits, risks, rollback, blocker, start/end SHA ve cold-review durumunu ver.
```
