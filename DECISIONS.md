# Kanonik Kararlar

Bu dosya yalnız kabul edilmiş, repository çapında etkili kararların kısa kaydıdır. Ayrıntılı gerekçe `architecture/ADR-REGISTER.md` içinde tutulur.

| ID | Karar | Durum |
|---|---|---|
| DEC-001 | HedefOra temiz depodan sıfırdan kurulacaktır; eski kod otomatik taşınmayacaktır. | ACCEPTED |
| DEC-002 | Bu başlangıç paketi yalnız Markdown'dır; runtime config ve kod Wave 000'da güncel formatla üretilir. | ACCEPTED |
| DEC-003 | Backend Go modüler monolit olacaktır. | ACCEPTED |
| DEC-004 | PostgreSQL 17 primary data store; River job queue olacaktır. | ACCEPTED |
| DEC-005 | MVP'de Redis veya ikinci broker yoktur. | ACCEPTED |
| DEC-006 | Frontend React + TypeScript; public sayfalar indexlenebilir, authenticated app interaktiftir. | ACCEPTED |
| DEC-007 | API contract-first OpenAPI 3.1; client ve mümkün olan registry'ler generated olacaktır. | ACCEPTED |
| DEC-008 | Deterministik planlama motoru source of truth; AI asenkron, bounded ve fallback'lı enhancement'tır. | ACCEPTED |
| DEC-009 | İlk desteklenen sınavlar KPSS, ALES ve DGS'dir; launch gate her biri için onaylı curriculum package ister. | ACCEPTED |
| DEC-010 | Self-hosted Linux origin ve Cloudflare edge/gateway kullanılacaktır. | ACCEPTED |
| DEC-011 | Codex için dedicated least-privilege SSH account; root ve sınırsız sudo yasaktır. | ACCEPTED |
| DEC-012 | Staging ve production erişimleri, anahtarları, secret'ları ve onayları ayrıdır. | ACCEPTED |
| DEC-013 | Maksimum dört eşzamanlı writer; dosya başına tek writer; shared file merge orchestrator-only. | ACCEPTED |
| DEC-014 | Tüm writer worktree'leri aynı immutable wave-start commit'inden açılır. | ACCEPTED |
| DEC-015 | Security/cold-review ajanları read-only; release için fresh-context review zorunludur. | ACCEPTED |
| DEC-016 | GitHub ana source control; ikinci off-site şifreli yedek launch ön koşuludur. | ACCEPTED |
| DEC-017 | Kullanıcıya başarı garantisi, resmi kurum izlenimi veya suçlayıcı dil verilmeyecektir. | ACCEPTED |
| DEC-018 | Ödeme, native mobile, sosyal/messaging, leaderboard, izinsiz scraping ve media download MVP dışıdır. | ACCEPTED |
| DEC-019 | Production dependency eklemek risk/lisans/alternatif değerlendirmesi ister. | ACCEPTED |
| DEC-020 | Ana model GPT-5.6 Sol + Ultra'dır; runtime'ın gerçek ayarı kanıta yazılır, sessiz downgrade yapılmaz. | ACCEPTED |
| DEC-021 | W000 yalnız build/test edilebilir no-feature scaffolding, toolchain ve repository validator kodu üretebilir; W001 platform/runtime davranışı W000 exit öncesi uygulanmaz. | ACCEPTED |
| DEC-022 | Gate'ler aktif wave kapsamına göre uygulanır; kanıtlı `NOT_APPLICABLE` PASS değildir ve mevcut artifact/acceptance için kullanılamaz. | ACCEPTED |
| DEC-023 | `PACKAGE-MANIFEST.md` ilk Markdown teslim paketinin değişmez provenance kaydıdır; yaşayan repository manifesti değildir. | ACCEPTED |

## Değiştirme kuralı

Bir ACCEPTED karar yalnız:

1. yeni ADR,
2. etki analizi,
3. migration/rollback planı,
4. owner approval

ile değiştirilebilir. Ajan tek başına bu dosyayı kapsam değiştirerek güncelleyemez.
