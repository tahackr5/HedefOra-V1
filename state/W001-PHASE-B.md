# W001-T04F Phase B — plan, ownership ve kanıt

- Status: IN_PROGRESS; güncel checkpoint tarihi: 2026-09-09.
- Initial Phase B immutable base: `7a1e124e432b51694e7d60c0d3d1589867a8835f`; tree `ec6d12847c657adedbd84e44565598d234c7b928`.
- Current continuation checkpoint: `aba3d13ed057bbe80a2e67486058180479c3c50e`; tree `ed51da48638d362ff52169658321604dedba442a`. PR #7 owner merge ve aşağıdaki post-merge admission sonrasında ilerletildi; mevcut runtime lineage yeniden yazılmadı.
- Merged candidate: `df67eb1d2c59009552602a666f352605494587ce`; tree `c04ce8c0adb6fa9a8ebcb30b3a750f23c6af1857`. Remote `main` olsa da post-merge CodeQL alert #5 nedeniyle `UNTRUSTED`; current continuation checkpoint değildir.
- Remediation source head: `e0e01321f2070b325348952c4d56be374848942c`; tree `e3dd8c1cc52983f4a3a6202e8c20b23b0bce5298`. S5 `dbd52ad` hosted alt kapıları geçti fakat iki local R-016 timeout'u ve delayed-evidence security finding'i nedeniyle FAIL oldu; e0 source security PASS olsa da henüz final seal ve yeni exact gates'i geçmedi.
- Historical W001 base değişmez: `bde560f182032e1e4ec9f1a1b02db4cd8ec5e99b`.
- Orchestrator branch/worktree: `codex/w001-t04f-postmerge-codeql5`, `C:\Users\ihsan\.codex\worktrees\HedefOra\W001\T04F-CODEQL5`.
- Etkin model/effort tool kanıtında doğrulanmadı: UNKNOWN/UNKNOWN; repository config değiştirilmedi, alt ajanlara override gönderilmedi.

## Tarihsel pre-merge runtime engine checkpoint — 2026-09-08

A11 exact3a32a0/treec9e705 gerçek SQL170/Go6/race ve bağımsız replay/current
absence PASS. Hosted CI/trusted execution SUCCESS, fakat CodeQL HIGH/open4
nedeniyle aynı checkpoint scanner FAIL ve PR8 DRAFT. Sabit public negatif
test işaretleyicisinin adlandırma/açıklama değişikliği yeni exact seal ve tüm
kapıların tekrarını gerektirir; scanner dismissal veya runtime güvenlik
düzeltmesi iddiası yok. Ayrıntı: state/W001-PG17-FIXTURE.md A11/CodeQL4.
Aşağıdaki A10 kanıtı yalnız tarihsel exact source kapsamındadır.

DEC-031/DQ-011 ayrı test-time profili ile exactff09a6cfa95a30b1526e3144ed632afde1cd8203
/treee1c7a6b95e886473e8d0917984af4d92c5b31f80 A10 actual engine PASS:
SQL170, Go6/race, TLS/SCRAM/pool ve /health/ready startup/outage/recovery/drain.
Bağımsız source/admission/engine security, artifact replay ve actual owned
daemon absence PASS. Ayrıntı, tarihsel A1-A9 FAIL'ler, günlük EPSS artışları,
fresh DB48h/run20min kaydı ve evidence hash'leri state/W001-PG17-FIXTURE.md.
Bu kayıt final metadata seal öncesidir; sonraki exact source kapıları ve PR
owner raporu artifacts/PR8-PHASE-B-OWNER-GATE.md üzerinden ayrı doğrulanır.
Production/hardened-image R026 BLOCKED_EXTERNAL ve eski inert services
korunur; yerel fixture PASS production dağıtımı değildir. T04G/River ve
main merge burada yapılmadı; final owner gate sonrası yeni yetki gerekir.

Aşağıdaki eski image/engine NOT_RUN ve hosted FAIL anlatımları tarihsel
exact checkpoint'lere aittir; yeni A10 kanıtını geçersiz kılmaz veya kendi
kendilerine final exact source PASS'ına dönüşmez.

## PR #6 post-merge doğrulaması

Approved head `01017a25bf02f27924bf0361fd6b70abdc493ac0`, merge zamanı `2026-09-06T12:41:42Z`. Merge ordered parents `cd81ee7b36d5bc647bb297e8ede13b21a7f1c8f1` ve approved head; `git diff --exit-code <approved-head> <merge>` exit 0. Repository API ID `1349011765`, full name `tahackr5/HedefOra-V1`, public, default main; merge commit açık, squash/rebase kapalı. PR #6 MERGED ve remote main exact merge olarak doğrulandı. Server-side enforcement açıldı varsayılmaz (R-014).

Clean detached clone `C:\Users\ihsan\AppData\Local\Temp\hedefora-main-7a1e124-20260906` kaynak/index/ref temiz. Node 24.20.0/pnpm 11.24.0 frozen install ve `pnpm ci:check` exit 0: repository 179 PASS, Linux literal-backslash kapsamı için iki mevcut Windows skip; web 3/3, scaffold coverage %100. Hosted Ubuntu quality suite ayrıca PASS. Pinned Go 1.26.7 tracked gofmt, mod verify, tidy-diff, list, build, vet, uncached shuffle/race exit 0. W001 exact merge-wrapper/continuous ownership ve historical W000 merge-wrapper/immutability exit 0. Python 3.12.13 TOML + unit 4/4, actionlint 1.7.12, Gitleaks 8.30.1 122-commit history ve hosted artifact taraması exit 0; exact typed UUID sibling canary expected raw 1. Inert Compose config services=0 ve sentetik credential disclosure=0. Git diff/index/status/check/fsck exit 0.

- CI run `34033868818`: source boundary `101488277065`, quality `101488290888`, R-016 `101488290875` SUCCESS exact merge.
- CodeQL run `34033868551` SUCCESS exact merge; main analyses Go `1731807957`, JS/TS `1731807924`, Python `1731807416`, Actions `1731807281`; her birinin result count 0/error boş. Exact main açık alert 0.
- Local R-016 run `20260906T124320036Z-1992-0f3e86b2`: PASS exit 0; evidence SHA-256 `cd559c51b8bf685136def41cf6e452fcda7fc4a081474901247ad47faf32b776`; DB seal `a291f6bd407ad6c879c067121129e98861b2f4abd82679c4c31fd3a9b3acd72a`.
- Hosted artifact `9989537724`, exact source/control merge; authenticated API archive digest ve downloaded ZIP SHA-256 `a60feff7505fbccace0fc7d74af836e53bf2fbccda59e85e5672665ef54895b9`; evidence SHA-256 `604cfe8ddb37610908ba32b607e56a5049f152cd4c2dc9e8a2866ddb05de88bb`; DB seal `78245fc5cbc76e84035148939f883e82017ff2b36cb8ec6f8e6be73479320663`.
- İki R-016 koşumunda 386/386 raw artifact size/SHA rehash; mismatch 0. Bütün R016 terminal checks PASS. Hosted `github-context-claim`, local `local-declaration`; her ikisi `visibilityProof=false`; authority artifact beyanından değil authenticated API/run/job/archive bağıyla ayrıca doğrulandı.
- İlk local harness yanlış Compose yolu ve eksik cached image denemeleri exit 1 verdi; doğru yol/digest acquisition ile giderildi ve başarılı gate gibi sunulmadı.

Bu sonuç Phase A checkpoint doğrulamasıdır; canlı PostgreSQL, Phase B completion veya deployment sonucu değildir.

## DAG ve tek-writer sahipliği

Tüm writer worktree'leri yukarıdaki aynı immutable base'ten açılır. Shared dosyaları orchestrator birleştirir. Diğer writer'ın değişikliği geri alınmaz.

| Task     | Tek writer / branch suffix                          | Yollar ve acceptance                                                                                                                                                                 | Sıra                   |
| -------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| T04FB-00 | orchestrator / phase-b                              | root governance, `state/**`, `FILE-INDEX.md`, delivery/architecture; DQ onayı ve post-merge kanıtı                                                                                   | önce                   |
| T04FB-01 | orchestrator / phase-b                              | `go.mod`, `go.sum`, exact graph pin/tidy checker; all-scope R-016 admission                                                                                                          | adapter öncesi         |
| T04FB-02 | orchestrator; bağımsız structured compiler proposal | OpenAPI/Spectral, generator/fixtures/tests, contracts README, generated Go yalnız generator ile                                                                                      | DQ-009 A               |
| T04FB-03 | backend / pool                                      | yalnız `internal/platform/config/postgres{,_test}.go`, `internal/platform/postgres/pool{,_test}.go`; structured config, verify-full TLS, bounded pool/cancel/close, secret redaction | T04FB-01 PASS          |
| T04FB-04 | backend / readiness                                 | `cmd/hedefora/**`, mevcut `config/api{,_test}.go`, `health/**`, `http/**`, `app/**`; iki-operation transport/probe/drain ve failure matrisi                                          | T04FB-02/03 contract   |
| T04FB-05 | infra / hardened-image                              | yalnız `infra/postgres/image/**`; exact source/base/package image tasarımı, inputs/build/entrypoint ve doküman                                                                       | DQ-010 B               |
| T04FB-06 | orchestrator; quality proposal                      | `scripts/postgres-image/**`, image-specific policy/lock; canonical OS/source-CPE/SBOM/freshness/canary/error gate                                                                    | image execution öncesi |
| T04FB-07 | orchestrator; quality proposal                      | `tests/integration/postgres/**`, `infra/compose.dev.yml`, infra/database README; admitted disposable engine empty/up/down/upgrade/privilege/TLS/pool                                 | image security PASS    |
| T04FB-08 | orchestrator + read-only fresh reviewers            | exact boundary/default gate wiring, ownership seal, ledger/artifacts, full-tree/local+hosted R-016/CI/CodeQL/PR                                                                      | bütün acceptance       |

Worktree kökü `C:\Users\ihsan\.codex\worktrees\HedefOra\W001`: `T04FB`, `T04FB-POOL`, `T04FB-READY`, `T04FB-IMAGE`. Branch'ler sırasıyla `codex/w001-t04f-phase-b`, `codex/w001-t04f-pool`, `codex/w001-t04f-readiness`, `codex/w001-t04f-hardened-image`.

