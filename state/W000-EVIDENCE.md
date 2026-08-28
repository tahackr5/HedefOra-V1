# W000 Kanıt Paketi

- Wave: `W000`
- Durum: `IN_PROGRESS`
- Wave başlangıcı: `2efca6c8b65e3342ad5309076b7cd0dedf816943`
- İncelenen hedef: `31d65b8d1287f8caadd276f65f3567eb4af12ca5`
- Integration branch/worktree: `codex/w000-bootstrap` / repository root
- Temiz doğrulama clone'u: `C:\Users\ihsan\.codex\worktrees\HedefOra\W000\VERIFY5-CLONE`
- Kanıt zamanı: `2026-08-28T06:19:10+03:00`

## Sonuç

W000 no-feature monorepo, Codex runtime sözleşmesi, exact ürün toolchain'i, frontend shell, CI/local PostgreSQL ve executable repository gate'leri temiz detached clone üzerinde yerel doğrulamayı geçti. Native Windows reviewer izolasyonu güvenli değildir; gerçek parent-child negatif sentinel yalnız WSL2/Linux üzerinde geçti. İlk fresh-context cold review `FAIL` verdi ve bulgular için remediation uygulandı. Final security re-review, final cold re-review ve GitHub-hosted kapılar henüz çalışmadığı için wave çıkışı verilmedi.

## Kapsam ve sözleşme

- OpenAPI 3.1 kökü additive scaffolding'dir; `paths` ve `webhooks` operation'ları boştur.
- Producer/consumer, generated client, migration veya compatibility window yoktur.
- W001 backend, DB, River, auth, planner veya ürün davranışı oluşturulmadı.
- Frontend yalnız erişilebilir Türkçe no-feature shell'dir; auth, router veya API client içermez.
- Legal/policy rolü ve tüm gelecekteki çıktıları `DRAFT_NOT_FOR_PRODUCTION`; aktivasyon owner gate'idir.
- Rollback, ilgili branch commit'lerini ters sırayla `git revert` etmektir; production mutation yoktur.

## Ajan ve runtime kanıtı

- Hedef project config'i `gpt-5.6-sol` + `ultra` kullanır; custom ajanlar model/effort override etmez.
- Önceki discovery smoke testinde 11 project custom agent'ın tamamı gerçek parent üzerinden üç partiyle spawn edildi: `TOTAL:11/11`. Bu sonuç isolation veya final review kanıtı olarak kullanılmaz.
- Native Windows Codex `0.150.0-alpha.8` üzerinde `unelevated`, permission-profile ve `elevated` denemelerinin tamamında bağımsız canlı loopback listener bağlantı aldı. Native Windows reviewer acceptance için kullanılamaz.
- Kabul edilen tanısal ortam WSL2 Ubuntu 24.04 ve resmi Linux Codex `0.150.0` paketidir: `codex-package-x86_64-unknown-linux-musl.tar.gz`; SHA-256 `2d27b8569ca760eeb2bf21fa12bd31f59ac42b81617b340cf8958e9b38d743d5`; kaynak `https://github.com/openai/codex/releases/download/rust-v0.150.0/codex-package-x86_64-unknown-linux-musl.tar.gz`.
- Parent-child isolation session'ı `01a04644-675d-77a2-b310-022134a064a9`; başlangıç `2026-08-28T02:48:03.008349471Z`, bitiş `2026-08-28T02:48:35.330460524Z`.
- Parent runtime `gpt-5.6-sol`, `approval_policy=never`, `reviewer-readonly`; tanısal isolation koşumunda effort `none` kullanıldı. Bu koşum final `ultra` security/cold review yerine geçmez.
- Hem `cold_reviewer` hem `security_privacy_review` için sonuç: repository read exit `0`; repository write exit `1`; loopback curl exit `7`; isolated credential sentinel read exit `1`; HTTP listener logu `0` byte; probe dosyası oluşmadı.
- Her child envanteri yalnız `apply_patch`, goal/plan, `exec_command`, `view_image` ve `write_stdin` ailelerini içerdi. MCP/app/connector/web/browser/computer/image-generation/plugin yüzeyi yoktu; görünen local write aracı read-only sandbox tarafından reddedildi.
- İzole `CODEX_HOME=/home/ihsan/.codex-hedefora-w000-0150` resolved absolute live deny listesine ayrıca eklendi; portable `~/.codex` kuralının bu özel yolu kapsadığı varsayılmadı. Auth dosyasının içeriği okunmadı veya çıktıya yazılmadı.
- Contract-change positive runtime prompt'u `hedefora-contract-change` seçip skill'i tamamen okudu; sıradan README satır sayımı negative prompt'u `SELECTED_HEDEFORA_SKILL:NONE` döndürdü.

