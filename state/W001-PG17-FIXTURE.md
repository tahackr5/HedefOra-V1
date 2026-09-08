# W001 Phase B — owner test-fixture admission

Güncel mühür-öncesi checkpoint: gerçek A11 engine PASS; exact3a32 CodeQL4
FAIL ve dar test adlandırması sonrası yeni exact kapılar bekleniyor.
PR #8 draft kaldırma koşulu aşağıdaki final protokoldedir. DEC-031/DQ-011,
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

## İlk dar profil / acceptance — tarihsel 2026-09-07 kaydı

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

## A7 — readonly kanıtı sonrası database CONNECT startup reddi

Exactb0265440def08b10f0815941864e50a0ab00716c/treeff6a8417bb2019c266357334f0a86ffca9d5dbb4
odaklı Node258/258/skip0 ve W001repolint exit0; dar security source PASS.
A7 gerçek engine readonly login-denied aşamasını aştı fakat
roles.migration.postgres-connect-denied / FIXTURE_SQL_EXECUTOR_TERMINATED
ile FAIL oldu. Host cleanup PASS; failure artifact
8685f19358b7a3be4317767d0bb530ff15a9c1e297e190f39d18e57530c7c014.
Cold reviewer aynı P1'i bağımsız kaynak akışından buldu: CheckMyDatabase,
process_startup_options'tan önce çalışır. Diğer beş CONNECT vakası da aynı
yolu kullanır; eski source PASS bu yeni full-matrix FAIL'i kapatmaz.

Dar forward fix yedi sabit tuple'a ortak güvenli startup korelasyonu ekler.
PG'nin Port kaynaklı role/database kimliği native log prefix'e alınır;
authenticated session_user olarak sunulmaz. Exact tuple first-only hakkı,
exclusive lock, stable generation/no-eviction cursor, raw nonzero observed
close, tam500ms settling ve tek exact verbose FATAL korunur. Ordinary native
unique-app korelasyonu yalnız anchored prefix normalizer kullanır; hatalı
veya çelişen hedef-app satırı atlanamaz, legacy fallback yoktur. SQL170,
catalog ACL/NOLOGIN ve before/after atomiklik değişmez. Güvenlik tasarım
kabulü koşulludur; yeni exact implementation review ve engine sonucu gerekir.

Aynı b026 ara Windows fullCI exit0:690test/688PASS/iki tarihsel Windows
skip, web3/3/kapsam100. Clean detached clone/fsck ve25rawhash replay PASS.
Proof85b0f99af94e4517a863188af9da3fafb75ac8a74b77530bbb0e3b24a09b460c;
CI log728cd2570ce11ac9051c2681fdfd5aac86435c8041889ad0576452ea7d4af15b.
Bu sonuç A7 engine FAIL veya yeni exact full-tree/hosted kapıları değildir.

## A8 — SQL aşaması sonrası Go process FAIL

Exact0e9046948c770c7574cb5a563fc046cc05607530/tree1471eab3de5d32fba0b8c4dc4d91b167bd5c06d8
Node295/295/skip0/raw0 odaklı kanıt
f9a1db7afba8b6b704a6a5ea11cde64bd23c7759bd9682278e554174a75aff98:
Node24.20/full command/stdout/stderr ve12before/after/current hash eşleşir.
W001repolint exit0; exact security pre-execution source PASS. Cold önceki
CONNECT P1'inin kaynak eksikliğini kapattı fakat engine sonucu yokken
BLOCKED_EVIDENCE tuttu. Bu scoped sonuçlar release PASS değildir.

A8 gerçek fixture FIXTURE_GO_PROCESS / failedCase null ile FAIL oldu;
owned removal/absence PASS. Artifact
5d2117552aafa266899bb4d9f6fd4d6bd4d07dd2aced3057d46451aea27e57f6.
Kontrol akışı runLiveSqlAcceptance ve SQL PASS kontrolünden sonra Go
aşamasına ulaşıldığını gösterir; host başarısız receipt'te tam SQL raporunu
saklamadığından bu çıkarım bağımsız SQL170 PASS artifact'i değildir.
Hangi Go assertion/process'in başarısız olduğu mevcut tanıda bilinmez.