Immutable mevcut SQL değişmez; engine test bir hata bulursa sonraki version/forward-fix sözleşmesiyle giderilir. Protected R-016 dosyaları runtime patch'ine katılmaz. River T04G ayrı owning task/graph admission'ı olarak kalır; sahte production job yoktur.

## Sözleşme ve kabul

### Ara uygulama kanıtı

- Task-open `7cbf26e6605b8129cbeb498cd60984550fd8afad`, dependency pins `9d5c7774f58c67cdf656d457be186876c298e8b1`, manifest-only seal `bb57a51bfe3cd0c3cae6d3197ef2b69462d38b17` (tree `1a55a91ffbd64167bc7f1ebe62d10ab7f9fdcc68`).
- Exact `bb57a51` R-016 `20260906T130505799Z-24384-356bcd77`: FAIL normalized exit 21, OSV raw exit 127. Manifest-only scanner kökünde default govulncheck paket bulamadı. Ayrıca JSON root manifestin 8 third-party girdisini (main dahil extraction 9) içeriyor; selected MVS inventory 16 third-party. Existing parity bu eksikliği de fail-closed reddeder; yanlış PASS yoktur.
- Düzeltme ayrı protected control-plane task'ı `codex/w001-r016-go-graph`, `T04FB-CONTROL`, aynı immutable `7a1e124` base'inden yürütülür. Explicit no-call-analysis, selected-full-graph scanner manifesti/original blob kimliği ayrımı ve transitive-only vulnerability canary gerekir. Pool writer admission geçene kadar başlamaz. Runtime/OpenAPI ve image hazırlığı güvenli paralel kapsamda sürer.
- Two-operation canonical kaynak 8383 byte / SHA-256 `7781c1c2a11b65664bf53d8691c8b2b2602789c4e56f22d901df63763ca451ac`; generated artifact `a1db83acdb832ef09af14f9f05870da71f4b532e72e34aaa19b3d56c54b5aa4e`, yalnız sealed renderer ile üretildi. Pinned Node unit 31/31 ve Spectral exact-diagnostic single-mutation 59/59 exit 0. İlk root testinde node_modules eksikti; frozen install exit 0 ardından yeniden koşuldu. Bu compiler component kanıtıdır; integrated Go/security/review PASS değildir.
- `scripts/check-go-mod.mjs` gerçek consumer kaynaklarını sadece offline tidy aşamasına alır; ağ açık acquisition sadece manifestleri görür. Tidy sonrasında yalnız üç exact security-only pin geri eklenir, indirect metadata korunur ve byte parity aranır. Unit 6/6 exit 0; ayrı tracked pgxpool-consumer fixture'ında gerçek Go 1.26.7 Windows ile checker exit 0. Windows arşivi official `go1.26.7.windows-amd64.zip` SHA-256 `f4f534a486e4bc3387fa18f08208f2f854b7aaea8a08f2a2d829a914a05abb11` byte doğrulamasıyla kullanıldı. Actual integrated runtime checker pool consumer tamamlanana kadar NOT_RUN; varsayılan CI zincirine bağlandı.

`/health/live` DB'den bağımsız; serving 200/drain 503 korunur. `/health/ready` yalnız bounded DB erişilebilirliği, kapalı `status: ready` 200 veya generic mevcut 503; timeout/cancel/drain sonrası success yasaktır. App rolü migration ledger'ını okumaz. Config eksik/bozuk ise startup generic fail; geçici DB kesintisinde listener açık ve ready 503. Pool dışarı connection/credential/provider error açmaz; yeni iş durdurulur, in-flight iptal/release edilir ve close sonlu bütçeyle tamamlanır.

En az wrong CA/hostname/plaintext fallback; ambient PG/service/passfile; secret-canary redaction; acquire/query/cancel/close stress/race; iki-route request/method/path/Accept/error/response union; migration replay/checksum/lock/privilege-negative gerçek engine kanıtı gerekir. Fakes gerçek PG kanıtını karşılamaz.

## Owner onayı ve sınırlar

### 2026-09-06 bağımsız component incelemeleri ve kalan kapılar

- Compiler scoped security PASS: exact `9c3100b7a4944d8a12355208621bc36095c60bea`, tree `a9066551271ffa97565d7027680d9d59c51c44f8`; pinned Node 37/37 (compiler/validator + ilk tidy), Spectral 59/59, generated drift ve Go 1.26.7 generated-package compile exit 0. İlk tidy checker F-01 Medium/High-confidence sebebiyle ortak component verdict FAIL idi; bu geçmiş sonuç saklanır.
- F-01 (`R-025`) acquisition öncesi `replace` inventory denetimi eksikliğidir. `a9e939b76acfccf1cbb348fc5c684450e430d997` / tree `d9af870ba6eb917519b52897ec9e8db476eff78e` offline `go mod edit -json` ile yalnız own Replace=null/[] kabul eder. Bağımsız re-review scoped PASS/CLOSED: unit 8/8, gerçek Go relative/absolute/versioned hostile fixture reddi (acquisition çağrısı 0), benign pgxpool fixture tidy/3-pin byte parity exit 0. Actual integrated runtime full-tree bununla PASS olmaz.
- Image hazırlığı `5848d9c44f02bb7e2a275f8f275292c6398b9503`: exact 53 build/12 runtime APK ve PG17.11 source reçetesi korunur; altı dosya completed/admitted runtime image değildir. Builder canonical scan raw 2: 2 Critical + 7 High (Perl/Bison/binutils), ignore 0. Safe publisher closure bulunamadı; Debian 13 üç paket kökü de vendor kayıtlarında vulnerable. PG tarball Bison/Flex/Perl gerektirir. `infra/postgres/image/README.md` exact digest/advisory/link ve failed-attempt sınırlarını taşır. Son entrypoint sh-n ve input identity/statik kontroller exit 0; runtime OCI yok.
- Gerçek source-build denemesi security sonucu tamamlanmadan başlamış ve `linux/fs.h` eksikliğiyle raw 1 bitmiştir; bu bir admission PASS veya güvenlik kapısının uygulandığına dair kanıt değildir. Halt talimatı geldiğinde build süreci zaten bitmişti. Sonrasında yeni source build veya PG service başlatılmadı. Gelecek kalıcı runner builder admission'ı gerçekleşmeden source build'i başlatamaz. Mevcut SLSA statement subject=[] olduğu için provenance verifier exit 1; statement değiştirilerek sonuç düzeltilmez. Yeni safe closure + Linux headers + yeniden bağlı provenance gereklidir.
- F-02 (`R-026`): henüz entegre edilmemiş image-policy önerisi, APK CPE/origin yokluğu veya yanlış PURL ile coverage PASS verebildi; independent scoped FAIL Medium/High-confidence. 59/59 unit PASS bu semantic gap'i kapatmaz. Düzeltme bağımsız expected metadata, exact PURL/CPE/origin ve APK-specific gerçek canary ister; mevcut PG17.2 source canary APK matcher'ını kanıtlamaz. Remediation sürerken image execution/license admission NOT_EVALUATED, engine kabulü NOT_RUN.
- Ayrı controller exact `5b9dd0b514d5165bb91202ad6113421c0c9d2cd6` / tree `7d4e60e55584499ff1d3840ed968ae89dbb1eb8b`: local full-tree kalite ve independent scoped security PASS; R-016 çalışıyor. Yeni protected controller kodu runtime branch'ine veya trusted main'e katılmadı. Disposable manifest-only candidate `cf58f6601a87d11e2c13a8ece3ca06d1f0c5baec` / tree `a152450eea44ca9fd4721c635c01330c09068fe9`, controller + actual exact pgx graph'ın local R-016 deneyidir; trusted/hosted checkpoint değildir, remote push yapılmaz. İlk candidate apply denemesi base'te go.sum olmadığı için durdu; Add File ile düzeltildi. İlk controller CLI forward-slash executable spelling canonical Windows path denetiminde acquisition öncesi exit 20 aldı; doğru canonical backslash ile yeni run başlatıldı. Bunlar başarılı gate diye sunulmaz.

Bu tarihsel component kaydındaki pool implementation sonradan aşağıdaki checkpoint'te birleştirildi; gerçek PG17 TLS/engine ve bütün Phase B exit kapıları tamamlanmadı. Composer/fixture/mocks üzerinden sahte live PASS üretilmez. Etkin model/effort bütün reviewer/handoff kanıtlarında UNKNOWN/UNKNOWN.

Owner DQ-008 A, DQ-009 A, DQ-010 B ve kesintisiz geliştirme/test/refactor/PR hazırlığını onayladı. Yeni ara implementasyon onayı istenmez. PR #6 için exact merge yetkisi kullanıldı; future main merge için exact-head protokolü korunur, genel geliştirme talimatı sessizce arbitrary-head merge yetkisi sayılmaz. Güvenli paralel hazırlık sürdürülür; başka merge/production yetkisi gerekirse somut exact gate'te gösterilir.

VPS/SSH/DNS/Cloudflare/production mutation yoktur. Yeni image execution ve graph admission sonuçları henüz NOT_RUN; onay bunları PASS yapmaz. Rollback: merge öncesi Phase B branch'lerini terk edip trusted main'i korumak; mevcut immutable SQL/public control plane'e ham revert yapmamak.

## Birleşik runtime checkpoint — 2026-09-06

- Image-policy `a20d3feaa9f32f7040c6ea6043871251a66597e0`: 82/82 unit PASS.
  F-02 bağımsız re-review scoped PASS/CLOSED; origin/canonical PURL/CPE set'i
  independent trusted mapping olmadan coverage kabul edilmez. Gerçek 53 APK
  için trusted CPE mapping NOT_RUN ve coverage FAIL; builder raw2 (2 Critical,
  7 High), license/execution NOT_EVALUATED. Saf policy runner/build admission
  değildir; Compose hâlâ sıfır service.
- Runtime `b4d9d87809b5a0dec6a724d405cc76b6e0adff4f`: 16 pool/config/
  app/cmd/health/http Go dosyası, exact boundary iki script'i ve açıklayıcı
  PostgreSQL README birleşti. Generated iki-health compiler daha önce
  `8a110b7` ile yalnız generator üzerinden üretildi. Root graph güvenlik pinleri
  değişmedi; protected controller eski trusted base byte'larında kaldı.
