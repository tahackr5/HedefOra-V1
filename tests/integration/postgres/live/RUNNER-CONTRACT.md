# PG17 canlı runner — kapalı yürütme sınırı

Durum: **DRAFT / ENGINE NOT_RUN**. Orchestrator source integration; model/effort `UNKNOWN/UNKNOWN`.
İlk TEMP öneri ve inceleme geçmişi korunur; güncel exact kaynak ve doğrulama
kapsamı `state/W001-PHASE-B.md` içinde mühürlenir. Source entegrasyonu image
admission veya gerçek engine PASS anlamına gelmez.

LR-01/02/03 kabul koşulları: public CLI sahte flag/env altında bile gerçek
nonzero exit vermelidir. Rol parolaları public run kimliğinden türetilemez:
her rol bağımsız 32-byte CSPRNG entropy taşır. Controller yalnız private0600
fixture'daki bağımsız 32-byte token ile yetkilendirilir; tek, strict64hex
header sabit-zamanlı karşılaştırılır, eksik/yanlış/çoklu header action'a ulaşmaz.
Child `connectionClosed` yalnız gözlenen close event'idir; kill/fallback
tek başına kapanış değildir ve disconnect aynı kanıtı taşır.

`hedefora-feature-delivery` skill'i kapsam/acceptance, negatif durumlar ve kanıt ayrımını yönlendirdi. Production dependency veya production DB API değişikliği yoktur.

## Dosyalar ve sınır

- `process.mjs`: shell:false, mutlak CLI, yalnız explicit env, bounded stdin/stdout/stderr, timeout/cancel ayrımı. Raw stderr yalnız kısa ömürlü bellekte; çıktı/receipt'e taşınmaz.
- `psql.mjs`: SQL ajanının `psql/openSession` API'sinin gerçek Docker exec uygulaması; private kalıcı session frame'leri ve server-correlated SQLSTATE.
- `live-runtime.mjs`: Linux-only gerçek image-load, owned lifecycle, TLS fixture, SQL + tagged Go pipeline ve cleanup. CLI entrypoint sağlamaz; root trusted controller import eder.
- `runner.test.mjs`: sentetik admission/resource/psql testleri, gerçek bounded Node çocukları ve gerçek loopback HTTP controller testi. Bunlar PostgreSQL veya Docker engine kanıtı değildir.
- `run-live.mjs`: public dispatch fixed-null root authority ile her durumda PG_IMAGE_ADMISSION_REQUIRED döndürür. DI yalnız internal library/test seam'dir; root yeni reviewed authority importunu entegre etmeden live dispatch yoktur.

## Trusted giriş sözleşmesi

```js
await runLivePg17({
  capability, // root private-branded, in-process; target JSON/PASS/flag değil
  authority: { assertCapability, revalidate, withVerifiedArchive },
  trusted: {
    descriptor,
    docker: { path, sha256 },
    go: { path, sha256 },
    goImage,
    imageBootstrapProfile: "apk-bootstrap-overlay/v1",
    repositoryPath,
    goModuleCache,
    verifySource,
    inputs: {
      entrypoint: { path, sha256 },
      roles: { path, sha256 },
      tlsGenerator: { path, sha256 },
      manifest: { path, sha256 },
      config: { path, sha256 },
    },
  },
  runLiveSqlAcceptance,
  verifyBeforeConnect,
});
```

`authority.assertCapability` root modülünün gerçek private-brand/authority kontrolüdür; saf profile validator admission vermez. `revalidate(capability)` tam descriptor'ı döndürür ve tüm evidence/advisory/source/image authority ilişkilerini yeniden doğrular. `withVerifiedArchive(capability, callback)` hash'i doğrulanmış aynı açık FD'den stream verir; callback tamamlanmadan FD kapanmaz. Path'i doğrulayıp tekrar açmak yasaktır. Runner kendisi capability üretmez, target'tan resolver import etmez.

