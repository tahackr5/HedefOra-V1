# W001 Phase B — owner test-fixture admission

Güncel durum: IMPLEMENTING; ENGINE NOT_RUN; PR #8 DRAFT. DEC-031/DQ-011,
owner 2026-09-07. Task-phase/trusted base aba3d13 ve historical wave start
bde560f değişmez. Başlangıç checkpoint cf69d6a129bd1bc95af9ef90dd8b06b7edecb34d,
tree0c1c34c5784a55c3f43c4b5f43633ba0c0fa5c85; branch codex/w001-t04f-phase-b.

## Önceki checkpoint kapanışı

cf69 local27/27 full-tree, nonrootLinux ci:check385/385skip0, localR016
20260906T233504052Z-14360-c8398ccd PASS. Hosted CI34067519809,
trustedPR34067520608 ve CodeQL34067520316 PASS; correct refs/pull/8/head
Go/JS/Python/Actions dört analiz result0/open0. Önceki CodeQL2/3 otomatik
fixed; dismissal yok. Full checkpoint cold PASS, engine eksikliği nedeniyle
Phase B exit BLOCKED_EVIDENCE idi. Tarihsel4446c8f FAIL geriye dönük değişmez.
Ignored local owner gate raporu artifacts/PR8-CF69D6A-OWNER-GATE.md hash
21ea0a68743b3b0fd56ee51b6f5bdabd98d4532262b0c98c0571f24af7bd6876.

## Yeni dar profil / acceptance

Eski postgres:live authority ve inert Compose kapalı kalır. Yeni
postgres:fixture yalnız exact CNPG17.11 minimal Trixie manifest74bd767…,
config2479c67… içindir. Raw Grype0.118.0 FAIL/raw2,357match ve184blocking
full-match multiset hash92a98d1ea3e9706bb0ee71c08320d720384e854f2a20bd8b1c1094f5e93348ee
korunur. Test risk kabulü VEX not_affected veya production/runtime admission
değildir. DB48h/2026-09-08T06:27:35Z expiry; sonlu20min lease. Registry
signer verification NOT_RUN, reproducible publisher build NOT_PROVEN;
residual provenance risk açık, hash/subject/source bağı ayrıca doğrulanır.

141/141 dpkg paket/notice envanteri,138distinctnotice ve10ekELF/binary
package ownership bağı mevcut; kayıpnotice/unowned0. Lisans değerlendirmesi
değişmeden kullanılan/yeniden dağıtılmayan kurum içi test kapsamındadır;
corresponding-source completeness veya distribution admission verilmedi.
Lisans kanıtı00b094982e95a24272da217ead194ca8c751a5dc7a6ce91f53b5e99a3e412435.

İmaj yalnız metadata olarak yüklendi; OCI arşivcf041f917bf92c186601d8170ec2a934ec119ddcfeb2b857cd6917219777bcdf,
151586816byte. Docker29.7.2 containerd store exact platform manifest'i Id
olarak kullanır; configdigest lookup başarısızdır. Manifest-only store
handle ve Descriptor1950byte/config/all3diffIDs birlikte bağlanır; serbest
config-or-manifest fallback yok. Metadata evidence41bdcb7db69e5ad9aae5d527a2b514fc04f1f04d11ef098c82316bc736dc10a6.
Bu yükleme PostgreSQL execution PASS değildir.

## Sahiplik ve review

Orchestrator shared DECISIONS/ADR/DQ/state/index/package/boundary allowlist,
fixture-admission/fixture-run ve bütünleşik güvenlik düzeltmelerinin sahibidir.
fixture_container_runtime yalnız psql/native/container ve sonra ayrı
fixture-build dosyalarını yazdı; fixture_host_policy yalnız host-policy ve
testlerini yazdı. Aynı dosyada eşzamanlı writer yok; root handoff sonrası
runtime RO kontrolünü bütünleştirdi. Image/license araştırması TEMP-only;
security ve final cold read-only. Actual model/effort UNKNOWN/UNKNOWN.

Bağımsız pre-execution review: ilk Medium lease ve uncertain-create-cleanup,
Low post-inventory ve unbounded-read bulguları forward fix edildi; önceki
BLOCKED_EVIDENCE verdict korunur. Final exact security re-review henüz
beklenir. Fail-open, skip/assertion gevşetmesi veya eski kanıtı yeni SHA'ya
taşıma yok. Canonical Node24.20 focused testleri ayrı execution kayıtlarıdır.

## Bitiş kapıları / rollback

Host source/tools/input exact public regular snapshot, gerçek RO inspect +
EROFS negatifleri; cap-dropALL/networknone/ephemeral tmpfs; exactowned
cleanup/absence. Gerçek immutable SQL170 satır, PG17 TLS/SCRAM,
connection pool ve /health/ready altı package-qualified Go testi/race PASS
olmadan engine tamamlanmaz. Ardından exact seal/full-tree/localR016,
hostedCI/CodeQL/push+trustedR016 ve fresh security/cold gerekir. Başarılı
sonuçtan sonra PR #8 DRAFT kaldırılır; main merge owner exactSHA onayı ister.