- Pool handoff patch SHA-256
  `6b5def6a2d3963e125773d7c9c21108d128b6a563f579c36bda6145c1bfec176`;
  pinned Windows/Linux component unit/vet/race exit0. Readiness patch
  `6f8190c374d6d575b271ba455ceac8924511e80067d9a40bce18bf0de9f1208d`;
  root F-03 typed-nil constructor guard + nil/typed-nil regression ekledi.
- İlk integrated Windows Go1.26.7 uncached shuffle bütün-paket koşusu exit1:
  OS Application Control `http.test.exe` ve `repolint.test.exe` yürütmesini
  engelledi. App/cmd/config/health/pool/telemetry ve diğer çalışabilen paketler
  geçti; bu full-tree PASS değildir. Sistem politikası değiştirilmez.
  Exact Linux full-tree/race ve yeni seal kanıtları sonraki kayıtla bağlanır.
- Tracked source/index boundary: pinned Node14 test,12PASS/2 mevcut Windows
  literal-backslash skip; actual generated boundary PASS0, git diff-check0.
  Yeni dosyalar yalnız exact dört Go path'iyle allowlist'e eklendi.
- Config API, bütçeler, DNS tek-IP seçimi, actual close completion ve logging
  sınırlamaları `infra/postgres/README.md` içinde belgelenmiştir. Synthetic
  wire tests gerçek PG authentication/ACL/migration kanıtı sayılmaz.
- Ayrı PR #7 exact20e91 controller hosted R-016/CodeQL SUCCESS; ancak actual
  hosted quality Go1.26.0, canonical1.26.7 değil. Fresh cold verdict FAIL;
  fix ayrı control branch'inde yapılır. Eski hosted success kayıtlarından
  kanonik Go1.26.7 admission sonucu türetilmez; pinned local kanıtı ayrıdır.
  Yeni source R-016, trusted runtime PR, full Phase B exit ve deployment
  bu checkpoint'te NOT_RUN/BLOCKED_EVIDENCE kalır.

## Exact43 yerel kalite ve güvenlik kanıtı

- `43d419da9027a8fb88fbf2e7c70705d8213742ed`, tree
  `4ce08b9c304605015d9619379a758432bd933873`; immutable source/index temiz.
  `6131759` üzerinden yalnız JSON seal; W001 continuous ownership ve
  historical W000 immutable/merge-wrapper exit0.
- Fresh detached kalite clone'u `hedefora-runtime-quality-d1fe7fd6e24f4e948e982c8edaa2333b`.
  `quality-proof.json` SHA-256
  `4c04c9bed7ac4ef11f6131b540da0ef823702171a0ea4ae76f1c5ed5d39bc5f0`,
  26 sealed log rehash mismatch0.
- Node24.20.0/pnpm11.24.0 frozen install + `pnpm ci:check` exit0:
  272 repository test,270PASS/2 mevcut Windows literal-backslash skip;
  web3/3, scaffold coverage100%; Spectral59, exact generated/boundary ve
  actual Go tidy/security-only üç pin parity PASS. CI log
  `13b49bf7dc423f1fc5b075220e98b3e6529532b2ac253f3d09ffd9051a72097c`.
- Pinned Linux Go1.26.7, RO source/module cache ve ağ kapalı:25 tracked
  gofmt; mod verify/list/build/vet/uncached-shuffle/race exit0;101 üst düzey
  test normal ve race koşusunda geçti. F-03 nil/typed-nil regression PASS.
  Go log `29a033b872608b5b86331401886d9a8f6581684c244c505843c6dc3559cf5cfc`.
  Cache metadata-write uyarıları korundu; offline/RO sınırı gevşetilmedi.
- Linux Node24.20.0 official archive SHA-256
  `855d581f8a4eb1a8117e3426de25fe02770592febcfb31369aee1ffbfee9e8ec`;
  exact boundary14/14/skip0 ve actual source boundary PASS.
  Log `15fb87e2fd7d8fd7aa9dff90356710bdb48c4cc4ebb65876775f371a50bf7d14`.
- Python3.12.13 TOML4, actionlint1.7.12, Gitleaks8.30.1 history140/bulgu0
  +exact typed-UUID sibling expected raw1, inert Compose services0 ve Git
  integrity exit0. 11 mevcut dangling blob corruption sayılmaz.
- Fresh read-only security scoped PASS, yeni doğrulanmış bulgu0:
  config/PG ambient boundary, explicit CA/SNI/TLS, bounded pool ownership/
  cancellation/actual close, provider redaction, drain/late-success,
  typed-nil ve sealed compiler incelendi. Reviewer Windows scoped Go
  yürütmesinde HTTP testexe OS-blocked; scope vet, compiler59 ve Node
  testleri geçti. Linux bütün-suite kanıtı ayrı kalite koşumudur.
  Reviewer model/effort UNKNOWN/UNKNOWN; gerçek engine admission yoktur.

## Disposable yeni controller + runtime R-016 deneyi

`hedefora-runtime-control-candidate-d7e06a08288b404399f166583ff7e602`
detached `d3938bbf285463dc0d57ec2415f3daddf48062cf`, tree
`b311dff3735092ab06159976f494932e91ddc6ad`: exact43 runtime üstüne
control745'in yalnız sekiz controller/workflow/fixture/schema yolu
apply_patch ile eklendi. Bu clone unpushed ve untrusted'dır; gerçek runtime
branch'inin protected byte'ları değişmedi ve main sahibi gibi davranılmaz.

Canonical local run `20260906T144111466Z-1128-291ec645` PASS0,
19 terminal PASS; source/control exact d3938bb. Evidence SHA-256
`504cb1f88045b79a69d138731e6a3d6fd4880b0dfe52901a11795d7d1ea2078b`,
DB seal `4d4c45f713b90d3d99cebb2cddf55606e49b0279209717dd29967af06866079e`.
Strict JSON schema True/0;426/426 regular bounded raw size/SHA rehash
mismatch0. Selected MVS17total/16thirdparty, scanner manifest678byte
`9fcca37de4ca5682de3b87247fb5d3c57a061cb4c172cdd91086cfe45a986c08`;
inventory `13ae19001033ab3cc48d63c04df4f3aeabb2c67c91715f7d333bdd1804671670`.
All-scope vulnerability/license/SAST PASS yalnız bu exact deney içindir.
VisibilityProof=false/local-declaration, hosted/trusted authority değildir.

Bu kanıt-promotion ve sonraki seal için yeni exact local kalite tekrarı
gereklidir. Runtime trusted R-016/hosted/CodeQL, owner merge/post-merge ve
gerçek PG17 auth/roles/migrations/TLS gate'i pending kalır. CPE-policy
hardening canlı image/engine completion olarak sunulmaz. Merge öncesi
rollback coherent runtime/dependency/compiler slice'ını birlikte terk
etmektir; immutable SQL, veri, production veya remote main değiştirilmedi.

## PR #7 owner merge ve yeni trusted checkpoint — 2026-09-06 UTC

Owner exact `7459265b2f5744d7aa40feddfc85cb8fcabb8567` head'ini onayladı.
GitHub merge API exact SHA ve merge method ile PR #7'yi
`2026-09-06T20:43:41Z` tarihinde `aba3d13ed057bbe80a2e67486058180479c3c50e`
olarak birleştirdi. Ordered parents `7a1e124e432b51694e7d60c0d3d1589867a8835f`
ve approved head; tree `ed51da48638d362ff52169658321604dedba442a` approved
head ile birebir eşleşti. `git diff --exit-code <head> <merge>` exit0;
authenticated API repository ID1349011765/full-name/public/main ve remote
main exact SHA doğrulandı. Squash/rebase kullanılmadı.

- Clean detached local quality proof SHA-256
  `cdbfbc3b1222e61a498f1f26ce08ca903b475926f232dd02a3ea426e5ab5c75f`:
  Node24.20.0/pnpm11.24.0 frozen install + ci:check0; repository183PASS,
  iki mevcut Windows skip; web3/3/scaffold coverage100. Linux gerçek
  Go1.26.7 fmt/verify/tidy/list/build/vet/uncached-shuffle/race0;
  historical W000 ve W001 actual merge-wrapper0. Python3.12.13 TOML4,
  actionlint1.7.12, Gitleaks8.30.1 history0 + typed-UUID canary raw1,
  inert Compose services0 ve Git integrity0. 32 artifact rehash mismatch0.
- Hosted CI34058883228: boundary101555710561, quality101555721224,
  R016101555721226 SUCCESS. Go1.26.7 early identity assertion gerçekten
  fmt/build/test öncesinde çalıştı; Linux repository185/185/skip0,
  web3/3, Go build/vet/shuffle/race ve W001 merge-wrapper PASS.
  R-027 historical Go1.26.0 sapması bu yeni exact checkpoint'te giderildi;
  eski PR #6 hosted execution SUCCESS geriye dönük toolchain PASS olmaz.
- CodeQL34058882911 exact main: Actions1732710335, Go1732710945,
  JavaScript1732711501, Python1732710770; success, result/open-alert0,
  error/warning boş.
- Local R016 `20260906T204513572Z-15156-0e1aa4b5` PASS0;
  evidence `dffe8f46649e4abe092f0daffcc27373a640e2e4e9546ac97116abef845a5839`,
  DB seal `cd59119d982537ffe5e522d64974756f477ed681cbedba26b968f66b0be32466`.
- Hosted artifact9996847268, ZIP209970byte SHA-256
  `f21fa3135c5b45bc32465e0e3e6dd1aff91bcf2c8f2aaf13dcfa01bf69472716`;
  evidence `1f196f05e591bb1e5bd880afd88536c2d71ab4df41ed11f4a5e4d0c7b1b36652`,
  DB seal `95e4e8e6e74752b08675537498d11877db81e6e2b7ad2ac02b3beec1c2b8834c`.
  API binding/ZIP CRC/410 regular files; iki koşumda408raw/204process/
  19terminal/90blob/206index/31protected entry independently replayed,
  mismatch0/schema0. Transitive canary12/12, raw1; production rejection20
  korunur. Artifact visibilityProof=false; authority authenticated API
  zinciridir, artifact claim'i değildir.