Sonraki dar tanı yalnız mevcut FAIL'e fixed package/test, bounded raw process
exit ve kaynakta tanımlı literal assertion'ın satır kimliğini ekler. Ham
binary stdout/stderr bounded private memory'de kalır; mesaj, path, SQL,
credential veya raw log dışarı çıkmaz. Bilinmeyen/dinamik mesaj UNKNOWN'dır.
Go validator, cancel/reap, zero-exit/observed-close ve altı test zorunlulukları
değişmez; eski FAIL ve host cleanup kanıtı korunur.

Tanı regresyonu Node24.20 ile186/186 PASS, raw exit0, skip/cancel/todo0;
proof SHA256 cc5afec964e4991e1ace74a197b26c76c429190733be4c916a8cb7959049373e.
Kanıt11girdi before/after hash ve format/diff exit0 içerir; source henüz
commit edilmeden üretilmiştir, yeni exact full-tree gate yerine geçmez.
PG çalıştırmayan ayrı Go1.26.7/race framing deneyi gerçek 0x16 FAIL çıktısını
ve kaynak literal satır eşlemesini doğruladı; değiştirilmiş reported line
otorite olmadı, yabancı path UNKNOWN kaldı. Proof SHA256
dd2c3c0d9f1e15631e6d7080df7d0f6c5d9b74f831c7a92c1d5afba90ff0cb8d;
import edilen helper8df048ed7c3cc34151cb81488bf75796ff7004e9ba3374a53354fe46a1a21f40
sınıflandırma boyunca sabit, owned cleanup/absence PASS. Bu iki kanıt
yalnız tanı güvenilirliğidir; SQL/Go engine PASS değildir.

## A9 — gerçek iptal testinde provider sahipliği

Exact a4dde45f2c2a14438a16d9a257caaf922e9cfb33 /
tree591658776799564e88511e8b770f0ed74217dc2f için source pre-execution
security PASS, W001 continuous ownership exit0 ve generated boundary exit0.
A9 engine FAIL: FIXTURE_GO_PROCESS_P_B1_C0_BC_CC_L593,
go.postgres.query-cancel. Tanı kaynak literal593'e bağlıdır:
iptal edilen operasyon döndüğünde AcquiredConns sıfır değildir. Bu sonuç
tek başına kalıcı leak veya hangi alt testin neden olduğu iddiası değildir.
Binary raw1/converter raw0 observed close; host exit1'i kabul etmeyerek
FIXTURE_INSPECT_STATE ile FAIL verir. OOM yok; owned cleanup/absence ve
source/tools post hash PASS. SQL ilerleme çıkarımı tam SQL receipt yerine
geçmez; engine gate açık kalır. Pinned provider Release/destructor semantiği
ve bounded cancellation sözleşmesi araştırılır; assertion gevşetilmez.
Final-result SHA256cfca6c59ce6ce9a47fd24be23eaa37e0c802366539f8136cbc2a775a67906ac2;
container-failure SHA256a3bb17f57f79230464986629fabfa43882f4c71cc275db3d6899d3a16b846144.

Pinned pgx5.10.0 Conn.Release closed/busy/non-idle bağlantıda puddle2.2.2
Resource.Destroy çağırır. Destruction asenkron; acquired kaydı gerçek
destructor sonrasında kaldırılır. Pool.Close completion ile sayaç güncellemesi
arasında da kısa scheduling aralığı olabilir. ADR-0018/DEC-028 ve Pool
sözleşmesi synchronous metric0 değil, tek-goroutine lease/Release-before-return,
bounded cancellation ve actual provider Close completion ister. Bağımsız
security re-evaluation ilk olası MEDIUM'u doğrulanmış production zafiyeti
değil test oracle uyumsuzluğu olarak sınıflandırdı; A9 FAIL korunur.

Dar oracle düzeltmesinin kabulü: gerçek underlying Release sonrası ACK ve
tam acquisition/release1, Check sonucu gözlendiğinde zaten hazır olmalıdır;
ACK beklenmez. Provider AcquiredConns0 ayrı olarak aynı cancelStart+2s
mutlak bütçede, gözlem sonrası da deadline kontrol edilerek kanıtlanır.
Geç sıfır, hiç bırakılmayan lease ve tamamlanmayan destruction FAIL'dir.
MaxConns1 gerçek recovery, actual Close ve kontrollü destructor bariyeri
regresyonu gerekir. Production pool/Hijack/kapasite/timeout sınırı değişmez.
Bu tasarım kabulüdür; yeni implementation review/test/engine sonucu değildir.