Production, VPS/SSH/DNS/secret/kalıcı veri işlemi yok. Rollback yeni profili
kapatma/dar reviewed revert; yalnız owned ephemeral kaynakların temizliği.
R-014 server-side enforcement, CodeRabbit/Sonar dış bağlantı ve production
image güvenliği ayrı, çözülmüş gösterilmeyen sınırlardır.

## İlk koşum hazırlığı — 43e26cb

Canonical Windows CI raw0:565test/563PASS/iki tarihsel Windows skip,
web3/3/coverage100. Windows Go format29/modverify/build/vet0;
uygulama denetimi dört generated executable'ı engellediği için fulltestFAIL,
CGO yokluğu nedeniyle WindowsraceNOT_RUN; Linux gate'e aktarılır.

a1 preflight Git cmd/git.exe nlink2 nedeniyle INPUT_FILE ile durdu;
aynı hash'li installed bin/git.exe nlink1 seçildi, kural gevşetilmedi.
a2 gerçek pinnedLinuxGo1.26.7 build/moduleverifybeforeafter/CGOrace binary
metadata PASS; build evidence567d9d8207f2dbdce833a17ca71530c55cb41d3b926f2f448bfb34137045ec81.
PG start öncesi inspect Config.ExposedPorts alanının Docker tarafından
atlanması nedeniyle FAIL; owned cleanup/absence PASS, engine NOT_RUN.
Final attempt evidencea2a0944ed38afe2782f81759c0af428e7c1496e42c42c57dee403680ceda4c9f.
Bağımsız never-started metadata probe aynı davranışı doğruladı; yalnız
bu isteğe bağlı boş alanın undefined/null/empty-map eşdeğerliği kabul edilir,
dolu port haritası ve geçersiz tipler reddedilir. Diğer created kontrolleri
değişmeden actual replay PASS; diagnosis evidence9c2dd243df30a0e6f060ddc58247bb6642e87105f6a6da6813f29d44a6491384.

## RO probe kalibrasyonu — 638952f

a3 pinned builder PASS; gerçek fixture Node başladı fakat initdb öncesi
FIXTURE_RO_PROBE_ERROR ile FAIL oldu. Owned removal/absence PASS; SQL/Go
engine henüz çalışmadı. Final failure artifact
b0c307b88cc17934570ca0f29d684596a5e46da080a68bac454eadb4cbaca898.
Bağımsız aynı UID26:102 Go-only tanıda mevcut üç dosya0555/root:root ve
Windows ReadOnly|Archive: write-open EACCES;
üç yeni dosya denemesi EROFS. Orijinal byte hash'leri değişmedi;
kanıt41d6e52bf4e37c17533ace32d6e212b8024c9465875d853ee88ed67e81b1ca63.

Güvenlik tasarım incelemesiyle her bind'a tek exact public calibrated
canary eklendi. Orijinal dosya izinleri korunur; canary DAC-yazılabilir
0777/0666 hazırlanır. Strict altı EROFS, hostRWfalse/self mountinfoRO,
nested mount yasağı, exact inventory/hash ve private ancestor değişmez.
EACCES başarı sayılmaz. Sonraki gerçek koşum ve exact full-tree/review
sonuçları ayrı kanıt olacaktır; bu düzeltme geçmiş FAIL'i değiştirmez.

Yeni yalnız sentetik public byte Go-only tanı: aynı UID26:102/üç RO bind
altıEROFS; RW negatif kontrolde altı başarılı open/create strictFAIL42
üretir. İki owned container removal/absence ve unchanged hash PASS;
kanıta2ab493a9137e494c25d0e2d3ee4cf3cde0687d6f7856637d2efef935e6cae27.
Bu davranış tanısı engine/full-tree yerine kullanılamaz.

## Gerçek motor a4 ve bağımsız cold FAIL — f8552b1

Exact f8552b17ff42ef46e63b9b7e88e48c08bf4dacb6/tree0dc66ee2330896eb112d75939091a27f3ca2fc8e
owned ağsız fixture başladı; FIXTURE_READINESS_TIMEOUT ile durdu. SQL/Go
receipt yok, host cleanup PASS. Failure artifact
8571652e0ddef7d65e848f0761f3f28bea0665b311360ac5b299411935443126.
Cold reviewer ayrıca P1 API cleanup tekrar-start uyumsuzluğunu doğruladı:
test recovery sonunda çalışan primary'ye cleanup start503 veriyordu.
Forward fix start idempotence'ını ancak gerçek SQL readiness ile kabul eder;
stopped server için observed clean close/restart gerekir. Regresyonlar ve
readiness aşaması/exit/SQLSTATE için sabit, sır içermeyen tanı sınıfları
eklendi. Raw SQL/stderr/parola dışarı taşınmaz; eski FAIL korunur.

