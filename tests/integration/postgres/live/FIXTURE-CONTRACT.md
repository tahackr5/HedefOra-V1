# PG17 test-fixture — ayrı owner risk kabul profili

DEC-031/ADR-0021; durum IMPLEMENTING / ENGINE NOT_RUN. Tek shared writer
orchestrator; container/native psql kaynak sahibi ayrı assigned worker.
Task-phase base aba3d13 değişmez; başlangıç source checkpoint cf69d6a.

## Acceptance ve kesin izolasyon

Yalnız `ghcr.io/cloudnative-pg/postgresql:17.11-minimal-trixie` manifest
`sha256:74bd7677a9d9bde0258dc3593106539a1fd5a0b23fecb4ee97dfb67589f8b6f2`,
config `sha256:2479c67c1284d28d3d03a0eb8f0cff34d1388a20b5e11f8ea0f9756e918b21bb`.
Vulnerability FAIL/184blocking row set'i ham report+DB hash'leriyle korunur;
ayrı test risk kabulü başka image, değişen tuple, stale DB veya production
scope'u kabul etmez. CSPRNG runId/private secrets, source/tree/toolbundle
hash'leri ve20dakikalık lease zorunlu. Global R016/image policies değişmez.

Windows Docker Desktop sentetik0777 mode için ADR-0021 effective-RO
clarification uygulanır: start öncesi host RWfalse, içeride mountinfo ro ve
alt mount yokluğu; her mount'ta no-truncate existing write-open ve benzersiz
create yalnız EROFS ile reddedilir. Bu kontroller input okumadan önce gelir.
Path/hash/FD/hardlink/inventory kısıtları sürer; native Linux chmod0555/0444
ek savunmadır, readonly authority değildir. Private public snapshot üzerinde
eşzamanlı writer yoktur; trusted host/daemon varsayımı açıktır.

Host Node controller, exact committed source'un yalnız tracked regular
public byte snapshot'ını ve hash-bound precompiled test araçlarını RO mount
eder. Image create sonrası/start öncesi actual inspect: exact configID,
26:102, no supplementary group, networknone/no published port, cap-dropALL,
privilegedfalse/readOnlyRoot/no-new-privileges/default seccomp, private PID/
IPC, bounded2CPU/1536MiB memory+swap/256PID/128MiB shm. Yalnız /source,
/tools ve /input RO bind; /fixture512MiB ve /tmp64MiB UID26/GID102 mode0700
rw,noexec,nosuid,nodev tmpfs. Başka volume/bind/device/socket/security option
ve host namespace kabul edilmez. Dış ağ interface/route yokluğu içeriden de
ölçülür; dış host inspect asıl authority'dir. Input/run metadata secret-free.

Tek container'ın PID1'i `/tools/node /source/tests/integration/postgres/live/fixture-container.mjs`.
Native programs yalnız `/usr/lib/postgresql/17/bin/` altında. İki PGDATA
/fixture/primary ve /fixture/negative; port5432 TLS ve5433 ssl-off. Her ikisi
local SCRAM, hostnossl reject, explicit HBA/config ve bounded/redacted log
ayarları kullanır. Primary role/database bootstrap immutable010_roles.sql
hash'ine bağlıdır. initdb17.11,builtinC.UTF-8,UTF8,data-checksums,nonroot.
Keys/fixture/PGDATA yalnız tmpfs; main reader/noTLS negative gerçek PG'dir.

## İç runner ve host arasındaki veri sözleşmesi

`/input/run.json`: schema `hedefora.pg17.fixture-run.v1`, runId32hex,
sourceCommit/sourceTree40hex, imageManifestDigest/imageConfigDigest,
approvalSha256, bundleSha256, issuedAt/expiresAt. Fazladan alan reddedilir.
`/tools/bundle.json`: schema `hedefora.pg17.fixture-tools.v1`, sourceCommit,
sourceTree, goVersion=`go1.26.7`, goImage exact mevcut pinned digest,
race=true, integration=true; files tam node/tlsfixture/test2json/
postgres.test/app.test için {name,sha256,bytes}, sourceFiles tam snapshot
regular path/hash/bytes inventory. SHA bundleBytes üzerinden hesaplanır.
Host source ve artifact byte eşleşmesini gate'ler; container readonly
tool/source/run hash'lerini, UID/capabilities/network/lease'i tekrar doğrular.
Yerel JSON tek başına host capability veya production admission değildir.

Container içinde `createPrivateRunSecrets` ve `createLifecycleController`
aynen kullanılır. Native psql adapter ortak request validation, random
framing, PostgreSQL-log-origin SQLSTATE, close/cancel/timeout ve bounded
output semantiğini korur. Docker taşıması yeni native profile'a geçirilmez;
eski `createPsqlExecutor` davranışı ve testleri korunur. Parent environment
secret içermez; native child env explicit ve role-specific olur.

`runStaticChecks` + collectMigrationPlan + immutable up/down byte check
bağlantıdan önce; mevcut `runLiveSqlAcceptance` tam matrisi değişmeden
çalışır. Private0600 `/fixture/pg17-integration.json` mevcut v2 schema'yı
taşır. Go parent env'de yalnız mevcut admission invocation token,
fixture path/sourceSHA/imageDigest; parola/controller token argv'ye girmez.

Önceden derlenmiş iki package binary sırayla, her biri `-test.v=test2json
-test.parallel=1 -test.count=1 -test.shuffle=on -test.timeout=120s
-test.run=^TestPG17` ile çalışır. Test2json'a standalone dönüştürme pipe'ı
kullanılır; wrapper child orphan kalamaz (binary ve converter ayrı doğrudan
izlenir veya process group lifecycle kanıtlanır). Tam altı package/test
PASS, her package PASS, fail/skip/duplicate/truncated/wrong-package0 ve
binary+converter exit0 zorunludur. Timeout/cancel/cleanup error PASS olmaz.

Container stdout yalnız bounded secret-free JSON receipt: schema
`hedefora.pg17.fixture-result.v1`, status, runId, sourceCommit,sourceTree,
imageManifestDigest,imageConfigDigest,approvalSha256,bundleSha256,
isolation (self-observation only), bootstrap identity, sqlEvidence,
goEvidence, cleanup. Hata code/failedCase ve execution status taşır;
raw SQL/error/log/env/key/token/parola dışarı çıkmaz. Host final receipt'e
actual inspect/start/wait/exit and owned removal/absence kanıtını ekler.

## Negatifler, tamamlama ve rollback

Forged/expired/stale/future/same-count-different-finding admission; source,
image, tool/bundle/role/migration hash drift; extra mount/volume/device/
network/cap/privilege; create/start lost ACK; daemon failure/foreign ID/
failed cleanup; malformed/duplicate/truncated/wrong package/skip/fail GoJSON;
synthetic credential/key/token disclosure; missing close/timeout regressions.
Host isolation+cleanup independently PASS olmadan engine PASS verilmez.

Local engine PASS production/hardened-image PASS değildir. Source gates,
R016/hostedCodeQL/CI ve fresh security/cold yeni exact SHA'da tekrar edilir.
Ancak sonra PR8 DRAFT kaldırılır; owner'a exact SHA merge metni sunulur.
Main merge/production/SSH/DNS/secret/kalıcı veri mutation yetkisi yoktur.