## İlk cold review ve remediation

Fresh-context cold review hedef `8d445875ce63b43eae9056149e7841380a5f3b66` üzerinde `FAIL` verdi. Bulgular sekiz gruptaydı:

1. PR/source ve CodeQL SHA kimliği,
2. merge-wrapper topolojisi ve merge yöntemi,
3. tracked Go format kapısı,
4. OpenAPI negatif fixture,
5. Git-backed marker taraması, ignored directory/case/unknown extension kapsamı,
6. ownership path alias'ları ve tam DAG doğrulaması,
7. evidence boşlukları,
8. repository backup ve GitHub branch-setting kanıtı.

Remediation içerik commit'leri `65b3a13`, `0dfd3a5`, `4a36dfb`, `b7b9519` ve `3820f2d`; ownership seal commit'leri `29ddf3b`, `dc12fa8` ve `31d65b8`'dir. Final bağımsız fix re-review henüz çalışmadı; bulgular `CLOSED` sayılmaz.

## Yerel gate sonuçları

| Gate | Ortam/komut özeti | Sonuç |
|---|---|---|
| Exact install + full JS gate | Node `24.20.0` image digest `sha256:ba849c60...`; pnpm `11.24.0`; Git `2.39.5`; online metadata + frozen lock; `pnpm ci:check` | `PASS`, exit `0`; 527 lock entry ve 4.498 installed file bütünlüğü doğrulandı |
| Repository Node tests | `node --test scripts/*.test.mjs` | `PASS`, 8/8 |
| Frontend test/coverage | Vitest `4.1.11` | `PASS`, 3/3; statement/branch/function/line `%100` |
| Frontend build | Vite `8.2.2` | `PASS`, exit `0`; 16 module |
| OpenAPI positive/negative | Spectral canonical scaffold + path/webhook rejection fixture'ları | `PASS` |
| Generated/no-feature | Exact W000 source boundary; generated filename/marker, inline HTML ve symlink negative fixture'ları | `PASS` |
| Work-marker policy | Code/docs/JSON/HTML/CSS/extensionless, ignored directory ve case varyantı fixture'ları | `PASS` |
| Production license graph | Exact React, React DOM ve scheduler; MIT | `PASS` |
| Dependency audit | `pnpm audit --prod --audit-level high` | `PASS`; bilinen vulnerability yok |
| Go format/module/vet/test | Go `1.26.7` image digest `sha256:e8c859f5...`; tracked `gofmt -l`, `go mod verify`, `go vet ./...`, `go test ./...` | `PASS`, exit `0`; iki package |
| Ownership | Schema v2; `-all -base 2efca6c... -head HEAD` | `PASS`; 15 kesintisiz task + bir manifest-only trailing endpoint |
| TOML | Python `3.12.13` image digest `sha256:4766d8b5...`; validator + unittest | `PASS`; 4/4 test ve ayrı unsafe-boundary subtest'leri |
| Secret scan | Gitleaks `8.30.1` digest `sha256:c00b6bd0...`, committed Git history | `PASS`; 36 commit, yaklaşık 502,10 KB, leak yok |
| Local PostgreSQL config | `docker compose -f infra/compose.dev.yml config --quiet` | `PASS`, exit `0` |
| Workflow lint | actionlint `1.7.12` digest `sha256:b1934ee5...` | `PASS`, exit `0` |
| Diff/worktree | `git diff --check`; detached clone `git status --short --branch` | `PASS`; exact HEAD `31d65b8...`, tracked tree temiz |

## Başarısız veya geçersiz sayılan tanısal koşumlar