A4dde45 exact fresh cold review A9 engine FAIL'i bağımsız hash/source ile
yeniden doğruladı. Ayrıca Medium cleanup bulgusu: runFixtureHost SIGINT/SIGTERM
handler'larını prepareFixtureTools sonrasında kuruyordu; derleme sırasında
graceful host iptali builder finally/removal kanıtını atlayabilirdi. Ayrı dar
fix handler kapsamını build öncesine taşır, tüm işi cancellation'a bağlar;
cleanup iptalden bağımsız kalmalı ve exact owned reconciliation/removal/absence
kanıtını tamamlamalıdır. Create/start/compile iptalleri ve tekrarlı sinyal
regresyonları gerekir. SIGKILL/host veya daemon kaybına garanti iddiası yoktur.

Dirty oracle security review ilk uygulamada tüketici-zamanı ACK ölçümünü
Medium test evidence bulgusu olarak reddetti. Check çağıran producer dönüş
anındaki nonblocking ACK/count snapshot'ını error ile birlikte yayınlamalı;
sonradan gelen ACK ilk false snapshot'ı düzeltemez. Geciken tüketici negatif
regresyonu ve controlled destructor yolu aynı kurala bağlanır. İlk dirty FAIL
ve önceki exact FAIL yeni review/test olmadan kapanmış sayılmaz.

Go oracle final dirty-source component kanıtı
5896df894fc36926f0987028791af86df907458556c6b25dabb59408fda471e0:
pinli offline Linux Go1.26.7 raw0, mod verify before/after, postgres/config
race+shuffle, altı yeni üst regresyon x20, tagged compile-only/vet ve format
exit0. Yedi Go/module girdi before/after aynı; concurrent Node/docs bu dar
kanıtın dışında. pool_test SHA1328b13b8246852fba216398843f8a34a03c57016908c47bf105f37601394a22,
integration SHA554b9dde2e97ded0b00867cbca86aec976c26fb63ed285944595a904f09e1ac7;
production pool.go SHA5bbb2c19b181d3edcb7fb1d8ab4798a354b72f5ad9216be7b22d2ec9435fb9f4
değişmedi. İlk eksik test-import derleme raw1'i ve pre-snapshot ara raw0
ayrı artifact'larda korunur. Bağımsız dar Go source review producer/consumer
bulgusunu CLOSED_STATIC yaptı; exact seal ve gerçek PG sonucu henüz yoktur.

Host cancellation A kanıtı SHA256
dd6f87298178ba02ddbd10aee874a2c7eddbe19f324b8512fe9e7f1e1564959d:
pinli Linux Node24.20 gerçek OS SIGINT/SIGTERM x post-create/post-start/
compile-wait/lost-create-ACK sekiz child vakası, cleanup sırasında tekrarlı
sinyal; her interrupted child raw1. Stateful simulated daemon exact-owner
remove/absence doğrulandı; gerçek Docker builder iptali iddiası değildir.
Linux focused127/127/skip0, dış Go-only diagnostic container raw0 ve exact
owned removal/absence PASS; 16public module closure değişmedi. Windows127/127
aynı çocuk vakalarında IPC process-event kullanır, OS signal iddiası yoktur.
Yeni clean exact seal sonrasında ayrı B gerçek prepareFixtureTools derleme
iptali ve Docker owned absence kanıtı gerekir; ardından tam PG engine rerun.

## 2026-09-08 — exact seal, B cleanup ve tazelik yenileme hazırlığı

Go oracle980adac7d5a21939ed655f8e98673a6e8d576af4 ve host-signal
acc427b9d6cf1fb907e57004cedae715eedbcd32, JSON-only
02a1df04f315b2c0e823f834888df2110acb454f /
treeb26f4e00aefdd906d3a92bffb6c36d0dc29108bd ile mühürlendi.
2026-09-08 W001repolint continuous ownership exit0; independent scoped
source review Go7+Node16=23 hash eşleşmesi/mismatch0 doğruladı. Eski A9
engine FAIL korunur; yeni source PASS engine/full-tree/hosted PASS değildir.

