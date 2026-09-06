# W001-T04F Phase B — plan, ownership ve kanıt

- Status: IN_PROGRESS; tarih: 2026-09-06.
- Initial Phase B immutable base: `7a1e124e432b51694e7d60c0d3d1589867a8835f`; tree `ec6d12847c657adedbd84e44565598d234c7b928`.
- Current continuation checkpoint: `aba3d13ed057bbe80a2e67486058180479c3c50e`; tree `ed51da48638d362ff52169658321604dedba442a`. PR #7 owner merge ve aşağıdaki post-merge admission sonrasında ilerletildi; mevcut runtime lineage yeniden yazılmadı.
- Historical W001 base değişmez: `bde560f182032e1e4ec9f1a1b02db4cd8ec5e99b`.
- Orchestrator branch/worktree: `codex/w001-t04f-phase-b`, `C:\Users\ihsan\.codex\worktrees\HedefOra\W001\T04FB`.
- Etkin model/effort tool kanıtında doğrulanmadı: UNKNOWN/UNKNOWN; repository config değiştirilmedi, alt ajanlara override gönderilmedi.

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

| Task | Tek writer / branch suffix | Yollar ve acceptance | Sıra |
|---|---|---|---|
| T04FB-00 | orchestrator / phase-b | root governance, `state/**`, `FILE-INDEX.md`, delivery/architecture; DQ onayı ve post-merge kanıtı | önce |
| T04FB-01 | orchestrator / phase-b | `go.mod`, `go.sum`, exact graph pin/tidy checker; all-scope R-016 admission | adapter öncesi |
| T04FB-02 | orchestrator; bağımsız structured compiler proposal | OpenAPI/Spectral, generator/fixtures/tests, contracts README, generated Go yalnız generator ile | DQ-009 A |
| T04FB-03 | backend / pool | yalnız `internal/platform/config/postgres{,_test}.go`, `internal/platform/postgres/pool{,_test}.go`; structured config, verify-full TLS, bounded pool/cancel/close, secret redaction | T04FB-01 PASS |
| T04FB-04 | backend / readiness | `cmd/hedefora/**`, mevcut `config/api{,_test}.go`, `health/**`, `http/**`, `app/**`; iki-operation transport/probe/drain ve failure matrisi | T04FB-02/03 contract |
| T04FB-05 | infra / hardened-image | yalnız `infra/postgres/image/**`; exact source/base/package image tasarımı, inputs/build/entrypoint ve doküman | DQ-010 B |
| T04FB-06 | orchestrator; quality proposal | `scripts/postgres-image/**`, image-specific policy/lock; canonical OS/source-CPE/SBOM/freshness/canary/error gate | image execution öncesi |
| T04FB-07 | orchestrator; quality proposal | `tests/integration/postgres/**`, `infra/compose.dev.yml`, infra/database README; admitted disposable engine empty/up/down/upgrade/privilege/TLS/pool | image security PASS |
| T04FB-08 | orchestrator + read-only fresh reviewers | exact boundary/default gate wiring, ownership seal, ledger/artifacts, full-tree/local+hosted R-016/CI/CodeQL/PR | bütün acceptance |

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

| Aday linux/amd64 manifest | Gerçek sonuç |
|---|---|
| Official17.11-alpine3.24 `sha256:7456ef82e5f5bc43d997f4781bbd7c0d6389bff397564649a356e206ba473aee` | raw2;5Critical/41High/3Unknown; related CVSS dahil49blocking; ignored0 |
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