## A5 dar TLS tanısı — 4ab16b9

Exact4ab16b9718dd20781f656f6951543091854ebeae/tree6a3158955e94d48baec3ca1ef6b8bf669475e1d7
Windows canonical CI641/639PASS/iki tarihselskip, web3/3/coverage100 ve
W001repolint exit0. Node proofb0400351504e0f314c4231338f7a920cac8c7746e9a643abcf3b77283d5fe8d0.
Cold dar re-review start kaynak düzeltmesini kabul etti, fakat gerçek
engine/full-tree/hosted eksikliği nedeniyle BLOCKED_EVIDENCE kaldı.

A5 gerçek engine yine FAIL: primary initial psql exit2, SQLSTATE NONE,
TLS sınıfı. Host cleanup PASS; failure artifact
83b37d96c4df1da6b2fa971079f51cbf0aa853524ecf1eb84c136956822f1f49.
TLS fixture CA'sının boş subject/issuer kimliği saptandı. RFC5280
[issuer](https://datatracker.ietf.org/doc/html/rfc5280#section-4.1.2.4) ve
[CA subject](https://datatracker.ietf.org/doc/html/rfc5280#section-4.1.2.6)
zorunlulukları doğrultusunda random-serial bağlı public CA adı ve gerçek
encoded authority parse edilerek SKID/AKID bağı eklendi. SAN doğrulaması,
yanlış CA/host negatifleri ve TLS güvenlik eşikleri değişmez. OpenSSL
birlikte çalışma/gerçek motor kapanışı ayrı yeni kanıt ister.

A5 aynı binary Go-only/OpenSSL3.0.20 tanısı: doğru CA+IP bile error18
self-signed/exit2 ile reddedilir; CA/leaf issuer ve subject boş, leaf AKID
yoktur. İmza matematiksel olarak CA anahtarıyla doğrulanır; sorun chain
kurulmasıdır. Private key yalnız tmpfs, original hash unchanged ve owned
removal/absence PASS. Kanıt
b7f9bc839704333c96ef9a2cbdd8bba4fd65b2fb3b328c6684cc00487f5b2684.

## TLS birlikte çalışma ve A6 startup-auth korelasyonu — 4609b92

Düzeltilmiş iki Go TLS dosyası exact hash'leriyle ayrı Linux Go1.26.7
test2/2 ve build PASS; OpenSSL doğru CA+IP exit0, yanlışCA exit2/error20,
yanlışIP/host exit2/error64. Sentetik private key tmpfs/owned cleanup PASS.
Dar kanıt30c9b0f12c26ade94cf5c9610ad74df014d95da1fd440c5e7b2b156aaa72fdac
tam kaynak/engine kapısının yerine geçmez.

Exact4609b92eefc57ed37be90728d83a77c5193efb05/tree9b99a2c05891087eda5d78ccc62c715555e3e0f1
A6 fixture gerçek SQL matrisinde roles.readonly.login-denied aşamasına
ulaştı ve FIXTURE_EXECUTION_FAILED ile FAIL oldu; tamSQL/Go PASS yok.
Owned cleanup PASS; failure artifact
fb933b5371923f35261146c5e3b4bdfc0060213d32cf80f7a2d9c422c507a36b.
PG17 [startup source](https://github.com/postgres/postgres/blob/REL_17_11/src/backend/utils/init/postinit.c)
authentication'ın application_name startup option'ından önce olduğunu
gösterir. Bu nedenle application_name-only core korelasyonu reddedilen
login için yeterli değildir; A6'nın raw logları saklanmadığından bu kök
neden kaynak/control-flow çıkarımıdır, gözlenen exact server satırı değildir.

Dar native çözüm: tek güven alanı/ağsız profile içinde exact readonly
negatifi için first-and-only attempt, exclusive operation/session lock,
generation/eviction bağlı taze log cursor ve actual nonzero observed close.
Tam500ms settling sonunda yalnız exact readonly FATAL28000/28P01 ve tek
error kabul edilir; belirsizlik fail-closed'dur. Read-only security design
bu koşullarla kabul etti; implementation review ve yeni gerçek engine
sonucu ayrıca gerekir. Güvenlik eşiği/SQL170/assertion gevşetilmez.
Yeni güvenli tanı yalnız SqlAcceptanceError kapalı code/case bilgisini
saklar; geçmiş FAIL'ler korunur, raw SQL/log/stderr dışarı çıkmaz.

Bağımsız implementation review MEDIUM uyumluluk bulgusu: verbose server
logging severity sonrasında SQLSTATE'i tekrar basar; ilk sentetik örnek
bunu atlıyordu. [PG17 elog source](https://github.com/postgres/postgres/blob/REL_17_11/src/backend/utils/error/elog.c)
ile doğrulanan exact biçim regex/testlere alınır; prefix/body state eşitliği
zorunludur. Log verbosity azaltılmaz; eksik veya uyuşmayan state reddedilir.