- Hedef `dc12fa8` üzerindeki ilk full JS gate'i `scripts/lib/governance.mjs` Prettier farkı nedeniyle exit `1` verdi. Mekanik format `3820f2d` ile düzeltildi; `31d65b8` seal hedefinde format ve tüm zincir exit `0` oldu.
- `31d65b8` için `pnpm install --offline --frozen-lockfile`, publish-time metadata mirror'da bulunmadığı için `ERR_PNPM_NO_OFFLINE_META` verdi ve gate sayılmadı. Online metadata ile frozen install tedarik politikası kontrolünü geçirerek exit `0` oldu.
- Exact Node slim image'ın ilk test koşumu Git binary'si içermediği için iki Git-backed fixture'da `spawnSync git ENOENT` verdi. Aynı digest image'a Git `2.39.5` eklenen CI-equivalent koşumda repository testleri 8/8 ve bütün `pnpm ci:check` zinciri exit `0` oldu.

## Security checkpoint geçmişi

Read-only `security_privacy_review`, hedef `97586859ce272e8390fdf9b405533914f02c3885` üzerinde önceki dört security-fix grubuna `SECURITY_FIX_VERDICT:PASS` verdi. Bu tarihsel checkpoint, sonraki cold-review remediation ve reviewer config değişikliklerini kapsamaz. Exact final hedefte security re-review `NOT_RUN` durumundadır.

## Uygulanabilirlik

- DB migration up/down/upgrade: `NOT_APPLICABLE` — W000'da DB runtime/migration yok.
- River catalog/process tests: `NOT_APPLICABLE` — W001 artifact'ı yok.
- Planner property/golden: `NOT_APPLICABLE` — W002 artifact'ı yok.
- Ürün E2E: `NOT_APPLICABLE` — W000 no-feature shell; mevcut frontend component/a11y smoke testleri uygulandı.
- Staging deploy, DB backup/restore, rollback drill, SLO/alerts: `NOT_APPLICABLE` — W007 kapsamı; VPS'e mutation yapılmadı.
- Repository ikinci off-site kopya + recovery testi: `NOT_RUN` — W001 başlangıç ön koşuludur; W000 local code gate'i değildir.
- GitHub PR CI, dependency review ve CodeQL: `NOT_RUN` — branch push/PR sonrasında doğrulanacak.
- CodeRabbit/Sonar: `BLOCKED_EXTERNAL` — bağlı ve kanıtlanmış servis yok; sahte review üretilmedi.
- Final security re-review ve fresh-context cold re-review: `NOT_RUN`.

## Açık risk ve owner girdisi

- R-001/R-009: ikinci şifreli off-site repository kopyası ve sıfırdan recovery testi yok; W001 başlayamaz.
- R-011: küçük VPS yalnız staging/pre-production; gerçek kullanıcı ve production verisi alınmaz.
- R-012: native Windows sandbox loopback'i engellemiyor; reviewer yalnız executable sentinel geçmiş WSL/Linux yolunda çalışır.
- R-013: kanonik checkout OneDrive altında; temiz doğrulama OneDrive dışı clone'da yapıldı, kalıcı kanonik taşıma W001 öncesi açıktır.
- R-014: GitHub merge yöntemi, branch protection, required checks ve final main merge-wrapper henüz dış sistemde doğrulanmadı.
- VPS secret/SSH bilgisi W000 için gerekmedi ve istenmedi. Staging envanteri W007'ye ertelendi.

## Çıkış için kalanlar

1. Exact final branch hedefi üzerinde WSL/Linux `gpt-5.6-sol + ultra` read-only security re-review.
2. Aynı hedef üzerinde fresh-context WSL/Linux cold re-review ve `PASS` verdict'i.
3. Branch push, PR ve GitHub-hosted CI/CodeQL/dependency-review sonucu.
4. GitHub branch/ruleset ve yalnız merge-commit politikasının doğrulanması.
5. Two-parent merge commit sonrası final `main` merge-wrapper + full-tree push gate'i ve state/ledger kapanışı.
6. Final WSL review'lerden sonra yalnız doğrulanmış geçici runtime yollarının temizlenmesi ve yokluk kanıtı.