B gerçek prepareFixtureTools derleme iptal kanıtı SHA256
c0b305008d45beb062101466c4e23f8dbc7cd2feaea69b3e8a080c1dd0e8c720,
exact02a1df/treeb26f. İlk gerçek go test -c PID1771 ve compile2034/PPID1771
gözlendikten sonra IPC→AbortController iptali yapıldı. Child raw1/observed
close, FIXTURE_COMMAND_ABORTED; bu kasıtlı build FAIL'dir. Builder kendi
finally cleanup'ı ile399d0f5626057cf35847690849f821fa2562899d66934c36c2f76a7f3ddf64b0
ID'sini kaldırdı; exact ID/name/iki-label list boş, inspect NoSuchContainer
raw1. Dış harness removal0, bundle yok, source before/after aynı. B cleanup
PASS; gerçek OS signal iddiası yoktur. A gerçek OS signal/simulated-daemon
kanıtından ayrıdır; birleşik OS-signal+real-daemon yürütmesi iddia edilmez.

2026-09-08T16:08:32Z devam kontrolünde admission'ın DB+48h süresi
2026-09-08T06:27:35Z'de dolmuştu. Gerçek validator
FIXTURE_APPROVAL_EXPIRED verdi (beklenen ret/raw0), PostgreSQL başlatılmadı.
Yeni exact archive üzerinde native fresh scan/delta hazırlanır; eski FAIL,
DB/scan hash ve süre kaydı korunur. Veri yenilemesi bağımsız risk-delta ve
yetki değerlendirmesi ister; fresh scan tek başına admission vermez. Yeni
veya şiddetlenen teknik etki ya da kapsam/provenance değişimi mevcut veri
yenileme yorumuyla kabul edilemez. Mevcut expired capability uzatılmaz.
Yeni admission/engine/full-tree/hosted/R016 kapıları tamamlanmadan PR8 DRAFT
kalır; production/runtime dağıtımı ve main merge onayı yoktur.

### Güncel tarama ve sonlu veri yenileme değerlendirmesi

Bağımsız DATA_REFRESH_REVIEW_PASS: owner 2026-09-07 kapsamı takvim bitiş
tarihi vermedi; teknik DB48h sınırı ve run20min korunarak yeni sonlu kayıt
hazırlanabilir. Bu sonuç execution admission/engine PASS değildir. Yeni
DB built2026-09-08T06:30:10Z, hydrated SHA256
39521d3581ed9987843264ca6a458d8b73389ea3ed9aaaa4edf1189f119a6408;
before/after eşit. Yeni expiry2026-09-10T06:30:10Z, eski kayıt18cc09d…
ve eski expiry geçmişte korunur. Owner approvalDate değişmez.

Grype0.118.0 FAIL/raw2,357match/184blocking/0ignored. Yeni full blocking
multiset SHA256b1fc51a9f5f1536e2cce28c5f8ac4ccd006905f34db0f5a4088fe32561e66953.
151/151 catalog exact aynı; tüm357 package/match/vulnerability kimliği aynı,
eklenen/çıkarılan0; severity/CVSS/fix/knownExploited değişimi0. Blocking168
satırın metadata'sı değişti; risk/EPSS23 satırda değişti (22artış/1azalış).
Tüm357 satırda36risk değişimi ve9primary description eklemesi var; dokuz
açıklamanın tamamı eski related-vulnerability alanında birebir mevcuttu.
Bu nedenle yeni teknik etki açıklaması gösterilmedi; risk aynı/azaldı veya
not_affected iddiası yoktur. EPSS günlük genel exploitation sinyalidir;
bu izole fixture için yeni erişilebilir saldırı yolu tek başına kanıtlamaz.
Kanonik DEC-031/ADR-0021 ayrı EPSS hareket eşiği tanımlamaz. Aynı image,
scope ve izolasyon için sonlu data refresh mevcut owner mandate içinde
değerlendirildi; yeni image/KEV/teknik etki/provenance/kapsam için genellenmez.

