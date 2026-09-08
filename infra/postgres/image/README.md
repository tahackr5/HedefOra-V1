# PostgreSQL 17 kaynak derleme adayı

Bu dizin W001-T04FB-05 / DQ-010 B / ADR-0020 kapsamındadır. Hedef yalnız disposable local/CI ortamıdır. Eski Bookworm/Trixie/Alpine PostgreSQL image'leri hiçbir build aşamasında kullanılmaz. Bu dosyaların varlığı image execution, staging, production veya registry dağıtım admission'ı değildir.

Durum: **BLOCKED_EXTERNAL — builder güvenlik gate'i FAIL; runtime image üretilmedi.** Bu dizin tamamlanmış veya çalıştırılabilir kabul edilmiş bir image değil, aşağıdaki gerçek denemelerin korunmuş tarif/girdi hazırlığıdır. Yeni kaynak derlemesi ve PostgreSQL servis açılışı durdurulmuştur.

## Girdiler ve build sınırı

`inputs.lock.json` schema version 1 source of truth'tur: exact Alpine linux/amd64 manifest ve index bağı, PostgreSQL 17.11 kaynak URL/SHA-256/size/lisansı ve ayrı build/runtime APK listeleri. Her paket kaydı `name`, `version`, `url`, `sha256`, `size`, `license` taşır. Bütün APK URL'leri tek resmî Alpine v3.24 main/x86_64 repository'sine ve exact dosya adına bağlıdır.

2026-09-06T13:12:50.814Z ediniminde 53 build ve 12 runtime paketin gerçek arşiv stream SHA-256/size değerleri doğrulandı. Bu bir vulnerability veya lisans kabulü değildir. Kaynak index byte kimliği, publisher lisans ifadeleri ve exact aports kaynak commit/origin bağı `package-sources.lock.json` içindedir. Transitif `libisl.so.23` provider'ı bilinçli olarak `isl26` seçildi. Gerçek APK signature/solver denemesi 53 paketli builder OS üretti; PostgreSQL derlemesi ise eksik `linux/fs.h` nedeniyle başarısız oldu. Dolayısıyla mevcut build listesi PostgreSQL derlemesi için tamamlanmış closure olarak kabul edilemez. Güvenli builder seçildikten sonra resmî `linux-headers` arşivi yeni lock/byte/signature/inventory taramasına eklenmelidir; bu teslim eski 53 paketlik kanıtın girdilerini değiştirmez.

Planlanan orchestrator `scripts/postgres-image/**` acquisition/runner sözleşmesi repository dışındaki boş, tek koşuma ait build context'ine yalnız şu girdileri koymalıdır; kalıcı runner henüz uygulanmadı, aşağıdaki denemeler geçici harness ile yapıldı:

```text
Dockerfile
.dockerignore
entrypoint.sh
inputs/source/postgresql-17.11.tar.bz2
inputs/apk/build/*.apk
inputs/apk/build/SHA256SUMS
inputs/apk/runtime/*.apk
inputs/apk/runtime/SHA256SUMS
```

Her `SHA256SUMS` satırı ilgili dizinde `sha256  name-version.apk` biçimindedir. Uygulanacak root acquisition gate'i duplicate/missing/extra dosya, yanlış URL/digest/size, symlink ve path escape durumlarını reddetmelidir; Dockerfile byte hashlerini tekrar doğrular. APK kendi paket imzalarını base'in Alpine public key'leriyle doğrular; `--allow-untrusted` yoktur. Source SHA doğrulaması arşiv açılmadan yapılır. Network bütün `RUN` aşamalarında kapalıdır. HTTP edinimi build'den önce tamamlanır.

`build-os` target'ı exact paketleri taşıyan builder OS envanteridir. `build` target'ı GCC/Make ile PG17.11 derler; `make check` veya PostgreSQL server çalıştırmaz. `SOURCE_DATE_EPOCH=1786396078`, resmî kaynak arşivinin `2026-08-10T21:07:58Z` zamanıdır. Bu pin reproducibility girdisidir; iki bağımsız build digest eşitliği henüz kanıtlanmış sayılmaz.

