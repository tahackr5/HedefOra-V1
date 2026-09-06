# PostgreSQL image vulnerability policy

Bu dizin DEC-030 / ADR-0020 için saf, bağımlılıksız kanıt doğrulayıcısıdır.
Yeni bileşen repository'ye additive olarak eklenir; yayımlanmamış ilk öneriye
göre F-02 evidence sıkılaştırması breaking'dir (aşağıdaki geçiş sınırı).
Producer: orchestrator-owned acquisition/build/scan
runner. Consumer: image admission ve disposable engine test kapısı.
OpenAPI/SQL/DB migration değişikliği yoktur; R-016 npm/Go dosyaları değişmez.

`status: PASS` yalnız verilen image vulnerability kanıtının tutarlılığını belirtir.
Çıktı her zaman `executionAdmission: NOT_EVALUATED` ve
`licenseReview: NOT_EVALUATED` taşır. GPL/ICU/Zlib/PostgreSQL dahil literal
build/runtime lisanslarının ayrı inventory/source/distribution incelemesi ve
bağımsız security kabulü olmadan image execution açılamaz. Kanıtın içine yazılan
bir `licenseReview: PASS` bu koddan yetki alamaz.

## API ve güven sınırı

Bütün evaluate fonksiyonları `{status, findings:[{code,path,detail}]}` döndürür;
eksik, bozuk veya desteklenmeyen veri FAIL olur. Dosya sistemi, ağ, process veya
image başlatılmaz. `sha256(bytes)` exact input byte'larını hashler.

`evaluateImageAdmission(evidence, trusted)` iki ayrı argüman ister.
`trusted` değerleri evidence JSON'dan alınamaz: runner kendi okuduğu reviewed
lock, gerçek saat/run kimliği, pinned image inputları, gerçek extraction sonucu
ve yeniden hashlediği artifact'lardan üretir. Bu modül hash/provenance claim'lerini
karşılaştırır; kendi başına process provenance, publisher authenticity veya
image içeriğinin doğruluğunu kanıtlamaz.

`trusted` biçimi:

- `lock`: `security/postgres-image-scanners.lock.json`.
- `now`: gerçek UTC/RFC3339 değerlendirme zamanı; `runId`: tek koşum kimliği.
- `targets.build`, `targets.runtime`: `imageDigest` (sha256:…), `rootfsSha256`,
  `inventory` (name/version/architecture/literal license/origin/purl/cpes nesneleri),
  `distro: {id:'alpine',versionID:'3.24.0'}`, `syftSource` (tam Syft source
  nesnesi), `grypeSource: {type:'sbom-file',target:exactPath}`.
- Runtime ayrıca `postgresBinarySha256` (gerçek /opt/postgresql/bin/postgres)
  ve `sourceGrypeSource` taşır.
- `canaryGrypeSource`: exact canary SBOM dosyasının Grype source nesnesi.
- `apkCanary`: bağımsız pinned known-vulnerable OCI input hedefi; imageDigest,
  rootfsSha256, inventory, distro, syftSource ve grypeSource alanları stage ile aynı.
  Ek `requiredMatches` listesi name/version/purl/vulnerabilityId/severity/cpe
  taşır. Beklenen bütün blocking APK finding'leri önceden belirlenir; yeni rapordan
  türetilmez. Duplicate, eksik veya değişen finding tam eşitliği bozar.

`evidence` biçimi:

- `tools.grype`, `tools.syft`: `runId`, `platform` (windows/amd64 veya
  linux/amd64), `archiveSha256`, `archiveMemberSha256`,
  `executableSha256Before`, `executableSha256After`, ve raw `version -o json`
  çıktısından parse edilen `version` nesnesi.
- `database`: `runId`, `archiveSha256`, `archiveSize`, `extractedSha256`,
  `importRawExit:0`, `databaseSha256Before`, `databaseSha256After`, raw
  `grype db status -o json` nesnesi `status`. Hydration SQLite byte'larını
  değiştirebilir: archive/extracted hash pinlidir; import sonrası DB hash'i
  scan öncesi ve sonrası eşit olmalıdır.