Descriptor tam eşitlik alanları: profile `apk-runtime-data-assembly/v1`, scope `disposable-local-ci-only`, root nonce `runId` 32 lowerhex; source/controller 40 lowerhex; profile/closure/rootfs/evidence/scanner SHA256; manifest/config/Docker ID digest; archive canonical path/SHA/size. Docker ID config digest'idir, manifest digest'i değildir. issuedAt gelecekte olamaz, expiresAt geçmemiş olmalı; lease en çok1saat ve advisory DB built+48saat. Root daha kısa süre uygulayabilir.

Bu taslak yalnız explicit `apk-bootstrap-overlay/v1` iki **uncompressed OCI tar layer** profiline bağlanır: ordered manifest.layers digest listesi = hash-bound config.rootfs.diff_ids listesi. RootfsSha256 bir overlay diffID olarak yorumlanmaz; bütünleşik rootfs/closure provenance ilişkisini root resolver doğrular. Exact Env yalnız PATH=/usr/libexec/postgresql17:/bin, PGDATA=/var/lib/postgresql/data, LANG=C.UTF-8, TZ=UTC; WorkingDir=/, StopSignal=SIGINT, embedded Entrypoint ve Cmd=postgres sabittir. Başka PG ambient env reddedilir. OCI load başarısız olursa hard FAIL; format veya tag fallback yoktur. Classic Docker-save gerekirse ayrı açık producer-profile incelemesi ve test gerekir.

`verifySource()` root'un exact clean committed source kontrolünü yapar, descriptor.sourceCommit döndürür; dirty/source drift fail olur. Root callable SQL module ve static preflight da trusted controller'dan gelir. `verifyBeforeConnect()` gerçek `collectMigrationPlan()` + immutable up/down bytes döndürür; SQL modülü bunları kendi exact hash kontrolünden geçirir. Target pass flag hiçbirini ikame etmez.

## Linux ve tool/image sınırı

Public launcher bütün platformlarda `PG_IMAGE_ADMISSION_REQUIRED` ve exit1 ile durur. Internal engine library Windows'ta `LIVE_ENGINE_REQUIRES_LINUX` ile durur. Windows sentetik sonuçları Linux engine PASS değildir. Host Docker CLI exact29.7.2, local unix socket `/var/run/docker.sock`, Linux/amd64 Go1.26.7 binary SHA ile bağlanır. Host compiler/race gereksinimleri ve read-only module cache root CI toolchain preflight'ının sorumluluğundadır. Go tooling image exact mevcut pinned digest `golang@sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514`; `--pull=never` ile yerelde bulunması gerekir.

Target input dosyaları canonical regular file/O_NOFOLLOW/bounded read ile okunup0700 private TEMP içinde0444 snapshot'a alınır. Protected load/create/start öncesi capability/source/snapshot yeniden doğrulanır. Root-owned archive resolver aynı FD sağlar. Docker image inspect exact configID, linux/amd64, User70:70, sabit embedded Entrypoint/Cmd/Env/WorkingDir/StopSignal ve RootFS.diffIDs doğrular. RepoDigest uydurulmaz; çalıştırma immutable configID üzerindendir.

Root'un APK bootstrap adaptation'ı `/usr/local/bin/hedefora-postgres` içinde embedded0555 olmalı; image assembly/provenance bu dosyanın `inputs.entrypoint.sha256` bytes'ını bağlamalıdır. Runner scripti image dışından çalıştırmaz. psql `/usr/libexec/postgresql17/psql` sabittir. Roles SQL yalnız exact0444 RO bind; immutable migration SQL değişmez.

Dosya okuması ilk bigint fstat boyutu+1 EOF byte buffer'ını aşmaz; her positioned read en çok64KiB'dır. Önce/sonra dev/ino/nlink/size/mtimeNs/ctimeNs birebir aynı, nlink=1 olmalıdır. Gerçek grow/same-size rewrite/hardlink negatifleri sentetik suite'te çalıştırılır. Sınırsız FileHandle.readFile kullanılmaz.

## Owned lifecycle ve TLS