İş sırası base edinim/scan → APK signature/identity doğrulaması → `build-os` export/OS scan/security kabulü → kaynak derlemesi → runtime OS/source scan/security kabulü → disposable runtime testleri şeklindedir. Bir önceki aşama FAIL veya eksikse sonraki yürütme aşaması başlatılmaz. Kalıcı root harness bu sınırı uygulamadan execution admission verilemez; Dockerfile'ın doğrudan final target ile çağrılması admission denetimi yerine geçmez.

Paket architecture değeri URL içindeki `x86_64` dizininden türetilemez. Edinilmiş 53 arşivin `.PKGINFO` dosyalarında dokuz `noarch` paket vardır; base'in kurulu DB'sindeki aynı sürüm beş paketin metadata'sı `apk --upgrade` işleminde korununca gerçek builder DB'sinde yalnız `build-base`, `fortify-headers`, `icu-data-full`, `tzdata` `noarch` kalmıştır. Expected inventory bağımsız doğrulanmış base DB ve paket işlem farkına dayanmalıdır; scanner çıktısını expected veri olarak kopyalamak veya arşiv metadata'sını bütün kurulu paketlere körlemesine uygulamak uygun değildir. Yeni runtime root'un architecture değerleri ise yeniden kurulan arşivlerin metadata'sından gelir.

`runtime-root`, ayrı ve boş `/runtime` köküne yalnız 12 paketlik closure'ı `--no-scripts` ile kurar. Paket DB'si korunur; gerekli BusyBox symlink'leri açıkça oluşturulur. Son `FROM scratch` aşaması bu yeni rootfs ile `/opt/postgresql` kurulumunu kopyalar. APK manager, derleyici, kaynak arşivleri ve eski base katmanları son imajda yoktur. PostgreSQL `COPYRIGHT` metni `/opt/postgresql/share/COPYRIGHT` yolundadır.

ICU ve bütün locale verisi, OpenSSL ve zlib korunur. İnteraktif psql Readline/history özelliği derlenmez; LDAP/GSSAPI/XML/LLVM gibi optional features bu local/CI profilinde açılmaz. UTF-8 collation varsayımı mevcut production cluster'a uygulanmaz.

## Runtime ve bootstrap sözleşmesi

Process UID/GID `70:70` ile başlar. Sabit data yolu `/var/lib/postgresql/data` ve Unix socket yolu `/run/postgresql`'dir. Container rootfs read-only çalışabilmelidir; yalnız disposable data volume, UID/GID 70 ve mode 0700 olan `/run/postgresql` tmpfs'i, ayrıca `/tmp` tmpfs'i yazılabilirdir. Data volume ilk kullanımda UID/GID 70 ve mode 0700 ile hazırlanır. Entry point root çalıştırmaz veya geniş chown/chmod uygulamaz.

İlk açılışta yalnız aşağıdaki sentetik local/test değişkenleri kabul edilir:

- `HEDEFORA_DEV_POSTGRES_PASSWORD`
- `HEDEFORA_DEV_POSTGRES_MIGRATION_PASSWORD`
- `HEDEFORA_DEV_POSTGRES_APP_PASSWORD`
- `HEDEFORA_DEV_POSTGRES_WORKER_PASSWORD`

Her değer 12–1024 byte olmalı ve CR/LF içermemelidir. Test harness bunları yeni üretir; gerçek credential/`.env` okunmaz. Parola process argümanına veya loga konmaz; bootstrap admin parolası mode 0600 geçici pwfile üzerinden initdb'ye verilip hemen silinir. Yönetilen rol parolaları mevcut immutable SQL'in `\getenv` sözleşmesine aktarılır. Raw initdb/psql output'u yayımlanmaz. Son server process'i başlamadan credential değişkenleri silinir. Container metadata'sındaki environment kopyası bu silmeyle ortadan kalkmaz; harness disposable container'ı temizlemekten sorumludur.

Local init profili `--auth-local=scram-sha-256`, `--auth-host=scram-sha-256`, `--data-checksums`, `--encoding=UTF8`, `--locale=C.UTF-8`, `--locale-provider=builtin`, `--username=hedefora_dev`, `--no-clean` kullanır. Builtin C.UTF-8 seçimi host libc locale drift'ini sınırlar; Türkçe sözlük sıralaması taahhüdü değildir. ICU gerektiğinde ayrı database/collation sözleşmesiyle kullanılabilir.