Data-only proof9a59d07eec0785c5bd1b6d8457fcdfeeb0e7d0e1ebc32389c44b860f33578ebb;
delta replay4fe0e45767b0f5fc2fb061775afeeee5ef61eb9ca2ef7a17baa5109edbaf907a;
risk summary621ff79ef691a2c19c59d4895abeecff544750c6845659986aa235231cca18ae.
Security12raw stdout/stderr hash/size replay ve eski/yeni DB/archive hash
mismatch0. Registry signer/reproducibility ve distribution residual'ları
değişmez; yeni pinler, negatif test, ownership ve exact security sonrası
engine çalıştırılır. DB üretiminden önceki now değeri ayrıca fail-closed
reddedilir; bu ek kontrol freshness eşiğini gevşetmez.

Exact02a1df/treeb26f yerel full-tree27gate+11içGo gate PASS; Linuxnonroot
817/817skip0, Windows815PASS+2tarihsel platformskip, Linuxboundary14/14,
web3/3coverage100. Quality proofdb17cc4a96e25ae38efdfde4ae923f59d4908667a280a335695ca615aeab37a0;
final replaye106746b425d67cb1a354275bd93b0b2d903d06e639a8bd85a541351a84dc609,
27gate+8clone+1nonroot raw mismatch0. Test başlamadan göreli harness path
çağrısı raw1 verdi; invocation-history içinde korunur, gerçek absolute
gate raw0. Bu sonuç yalnız02a1df exact source; yeni admission/state SHA'sına
taşınmaz. R016/hosted/engine yeni exact kapıları henüz NOT_RUN.

Yeni admission byte SHA2564722d2c788f4873558f7926d6d577b4ddbc0a13435d4018619535e6a08af4623,
46exact evidence file ve aynı notice/OCI closure'a bağlanır. Consumer düzenine
taşıma yeni scanner koşumu değildir; scan/catalog projection gerçek raw
receipt alanlarından türetildi. Adapter proof24eb954065dae94ab53f8a94d5c49ea153e7e201c38c3ae808ca06e09b938075;
data-only compatibility786ed9ed1cc01ec61a549b514c2dfd3279110c4dfe3bdf8585470bf3ae6a0092.
Kaynak raw/delta byte'ları ayrıca kayda bağlı, kopyalar nlink1; engine için
gerçek admission capability kontrolü ayrı zorunludur.

Node24.20 --test --test-reporter=spec admission/run/build/host-policy dört
test dosyası170/170PASS, fail/cancel/skip/todo0, gerçek process exit0.
ExactlyDBbuilt ve expiry-1ms kabul; built-1ms/expiry/eski zaman/NaN/Infinity
ret, DBhash/DBtime/age ve önceki pin/scope mutasyonları ret. Bu odaklı kaynak
kanıtı full-tree/engine veya yeni exact security sonucu değildir.

## A10 — gerçek PG17 engine checkpoint PASS, 2026-09-08

Source90d7d151136c6aa1efa68deb6da8c7b027f9bed7, JSON-only ownership seal
ff09a6cfa95a30b1526e3144ed632afde1cd8203 /
treee1c7a6b95e886473e8d0917984af4d92c5b31f80. Continuous W001repolint ve
generated boundary exit0, clean source. Independent PREEXEC_SOURCE_AND_DATA_PASS:
gerçek admitFixture/fixtureArchive46file+DB/OCI/license okuması raw0,
altı actual-receipt projection eşleşmesi,6pozitif/19negatif PASS. Bu admission
Grype FAIL'i değiştirmedi; current finite4722d2c… test kaydı kullanıldı.

Canonical Node24.20 fixture-run.mjs config-a10-20260908 ile actual process
exit0 ve source/tree-bound PASS verdi (tool session93593, terminal77c0d7).
Run52936b824d862b2d986fba1205f52605, issued2026-09-08T16:44:07.846Z;
PG start16:44:09.393Z, finish16:45:14.679Z, süre65285ms/20minlease içinde.
Final-result SHA256752c9d0c503c33ff02948f425674535ee159057282b3a9b989efa2c5bb2c33ec;
container-receipt17e1b8b31d3174e468c6d46a1af94598acd28a693e99a6570ec79157966225a5;
toolbundle34a23b84069602d9ca9eaf7ac73d58fab55a1a576f84752d940386229e088ce1.

