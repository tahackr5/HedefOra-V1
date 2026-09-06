# W001-T04F Phase B — plan, ownership ve kanıt

- Status: IN_PROGRESS; tarih: 2026-09-06.
- Immutable base: `7a1e124e432b51694e7d60c0d3d1589867a8835f`; tree `ec6d12847c657adedbd84e44565598d234c7b928`.
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

`/health/live` DB'den bağımsız; serving 200/drain 503 korunur. `/health/ready` yalnız bounded DB erişilebilirliği, kapalı `status: ready` 200 veya generic mevcut 503; timeout/cancel/drain sonrası success yasaktır. App rolü migration ledger'ını okumaz. Config eksik/bozuk ise startup generic fail; geçici DB kesintisinde listener açık ve ready 503. Pool dışarı connection/credential/provider error açmaz; yeni iş durdurulur, in-flight iptal/release edilir ve close sonlu bütçeyle tamamlanır.

En az wrong CA/hostname/plaintext fallback; ambient PG/service/passfile; secret-canary redaction; acquire/query/cancel/close stress/race; iki-route request/method/path/Accept/error/response union; migration replay/checksum/lock/privilege-negative gerçek engine kanıtı gerekir. Fakes gerçek PG kanıtını karşılamaz.

## Owner onayı ve sınırlar

Owner DQ-008 A, DQ-009 A, DQ-010 B ve kesintisiz geliştirme/test/refactor/PR hazırlığını onayladı. Yeni ara implementasyon onayı istenmez. PR #6 için exact merge yetkisi kullanıldı; future main merge için exact-head protokolü korunur, genel geliştirme talimatı sessizce arbitrary-head merge yetkisi sayılmaz. Güvenli paralel hazırlık sürdürülür; başka merge/production yetkisi gerekirse somut exact gate'te gösterilir.

VPS/SSH/DNS/Cloudflare/production mutation yoktur. Yeni image execution ve graph admission sonuçları henüz NOT_RUN; onay bunları PASS yapmaz. Rollback: merge öncesi Phase B branch'lerini terk edip trusted main'i korumak; mevcut immutable SQL/public control plane'e ham revert yapmamak.
