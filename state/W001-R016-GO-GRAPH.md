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

## Artifact uyumluluğu

Producer `run.mjs`, consumer exact control SHA'sının `contracts.mjs` ve tracked evidence schema'sıdır. Yeni required `scannerManifest` ve transitive-canary/process alanları artifact biçiminde breaking sıkılaştırmadır; production uygulama API/DB sözleşmesi değildir. `schemaVersion: 2` tek başına revision/discriminator veya uyumluluk kanıtı sayılmaz: history artifact'i kendi exact control/schema blob SHA'larıyla replay edilir. Yeni validator eski v2 artifactlerini kabul etmez; eski başarılı artifact yeni biçime dönüştürülmez, geçmiş FAIL yeniden etiketlenmez. Geçiş penceresi yoktur; hosted controller ancak control-only owner-approved merge sonrası yeni biçimi üretir. Eski/yeni biçim karışımı unit corpus'ta missing field/process/original-hash-overload negatifleriyle reddedilir. Bu kırıcı artifact geçişi de exact-head owner merge paketinin parçasıdır; general development onayı arbitrary-head merge izni değildir.

## Exact yerel checkpoint kanıtı

- Task-open `77c8a2c`, implementation `4972c06e9432e6072ce5799cc751fca8be9db2eb`, ownership-only seal `5b9dd0b514d5165bb91202ad6113421c0c9d2cd6`, tree `7d4e60e55584499ff1d3840ed968ae89dbb1eb8b`. Branch/source/index temiz. Proposal 7 dosya SHA-256 `9e16cc7034b1d55ff8cd66f4f84c6eef73c051a3e0adae587aa55826a7b6f0df`; parent apply_patch entegrasyonu ve targeted supply-chain 123/123 exit 0.
- Pinned Node 24.20.0/pnpm 11.24.0 clean full-clone frozen install 502 ve ci:check exit 0; repository 184 test: 182 PASS, 0 FAIL, mevcut iki Windows literal-backslash skip. Web 3/3 ve scaffold coverage %100; canonical OpenAPI negative corpus 33/33. Yeni compiler bu branch'te yoktur.
- Pinned Go 1.26.7 Linux fmt21tracked, mod verify/tidy-diff/list/build/vet/uncached-shuffle/race exit 0. W000 immutable diff + historical merge-wrapper ve W001 all/continuous ownership exit 0. Python 3.12.13 TOML + 4/4, actionlint 1.7.12, Gitleaks 8.30.1 history131commit, exact typed-UUID sibling raw1, inert Compose services0/disclosure0 ve Git integrity exit 0. Fsck 11 dangling blob bildirdi; corruption yok.
- Quality kanıtı repository dışı `hedefora-control-quality-6e6511a00cc746f2a7122ceebe45813a`: ci-check.log SHA-256 `1ff6b287eaf441aa78dc7436f8c6c52c8ce250f66db0c423ab186e1a734e08fa`; go-quality.log `922e2577eff9d89b767f389a548aad33748b54f1e3e85f58efb9a6a2c4d44acd`.
- Canonical local R-016 `20260906T134514656Z-25268-432a0759`: PASS/0 exact source/control `5b9dd0b`; evidence SHA-256 `99881619cc0a57696594cfa538a951ad80e6e80e582326eb279f2ffd3d51fd67`; db-seal `d61c367bfe8f944b906aefdac8ce28d627fa916a4396106a0b3f2b6056d0d706`. Zero-third-party actual target extraction0; canary selected13/thirdparty12/extraction12, exact GO-2026-5970/raw1. Independent cold replay408/408 regular raw size/hash, 90 source/control blob, 32 protected index entry mismatch0; JSON schema validation True/0. DB start ages npm16.20h/Go10.22h. Local declaration visibilityProof=false, hosted authority değildir.
- İlk CLI run `20260906T134441459Z-11240-f59bd028` canonical Windows executable path spelling nedeniyle acquisition öncesi FAIL/20 verdi; doğru backslash ile ayrı run başlatıldı. Başarısız artifact korunur, PASS sayılmaz.
- Independent security scoped PASS/HIGH: exact5b9 diff, pinned Node run/contracts/policy 99test exit0, finding0. Fresh read-only cold review local control-only PASS: actual raw artifact/schema/source/ownership ve threshold replay doğrulandı; transitive canary normal production policy'de unknown severity nedeniyle exit20 vermeye devam ediyor. Her iki reviewer effective model/effort UNKNOWN/UNKNOWN; parent override/config mutation yok.
- Ayrı disposable local candidate `cf58f6601a87d11e2c13a8ece3ca06d1f0c5baec`, tree `a152450eea44ca9fd4721c635c01330c09068fe9`, yalnız controller üstüne actual pgx manifests ekler. R-016 `20260906T134843780Z-27652-d0b5857e` PASS/0, MVS17 toplam/16thirdparty/tam extraction16, vulnerability/license all-scope PASS. Evidence `2d38ae22ece5620356bf7be2d72f63325773b8bec175a6d965d44cca60b74106`; dbseal `1c9d31a3692a3a033611bcd0a8805c38c4cde6446f8f95da962efc0780292687`; 410/410 raw rehash mismatch0. go.mod `5e4707956c76acec9a0fa1958cb6f5c91bff28a4a0ddef2a6845cca8645cfadf`, go.sum `01e871c8682b62b9801251dd00fa5abe3eaf689c083e2d227bb7c62bcd75c1b4`, scanner-only manifest `9fcca37de4ca5682de3b87247fb5d3c57a061cb4c172cdd91086cfe45a986c08`/678byte. Bu unpushed candidate runtime/trusted base veya control PR içeriği değildir; yalnız local graph admission deneyi, sibling pool geliştirmesini başlatır.

## Doğrulama ve rollback

Yukarıdaki sonuçlar yalnız exact5b9 yerel checkpoint'e bağlıdır. Bu evidence-promotion commit'i ve manifest-only yeni final seal üzerinde yeni exact full-tree/R-016 replay ve independent final recheck gerekir; sonuç eski SHA'dan taşınmaz. PR/hosted Linux/CodeQL/Dependency Review, owner merge ve post-merge henüz NOT_RUN. Eski base protected controller değişikliğini trusted PR parity ile reddetmelidir; bu control-only bootstrap'ın NOT_RUN sınırıdır, ayrı runtime PR için bypass değildir. Bare/secured pgx differential deneyleri source-only isolated manifest verisi olarak çalışır; uygulama/PG service başlatılmaz.

Rollback merge öncesi branch'i terk edip fail-closed trusted main'i korumaktır. Public repo eski private-only kontrol tree'sine döndürülmez; hiçbir production/data mutation yoktur. Kullanıcıdan normal implementasyon ayrıntıları için ek onay istenmez; yeni exact merge yetkisi gerekiyorsa o somut kapıda raporlanır.
