# W001 R-016 selected-Go-graph remediation

- Status: IN_PROGRESS; tarih 2026-09-06.
- Tek writer/integrator: orchestrator; bağımsız architecture proposal, security ve cold reviewer read-only.
- Branch/worktree: `codex/w001-r016-go-graph`, `C:\Users\ihsan\.codex\worktrees\HedefOra\W001\T04FB-CONTROL`.
- Immutable base: owner-onaylı PR #6 merge `7a1e124e432b51694e7d60c0d3d1589867a8835f`; tree `ec6d12847c657adedbd84e44565598d234c7b928`. Ordered parents `cd81ee7b36d5bc647bb297e8ede13b21a7f1c8f1` + `01017a25bf02f27924bf0361fd6b70abdc493ac0`; approved-head diff boş.
- Historical wave-start `bde560f182032e1e4ec9f1a1b02db4cd8ec5e99b` değişmez.

## Bulgu ve yetki

Owner PR #6 merge/post-merge ve DQ-008 A, DQ-009 A, DQ-010 B sonrası otonom geliştirme/test/regression düzeltmesini onayladı. Phase B'nin 16-third-party pgx graph'ını ekleyen exact seal `bb57a51bfe3cd0c3cae6d3197ef2b69462d38b17` (tree `1a55a91ffbd64167bc7f1ebe62d10ab7f9fdcc68`) mevcut R-016 tarafından fail-closed reddedildi. Bu branch yalnız kanıtlanan scanner regression'ını düzeltir; runtime graph/compiler/pool/image değişikliğini taşımaz.

R-016 run `20260906T130505799Z-24384-356bcd77`, normalized exit 21/OSV raw exit 127. OSV 2.5.1 default govulncheck, bilerek manifest-only hazırlanmış source kökünde actual package bulamadı. Raw JSON root require'ların 8 third-party modülünü içerirken MVS inventory 16 third-party modül taşıyor; original extractor 9 bildiriyor. Bu ek sayımın main module olduğu varsayımı kullanılmaz: canlı deneyde go directive taşımayan scanner-only manifest extraction'ı third-party sayısıyla birebir eşleşti. Existing exact extraction parity de eksik graph'ı reddeder. Saptanan sonuç yanlış PASS değil, yeni production dependency ile açığa çıkan fail-closed availability/coverage uyumsuzluğudur.

## Sözleşme

1. Original tracked go.mod/go.sum yalnız manifest-only resolver acquisition'da kullanılır ve original SHA kanıtı korunur.
2. Exact `go list -mod=readonly -m all` selected MVS graph'ı scanner-only deterministik manifest'e dönüştürülür. Main module dışındaki bütün modüller/version'lar bir kez yer alır; replacement, duplicate, invalid/nonexact identity fail-closed olur.
3. Synthesized manifest format/size/SHA ayrı `scannerManifest` kanıtıdır; original `goModSha256` yeniden etiketlenmez. Scanner path/extraction/JSON package multiset ile MVS inventory birebir karşılaştırılır.
4. Manifest-only advisory/license taramasında explicit `--no-call-analysis=go` kullanılır. `--all-vulns`, all-scope eşik, raw exit ve offline vulnerability/database seal sınırları değişmez; reachability ile finding bastırılmaz. SAST/CodeQL ayrı uygulanır.
5. Root requires içinde bulunmayan gerçek transitive vulnerable module için pinned-source canlı canary gerekir; sadece unit fixture veya direct x/text canary bunu karşılamaz. Pgx-only kök, selected `golang.org/x/text v0.29.0` / exact `GO-2026-5970`, raw finding exit 1 ve bütün selected package multiset parity aranır. Bu advisory'nin boş severity metadata'sı mevcut production policy'de contract exit 20 ile fail-closed kalır; canary sırf finding exit 10 almak için metadata veya eşik değiştiremez.
6. Protected control-plane exact-path/mode/stage/OID parity ve first-party boundary korunur; runtime target kendi yeni kontrolünü trusted ilan edemez. Ayrı control-only PR, exact local/full-tree/R-016/security/cold/hosted gate ve owner-controlled merge sonrası trusted base ilerler.

## Sahiplik

Yalnız `scripts/supply-chain/{run,run.test,contracts,contracts.test}.mjs`, `security/r016-evidence.schema.json`, gerekli tek-purpose `scripts/fixtures/supply-chain/*transitive*` fixture'ı ve atanmış governance/evidence/ownership dosyaları. Workflow/policy/scanner version/threshold/ruleset değişikliği yoktur. Kök go.mod/go.sum veya runtime kaynakları bu PR'a alınmaz. Root proposal'ı doğrulayıp apply_patch ile uygular; generated/schema kimlikleri semantik inceleme sonrasında yenilenir.

## Doğrulama ve rollback

Control implementation, negative corpus, local exact R-016 (transitive canary dahil), full-tree, security/cold, PR/hosted ve post-merge sonuçları şu an NOT_RUN. Eski 7a1e124 post-merge PASS bu yeni kontrol head'ine taşınmaz. Bare/secured pgx graph differential deneyleri source-only isolated manifest verisi olarak çalışır; uygulama/PG service başlatılmaz.

Rollback merge öncesi branch'i terk edip fail-closed trusted main'i korumaktır. Public repo eski private-only kontrol tree'sine döndürülmez; hiçbir production/data mutation yoktur. Kullanıcıdan normal implementasyon ayrıntıları için ek onay istenmez; yeni exact merge yetkisi gerekiyorsa o somut kapıda raporlanır.
