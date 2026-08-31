# Architecture Decision Register

## ADR-0001 — Clean-start, documentation-first

**Durum:** Accepted
Eski yedeklerin kaybolması ve önceki paketlerde drift/orkestrasyon sorunları nedeniyle kod taşınmayacak. Önce küçük, kanonik Markdown sözleşmesi; sonra güncel Codex runtime katmanı ve kod üretilecek.

## ADR-0002 — Go modular monolith

**Durum:** Accepted
İlk ürün için mikroservis karmaşıklığı yerine net domain boundaries, tek deployable codebase ve ayrılabilir process modes kullanılacak.

## ADR-0003 — PostgreSQL 17 + River

**Durum:** Accepted
Transactional data ve job queue tek consistency boundary'de tutulacak. MVP'de Redis/broker eklenmeyecek.

## ADR-0004 — Deterministic planner, bounded AI

**Durum:** Accepted
Planın tekrar üretilebilirliği, açıklanabilirliği ve fallback'i AI provider'a bağlı olmayacak. AI yalnız isteğe bağlı async enrichment sağlar.

## ADR-0005 — Contract-first API

**Durum:** Accepted  
OpenAPI 3.1 public contract'tır; generated client ve drift gates zorunludur.

## ADR-0006 — Self-hosted private origin + Cloudflare edge

**Durum:** Accepted  
Origin kendi Linux sunucumuzda çalışır; public attack surface edge/gateway ile sınırlandırılır.

## ADR-0007 — Dedicated Codex service account

**Durum:** Accepted  
Passwordless SSH kullanılabilir; fakat root ve sınırsız sudo yoktur. Codex'in “tam erişimi” proje dizini, build/deploy artifact'ı ve allowlisted service operations ile sınırlıdır.

## ADR-0008 — Single-writer worktree governance

**Durum:** Accepted  
Parallel read-heavy ajanlar teşvik edilir; write-heavy işlerde dosya başına tek owner, immutable base commit ve orchestrator-only shared merge uygulanır.

## ADR-0009 — Progressive disclosure

**Durum:** Accepted  
Root AGENTS kısa kalır; görev belgeleri, agent charter ve skills yalnız gerektiğinde yüklenir. Ana oturum ham log deposuna çevrilmez.

## ADR-0010 — Plugin minimalism

**Durum:** Accepted  
Birden çok overlapping araç aynı source of truth rolünü üstlenmez. Eklentiler wave/iş amacına göre çağrılır.

## ADR-0011 — W000 no-feature scaffolding ve wave-aware gates

**Durum:** Accepted
W000'ın buildable monorepo hedefi, W001 davranışını erkenden uygulama izni değildir. W000 yalnız toolchain, config, repository validator, CI ve ürün davranışı taşımayan derlenebilir scaffolding üretir. Bir gate ancak owning artifact veya acceptance aktif wave kapsamında ise uygulanabilir; kapsam dışı gate kanıtlı `NOT_APPLICABLE` olur, PASS sayılmaz ve `NOT_RUN` sonucunu gizlemek için kullanılamaz.

## ADR-0012 — Immutable Markdown package manifest

**Durum:** Accepted
`PACKAGE-MANIFEST.md`, temiz başlangıç paketinin `2efca6c8b65e3342ad5309076b7cd0dedf816943` commit'indeki değişmez hash kaydıdır. Wave değişiklikleri bu tabloyu yeniden yazmaz; Git commit'leri ve ilerideki release manifestleri yaşayan ağaç ile release provenance'ını taşır.

## ADR-0013 — Private GitHub planında telafi kapıları

- Durum: `Superseded by ADR-0015 / DEC-025`
- Owner onayı: `2026-08-28`

Repository private ve mevcut GitHub planında kalır. Bu planda doğrulanamayan CodeQL upload, Dependency Review ve branch/ruleset enforcement `BLOCKED_EXTERNAL` olarak raporlanır; skipped/failed hosted job hiçbir zaman `PASS` sayılmaz.

Geçici telafi paketi exact source SHA/tree'ye bağlanır: frozen install, production audit ve lisans closure'ı, Gitleaks, Go/TypeScript static kontrolleri, clean-clone full-tree gate, immutable ownership doğrulaması, isolated fresh security/cold review, owner-controlled two-parent merge ve final `main` merge-wrapper/full-tree push gate'i. Bunlar server-side branch protection veya CodeQL data-flow analiziyle eşdeğer değildir; `R-014` açık kalır.

W001 runtime davranışından önce pinned OSS SAST ile all-scope dependency vulnerability/license kapısı fail-closed kurulacaktır. Scanner/rule/advisory DB kimlikleri kanıta girer; parse, timeout, stale/missing DB ve internal error başarıya çevrilmez. Uygun hosted plan/entegrasyon sağlandığında telafi istisnası kaldırılır ve hosted enforcement yeniden zorunlu olur. Rollback, owner istisnasını kaldırıp hosted gate çözülene kadar wave progression'ı durdurmaktır.