Her resource adı `ho-pg17-<nonce>-<purpose>`, iki exact owner/run etiketi taşır. Önceden var olan isim kabul edilmez. Create öncesi intent kaydı lost-ACK cleanup'ını sağlar. Cleanup yalnız exact isim/ID + owner etiketi ile; önce containers, sonra volumes/network. Generic daemon inspection failure yokluk sayılamaz. Removal sonrasında absence doğrulanır; cleanup FAIL genel sonucu FAIL yapar. Prune, genel rm, image silme veya yabancı resource silme yoktur.

PG containers UID/GID70, read-only root, cap-dropALL, no-new-privileges, 512MiB memory/swap,1CPU,128PID; internal dedicated network, yalnız127.0.0.1 dynamic published ports. PGDATA named volume restart boyunca korunur. /run ve /tmp bounded0700 noexec tmpfs. Sunucu log redaction sabit: log_statementnone, log_min_error_statementpanic, parameter max lengths0, verbose + `%a %e ` prefix.

Her yeni owned volume için exact Go tooling helper networknone/root/capCHOWN-only ile yalnız mount kökü `/fixture` üzerinde **nonrecursive** chmod0700→chown70:70 yapar. TLS generator ikinci helper'da UID70/noCaps/read-only/networknone, bounded exec tmpfs ve RO source ile çalışır; `/tmp/fixture/tls` yeni çıktı dizinidir. Private server keys named volume0600 içinde kalır. Stopped helper'dan host private TEMP'e yalnız ca.crt ve wrong-ca.crt kopyalanır. Parent700, dosya0600 ve symlink kuralları gerçek Go generator testlerindedir.

İkinci PG instance explicit ssl=off fakat aynı hostnossl reject HBA ile açılır. Runner yalnız local socket SCRAM admin sorgusuyla exact17.11/ssl=off/system_user SCRAM kimliği doğrular. Tagged Go no-TLS negatif tanığı bounded PostgreSQL SSLRequest'e exact `N` cevabıdır; plaintext authenticated bağlantı açılmaz veya fallback eklenmez.

## psql ve session sözleşmesi

SQL ajanının sealed API'si korunur: allowlisted admin/migration/app/worker/readonly, yalnız hedefora_dev/postgres/template1 ve migration_checksum/expected_up_checksum variables. CLI `-X -Atq -w --set=ON_ERROR_STOP=1 --set=VERBOSITY=sqlstate`; env key-only `--env KEY`, password değerleri hiçbir argv'de yoktur. Password'ler public nonce'tan bağımsız, her role özel CSPRNG32-byte synthetic değerlerdir. Main bağlantı container içi loopback TCP, verify-full/TLS1.2minimum + PGREQUIREAUTHscram-sha-256; ambient service/passfile/HOME discovery sabit boş yollarla kapalıdır.

SQL trusted in-process module'den gelir; psql file/shell/output/program kontrolleri ek olarak reddedilir. Bu ek regexp **untrusted SQL parser/sandbox değildir**. Readonly NOLOGIN için intentionally wrong synthetic password kullanılır, gerçek readonly credential yoktur.

Her CLI oturumu unique PGAPPNAME ile log prefix'e bağlanır. Raw stderr SQLSTATE kanıtı değildir. Bounded owned-container logs içinde tam app adı + ERROR/FATAL/PANIC + tek non00000 kod gerekir; yok/çelişkili kod channel FAIL'dir. Herhangi timeout/cancel PostgreSQL hatası sayılamaz.

Kalıcı oturum tek pending query, random line-delimited `\\echo` frame kullanır. Query SQL hatası ON_ERROR_STOP nedeniyle CLI'ı kapatır; closed Promise structured terminal evidence ile resolve olur. Idle server25P03 sonraki query'de gözlenirse retained terminal evidence döner. disconnect idempotent/bounded; forced CLI kill orphan risk kaydeder. `connectionClosed` yalnız CLI transport kapanışıdır: gerçek backend/lock absence'ı SQL modülündeki bağımsız pg_stat_activity/pg_locks/try-lock kontrolleri kanıtlar.