- `stages.build`, `stages.runtime`: `runId`, `imageDigest`, `rootfsSha256`,
  `extraction:{rawExit:0,errors:[]}`, `syft`, `grype`.
- Process zarfı `{runId,text,sha256,inputSha256,rawExit,stderr}`; `text`
  raw UTF-8 JSON'dır. Syft input hash'i exact extracted rootfs hash'i; Grype
  input hash'i exact SBOM text hash'idir. Runner rootfs fingerprint algoritmasını
  sabitler; empty input/snapshot/advisory kaynağı başarılı tarama yerine geçmez.
- `source:{sbom,grype}`: SBOM `makePostgresSbom({version,sourceSha256,
binarySha256,imageDigest})` üretir. `sbom.inputSha256` binary SHA'dır.
- `canary:{sbom,grype}`: CycloneDX 1.6/version 1; components tam olarak
  `[{type:'application','bom-ref':'postgresql-source',name:'postgresql',
version:'17.2',purl:'pkg:generic/postgresql@17.2',
cpe:'cpe:2.3:a:postgresql:postgresql:17.2:*:*:*:*:*:*:*'}]`.
  `sbom.inputSha256 = sha256('postgresql-source-canary-17.2')`.
  CVE-2025-1094 High/Critical CPE match ve raw exit 2 zorunludur.
- `apkCanary`: stage gibi runId/imageDigest/rootfsSha256/extraction/syft/grype
  taşır. OCI yalnız veri olarak kataloglanır; canary paketleri çalıştırılmaz.
  Raw exit 2, exact expected blocking finding kümesi, APK artifact kimliği ve
  apk-matcher/cpe-match/searchedBy CPE/vulnerabilityID witness zorunludur.
  Grype 0.118.0 APK matcher, search CPE sürümünden yalnız APK -rN revision
  ekini kaldırır; artifact CPE'sinde tam paket sürümü korunur.
  PostgreSQL canary'si APK canary'sinin yerine geçmez.

Aynı kontroller tekil API ile çalıştırılabilir:
`evaluateScannerIdentity({name,evidence,lock,runId})`,
`evaluateDatabase({evidence,lock,now,runId})`,
`evaluateApkCoverage({sbomText,inventory,expectedSource,expectedDistro,lock})`,
`evaluateSourceCoverage({sbomText,expected})`,
`evaluateApkCanary({evidence,expected,runId,database,lock})`,
`evaluateGrypeReport({reportText,rawExit,stderr,expectedSource,expectedDistro,database,lock})`.
Tekil API PASS sonucu aggregate kanıtının yerine geçmez.

## Exact scanner davranışı

Syft 1.51.1 JSON schema 16.1.10 kullanır. OS envanteri için
`--select-catalogers apk` tag'i kullanılır; `apk-db-cataloger` plain adı bu
seçenekte geçersizdir. Directory kaynağı explicit source-name/source-version
ister. APK type/foundBy/metadata/name/version/architecture/literal license
exact multiset eşitliği gerekir. Native Windows directory taramasında
`distro:{}` / boş PURL görülürse inference yapılmaz; Linux/OCI taramasıyla
gerçek coverage üretilmelidir. Compiled PostgreSQL ayrı CPE/PURL/source/binary
SHA SBOM'uyla aynı DB koşumunda taranır.

F-02 gereği her trusted inventory satırı bağımsız APK installed/archive
metadata'sından origin taşır. `canonicalApkPurl(row,distroVersion)` yalnız bu
metadata'dan canonical name/version/architecture/distro/upstream PURL üretir.
Trusted purl bu değerle ve scanner PURL'üyle tam eşleşmelidir. Trusted cpes alanı
boş olmayan, duplicate içermeyen, ayrıca reviewed bir CPE kümesidir. Denetlenen
SBOM'dan expected CPE/PURL/origin kopyalanamaz. CPE syntax profili mevcut APK
application-CPE'leriyle sınırlıdır: literal vendor/product, exact APK version,
wildcard son alanlar ve escaped plus; en fazla 32 CPE. Desteklenmeyen profil
review gerektirir. Bu kontrol genel CPE generator veya kendiliğinden mapping
onayı değildir.

