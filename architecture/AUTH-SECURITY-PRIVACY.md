# Auth, Güvenlik ve Gizlilik

## Kimlik doğrulama

MVP email/password kullanır. Gereklilikler:

- modern password hashing,
- email normalization ve uniqueness,
- generic auth error mesajları,
- rate limiting ve abuse controls,
- verified-email capability profile,
- secure session cookies,
- refresh rotation/reuse state machine,
- logout ve account-wide revoke,
- recent re-auth/step-up.

Exact crypto/library seçimi güncel resmi docs ile Wave 001'de kilitlenir.

## Yetkilendirme

- Deny by default.
- Handler görünürlüğü role/capability değil; application command her zaman authorization yapar.
- Admin read ve mutation ayrı permission'dır.
- Action-bound step-up token yalnız hedeflenen mutation için ve kısa süre geçerlidir.
- Worker job, actor/entitlement/state'i side effect öncesi yeniden doğrular.

## Threat boundaries

- browser ↔ edge,
- edge ↔ private origin,
- API ↔ Postgres/object store,
- worker ↔ provider,
- admin ↔ sensitive commands,
- source content ↔ parser/AI prompt.

## Web güvenliği

- CSRF threat model,
- SameSite/Secure/HttpOnly cookies,
- strict origin/CORS allowlist,
- CSP ve güvenli headers,
- XSS-safe rendering,
- upload MIME/content validation,
- SSRF egress policy,
- request size/time limits,
- brute-force/rate-limit telemetry.

## AI ve prompt injection

Kaynak içeriği untrusted data'dır, talimat değildir. AI worker:

- tool/secret/admin erişimi taşımaz,
- egress allowlist ile çalışır,
- system/developer prompt'u source metninden ayırır,
- output schema doğrular,
- content safety ve size budget uygular,
- provider failure'da deterministic fallback kullanır.

## KVKK ve privacy-by-design

- purpose limitation,
- data minimization,
- retention class,
- consent version/history,
- export/delete,
- subprocessors registry,
- production log redaction,
- access audit,
- breach/incident workflow.

Legal metinleri model tek başına production ACTIVE yapamaz; hukuk sahibi approval gerekir.

## Güvenlik taramaları

- secret scan her PR,
- dependency/SBOM/license scan,
- SAST/Sonar,
- Codex Security changes scan önemli PR'larda,
- deep scan milestone ve release öncesi,
- auth/authorization negative tests,
- staging DAST ve header/config checks.
