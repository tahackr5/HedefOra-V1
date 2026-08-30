# Dependency ve Supply-Chain Politikası

## Ekleme ölçütleri

Yeni production dependency için:

- gerçek problem ve neden standard library/mevcut dependency yetmiyor,
- bakım/maintainer sağlığı,
- lisans,
- security history,
- transitive dependency maliyeti,
- bundle/runtime etkisi,
- exit/replacement planı

yazılır.

## Sürüm kilidi

- exact lockfiles,
- toolchain version file,
- reproducible install,
- dependency bot PR'ları küçük ve review edilmiş,
- major update ADR/compat planı.

Exact sürümler Context7 ve resmi docs ile W000'da doğrulanır; bu blueprint sürüm uydurmaz.

## Artifact güveni

- CI source commit'ten build eder,
- immutable digest,
- SBOM,
- vulnerability scan,
- provenance/attestation,
- release artifact outside developer laptop,
- production deploy yalnız approved artifact.

## Private-plan vulnerability ve lisans telafisi

Hosted Dependency Review kullanılamadığında sonuç `BLOCKED_EXTERNAL` kalır. W001 runtime davranışından önce:

- pnpm ve Go manifest/lock kapsamının tamamını tarayan pinned OSS advisory scanner,
- production closure yanında development ve unknown scope'u kapsayan high/critical vulnerability gate,
- açık lisans allow/deny politikası ve unknown-license fail-closed davranışı,
- scanner binary/image, rules ve advisory DB digest'i,
- vulnerable development/unknown-scope, disallowed/unknown-license ve stale/missing DB negatif fixture'ları

zorunludur. Network, parse, timeout veya scanner internal error success'e map edilmez.

### R-016 yürütme sözleşmesi