## Fixture/controller ve zorunlu pipeline

Fixture schema `hedefora.pg17.integration.v2`, private0600 `pg17-integration.json`; exact run_id/source_sha/image_digest/synthetic_only/127.0.0.1/iki farklıport/publicCA/syntheticappPassword/control_address/control_token içerir. İki Go test consumer'ı birlikte v2'ye geçer; eski v1 fail-closed reddedilir. Henüz dağıtılmış consumer yoktur. Go env admission string yalnız root tarafından gerçek admission **sonrası** fixture-invocation protokolüdür; image authorization değildir. Token yalnız `X-Hedefora-Control-Token` header'ıyla taşınır; URL, argv, public resource etiketi, response veya receipt'e yazılmaz.

Controller yalnız loopback POST `/v1/pg17`, exact application/json,2048-byte body ve yalnız run_id/image_digest/action kabul eder. start/stop serialdır. start ACK ancak real SCRAM+TLS ready; stop ACK ancak Docker inspect actual stopped. Response exact action + `accepting-scram-tls` veya `stopped`. Hata generic503; başka komut veya endpoint yoktur.

Main pipeline önce gerçek SQL matrix, sonra exact pinned Go `test -json -tags=integration -p=1 -parallel=1 -count=1 -shuffle=on -race -timeout=120s -run=^TestPG17 ./internal/platform/postgres ./internal/platform/app` çağırır. Altı exact top-level test PASS, skip0 ve raw0 zorunludur; namespace/paket sonuçları genişletilmez. Raw Go/stdout/stderr bellekte kalır; receipt yalnız canonical sonuçları taşır.

Go live child `GOFLAGS=-mod=readonly` alır. Monotonic20dakika whole-run bütçesi SQL spawn/session query, protected gate/create/start öncesi kontrol edilir ve her yeni process timeout'u kalan süreye kırpılır. Süre dolduğunda yeni iş başlamaz; active process kendi bounded cancellation yolundan kapanır. Cleanup admission/global-budget expiry sonrasında da mümkündür ve kendi komut bütçeleriyle yürür; timeout/orphan/cleanup failure genel PASS olamaz. Bırakılmış Promise.race arka plan işi yoktur. Root authority/source/preflight callback'leri de kendi bounded trusted implementation'larına sahip olmalıdır.

## Kanıt kapsamı, eksikler ve rollback

Sentetik testler admission guard/hash drift, Node process bütçesi/env, psql frame/error/idle contract, owned cleanup/foreign labels/lost ACK/daemon failure ve HTTP serialization/negative request sınırlarını çalıştırır. Full `runLivePg17()` Linux/Docker orchestration yolu, OCI load uyumluluğu, internal network host port davranışı, actual PG bootstrap/TLS/SCRAM/SQLSTATE logs, gerçek session/backend süreleri ve tagged Go engine testleri **NOT_RUN**. Başarılı sentetik test sayısı bunların yerine geçmez.

Image admission resolver/private brand ve archive retained-FD implementasyonu root ownership'ündedir; bu taslak onları implement etmez. Exact executable path ve privileged Docker daemon trusted computing boundary'dir; hostile same-UID tool replacement veya compromised daemon'a karşı sandbox iddiası yoktur. Controller concurrent real engine start/stop timeoutları ve cleanup fault recovery future admitted Linux engine koşumunda doğrulanmalıdır.

PG image libxml2 High blocker'ları varken bu launcher engine'e çağrılmaz. Root bağımsız review ve exact source boundary integration sonrası yalnız gerçek admission ile live gate açar. Rollback: PR'ı merge etmeme veya yalnız yeni test/runner eklemelerini normal review'lu revert etme; production/config/schema değişikliği yoktur. Admitted koşumda synthetic fixture ve public CA host0700 TEMP içinde kalır; private keys yalnız owned TLS volume'dadır ve doğrulanmış cleanup ile kaldırılır. Henüz böyle bir engine koşumu yapılmadı.