Bootstrap server yalnız özel Unix socket üzerinde ve 0700 socket izniyle açılır; TCP dinlemez. `hedefora_dev` database oluşturulduktan sonra yalnız `/docker-entrypoint-initdb.d/010_roles.sql` snapshot'ı ve exact SHA-256 `807d591779783d83ea0c4759d58076101db672a9d4fb93a95d754026aedd222a` kabul edilir. Dosya read-only mount olmalıdır. Migration çalıştırılmaz; mevcut immutable SQL değiştirilmez. SQL/output failure nonzero ve generic hata verir; private server logu temizlenir. Signal veya bootstrap hatasında geçici server bounded immediate-stop ile kapatılır.

Başarı işareti `.hedefora-bootstrap-v1`, database, PostgreSQL sürümü, rol SQL hash'i, locale profili ve `pg_controldata` database system identifier değerine bağlıdır. Ancak bütün bootstrap işlemleri ve geçici server'ın kapanışı tamamlanınca atomik rename ile yazılır. Nonempty data dizininde missing/invalid marker, farklı PG major, foreign system identifier, bozuk control dosyası/CRC uyarısı veya symlink fail-closed olur; otomatik re-init, password rotation veya repair yoktur. Marker privileged data-volume sahibine karşı kriptografik yetkilendirme değildir; yalnız bu harness'ın oluşturduğu disposable volume kabul edilir.

Final server SCRAM ve redaction ayarlarını, data/HBA yollarını sabitler. HBA uzak bağlantılarda yalnız `hostssl` kabul eder, plaintext reddedilir; local socket de SCRAM ister. TLS certificate/key, salt-okunur test mount'ları ve `ssl=on` argümanları orchestrator'ın admitted harness'ına aittir. TLS olmadan uzaktan bağlantı açılamaz. Readiness yalnız port dinleme sonucuyla PASS olmaz; rol/ACL, TLS ve engine acceptance ayrı testlerdir.

## Güvenlik, lisans ve kanıt

Builder/runtime OS paketleri exact inventory parity ile, kaynak derlemesi PG17.11 ise source hash/binary hash/CPE bağı taşıyan ayrı SBOM ile taranmalıdır. Grype/Syft binary ve advisory DB pinleri `scripts/postgres-image/**` akışına aittir. Yalnız OS package taramasında source-built PostgreSQL'in görünmemesi success değildir. High/Critical, CVSS ≥7 ve unknown severity bloklanır; coverage/missing/stale DB/hash/parse/network/internal/timeout hataları success'e çevrilmez. Known-vulnerable source CPE canary zorunludur.

Paket lisansları publisher'ın exact ifadeleriyle tutulur. Runtime BusyBox/baselayout GPL bileşenleri içerir; libgcc/libstdc++ publisher ifadesi GCC runtime exception değerlendirmesini tek başına kanıtlamaz. ICU, PostgreSQL, Zlib ve `Public-Domain` da npm/Go allowlist'inin otomatik kabulü değildir. Bütün bileşenlerin tek bir filesystem'e aggregate edilmesi her paket için ayrı lisans/source yükümlülüğü incelemesini ortadan kaldırmaz. Image yalnız internal local/CI kullanımına adaydır; registry veya üçüncü kişilere binary dağıtımı bu task'ın dışında ve kaynak/notices teklifinin ayrıca tamamlanmasına bağlıdır. Bu teknik envanter hukuki onay değildir.

Protected npm/Go R-016 allow/deny dosyaları değiştirilmez. Image üretim onayı lisans deny istisnası değildir; image-specific review açık kabul üretmezse image admission kapalı kalır. Kaynak commit referansları corresponding-source tesliminin tamamlandığı anlamına gelmez.

## 2026-09-06 gerçek deneme sonucu

Run-specific repository dışı context yalnız yukarıdaki dosyaları ve doğrulanmış arşivleri içerdi; boş auth config ile local Docker Desktop Linux engine kullanıldı. Bütün build `RUN` adımları `--network=none`, derleme paralelliği `make -j2`, shared memory sınırı 128 MiB idi. Hiçbir PostgreSQL servisi açılmadı; registry push veya deployment yapılmadı.