Gerçek SQL170/170 sıralı case PASS: immutable up/down/checksum/rollback,
role catalog/NOLOGIN/password-null/membership/ACL, DML/DDL/advisory-lock ve
hedef-dışı DB reddi. Readonly28P01, diğer altı login-denied42501; lock3013ms
55P03, statement15002ms57014, idle15097ms25P03. Altı exact Go test/iki package
PASS: TLS/SCRAM, yanlış CA/hostname/parola ve plaintext fallback reddi,
ambient endpoint sınırı, pool capacity/deadline/reuse/Close, gerçek in-flight
cancel/recovery ve API startup/outage/recovery/drain. Binary/converter0/0,
fail/skip0, Go1.26.7/race/integration. /health/ready startup503→200,
outage503→200 ve drain sonrası geç başarı503; health/live bağımsızlığı korunur.

Owned container ae217e59aa69b5851cf8bc8f4c841708657d54cadae9cad1cacc41c2cd2fdabc,
üç actual inspect ile exact profile bağlı,59host event raw0; OOMfalse.
İç iki postmaster close ile dış host removal ayrı authority'dir. Host
ownedRemovalAndAbsence PASS ve source/tools/input post hash PASS. Ayrı
güncel exact ID/name/run+source label listeleri boş, inspect NoSuchContainer
raw1; bağımsız verifier hiçbir cleanup komutu çalıştırmadı.

Independent PASS_ENGINE_SECURITY_SCOPE ve artifact replay PASS:
SQL170/Go6/full Git snapshot/tool/input/inspect/lifecycle kontrolleri eşleşti.
A9 CLOSED_VERIFIED_TEST_ORACLE_ONLY; production leak veya immediate
server-side SQL cancellation düzeltilmiş iddiası yok. A1-A9 FAIL'ler saklı.
Offline replay proof20641c62c427035687a72001cb881b7861117ec1692aa7bfc3a14c7b7783304b.
İlk replay preflight NON_CANONICAL_PATH/raw1 proof6d71b8758843fa1a8e253708452ca864aa8d334c712e7c1874468e8a5b1ba9c0
korundu. pnpm Node executable AppX canonical path/nlink4 nedeniyle strict
verifier reddetti; aynı5c9760… hash'li exclusive ordinary TEMP kopya
canonical+nlink1 ile geçti. Verifier kodu/eşikleri değiştirilmedi.

Kanıt sınırı: persisted inspect JSON yeniden pretty-encoded olduğundan
saklanmayan tüm raw inspect stdout hash'leri replay edilmiş sayılmaz.
Yapısal üç inspect ve sekiz bilinen-output hash replay ayrıdır; ana CLI raw0
tool gözlemi, gerçek admission ve güncel daemon absence ayrı kanıtlardır.
Trusted host/daemon ve eşzamanlı snapshot writer yokluğu varsayımı sürer.
Cryptographic execution attestation, malicious-image isolation veya
production/hardened-image admission iddiası yoktur.

### Final exact checkpoint protokolü

Bu state/ledger promotion'ı yeni exact SHA üretir; A10 PASS yeni SHA'ya
yeniden etiketlenmez. Yeni engine koşumu, clean-clone27quality gate,
nonroot full CI, local/trusted+push hosted R016, dört dilli CodeQL ve fresh
security/cold sonucu ayrı hash-bağlı artifact'larda tamamlanır. Final rapor
artifacts/PR8-PHASE-B-OWNER-GATE.md; ilgili exact SHA ve tüm raw exit/hash
bağları olmadan PR8 draft kaldırılmaz. Hosted source gate, yerel PG engine
yerine geçmez. PR8 merge ayrıca yeni exact-head owner onayı ister; post-merge
full-tree/CI/R016 sonraki yetkili adımdır. R026 production/hardened-image
BLOCKED_EXTERNAL, R014 server enforcement ve CodeRabbit/Sonar boşlukları
PASS sayılmaz. Rollback reviewed dar revert veya yeni profili kullanmama;
production/SSH/DNS/secret/gerçek veri mutation yoktur.

## A11 ve CodeQL4 — exact sonuçların ayrılması, 2026-09-08