- Hosted verification report SHA-256
  `4af0b0bc9fe2de4afd26ed16775a9b4ed452eba4cfa29c51ec17b1247f02f87e`.
  İlk iki proof-adapter failure kaydı korunur; final pinned-Node replay0.
- Fresh independent cold reviewer exact merge için PASS verdi; parent/tree,
  local/hosted raw evidence ve gerçek hosted Go kimliğini yeniden doğruladı.
  Reviewed control code approved head ile content-identical; yeni source
  diff yoktur. Model/effort UNKNOWN/UNKNOWN; source mutation0.

DEC-026 ile continuation task-phase/trusted controller base artık aba3d13.
Mevcut02ef7cf runtime first-parent zinciri korunarak merge edilir. Dört
governance conflict semantik çözülür: release ledger iki dalın tarihsel
satırlarını korur, risk kayıtları birleşir, current base ilerler; ownership
JSON için ilk dar runtime-chain önerisi aşağıda kaydedilen ancestry kontrolünü
geçmedi. İki dalın immutable dar manifestleri Git tarihinde korunur; yaşayan
manifest ortak7a1e124 → f19cca1 graph-reconciliation envelope'ını kullanır.
Eski writer worktree'leri yeniden açılmış sayılmaz; continuation'da root
tek source writer, diğer ajanlar immutable-source TEMP proposal/read-only.

Bu admission yalnız control checkpoint içindir. Image/live SQL/TLS/Phase B
completion değildir. R-014 server-side enforcement BLOCKED_EXTERNAL kalır;
Semgrep/deps.dev/publisher provenance residual'ları değişmez. Production,
VPS/SSH/DNS/secret/data mutation yoktur. Public repository'de eski unsafe
control'a ham revert yasaktır; hata halinde runtime ilerlemesi durdurulur ve
trusted main korunur, gerekiyorsa reviewed forward-fix/control owner gate'i
açılır. Sonraki PR hazırlanabilir; yeni exact-head main merge ayrı owner gate.

## Runtime integration seal ve ayrı trusted-controller kanıtı

`f19cca198e7236e15f2ac7d764c12f8312b0f348` runtime integration merge'inin
ordered parents'ı `02ef7cf2379c563d398571a6f439920331e16a80` ve trusted
`aba3d13ed057bbe80a2e67486058180479c3c50e`'dir. Bu runtime integration
merge'i content-identical owner/main merge diye sunulmaz. İlk a3c0b919
manifest-only seal (tree1d0c40d27faba492b815532b43b5b2298d8f11a9),
02ef7cf → f19cca1 dar18-path aralığını hatalı modelledi. Önceki metindeki
continuous ownership0 iddiası geri çekildi: birden fazla komut içeren shell'in
son başarılı okuması, repolint'in exit sonucunu örtmüştü. Non-main paketi
hedefleyen ilk komut da exit1'dir. İzole gerçek CLI,5e8e599 üzerinde exit1:
77c8a2c374a92fabb8642a1731d3011ca6208a84 reachable fakat02ef7cf'nin
descendant'ı değil. Node/R-016 ayrı sonuçları bu ownership hatasını kapatmaz.

R-023'teki mevcut graph-reconciliation yaklaşımı uygulanır: ortak7a1e124
prefix'i korunur,7a1e124 → f19cca1 içindeki24 reachable commit'in her birinin
first-parent diff endpoint union'ı exact65 path olarak mühürlenir. Bütün
commit'ler ortak base'in descendant'ı olmalıdır; validator veya eşik değişmez.
Runtime02ef7cf ve control7459265 dar manifestleri immutable tarihsel kanıttır.
Aggregate yalnız bu kapanmış aralığa aittir, gelecekte yazma yetkisi değildir.
Yeni manifest ve izole exit doğrulaması tamamlanmadan PASS iddiası yoktur.

Exact a3c0b91 Node24.20.0/pnpm11.24.0 `ci:check`0: repository274PASS,
iki mevcut Windows literal-backslash skip; web3/3/scaffold coverage100,
Spectral59, deterministic generated parity, canonical security-pin tidy,
licenses/audit0. Log SHA-256
`0cd988df062ea284b83392245ca4d9e893a8ed7797c9f65bec2de7a272c15336`.
Bu Node gate'i yeni exact Linux Go veya hosted gate'in yerine geçmez.

- Self-control local R016 `20260906T210416303Z-25224-fe87e11e` PASS0,
  source/control a3c0b91,426raw/19terminal/schema0, rehash mismatch0;
  evidence `24bdf0a2416e2d5c344f2a1e2c7aa4e75f10b430f20f5bbf9c7f06ee87c07fcf`,
  DB seal `ab95965405bb29208664f1be29bdd443f5240fc2970866cb0ed27c949d4eae67`.
  İlk CLI aynı source root'u controller olarak kullanır; environment'taki
  farklı EXPECTED_CONTROL_SHA onu ayrı trusted-controller koşusu yapmaz.
- Ayrı admitted aba3d13 clone'undaki immutable runner modülü ile target
  a3c0b91 üzerinde `executeSupplyChainGate`:
  `20260906T211005393Z-17284-68e5f41b` PASS0. Source224tracked/tree1d0c40,
  control206tracked/treeed51da4;456raw/19terminal/schema0, rehash mismatch0.
  Evidence `5c0f1a070de8aee478d72cf970e4f4851a307775478cf21c03e251f76294c924`,
  DB seal `791d4539962aa3639667ed7f730b54e333731bd8c9db78034c085d3750edb568`.
  Target protected workflow/controller/fixture/schema bytes aba3d13 ile
  exact parity'dedir. Local declaration/visibilityProof=false korunur;
  bu hosted PR authority veya Phase B completion değildir.

## PG17 alternatif araştırması — yalnız veri edinimi

İki public hazır aday exact manifest/config/layer/diff-ID/SBOM kimliğiyle,
pinli Syft1.51.1/Grype0.118.0 ve fresh DB üzerinden çalıştırılmadan tarandı:

| Aday linux/amd64 manifest                                                                          | Gerçek sonuç                                                               |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Official17.11-alpine3.24 `sha256:7456ef82e5f5bc43d997f4781bbd7c0d6389bff397564649a356e206ba473aee` | raw2;5Critical/41High/3Unknown; related CVSS dahil49blocking; ignored0     |
| CNPG17.11-minimal-trixie `sha256:74bd7677a9d9bde0258dc3593106539a1fd5a0b23fecb4ee97dfb67589f8b6f2` | raw2;27Critical/107High/16Unknown; related CVSS dahil184blocking; ignored0 |

Chainguard public exact17 HTTP404; DHI17 HTTP401, credential alınmadı.
Fresh Linux Grype DB import0; hydrated DB SHA-256
`b46475b87396aac20557f409356989900390786038759b213dc69a057051b598`
scan öncesi/sonrası byte-identical. Araştırma evidence-index
`4a85768d11280cbced3e489c394668c1fbf0a5f0e200cbdbad645869da4e196a`,
67artifact rehash0mismatch; scan-proof
`e999dcd71d4104b3f566b7b8338e989a87b2c720a118ec1d9768b6d81efcf46f`.
İlk Windows DB activation failure/raw1 korunur; Linux import0 ayrı kanıttır.
Araştırmanın Node24.19.0 completion'ı repository24.20.0 gate'i sayılmaz.

İzolasyon kararı: non-root/read-only/cap-drop/network sınırları ek savunmadır;
mevcut High/Critical/unknown/CVSS bulgularını ortadan kaldırmaz. Failed
source-builder ve bu iki hazır image çalıştırılmaz; eski9builder bulgusu
başka profile geçilerek kapatılmaz. Owner'ın güvenli alternatif araştırması
onayı kapsamında signed precompiled APK + data-only reproducible OCI
assembly profili hazırlanıyor. Yerel builder çalışmadığı kanıtlandığında
yalnız o yeni profile ait builder gate gerekçeli NOT_APPLICABLE olabilir;
publisher/source, full OS/binary inventory, independent CPE parity, iki PG
source-family17.11/18.6, fresh scan/canary, license ve execution review
kapıları korunur. Source-build policy ve eski FAIL kanıtı değiştirilmez.

İlk yeni28signed-APK closure taraması raw0/3Medium/2Low/0blocking/ignored0
verdi; bu yalnız olumlu araştırma sinyalidir, execution admission değildir.
Source-family libpq18.6, signer trust anchor ve APKv2 RSA-SHA1 legacy
sınırı ayrıca incelenir. Package scripts, builder ve PostgreSQL çalıştırma0.
Yeni runtime profilinin/test runner'ın source integration, independent
security review, gerçek engine ve final hosted PR kapıları pending'dir.

## Gerçek-engine test kaynağı hazırlığı

Altı `TestPG17*` girişini içeren `pool_integration_test.go` ve
`api_integration_test.go` yalnız explicit integration build tag'i altında
çalışır. Eksik admission/fixture fatal'dır; tag tek başına image execution
yetkisi değildir. İzin veren launcher henüz bağlanmadı. Gerçek PG17 TLS ve
SCRAM, ambient discovery, kapasite/deadline/reuse/actual close, in-flight
cancel, DB outage/recovery ve drain/late-success matrisi hazırlanmıştır;
bu kaynakların varlığı gerçek engine PASS oluşturmaz.

Go-stdlib `tlsfixture` yalnız Linux/private temporary parent700 altında yeni
directory700/files600 üretir: ECDSA P256, serverAuth, loopback SAN, ayrı
wrong-CA/wrong-host ve bir saat expiry. CA private key saklanmaz. Maintained
Linux unit'leri chain/key/usage/time/SAN/mode ve existing/relative/outside/
symbolic/non-private parent reddini doğrular. Runtime API veya dependency
eklenmedi; yalnız dört exact Go test/tool yolu boundary'ye eklendi.

Root draft review plaintext-auth witness'ı mevcut fixed hostnossl-reject HBA
ile çeliştiği için değiştirdi: negatif ssl=off engine gerçek SSLRequest'e N
yanıtını verir, runner ayrıca local SCRAM socket ile exact version/ssl=off
gözler. Test için bile plaintext authentication açılmaz. Uzun pg_sleep testi
caller/lease iptalini ölçer; otomatik server-side SQL abort iddia etmez ve
yalnız exact same-role sentetik query cleanup'ını açıkça doğrular.