- Trusted PR koşumu iki ayrı ve birbirini içermeyen Git kökü kullanır: `pull_request_target` base SHA checkout'u kontrol köküdür; runner, policy/scanner/rule kilitleri, evidence schema'sı, negatif fixture'lar ve doğrulayıcılar bu kökün exact Git blob'larından okunur. PR head checkout'u yalnız taranacak pnpm/Go manifestleri ile tracked Go/JavaScript/TypeScript kaynaklarını sağlar; target içindeki script/action çalıştırılmaz.
- Split-root koşumunda `scripts/supply-chain/**`, `scripts/fixtures/supply-chain/**`, `tools/osvdbcheck/**`, R-016 security config'leri ve iki R-016 workflow'u base ile target arasında path, mode, stage ve Git object ID düzeyinde birebir aynı olmalıdır. Bu protected parity sağlanmadan config okunmaz veya scanner başlatılmaz; target'ın normal dependency/source değişiklikleri ise kendi Git blob kimlikleriyle taranır.
- Trusted workflow, base runner'ı import etmeden önce current transitive production module setinin tamamını Git stage-0 `100644` blob, working-tree hash equality, regular/non-link dosya ve control-root realpath sınırıyla doğrular; import listesiyle bootstrap listesi testte birebir bağlıdır. Split-root koşumunda hosted veya local ayrımı olmadan target ve control exact SHA'ları zorunludur.
- İlk R-016 kontrol düzlemi PR'ında base branch henüz trusted workflow/runner taşımadığı için trusted PR gate'i çalışmış sayılamaz ve `NOT_RUN` kalır. Bu bootstrap yalnız clean exact-target/full-tree, security/cold review ve owner onayıyla control-plane-only ilk aşama olarak birleşebilir. Yeni base etkin olduktan sonraki ayrı target/runtime PR'ı trusted-base gate'i çalıştırıp `PASS` üretmelidir. Daha sonraki protected control-plane değişiklikleri de aynı owner-onaylı iki aşamalı akışı izler; eski base kontrolü ile yeni kontrol kodu aynı PR'da güvenilmiş sayılmaz.
- `pnpm-lock.yaml` içindeki her sütun-0 YAML belgesi önce strict ve duplicate-aware ayrıştırılır; her belge ayrı `pnpm-lock.yaml` olarak OSV'ye verilir. OSV source/package multiset'i raw lock envanteriyle birebir eşleşmezse sonuç reddedilir.
- Go kapsamı bütün tracked regular-file `go.mod` dosyalarını önce pinned `go mod edit -json`, sonra `GOWORK=off`, `-mod=readonly` ve exact pinned Go image ile çözer. Kullanılmayanlar dahil bütün `replace` directive'leri, versionsız third-party modül, orphan `go.sum` ve açıkça desteklenmeyen `go.work` merge'i bloklar; sıfır third-party yalnız başarılı `go list` ve OSV extraction-count kanıtıyla kabul edilir.
- npm ve Go advisory ZIP'leri her koşumda boş run-specific dizine fresh HTTPS `GET` ile alınır. GCS generation/ETag/Last-Modified/content-length/MD5 ile yerel MD5/SHA-256 doğrulanır; sıkıştırılmış header ve stream için ayrı ayrı 512 MiB, arşiv başına 300.000 entry, entry başına 128 MiB ve toplam açılmış içerik için 8 GiB üst sınır; en fazla 48 saat yaş ve 10 dakika future-skew uygulanır. `db-seal.json` yazıldıktan sonra aynı byte'lar read-only mount, `--network none` ve `--all-vulns` ile taranır; tarama sonrası hash yeniden doğrulanır.
- Lisans metadata'sı OSV/deps.dev ağ çağrısı gerektirdiği için config'siz vulnerability koşumundan ayrıdır. Lisans config'i yalnız exact `reserved@0.1.2 → MIT` override byte'larını kabul eder; ignore/regex/bilinmeyen TOML anahtarı bloklanır. Ağ/parse/timeout hata verir; başarılı sonuç yine exact all-scope package parity, açık SPDX allowlist ve unknown deny kontrolünden geçer. deps.dev response snapshot digest'i vermediği için bit-for-bit replay eksikliği residual risk olarak kanıtta tutulur.
- Pinned OSV negatif entegrasyonu npm fixture'larına ek olarak iki Go canary taşır: offline `golang.org/x/text@v0.3.7` fixture'ı exact `GO-2022-1059` advisory'sini ve extraction count'u; online `github.com/MichaelMure/git-bug@v0.8.0` fixture'ı exact `GPL-3.0-or-later` deny verdict'ini ve package/license parity'sini kanıtlamalıdır. İkisinde de beklenen finding raw exit'i `1`'dir; sıfır finding, farklı advisory/license, extraction drift'i veya ağ/parse/internal hata failure'dır.
- Ağ erişimi olan Go ve OSV container'ları repository root veya altındaki source/secret dosyalarını mount edemez; yalnız run-specific staging içindeki `go.mod`/`go.sum`, split lock ve bounded config girdilerini görür.
- SAST, digest-pinned nonroot Semgrep Community Edition image'ını yalnız `--oss-only`, exact locked Git commit:path blob'larından run-specific staging'e alınan rule files, `--network none`, read-only mounts, kapalı metrics/version-check ve bounded resource/timeout ile çalıştırır. Tüm tracked Go ve JavaScript/TypeScript regular source dosyaları checkout byte'larına güvenmeden exact Git index OID/blob'larından ayrı staging'e kopyalanır; ignore, binary/minified ve 1 MB target filtreleri kapatılır; `paths.scanned` exact Git source multiset'iyle birebir eşleşmezse koşum reddedilir. Bilerek insecure Go/TypeScript ile `.semgrepignore` ve 1 MB üstü bypass fixture'larının finding üretmemesi de gate failure'dır.
- Yerel CLI, açıkça verilmiş absolute `--git-binary` ve `--docker-binary` yolları olmadan başlamaz; dosyaların regular/non-link, executable, target/control/temp kökleri dışında ve hash-mühürlü olması gerekir. Hosted Linux koşumu yalnız `/usr/bin/git`, `/usr/bin/docker` ve trusted toolcache içindeki exact Node `24.20.0` ile çalışır. Git komutları exact repository `-C` bağıyla, system/global config ve routing/trace environment kapalı; Docker komutları run-specific boş config ve routing/executable-injection environment kapalı çalışır.
- Kanıt dosyası tracked JSON schema ve runtime validator'dan geçer; target ile control için ayrı initial/final HEAD/tree/index/status/hidden-flag seal'i, protected control-plane blob envanteri, Node/platform/runner ve Docker client/server kimliği ile yerleşik `manifest inspect` üzerinden image-index kimliğini, bütün zorunlu process'ler için literal command/argument/raw exit ve iki stream artifact hash/konumunu taşır. Terminal scanner verdict raw exit'i process kaydıyla eşleşir. Temp/container cleanup başarısızlığı önceki PASS durumunu atomik evidence yazımından önce FAIL'e çevirir; primary ve cleanup failure bounded structured cause olarak birlikte korunur.
- Canonical `evidence.json` doğrulama veya yazımı başarısız olursa koşum başarıya dönmez: original failure'ı koruyan, bounded ve secret/raw-output içermeyen `evidence-finalization-failure.json` atomik-exclusive yazılır ve exit `21` kalır. Artifact dizininde canonical evidence ile bu fallback'tan tam olarak biri bulunabilir; fallback hiçbir scanner sonucuna `PASS` anlamı kazandırmaz.
- Semgrep Rules License v1.0 kapsamındaki kurallar yalnız private HedefOra repository'sinin internal CI taramasında geçici olarak alınır; rule içeriği artifact/repository'ye vendored edilmez ve scanning-as-a-service sunulmaz. Repository public yapılmadan önce kullanım yeniden review edilir.
- Scanner ve DB işi 2 GB staging VPS üzerinde çalıştırılmaz; GitHub-hosted CI veya yeterli kaynaklı ayrı doğrulama ortamı kullanılır.

## Package script güvenliği

Install/build scriptleri review edilir; gereksiz lifecycle script ve internet fetch engellenir. CI tokenları scoped ve short-lived olmalıdır.

## Plugin/MCP supply chain

- Eklenti sayısı minimum tutulur.
- Permission ve provider trust incelenir.
- Overlapping high-privilege remote-control eklentileri kurulmaz.
- Plugin output source-of-truth kabul edilmeden code/test evidence ile doğrulanır.
- Bir plugin production secret okuyamaz veya yıkıcı işlemi onaysız yapamaz.