Runner input sözleşmesi lock.syft.generateCpes=true değerini pinler; pinned
Syft CreateSBOMConfig effective data-generation.generate-cpes=true çıktısı
zorunludur. Eksik/false setting veya exact trusted CPE set farkı FAIL'dir.
53 paket için bağımsız origin/name/version/arch/license hazırlık metadata'sı
bulunması CPE eşlemesinin de onaylandığı anlamına gelmez. CPE mapping admission
henüz NOT_RUN ise aggregate coverage FAIL/BLOCKED_EVIDENCE kalır; gerçek APK
canary'de bilinen bulguların görülmesi bunu PASS yapmaz.

Bu pre-integration sözleşme sıkılaştırması eski dört-field inventory ve yalnız
PG canary taşıyan evidence producer'ları için breaking'dir. Orchestrator runner
trusted mapping ve ikinci canary zarfını ekleyip aynı koşum kanıtını yeniden
üretmelidir; mevcut report'lar yeni sözleşmeye otomatik yükseltilmez.

Grype 0.118.0 için no-filter config:
`fail-on-severity: high`, `only-fixed:false`, `only-notfixed:false`,
`ignore-states:""`, `ignore:[]`, `exclude:[]`, `vex-documents:[]`,
`vex-add:[]`, `match-upstream-kernel-headers:true`,
`match.stock.using-cpes:true`, `alerts.enable-eol-distro-warnings:true`;
`db.auto-update:false`, `db.validate-age:true`,
`db.max-allowed-built-age:48h`, `db.validate-by-hash-on-start:true`.
Explicit isolated config/environment ve doğru process/output capture runner'a aittir.
Kernel-header seçeneği olmadan Grype dört default ignore kuralı ekler ve policy
FAIL olur. DB raporu `descriptor.db.status` içinde, provider metadata
`descriptor.db.providers` içindedir; alpine/NVD/EOL coverage zorunludur.

Boş `ignoredMatches` omitted veya [] olabilir; nonempty/bozuk alanlar bloklanır.
Raw exit 0/2 primary severity ile tutarlı olmalıdır. Grype'ın raw 2 için tek
`ERROR discovered vulnerabilities at or above the severity threshold` satırı
tanınır; diğer stderr, warnings, parse errors ve EOL alerts FAIL'dir.
High/Critical, tüm primary/related CVSS >=7 veya bilinmeyen severity her fix
state için bloklanır. İlgisiz düşük bulgu raw 0 ile bulunabilir; CVSS>=7 ise
raw 0 olsa da policy FAIL olur.

## Doğrulama ve geri dönüş

`node --test scripts/postgres-image/policy.test.mjs` saf sentetik policy
testleridir; image scan veya engine sonucu değildir. Shared integrator default
gate wiring, gerçek build/runtime source scans, inventory/license incelemesi,
bağımsız security ve merge sonrası full-tree kapılarını ayrıca çalıştırır.
Rollback yeni scanner runner/policy entegrasyonunu geri almak ve inert Compose'u
korumaktır; SQL migration veya production veri etkisi yoktur.

Exact upstream kaynaklar:
[Grype JSON document](https://github.com/anchore/grype/blob/v0.118.0/grype/presenter/models/document.go),
[Grype options](https://github.com/anchore/grype/blob/v0.118.0/cmd/grype/cli/options/grype.go),
[Grype APK matcher](https://github.com/anchore/grype/blob/v0.118.0/grype/matcher/apk/matcher.go),
[Syft APK metadata](https://github.com/anchore/syft/blob/v1.51.1/syft/pkg/cataloger/alpine/parse_apk_db.go),
[DB import/hydration](https://github.com/anchore/grype/blob/v0.118.0/grype/db/v6/installation/curator.go),
[Syft JSON schema 16.1.10](https://github.com/anchore/syft/blob/v1.51.1/schema/json/schema-16.1.10.json).