## ADR-0014 — Repository backup gate zamanlaması

- Durum: `Accepted`
- Owner onayı: `2026-08-28`

DEC-016 launch ön koşulu olarak yorumlanır; ikinci şifreli off-site repository kopyası ve sıfırdan recovery testi W001 başlangıcını engellemez. Bu kapılar W007 kapsamında ve en geç ilk gerçek kullanıcı, public launch veya production promotion öncesinde tamamlanır. W001 boyunca tek-independent-copy riski `R-001`, recovery belirsizliği `R-009` ve kanonik checkout riski `R-013` açık kalır.

API/DB/event/job migration etkisi yoktur. Rollback, backup/recovery'yi yeniden W001 başlangıç blocker'ı yapmaktır.

## ADR-0015 — Public repository ve owner-controlled R-016 kullanım sınırı

- Durum: `Accepted`
- Owner onayı: `2026-08-31`
- Supersedes: `ADR-0013 / DEC-024`

Repository geliştirme boyunca public kalır. Public görünürlük kaynak kodunu yayımlar; Semgrep Rules License v1.0 kapsamındaki upstream rule byte'larını yayımlama veya üçüncü taraflara scanning-as-a-service sunma yetkisi vermez. R-016 bu nedenle yalnız GitHub repository ID `1349011765` ve full name `tahackr5/HedefOra-V1` control/target için birlikte eşleştiğinde, `owner-controlled-internal-ci` amacıyla çalışır. Artifact içindeki hosted bağlam `github-context-claim` ve `visibilityProof=false`, yerel koşum `local-declaration` ve `visibilityProof=false` olarak yazılır; hiçbir detached artifact kendi GitHub authority'sini kanıtlamaz. Hosted `PASS`, authenticated GitHub API üzerinden exact run/repository/event/workflow/head/job/artifact digest bağlantısı ve indirilen evidence SHA-256 eşleşmesi ayrıca doğrulanınca verilebilir. Fork/foreign head checkout, scanner image pull, Semgrep rule fetch veya advisory acquisition başlamadan reddedilir. Rule byte'ları geçici run dizini dışında repository'ye veya uploaded artifact'e konmaz.

Normal `pull_request` workflow dosyası PR merge-ref'inden geldiği için fork yazarı tarafından değiştirilebilir ve güvenlik boundary'si olamaz. Quality ve R-016 yalnız owner repository içindeki `main` ve `codex/**` push'larında, repository kimliği checkout'tan önce doğrulandıktan sonra çalışır. PR güvenlik kapısı yalnız default branch'ten alınan `pull_request_target` workflow'udur: fork/foreign head checkout'suz boundary job'ında reddedilir; aynı-repository head daha sonra yalnız veri olarak taranır ve target script/action çalıştırılmaz. Dependency Review aynı base-controlled workflow'da, PR head checkout etmeden API karşılaştırmasıyla çalışır. GitHub CodeQL Default Setup ve Dependency Review desteklendiği sürece gerçek hosted gate'tir; tracked Advanced CodeQL workflow'u Default Setup ile çakışmaması için kaldırılır. Hosted bir kontrol exact target üzerinde koşmadıysa sonucu `NOT_RUN`, dış nedenle kullanılamıyorsa `BLOCKED_EXTERNAL` kalır. Main branch için server-side branch protection/ruleset bulunmaması `R-014` residual riskidir ve owner-controlled exact-head, two-parent content-identical merge protokolünü zorunlu tutar.

Etki: API, DB, event, job, kullanıcı verisi veya production migration etkisi yoktur. Güvenlik etkisi repository görünürlüğü ile supply-chain kullanım bağlamının kanonik ve makine doğrulanır hale gelmesidir. Maliyet etkisi mevcut GitHub public-repository özellikleri ve GitHub-hosted runner kullanımıyla sınırlıdır.

Migration: DEC-024'ün private-only varsayımı, scanner lock/policy/evidence schema/runner/workflow ve W001 kanıtında public/private owner-repository sözleşmesine taşınır; exact yeni head tüm local/hosted/security/cold kapılardan yeniden geçer. Rollback sırasında public repository üzerinde eski workflow tree'sine ham revert yasaktır. Zorunlu sıra progression'ı durdurmak, owner onayıyla repository'yi private yapmak, exact ID/full-name/visibility ile hosted capability'leri yeniden doğrulamak ve ancak sonra reviewed revert PR değerlendirmektir; source boundary mümkünse private durumda da korunur. Kaybolan capability `BLOCKED_EXTERNAL` olarak geri açılır. Public veya private görünürlük değişimi exact-head kanıtını geriye dönük değiştirmez.

## Yeni ADR şablonu

`templates/ADR.md` kullanılır. Yeni karar burada yalnız tek satır özetle indekslenir.