| Kontrol                                                                                    | Gerçek sonuç                                                                      |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| İlk tarif için `docker buildx build --check --network=none --platform linux/amd64 .`       | exit 0, warning 0; sonraki tarif için full-tree gate değildir                     |
| Son entrypoint için WSL `/bin/sh -n`                                                       | exit 0; canlı bootstrap kanıtı değildir                                           |
| 54 exact arşiv edinimi; SHA-256/size; 53 APK `.PKGINFO` kimlik/lisans okuması              | exit 0                                                                            |
| `base`, `verify-inputs`, `build-os` isolated OCI export                                    | exit 0; APK byte/signature doğrulaması ve 53 paket solver tamamlandı              |
| Native OCI Syft `build-os`                                                                 | exit 0, 53 paket; bağımsız OCI kurulu DB okuması aynı mimari farkını doğruladı    |
| Canonical Grype `build-os`                                                                 | raw exit 2, FAIL; 2 Critical + 7 High, ignore 0                                   |
| `runtime` kaynak derlemesi                                                                 | raw exit 1; `pg_combinebackup.c:24` için `linux/fs.h` bulunamadı; runtime OCI yok |
| OCI provenance identity kontrolü                                                           | exit 1, FAIL: SLSA v1 `subject: []`, manifest bağı yok                            |
| Runtime/source admission, canlı bootstrap/restart/TLS/privilege, iki-build reproducibility | NOT_RUN; PASS değildir                                                            |

Builder manifest `sha256:29914cef30c5cba5b0e63587ed40a78e3789419c744cd721c0dd99e9f7a5e603`, OCI archive SHA-256 `40b0c29944e729d30f81349371eebf54bebe3647bedf5e19821bfec112876e31` değerindedir. Source build hatası `2026-09-06T13:32:43.983Z` zamanında sonlandı; stderr SHA-256 `90cbf5c3afc657e7cb4f382cace42b5bbffc5b5cdd409596043a536078ba7583` olarak korundu. Bu manifest admission almadı.

Yerel OCI export `--provenance=mode=max` kullanmasına rağmen target için image adı verilmediğinde üretilen statement boş subject taşıdı. Sonraki güvenli denemede yalnız yerel `--tag hedefora-postgres-local:<immutable-input-id>` ve OCI export ile digest bağı tekrar doğrulanmalıdır; bu düzeltmenin başarılı olduğu henüz denenmedi. Var olan statement sonradan doldurulmaz, yeniden adlandırılarak PASS sayılmaz.

### Güvenli alternatif değerlendirmesi

Pinned PostgreSQL 17.11 tarball'ında parser `gram.y`/`scan.l` ve catalog `genbki.pl` girdileri bulunur; `gram.c`, `gram.h`, `scan.c`, `postgres.bki` üretilmiş çıktıları bulunmaz. `configure` eksik Bison/Flex/Perl için koşulsuz hata üretir. [Resmî PG17 gereksinimleri](https://www.postgresql.org/docs/17/install-requirements.html) de bu araçları zorunlu kılar. Bu nedenle araçları kaldırmak veya PL/Perl'i kapatmayı Perl build gereksiniminin kalkması olarak yorumlamak geçerli değildir.

Canonical scanner'ın dokuz bloklayıcı eşleşmesi ve publisher değerlendirmesi:

