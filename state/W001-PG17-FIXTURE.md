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