Integrated pending-index component koşumu: pinli Linux Go1.26.7,
network=none/read-only source+module cache/cap-drop ALL; TLS generator gerçek
unit0, iki tagged package compile-only `-run '^$'`0 ve tagged vet0. Log SHA
`66a58bc34c617a7d4ef3332bfd6b4e830f299d6a9764510f693734ec2fb624c7`.
Compiler çıktısındaki no-tests-to-run canlı test değildir. Node exact
boundary gate0; önceki üç-dosya boundary testinde12PASS/iki mevcut Windows
skip vardı; dördüncü Linux-only unit yolu sonrasında full-tree ayrıca
yenilenir. Gerçek PG17 image import/start/live SQL/race henüz NOT_RUN.

## Ownership düzeltmesi ve SQL test entegrasyonu

Graph-reconciliation manifest-only commit
`27a7e9fbe97935eb7aca5f1e5202c1c49ae9e891` üzerinde izole canonical
`go run ./tools/repolint/cmd/repolint -manifest state/W001-OWNERSHIP.json
-all -base bde560f182032e1e4ec9f1a1b02db4cd8ec5e99b -head HEAD`
gerçek exit0 verdi. Verified-through b4dd51a, yalnız JSON trailing path1;
log SHA-256 `b349cbe03c4a746fb1e00bed4c3e46bbc43e365ed3e5ba30c5e970b254612e5c`.
Bu sonuç eski a3c0b91/5e8e599 ownership failure'ını geriye dönük PASS yapmaz.

`tests/integration/postgres/live-sql.mjs` yeni gerçek-motor acceptance
matrisidir; kendi process/filesystem/network yeteneği yoktur. Caller yalnız
admitted immutable image ve kendine ait sentetik boş DB ile kullanabilir.
İlk bağlantıdan önce gerçek static checks + exported collectMigrationPlan
zorunludur; modül immutable up/down SHA ve exact v1 planını ayrıca doğrular.
Üç gerçek LOGIN/SCRAM, readonly NOLOGIN/null-verifier, DB/schema/object/default
ACL,16 advisory overload, migration v0/up/down/rerun/atomicity ve gerçek
backend/lock/statement/idle timeout kanıtı gerekir. Superuser SET ROLE,
gerçek LOGIN yerine sayılmaz; readonly capability ayrı bağlamdır.

Executor shell=false/bounded/no raw error disclosure olmalıdır. Başarı da
hata da explicit PostgreSQL origin ister; timeout/cancel/channel loss
beklenen SQLSTATE sayılamaz. Startup SQLSTATE yalnız benzersiz application
name ve owned-server log korelasyonundan gelir. Persistent session query
aynı backend'i korur; client disconnect sonrası bağımsız admin backend ve
lock yokluğunu doğrular. Ham password/SCRAM verifier rapora taşınmaz.

Integrated source Node24.20 `--test live-sql.test.mjs run.test.mjs
scripts/check-generated.test.mjs`:40test/38PASS/iki mevcut Windows skip,
exit0; SQL-only18/18PASS. Test gerçek repository planını kullanır ve başarılı
fake-engine matrisi üretmez. Log SHA-256
`e6c3dd3ef98b2c3d5e5c7f96755d37e821c8ceacdf8a81554411808778ffc004`.
SQL kaynakları ve init/checksum sözleşmesi değişmedi; yalnız canonical plan
collector export edildi. Bu unit/static sonuç gerçek PG17 PASS değildir.

Alternatif28-APK adayının supplemental XMLsoft upstream CPE taraması raw2
verdi:9match/4High. `libxml2.grype.json` SHA-256
`9ea118178e01d296c769de2b6d8dbe75035d6d6af4a5a45087cd28423a404984`.
Önceki package-SBOM raw0 tek başına tam admission değildir. Backport/package
attribution incelemesi sürer; findings silinmez, VEX/ignore/threshold waiver
yoktur ve aday image execution BLOCKED_SECURITY kalır.

## 2026-09-07 — Stage S ve kapalı live-runner entegrasyonu

Continuation source başlangıcı `2ee64c140b0812e6b0eae63c6a7f187a0440a7f9`
/ tree `ab12673cbfeda9d29bfe275cb1a793689f6a483e`; immutable trusted base
aba3d13 değişmez. Root tek repository writer; diğer ajanlar yalnız TEMP öneri
veya salt okunur inceleme sağladı. Etkin model/effort UNKNOWN/UNKNOWN.

Yeni kapsam: `scripts/postgres-image/apk-runtime/` sekiz data-only Stage S
dosyası; `tests/integration/postgres/live/` altı runner/test/sözleşme dosyası;
exact generated-boundary allowlist, package test/CLI ve üç Go test dosyası.
Production dependency, immutable migration, source-builder veya protected
R-016 controller değişmedi. Fixed authority null; public CLI her platformda
exit1/BLOCKED_SECURITY. Private capability allocator/fresh aggregate/license
admission henüz yoktur; bunlar yerel pending iştir, dış engelin kendisi değildir.

Stage S exact araştırma OCI/APK/index/source byte kimliği, bounded immutable
dosya okumaları, signed28-package metadata closure ve984-entry sanal rootfs
bağlarını doğrular; host extraction/package script/image execution yapmaz.
APKv2 RSA-SHA1 legacy sınırı korunur; publisher compiler provenance ve NVD
dictionary completeness NOT_PROVEN, lisans NOT_ADMITTED. Byte replay,
vulnerability veya engine PASS değildir.

Bağımsız bulgular ve dar düzeltmeler:

- F-S01 normalize-before-symlink gizli cycle kabulü: ilk review LOW/High,
  bağımsız boundary investigator Medium/High değerlendirdi; iki verdict
  korunur. Bileşen sıralı çözüm,40-link sınırı, regular-file üzerinden `..`,
  `.`, trailing-slash reddi ve finite-repeat/implicit-directory testleri eklendi.
- LR-01 Medium public CLI export-only exit0: gerçek Node dispatch, generic
  nonzero blocked response ve sahte flag/env regresyonu eklendi.
- LR-02 Medium public runId-derived parolalar/controller authorization:
  her role bağımsız CSPRNG32-byte parola ve private controller token eklendi.
  Tek strict64hex header queue öncesi timingSafeEqual ile doğrulanır. Fixture
  v2 iki Go consumer'ıyla birlikte değişti; token argv/URL/public receipt'e
  taşınmaz. Gerçek loopback missing/wrong/malformed/duplicate token testleri
  callback0, geçerli token normal action/ACK doğrular.
- LR-03 önceki Low/High, son investigator Medium/High kapanış kanıtı:
  yalnız gerçek close olayı connectionClosed=true verir; disconnect belirsiz
  kapanışı false taşır. Missing-close/failed-kill/orphan regresyonu eklendi.
  CLI kapanışı PostgreSQL backend cleanup kanıtı değildir.
- Go engine-evidence F01 Medium/F02 Low: negatif TLS/password öncesi/sonrası
  gerçek SCRAM+TLS sağlıklı tanık ve typed x509/28P01 sebebi zorunlu. TLS
  refusal wire observer plaintext StartupMessage/fallback'i reddeder.
  Query cleanup pg_cancel_backend bool ACK ve bounded inactive gözlemi ister.
  İki helper regresyonu default Go unit kümesindedir. Engine NOT_RUN kalır.

Pre-fix component77/77 exit0 bulguları kapsamıyordu; closure kanıtı değildir.
Dirty-source Node24.20.0 komutu `--test
scripts/postgres-image/apk-runtime/*.test.mjs
tests/integration/postgres/live/runner.test.mjs
tests/integration/postgres/live-sql.test.mjs scripts/check-generated.test.mjs`:
115test/113PASS/iki mevcut Windows skip, exit0; log SHA256
`ed1fb88d4f9a7db97aa0a9971b5bea4c9f7301cb6ee3be4fcd555eb7d3500878`.
Fixed-artifact CLI byte replay exit0:28package/984entry/308link, authority
ABSENT, execution NOT_ADMITTED; transport artifact SHA256
`37f2914ca6eef3cdf9426472688483f6c9001cd1bf5ad9094ed541be4e400a03`.
Linux Go1.26.7 source/module-cache RO/networknone: iki package default
uncached race0, tagged vet0, tagged compile `-run '^$'`0; log SHA256
`dfa33a7330a54d8d1d83f23903cc81c69e5f16a0fdd343f9c499dde14aedbf06`.
Yeni sealed full-tree, independent re-review ve hosted/R-016 henüz bu
component sonuçlarıyla PASS değildir; yeni exact source'a yeniden bağlanır.

Source-builder2Critical/7High ve alternatif signed-APK libxml2 upstream4High
sonuçları korunur. Bounded public minimal/Alpine/signed-index araştırması
admission sağlamadı; dünyada hiç güvenli image yok iddiası değildir.
Threshold/ignore/VEX değişmez. Image import/start, SQL/TLS/SCRAM/pool/readiness
engine matrisi NOT_RUN; Phase B IN_PROGRESS, image BLOCKED_SECURITY.
Güvenli draft PR hazırlanabilir; T04F exit/READY_TO_MERGE değildir. Yeni
exact main merge ayrı owner gate'idir. Rollback: merge etmeme/review'lu dar
revert; immutable SQL ve protected public control-plane korunur.
VPS/production/DNS/SSH/kullanıcı verisi mutation'ı yoktur.

### Tek-cycle candidate review ve hardlink forward-fix

Fresh read-only candidate review exact8f349e/treec37509f (410a17e source parity)
FAIL verdi: F-S01'in type1 hardlink hedefindeki symlink'i dereference etmesi,
Linux inode semantiğiyle uyuşmuyor. `d/s -> ../safe`, `h -> d/s` type1 örneği
ve başka yerde cycle oluşturan yedi-entry varyant kabul edildi; Medium/High.
Mevcut literal artifact pinlerinin aşılabildiği gösterilmedi; authority null.
77 seçili artifactless Node24.20 testinin exit0 sonucu bu FAIL'i kapatmaz.
Reviewer LR-01/02/03 için başka source-backed bypass doğrulamadı; Go gerçek
engine/release/full-tree PASS iddiası vermedi. Dosya/TEMP yazımı yapmadı.