| Paket                | Bulgu                     | Sürüm ve publisher kanıtı                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `perl 5.42.2-r0`     | Critical `CVE-2026-13221` | Canonical CPE aralığı `<=5.43.9`; [vendor kaydı](https://security-tracker.debian.org/tracker/CVE-2026-13221) stable Trixie 5.40.1-6'yı vulnerable, unstable 5.42.3-1'i fixed gösterir.                                                                                                                                                     |
| `perl 5.42.2-r0`     | Critical `CVE-2026-8376`  | Canonical aralık `<=5.43.10`; [vendor kaydı](https://security-tracker.debian.org/tracker/CVE-2026-8376) 32-bit regex overflow koşulunu belirtir. Mevcut target amd64 olması kayıtlı High/Critical bulgusunu silme/VEX gerekçesi olarak kullanılmadı.                                                                                       |
| `perl 5.42.2-r0`     | High `CVE-2026-57432`     | Canonical aralık `<=5.43.10`; [vendor kaydı](https://security-tracker.debian.org/tracker/CVE-2026-57432) pack/unpack overflow düzeltmelerini ve stable Trixie'nin hâlâ vulnerable olduğunu gösterir.                                                                                                                                       |
| `bison 3.8.2-r3`     | High `CVE-2026-56389`     | [Vendor kaydı](https://security-tracker.debian.org/tracker/CVE-2026-56389) 3.8.2'yi doğrulanmış vulnerable, 3.7.5 dahil stable paketleri vulnerable ve upstream fix commit'ini `3169c1e7a2c6acc4c59dfcf8b089896d6881925b` olarak gösterir. HTML report kullanım koşulu scanner bulgusunu kaldırmaz; güvenli eski sürüm varsayımı kurulmaz. |
| `binutils 2.45.1-r1` | High `CVE-2025-69650`     | Canonical aralık `<=2.46`; [vendor kaydı](https://security-tracker.debian.org/tracker/CVE-2025-69650) pre-release applicability dispute ve 2.46-1 fix kaydını birlikte taşır. Bu uyuşmazlık canonical FAIL sonucunu değiştirmez.                                                                                                           |
| `binutils 2.45.1-r1` | High `CVE-2025-69649`     | Canonical aralık `<=2.46`; [vendor kaydı](https://security-tracker.debian.org/tracker/CVE-2025-69649) readelf null dereference ve 2.46-1 fix kaydı içerir.                                                                                                                                                                                 |
| `binutils 2.45.1-r1` | High `CVE-2026-3442`      | Canonical sürüm aralığı belirsiz; [vendor kaydı](https://security-tracker.debian.org/tracker/CVE-2026-3442) XCOFF/bfd out-of-bounds read'i ve unstable dahil unfixed durumunu gösterir.                                                                                                                                                    |
| `binutils 2.45.1-r1` | High `CVE-2026-3441`      | Canonical sürüm aralığı belirsiz; [vendor kaydı](https://security-tracker.debian.org/tracker/CVE-2026-3441) XCOFF/bfd out-of-bounds read'i ve unstable dahil unfixed durumunu gösterir.                                                                                                                                                    |
| `binutils 2.45.1-r1` | High `CVE-2026-6846`      | Canonical aralık `<=2.46`; [vendor kaydı](https://security-tracker.debian.org/tracker/CVE-2026-6846) XCOFF heap overflow ve 2.47-1 fix kaydı içerir.                                                                                                                                                                                       |

Bakımı süren bir alternatif olarak Debian 13 Trixie paket kökleri kontrol edildi: [Bison 2:3.8.2+dfsg-1+b2](https://packages.debian.org/trixie/bison), [Perl 5.40.1-6](https://packages.debian.org/trixie/perl), [binutils 2.44-3](https://packages.debian.org/trixie/binutils). Vendor kayıtları bu üç kökte ilgili bulguları açık tuttuğu için kapalı, güvenli bir alternatif closure kanıtlanamadı; yeni distro image'i edinilmedi veya çalıştırılmadı. Clang integrated assembler/lld geçişi binutils yüzeyini azaltabilir, fakat zorunlu Bison/Perl blocker'larını tek başına çözmez; tarifi denenmiş güvenli alternatif olarak değiştirmek için yeterli kanıt yoktur.

İlerleme koşulu publisher'ın doğrulanabilir fixed paket/kaynak kimliği sağlaması ve yeni closure'ın hiçbir ignore/VEX/threshold değişikliği olmadan aynı güncel pinned DB ile canonical OS/source/security gate'lerini geçmesidir. Bilinen fix commit'lerini kaynakta uygulayıp eski sürüm kimliğiyle paketlemek veya resmî advisory metadata farkını elle silmek bu teslimde yapılmadı. Ardından eksik Linux header girdisi ve provenance subject bağı tamamlanıp yeniden derleme denenebilir. Lisans acceptance da ayrı açık koşuldur.

Rollback mevcut inert Compose sınırını korumaktır. Altı owned dosya engellenmiş hazırlık checkpoint'i olarak orchestrator'a aktarılmış, repository dışı deneme artifact'ları ve başarısızlık kanıtları korunmuştur; bu teslim hiçbir dosyayı silmez. Merge sonrası full-tree doğrulama ve final commit/ref yönetimi orchestrator'a aittir. Ara acquisition/diagnostic Node runtime 24.19.0 idi; repository'nin pinned 24.20.0 kalite gate'i olarak raporlanmaz. Effective model/reasoning runtime tarafından açıklanmadı: `UNKNOWN`.
