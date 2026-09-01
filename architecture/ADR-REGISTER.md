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

## ADR-0016 — Wave içi immutable trusted checkpoint

- Durum: `Accepted`
- Owner onayı: `2026-08-31`

DEC-014'ün amacı hareket eden bir integration `HEAD`'inden farklı writer tabanları açılmasını ve ownership drift'ini engellemektir. W001'in ilk base'i `bde560f182032e1e4ec9f1a1b02db4cd8ec5e99b` trusted R-016 runner'ını taşımazken runtime PR'ının bu runner'ı taşıyan yeni base'i kullanması güvenlik sözleşmesidir. Owner, `ac637de57d4f7c3a7f51c4933365f596e0b3817b` head'inin exact two-parent, content-identical merge'ini ve runtime'ın yeni trusted base'ten sürmesini açıkça onayladı.

Bu nedenle wave start SHA/tree tarihsel provenance olarak değişmez; fakat yeni bir task fazı yalnız şu koşullarla ileri checkpoint açabilir: exact owner onayı, iki parent'lı content-identical merge, uzak `main` parent/tree doğrulaması, yerel ve hosted full-tree/R-016 `PASS`, mevcut hosted security gate'leri ve kayıtlı residual riskler. Fazdaki bütün writer'lar tek checkpoint'ten açılır; moving `HEAD`, farklı base veya unsealed branch kullanılamaz. W001 runtime checkpoint'i `1dbc81b57e4809ce7ba0f530cab946ee0540ea71`, tree `8e6973a69f8f9551a29c8f301d59961113cf4e70`'dir.

API/DB/event/job davranışı veya veri migration'ı bu kararla değişmez. Rollback, runtime branch/worktree'lerini terk edip trusted `main` checkpoint'ini korumaktır; public repository'de control-plane tree'sine ham revert ADR-0015 gereği yasaktır. Yeni runtime exact head'i ayrı owner merge onayı ve trusted-base PR gate'i almadan `main`e giremez.

## ADR-0017 — Exact-health sealed OpenAPI renderer

- Durum: `Accepted`
- Owner onayı: `2026-08-31`
- İlgili risk: `GHSA-9c2f-gr95-7wqw`, `R-019`, `R-020`

`oapi-codegen 2.8.0` ve upstream `HEAD`, spec kaynaklı `x-go-type-import.name` değerini generated Go koduna güvenli olmayan biçimde taşıyabildiği ve patched sürüm yayımlanmadığı için W001 dependency/tool admission'ı alamaz. Recursive Spectral extension yasağı defense-in-depth'tir; known-vulnerable generator'ı çalıştırma yetkisi vermez. Owner, upstream yamayı beklemek yerine ayrı güvenlik-kritik yerel generator stratejisini açıkça onaylamıştır.

W001'in ilk Go üreticisi genel amaçlı YAML/OpenAPI compiler değildir. `contracts/openapi/openapi.yaml` dosyasının exact LF byte dizisini, boyutunu ve SHA-256 kimliğini kabul eden repository-owned sealed renderer yalnız `GET /health/live` profilini ve tek allowlisted `internal/generated/openapi/openapi.gen.go` artifact'ını üretir. Renderer yalnız Node standard library kullanır; YAML parser, template/plugin engine, subprocess, network, environment-derived path, stdin veya dinamik import içermez. Input/output/package/template/config yolu CLI'dan değiştirilemez. Spec metninden identifier, import, package, output path, comment veya Go source parçası interpolate edilmez; generated import ve symbol yüzeyi renderer içinde sabittir.

Kanonik OpenAPI source of truth olarak kalır. Renderer önce fatal UTF-8 ve bounded lexical güvenlik preflight'ı, ardından exact source digest'i uygular. Bilinmeyen key/extension, duplicate/alias/tag/merge/multi-document biçimi, external/dynamic/recursive ref veya tek byte'lık semantik değişiklik source seal mismatch ile fail-closed olur. `--check` write-free exact byte parity ve output inventory doğrular; `--write` yalnız hardcoded regular/non-link path'e exclusive temp + atomic rename ile yazar. Generated dosya elle düzenlenmez.

Üretilen Go yüzeyi yalnız contract tipleri, exact operation metadata'sı, sealed `200/503` response union'ı ve `StrictServerInterface` içerir. HTTP request ID, typed default error mapping, exact method/path dispatch, content negotiation, logging ve graceful drain T04D'nin hand-written transport boundary'sinde kalır. `http.ServeMux` GET pattern'inin HEAD'i örtük kabul etmesi nedeniyle T04D exact method/path negatifleri olmadan runtime `PASS` sayılamaz.

Bu karar additive API sözleşmesini değiştirmez; DB/event/job veya veri migration etkisi yoktur. TypeScript consumer parity bu Go task'ıyla otomatik `PASS` olmaz. Ana residual risk, sealed source digest'i ile sabit Go profilinin birlikte yanlış güncellenmesidir; independent semantic parity, deterministic golden, generated drift, exact Go compile/vet/test, R-016 ve fresh security/cold review ile azaltılır. İkinci operation/schema veya dinamik identifier ihtiyacında bu renderer genişletilmez; yeni owner-approved compiler/parser admission task'ı açılır. Rollback merge öncesi task branch'ini terk etmek; patched upstream'e ileride geçiş ise public Go API ve HTTP golden parity kanıtından sonra atomik consumer migration yapmaktır.

## Yeni ADR şablonu

`templates/ADR.md` kullanılır. Yeni karar burada yalnız tek satır özetle indekslenir.