Root, [Linux link(2)](https://www.man7.org/linux/man-pages/man2/link.2.html)
ve [GNU tar hardlink](https://www.gnu.org/software/tar/manual/html_node/hard-links.html)
semantiğini ayrıca kontrol etti. Dar forward-fix type1 hedefini canonical
archive-root-relative, doğrudan type0 regular kayda sınırlar. Symlink,
hardlink-chain, directory, missing ve traversal hedefleri reddedilir;
symlink'in normal dosyaya bağlı hardlink'i izlemesi korunur. İlk pozitif
hardlink-to-symlink örneği yanlış acceptance idi; gerçek regular hedefle
değiştirildi ve iki adversarial örnek negatif regresyon oldu.

`node --test scripts/postgres-image/apk-runtime/*.test.mjs
tests/integration/postgres/live/runner.test.mjs` Node24.20:84/84PASS/skip0,
exit0; log SHA256
`02bc024e7036802d2a28646a4102350ea78bf4bd254b3a523aa925f1fa776800`.
Gerçek sealed-research byte replay yine exit0/28package/984entry/308link;
önceki transport artifact ile birebir aynı SHA256
`37f2914ca6eef3cdf9426472688483f6c9001cd1bf5ad9094ed541be4e400a03`.
Eski8f349e/410a17e reviewer FAIL kaydı korunur; yeni source/ownership/full-tree/
cold kanıtı ayrıca gerekir. Gerçek image/PG execution yapılmadı.

### Alternatif image kanıtının bağımsız salt okunur replay'i

Alpine supplemental HANDOFF SHA256
`c3fcddc9f88cd2cfa2e6d9b92ae8fddf0292bae9634c5ba647b278df31cb3a63`,
evidence-index `2720ea3098be41aa8e16c5dcd021651f6dacc3cb824d550569831d03f3341331`:
24/24 size/hash girdisi ve origin probe24/24 input/report bağı eşleşti.
Wolfi HANDOFF `29ae6d21a0214828cf641c349cbbb553402aeac4c35664e8faf5c80d70697e97`,
index `77cc131f812ee59de1a66ce50d9b68d2e3f24e15e921d7de8f4403ec2016bebf`:
41/41 size/hash girdisi eşleşti; bütün mismatch sayıları0. Bu replay yeni
scanner/DB acquisition veya image admission değildir.

Ham report sayımları: Alpine libxml2 2.13.9 raw2,4High/1Medium/4Low;
supplemental28-APK OS-only raw0,2Medium; gerçek Perl APK canary raw2,
2Critical/1High/1Medium (toplam4match, üç blocking tuple). Diğer11 source
probe raw0; GCC diagnostic1Medium, kalan10match0. GCC compiler kurulu
olmadığından diagnostic runtime-library coverage kanıtı değildir.
Wolfi PG17.10 raw2,16High/8Medium/2Low; libxml2 2.15.4 raw2,1High/1Low.
Bütün ignored0; Grype0.118.0, DB build2026-09-06T06:27:35Z. Hash-bound
scanner `565446b4bc9fd7cc4a72d1066468650eab6941b19ba804ca4649e504c2c2a024`
ve DB `b46475b87396aac20557f409356989900390786038759b213dc69a057051b598`
önce/sonra aynı; replay bu executable'ı yeniden çalıştırmadı.

İncelenen dört signed Alpine x86_64 index'te v3.24/main ve edge/main aynı
libxml2 2.13.9-r2; edge/community/testing libxml2 replacement içermiyor.
Raw High kimlikleri CVE-2025-6021/2026-6732/2025-7425/2026-11979.
Secfix/backport veya eksik utility/libxslt attribution otomatik kapanış değildir;
ham match ile actual installed-code exploitability aynı iddia değildir.
Wolfi signed index'te PG17.11 yok, en yeni aday17.10-r1; sürüm düşürülmedi.
Wolfi indexRSA-SHA256→Q1/SHA1control→SHA256payload bağı, doğrudan APK
imzası veya Alpine ile eşdeğer execution profile kabulü değildir. glibc/
SONAME16→musl/SONAME2 ABI closure doğrulanmadı; recipeHTTP404 ve doğru key'i
doğrulanmamış ek Chainguard index diagnostic sonucu korunur. Lisans28paket/
22origin inventory, tamamlanmış notice/source correspondence değildir.
Image BLOCKED_SECURITY/R-026 BLOCKED_EXTERNAL; source hazırlığı devam eder.

Tool availability yeniden kontrolünde CodeRabbit/Sonar executable veya
bağlı callable gate bulunmadı; tarihsel BLOCKED_EXTERNAL korunur. GitHub
API repositoryID1349011765/public/mainaba3d13 doğrulandı. Hosted runtime
kapıları PR oluşunca yeni exact SHA'ya bağlanacaktır; sahte review yoktur.

### Tarihsel exact410a17e tam yerel kalite

Clean detached410a17e/tree65dee6c için quality-proof SHA256
`dc550ac2fb0e4094403bd333f2d2258d4e866e9379b1be3935a94a3a96ffa558`;
27required gate/30receipt, hash mismatch0. Node24.20/pnpm11.24 frozen0 ve
ci:check0:377test/375PASS/iki mevcut Windows skip; Linux boundary14/14skip0;
web3/3/coverage100. Actual LinuxGo1.26.7 fmt29/module verify/list/build/vet/
uncached shuffle/race/W000 immutable+wrapper/W001continuous ownership0;
tagged vet/compile0. PythonTOML4/4, actionlint, Gitleaks154patch-history0,
typedUUIDcanary raw1, Compose0service, Gitclean/detached/fsck0.

İlk Python ve Node raw1, agent'ın kendi TEMP clone'una eklediği Windows
ReadOnly niteliğinin copytree negatif fixture'a taşınmasından kaynaklandı.
Ara Python DAC_OVERRIDE denemesi raw0 kayıtta korunur fakat final gate
değildir: yalnız own clone dosya nitelikleri ordinary checkout'a döndürüldü,
final Python cap-dropALL/sourceRO ve Node tekrarları geçti. Kaynak/assertion/
threshold değişmedi. Go read-only cache uyarıları ve Git dangling nesneleri
gizlenmedi; ilgili komutların exit0 olması stderr/nesne sayısı0 iddiası değildir.
CI log SHA `f08cc0c4a2afc7c5c83f4ac86802a6c8ac37dfba8158b8225ae22d48724f2ac6`,
Go log SHA `b3a0f4cd8c130919b92ca665220f802b3c91eee9fc5c1772e1dec1d5c5679848`.
410a17e hardlink review FAIL kaydı değişmez; af918cc veya sonraki source
full-tree PASS olarak yeniden etiketlenmez. Yeni exact koşum zorunludur.

### Tarihsel exact410a17e ayrı trusted-controller R-016

Run `20260906T225318213Z-26992-c27d3edc` actual PASS/exit0; source410a17e/
tree65dee6c, ayrı clean controlaba3d13/treeed51da4. Evidence SHA256
`84945372c0ee591bee135a3db30d52ca6ca7ca0ffdaa4ae6c1d3331e151049a3`,
DB-seal `adfcd8bbec8e25312b66bc644465ebafc1cffd0ba19d9cbe6678ec1a225edd6d`,
driver `d532e57dc16570c1bad1bac10269217f2fab8fbbedb327f67d5d944d8a69724b`.
Driver ayrı trusted clone'un run.mjs modülünü import etti; kendi target
runner'ını trusted ilan etmedi. Bağımsız readonly replay exit0:
494/494 saklanan raw stream size/hash,247process,19terminal,13process-backed
terminal stream/exit bağı,120input blob ve31protected path parity; mismatch0.
Disk496file, missing/extra/symlink0; evidence canonical348457byte.

Node24.20/Go1.26.7/OSV2.5.1/Semgrep1.175.0 kayıtlı identity doğrulandı;
vulnerability/license/SAST raw0, canaryraw1, missingDBraw127 korunur.
Replay Node24.19 salt okunur integrity kontrolüdür; yeni kanonik scanner
koşumu değildir. İlk iki replay-helper varsayım hatası raw1, doğru kanonik
protected-set/lock eşlemesi raw0 ile düzeltildi.288redacted stream'in yalnız
saklanan byte'ları doğrulanabilir. DB archive'ları artifact'ta saklanmadığından
yeniden archive rehash/scan iddiası yok; seal ve validator-output bağı
doğrulandı. Local-declaration/visibilityProof=false, hosted authority değildir.
Bu PASS af918cc veya sonraki head'e, PG image veya engine gate'ine taşınmaz.

## 2026-09-07 — PR #8 exact444 checkpoint ve hosted remediation

PR #8 OPEN/DRAFT: `https://github.com/tahackr5/HedefOra-V1/pull/8`.
Head `4446c8f0733a10c5e2191f8c769394ce0e0ad1b3`, tree
`7f3c2730c2bd4bb19ad2f1b0e8bfc378c6eef05a`; base/control aba3d13.
Normal push yapıldı; main merge veya image/PG execution yapılmadı.

Exact444 yerel kalite PASS: proof
`fb1ed0c1eb0d08b0151bd27535095f748a08bff18289bbbb0f598c84fabe1a2b`,
27required/27receipt, bağımsız rehash mismatch0. Node24.20/pnpm11.24
frozen+ci0,378test/376PASS/iki mevcut Windows skip; Linux boundary14/14skip0;
web3/3 coverage100; LinuxGo1.26.7 fmt29/verify/list/build/vet/shuffle/race/
W000+W001ownership0, tagged vet/compile0; Python4/actionlint/Gitleaks157patch0
ve typedUUIDcanary1/Compose0service/Gitclean166commit/fsck0.
CI log `d42ea24a1138abd57513c5a9f85f7a82b13b5ecb8e62f9c752f0128c5c5de586`;
Go log `8d31067c080fcbb0128b69dba7b9cd474f96fbfa189a85d9c792784e1aa6a240`.
Yerel Node gate'i Windows'ta çalıştı; Linux nonroot manifest cleanup kanıtı
değildir. Sonraki hosted FAIL bu yerel PASS ile gizlenmez.

Ayrı trusted-controller local R-016 run
`20260906T230829848Z-27636-17f8ed02`, actual exit0/PASS, evidence
`d5f80c4f48e581d9a05e91515aec4c68ef5dcaa5f534c637b0f610aef90ccc3a`.
Cold readonly replay494/494 raw hash eşleşti; source444/controlaba identity
ayrı doğrulandı. Local declaration/visibilityProof=false hosted authority
yerine geçmez; gerçek PG ve sourcebuilder çalıştırılmadı.

Hosted CI34066149544 quality101575149854 FAIL: Node378/378/Linuxskip0 ve
web3/3 sonrasında check-go-mod finally içindeki genel recursive rm,
Go'nun salt okunur `gopkg.in/check.v1@.../.github` cache dizininde EACCES
verdi. Sonraki Go verify/vet/build/test/race adımları SKIPPED/NOT_RUN.
ActualGo1.26.7 identity/manifest assertion PASS. Ham log SHA256
`16c67c8b469c116f55f9ff8a98f1d603bbfc3a3e1f489aea052b75f71c23ef28`.
CI watch exit1; trusted PR34066167269 watch exit0. PushR016101575149833,
trustedR016101575193759 ve DependencyReview101575193787 PASS; pgpassfile
ve puddle Scorecard uyarıları nonblocking olarak korunur.

Bağımsız authenticated hosted proof: push artifact9999019287,
464raw/232process/19terminal/index244+244; trusted artifact9999024110,
494raw/247process/19terminal/index244+206. İkisinde120blobprocess,
117source/control blob kontrolü,31protected path,562package ve16seçili
Go module; hash/size mismatch0. Verification report
`6f9b3d002d0d0ab5f9bc2054e0e5e84333d4601041620b8e3870be2e8674e3c8`,
final manifest `d3e1b3040c747748b3a3c1c0da7fbf3d72057c6ceae6e79d24198fc03ec39384`.
Artifact visibilityProof=false değişmeden authenticated dış authority
kuruldu. Saklanmayan özgün redacted stream/advisory DB archive byte'ları
yeniden taranmış/rehashlenmiş sayılmaz; seal ve kayıtlı validator bağı doğrulandı.

CodeQL34066165756 executionSUCCESS, exact `refs/pull/8/head`:
Go1732990227 results2, Actions1732989561/Python1732989770/JS1732990267
results0. Alert2/3 `go/incorrect-integer-conversion` high/open'dır.
`refs/pull/8/merge` boş sorgusu doğru ref için sıfır alert kanıtı değildir.
Parent ve fresh investigator decimal→cast→ValidatePostgres yolunu bağımsız
izledi: helper yalnız0 veya izinli aralık döndürür; sıfır reddedilir.
Ulaşılabilir taşma doğrulanmadı (guarded false positive, high confidence).
Cold exact444 verdict FAIL: hosted cleanup ve açık CodeQL gate'i; eski
hardlink finding'i kaynakta kapanmış olsa da owner-ready=false kalır.

### Dar kaynak düzeltmeleri ve acceptance

Orchestrator dört dosyanın tek yazarıdır: config/postgres.go+test ve
scripts/check-go-mod.mjs+test. Sayısal iki dönüşüm önünde literal1..65535
ve1..8 sınırları görünür yapıldı; ortak decimal/RetryAfterSeconds, API,
DB ve generated sözleşmeleri değişmedi. Bu, kanıtlanmış zafiyet düzeltmesi
iddiası değil, hosted static-proof ve uyumluluk regresyon değişikliğidir.
Sarma sonrası geçerli görünen65537/70968/4294967297/4294967304 dahil
overflow, işaret/Unicode/NUL/boşluk/hex/üs reddi; sınırlar/default/uzun
başlangıç sıfırları/generic error ve zero-value dönüşü korunur.

Go cache için yeni canonical mkdtemp child + lstat/realpath dizin kontrolleri,
modules link/dosya/dangling-link reddi, aynı izole offline ortamda exact
`go clean -modcache`, root inode/dev yeniden kontrolü ve sonra outer rm
uygulanır. Cache yoksa Go çağrısı0; clean fail/incomplete dış rm'yi durdurur.
GOFLAGS, checksum verify, timeout, acquisition ve source seal değişmez;
paylaşılan cache, sudo, recursive chmod veya modcacherw kullanılmaz.
[Go cache sözleşmesi](https://go.dev/ref/mod#go-clean-modcache) ile uyumludur.
Path kontrolleri aynı UID'nin eşzamanlı mutation'ına atomik garanti iddiası
taşımaz; source kodu private temp ağacında çalıştırılmaz.

Odaklı Node24.20 test15/15/skip0 exit0, log
`0bebaecf027f5bc00317b239d8f6011b310f443c3403e4ad272c2d93ea0aae30`.
Nonroot Linux UID1001, cap-dropALL, pinnedGo1.26.7 config race exit0,
log `5915c40d121cd7907498c7f18f733faa487f85d799a22df6604c344734db62a1`.
Aynı nonroot/pinnedNode24.20/Go1.26.7 gerçek module acquisition reproducer:
cache mode0555; eski Node rm EACCES, yeni cleanup0/temp absent ve dış sibling
canary unchanged; log
`87949ae151a2d7d78d2eab482f04262b3a226e0b54e636f6eb72428a23a29874`.
Bunlar henüz yeni sealed-head full-tree/hosted CodeQL kapanışı değildir.
Yeni exact seal, nonroot full ci:check, local/hosted/R016 ve independent
candidate/cold review gerekir; geçmiş444 FAIL geriye dönük PASS olmaz.

Rollback ayrı dar revert ve yeni ownership/gate gerektirir; geçmiş ref'ler
rewrite edilmez. Engine/image/Phase B exit NOT_RUN/BLOCKED_SECURITY;
R-026 ve R-014, CodeRabbit/Sonar bağlantı boşlukları korunur. Model/effort
UNKNOWN/UNKNOWN; hiçbir plugin çıktısı taklit edilmedi.

Tek fresh-context read-only post-patch bypass/regression review dört dosyada
somut surviving bypass veya uyumluluk regresyonu bulmadı. Reviewer dosya
hash'lerini başlangıç/kapanışta aynı doğruladı; kendi Node24.19 test15/15
exit0 yalnız supplemental kanıttır, canonical/hosted PASS değildir. Root'un
yukarıdaki pinned Node24.20/nonrootLinuxGo kanıtları ayrı kalır. İnceleme
Go yürütmedi ve source review'u engine/CodeQL kapanışı olarak sunmadı.

## 2026-09-08 — PR #8 owner merge ve post-merge remediation ayrımı

Owner'ın exact `799630bdad8cde8c784bc3a797731d9186bd96e0` onayı yalnız PR #8
head'ini kapsadı. Owner-gate report SHA-256
`cc24192acda6522bc8b6f1a93884c954c04ab821dc07fba70f69f8cead3f904c`.
PR #8, base `aba3d13ed057bbe80a2e67486058180479c3c50e` ve approved head ordered
parents'ıyla `df67eb1d2c59009552602a666f352605494587ce` olarak birleşti. Merge ve
head tree'si exact `c04ce8c0adb6fa9a8ebcb30b3a750f23c6af1857`; endpoint diff boş.
Squash/rebase/admin/auto/delete kullanılmadı, remote `main` exact merge'dir.

Hosted CI `34277066786` exact `main/df67eb1` için source boundary, quality ve
R-016 job'larında SUCCESS verdi. Artifact `10076195679`, 248782 byte, API ve
indirilen ZIP SHA-256
`cb97b0c065f494a1037b3a357cb5447bda7740ebe2843d20a9004bbdc4f5688c`.
486 raw artifact, 243 process, 19 terminal, 99 source + 32 control Git blob,
546 pnpm package ve 16 selected Go module strict replay mismatch `0`.
Evidence SHA-256
`4f23d503dd619c1fb4741552623e7ccd62a100f2e55397769e8ec9370aaf4c93`;
DB seal `9970ee6ba9520611379478e412b76a31ad3552b939d0617061b112c7022fc6a1`.
Bu hosted R-016 alt kapısı PASS'tir.

CodeQL `34277063233` workflow execution SUCCESS olsa da exact merge üzerinde
`js/incomplete-sanitization` HIGH/open alert #5 açtı. Akış yalnız testteki
malformed identity üreticisidir ve independent triage `NOT_ACTIONABLE/high`
verdi; bu sınıflandırma scanner dismissal veya gate PASS değildir. Overall
post-merge security FAIL, `df67eb1` untrusted ve T04G PENDING kalır.

Post-merge local pinned Node24.20/pnpm11.24 `ci:check` PASS: repository
823/825, iki mevcut Windows skip; web3/3, coverage100, build/generated/tidy/
license/audit0. İlk PATH denemesi Node24.19 olduğu için girişte FAIL olarak
korunur. Native pinned Go list/build/vet0; `go test` yalnız Windows Application
Control'ün temporary test executable'ını engellemesiyle FAIL. Ayrı isolated
Linux attempt-01 awk harness hatasıyla raw2 ve gate NOT_STARTED. Attempt-02
exact identity/tree/parents, isolation, Go1.26.7, gofmt29 ve mod-verify PASS;
`go list ./...` sırasında 1201.21s hard timeout, kalan build/vet/test/race/
repolint/integration NOT_RUN. Receipt SHA-256
`ccfac8eea2939098d29b3a7106856757264d3524e8f4e194b264782843b54cda`;
owned container absence ve fresh clone cleanliness PASS. Bu çevresel sonuç
hosted Linux quality PASS'ını veya eksik local kapıları yeniden adlandırmaz.

Canonical engine post-merge A13 `FIXTURE_BUILD_DOCKER_COMMAND`, A14 cleanup
failure ve A15 exact `/source` verifier 30s timeout ile ayrı immutable FAIL.
Public snapshot Windows bind-mount okuması 45–61s ölçüldü; A16 kesin NOT_RUN.
Eski pre-merge A12/`799630` engine sonucu `df67eb1` adına taşınmaz. Docker
Desktop settings deneme sonrasında original SHA-256
`df5418998cadef7eab0a0c89e67a54954b2968437e8ad0367c282731f77c6bc0` byte'ına
geri döndü; container yokluğu doğrulandı. Silinmeyen stale runtime klasörleri
recoverable host diagnostics'tir. DEC-031 expiry
`2026-09-10T06:30:10Z`, run budget 20 dakika ve Grype FAIL değişmez.

Dar forward-fix `4d62c24c7ebf6a9e5cdfd9a5dca26b751d1caf86` yalnız
`tests/integration/postgres/live/runner.test.mjs` değiştirir. Test helper'ı
exact `"] ERROR:"` structural delimiter'ını bulup yalnız kapanış `]` byte'ını
slice eder; message body içindeki başka `]` byte'ının korunduğu regresyon
eklenmiştir. Focused Node24.20 test132/132 PASS. Full gate'in ilk denemesi
canonical Go PATH eksikliği, sonraki iki denemesi yanlış Node24.19 lifecycle
seçimi nedeniyle FAIL olarak korunur. Exact shim ile Node24.20.0,
pnpm11.24.0 ve Go1.26.7 doğrulandıktan sonra `pnpm ci:check` exit0:
826 toplam,824PASS/iki mevcut Windows skip; web3/3/coverage100 ve build/
generated/go-mod/license/audit PASS. Final ownership seal, exact local R-016,
fresh security/cold, hosted CI/trusted R-016/Dependency Review/CodeQL ve yeni
exact-head owner merge gate'i henüz NOT_RUN. PR #8 onayı bu yeni merge'i
kapsamaz; production/deployment/SSH/DNS/secret mutation yoktur.

## 2026-09-09 — PR #9 S1 hosted PASS, security/cold FAIL ve S2 remediation

İlk sealed checkpoint S1 `7545583cf1d88a6e7604ce23b431f7ea4145b09f`
üzerinde hosted CI `34287282561` ve trusted PR `34287323088` SUCCESS oldu;
trusted koşumdaki Dependency Review de PASS'tir. CodeQL `34287321357` exact
`refs/pull/9/head` üzerinde Actions, Go, JavaScript/TypeScript ve Python için
`results_count=0`; PR/head ve branch ref açık alert listeleri boştur. Main'deki
alert #5 merge'e kadar tarihsel `df67eb1` ref'inde açık kalır; dismissal veya
suppression yapılmadı.

Push R-016 artifact `10080010444`, 248802 byte, API/indirilen ZIP SHA-256
`d269f19e47f1913a26b76cd68a8565c0129bc7e6f8a92ab04723cf2ed7084624`;
evidence SHA-256
`16d43242d2b635ee1c45828e110cca8c25580c60b4b73439f018ba5243b98c98`, DB
seal `21e89d877179c1a54b5ffb9e2fe562119ee5f8488279019b574dcf547f27af25`.
Trusted artifact `10080032714`, 279361 byte, API/indirilen ZIP SHA-256
`cbc61f5f07064ec1e417e4fc119499cdc39e975728e3662b580bb9df9d45aacd`;
evidence SHA-256
`e602a8bb4b4d13d7389ba6806629dba21d4f4fd285cc8ed844d61866892e5776`, DB
seal `b5c089b606ee91cb431e47424d116ab42788c4629a3c31a0373aa4851819e2a4`.
İki ZIP'te path/link/collision/file-set/hash/size/process/terminal ve DB-seal
strict replay mismatch `0`; sırasıyla 486 ve 516 raw artifact doğrulandı.

S1 local pinned `ci:check` exit `0`: repository 824 PASS/iki mevcut Windows
skip, web 3/3, coverage %100, generated/build/Go-mod/license/audit PASS.
Pinned Go 1.26.7 gofmt/mod/list/build/vet/test PASS; native race Windows cgo
gereksinimi nedeniyle koşmadı, hosted Linux race PASS'tir. Local R-016'nin
ilk iki denemesi yanlış repository full-name ile acquisition öncesi
fail-closed kaldı. Doğru identity ile üçüncü koşum 394 raw artifact sonrası,
S1 review FAIL geldiği için bilinçli durduruldu; `evidence.json`/final sonuç
yoktur ve PASS değildir.

Fresh security ve cold reviewer, `FIXTURE-CONTRACT.md` verbose prefix/body
SQLSTATE equality şartına rağmen ordinary native korelatörün yalnız prefix'i
güvenilir saydığını doğruladı. Doğru app/user/database prefix'li `42501`
satırında eksik body state veya body `28P01` olsa da `42501/origin=postgres`
üretilebildiği için F-01 MEDIUM, HIGH-confidence, CWE-20 ve release-blocking
olarak kaydedildi. Bu test-evidence integrity açığı `df67eb1` tabanında da
vardı; production runtime etkisi doğrulanmadı. S1 merge adayı değildir.

S2 `758b86ba38db0c3172dafb2540f6d7c33f74df76`, tree
`97b86c17c43a2711fefe16d47a27cb62be320efc`, yalnız
`tests/integration/postgres/live/{process.mjs,runner.test.mjs,fixture-container.test.mjs}`
yollarını değiştirir. Target-app `ERROR/FATAL/PANIC` kanıtında exact verbose
body state zorunludur ve prefix ile eşit olmalıdır; missing/mismatch veya
valid+malformed birleşimi `null/origin=channel` ile fail-closed olur. Unrelated
app ve `NOTICE/WARNING` kanıt yetkisi kazanmaz; farklı iki geçerli state'in
ambiguity hatası korunur. Exact Node 24.20.0 iki-file suite `322/322`, focused
regression `9/9`, Prettier ve `git diff --check` PASS. Yeni evidence commit,
manifest-only seal, full-tree, local R-016, gerçek PG engine, hosted kapılar
ve fresh final review'ler henüz NOT_RUN; önceki sonuçlar S2 adına taşınmaz.
PR #8 onayı PR #9'u kapsamaz; production/deployment yetkisi yoktur ve T04G
PENDING kalır.

### S2 temporal pre-seal FAIL ve terminal remediation

S2 `758b86ba38db0c3172dafb2540f6d7c33f74df76` pre-seal read-only review,
native 500 ms polling sırasında malformed target line'ın sonraki snapshot'ta
kaybolması halinde taint'in korunmadığını buldu. Exact Node24.20 probe,
başlangıçta prefix `42501`/body `28P01`, 40 ms sonra yalnız valid
`42501/42501` satırı verildiğinde yanlış `{origin:"postgres",
sqlState:"42501"}` döndürdü. S2 aynı-snapshot düzeltmesine rağmen temporal
fail-closed acceptance'ı karşılamaz ve merge adayı değildir.

Commit `393e32b9082040aa654a4abe0c97eec89b50bb7a`, tree
`1133bf59f7da0dc81cf000a8a7b1656995850b65`, parent S2; yalnız
`tests/integration/postgres/live/{process.mjs,runner.test.mjs}`, +43/-31.
Canonical olmayan, prefix/body state'i uyuşmayan veya `00000` taşıyan target
`ERROR/FATAL/PANIC` artık typed `SQLSTATE_INVALID` ile terminal olur; yalnız
eligible kanıt bulunmaması `null` kalır. Psql core bu hatayı public
`origin=channel/sqlState=null` sonucuna kapatır. Unrelated application ve
`NOTICE/WARNING` ayrımı, partial-tail retry ve distinct-valid ambiguity
korunur. Malformed satır kalsa da kaybolsa da missing/mismatch + valid
matrisi eklendi. Exact Node24.20 iki-file suite `326/326`, Prettier ve diff
check PASS. Yeni state/ownership seal ile bütün exact local/engine/hosted ve
fresh review kapıları NOT_RUN; eski S1/S2 sonucu bu head'e taşınmaz.

## 2026-09-09 — S5 hosted PASS, local/security FAIL ve e0 remediation

S5 `dbd52ad9dbc9899b954db0ceb5082a024b0543d4`, tree
`cddba11f3904277447f0881aa49bb12da96f9624`, CI `34293730275`, trusted
`34293730907`, Dependency Review ve CodeQL `34293730446` kapılarında PASS;
push/trusted R-016 artifacts `10082370198`/486 raw ve `10082370086`/516 raw
strict replay mismatch `0` oldu. Bu exact hosted sonuçlar S5 overall veya
sonraki source head için release PASS değildir.

İki S5 local R-016 koşumu
`20260909T000509360Z-26012-3d47a01e`/600541 ms ve
`20260909T002533804Z-32464-fb473dae`/600481 ms sürelerinde OSV DB ZIP
validation timeout/SIGKILL ile exit `21` verdi; FAIL evidence ve container
absence korundu. Alternatif WSL UNC bind probe'u missing Docker Desktop
distro-service socket nedeniyle exit `127`/NO-GO; full R-016 çalıştırılmadı,
host ayarı değiştirilmedi ve cleanup tamamlandı.

Fresh security S5-A08-01, ordinary native poll'un ilk geçerli SQLSTATE'te
close+500ms penceresi dolmadan dönerek gecikmiş malformed/conflicting severe
kanıtı kaçırdığını 15/15 ERROR/FATAL/PANIC varyantıyla doğruladı;
MEDIUM/HIGH-confidence CWE-367/CWE-20 ve S5 FAIL'dir. Source
`e0e01321f2070b325348952c4d56be374848942c`, tree
`e3dd8c1cc52983f4a3a6202e8c20b23b0bce5298`, launch-öncesi generation
snapshot'ı, append-only suffix ve sabit pencerenin tamamında tarama uygular.
İncelemede bulunan sub-ms final-snapshot yarışı da deadline sonrası resnapshot
ile kapandı. Exact Node `364/364`, broad PG `653/653`, root PG `26/26`, clean
source `ci:check` 872 total/870 PASS/iki Windows skip, pinned Go build/vet/
shuffle ve source security re-review PASS.

Yeni exact ownership seal, actual engine, local R-016, hosted ve fresh cold
kapıları henüz çalıştırılmadı. Trusted/task-phase base `aba3d13` kalır; PR #8
owner onayı PR #9 S5/e0/final seal merge'ini kapsamaz. T04G PENDING;
DEC-031 expiry/max20m, Grype FAIL, R-026 ve production/deployment yasağı
değişmez.