Source3a32a0ced2474285d586b29c79d275e9616b593b /
treec9e7052f8473ada96b185731a63bb3539a57c4ed, canonical fixture CLI gerçek
exit0 (root session49176, terminalf67798): SQL170/Go6/race, üç inspect,
owned cleanup ve posthash PASS. Final-result96aec7eb47d14833f42a501db7f635cf385295af543263027b4e95885e3d3723;
receiptf6379f0178b3e63de4b7cc8b454651ee57e6a8f4fa3cc0c5cc119dc5aad1c865.
Bağımsız değişmemiş verifier replay/current daemon absence PASS:
proof25caac8c25b724856258a855392d27e417ff203f6c142b9cf2dcc9bdfecdb03f.
258public source/5tool/9artifact/8bilinen event hash doğrulandı; exact
ID/name/iki owner label yokluğu ve daemon identity eşleşti. Saklanmayan
raw inspect stream byte'ları replay edilmiş sayılmaz. A10 ve önceki
başarısızlıklar değişmedi; production admission yoktur.

Aynı SHA'da push CI34254340723 ve trusted PR34254341395 execution SUCCESS;
CodeQL34254340955 execution SUCCESS olmasına rağmen JS analysis1742604671
result1 ve HIGH/open alert4 nedeniyle CodeQL gate FAIL. Actions/Go/Python
result0; eski alert2/3 fixed. R016 artifact metadata push10067306117 /
trusted10067317428 toplandı; bu checkpoint ZIP/raw bağımsız replay edilmedi.
Windows frozen install/ci:check exit0, repository823PASS+2tarihsel skip
(825toplam), web3/3 ve coverage100; yeni Linux/Go/localR016 full-tree
koşulmamış sonuçlar PASS sayılmaz. Kaynak güvenlik incelemesi scoped PASS
olması bu hosted bulguyu veya eksik gate'leri kapatmaz.

Actual SARIF alert4 akışı fixture-build.test.mjs:276 içindeki `secret`
değişkeninden verifyGitBlob parametresi ve SHA-1 update'e gider. Değer sabit,
public, geçersiz PEM-biçimli `synthetic-only` işaretleyicisidir; gerçek
anahtar okunmaz/üretilmez. Doğru Git blob OID verilmesi negatif testin hash
uyuşmazlığı yerine FIXTURE_BUILD_PRIVATE_BYTES reddine ulaşmasını sağlar.
SHA-1 burada mevcut Git object-format kimlik eşlemesidir; password/secret
koruma algoritması değildir. Dosya/tool/bundle manifest bütünlüğü SHA-256
olarak kalır; bu değerlendirme genel Git SHA-1 collision güvenliği iddiası
değildir. [Git object format](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects.html)
ve [CodeQL kuralı](https://codeql.github.com/codeql-query-help/javascript/js-weak-cryptographic-algorithm/)
ayrı anlamları doğrulamak için incelendi.

Inline static triage: not_actionable/high confidence, supported sensitive
boundary crossed=false. Uygulanabilir SECURITY.md resolver sonucu yok;
AGENTS/DEC-031/ADR-0021 trusted-host/public-source sınırı kullanıldı.
Triage JSON SHA256d02dfe51f81ea6a8129d0e55c2a2849878b66f8ff76286bc234c740734457b44.
Bağımsız read-only inceleme aynı dar kaynak yorumunu doğruladı. Güvenlik
düzeltmesi sonucu no_change; normal CI fixture açıklaması yalnız `secret`
adını `markerBytes` yapar ve sabit/geçersiz/public yorumu ekler. Literal
byte'lar, oid hesabı, çağrı, assertion ve runtime kaynak byte'ları korunur.
CodeQL kuralı/config/dismissal/suppression/threshold değişikliği yapılmaz.
Yeni exact hosted scan sonucu görülmeden alert fixed veya gate PASS denmez.

Odaklı canonical Node24.20 fixture-build testleri107/107, fail/skip/todo0,
exit0. Yorum ve değişken adı geri normalize edildiğinde önceki test
dosyası birebir aynı; fixture-build.mjs implementation değişmemiştir.
Bağımsız fresh read-only aday bypass/regression incelemesi scoped PASS;
bu sonuç taramanın otomatik kapanışını veya yeni exact full-tree PASS'ını
öngörmez. Eski marker reddi ve Git OID uyumluluğu aynen korunur.

Sonraki source/seal için A12 engine, clean-clone full-tree/R016, hosted
push+trusted ve fresh security/cold ayrı artifact'larla doğrulanır. A11
PASS yeni SHA'ya taşınmaz. PR8 DRAFT bu kapılar bitmeden kaldırılmaz; owner
exact-head merge ve post-merge full-tree hâlâ sonraki yetki eşiğidir.
