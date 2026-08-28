# W000 Kanıt Paketi

- Wave: `W000`
- Durum: `COMPLETED`
- Wave başlangıcı: `2efca6c8b65e3342ad5309076b7cd0dedf816943`
- Exact reviewed PR head: `383cf66723667a5ab8e0fd2001fe86b261698d10`
- Reviewed tree: `2fc4fb23d42ea0a5ec41cfd70704b1132b04519a`
- W000 end merge commit: `f52a8b7eaf83e8817a98e02aa5953c0faf04f6c2`
- Son exact local full-tree checkpoint: `f52a8b7eaf83e8817a98e02aa5953c0faf04f6c2`
- Exact isolation diagnostic target: `1bd1729fc9bb1f8ec86d381bc9ff947c03685b17`
- Final security review target/session: `383cf66723667a5ab8e0fd2001fe86b261698d10` / `01a04861-5700-79b3-840b-93dcd214c2c4`; sonuç `PASS`
- Final cold review target/session: `383cf66723667a5ab8e0fd2001fe86b261698d10` / `01a0486e-e3e5-7fc1-b7f6-1f949b670c04`; sonuç `PASS`
- Integration branch/worktree: `codex/w000-bootstrap` / repository root
- PR-head temiz doğrulama clone'u: `C:\Users\ihsan\.codex\worktrees\HedefOra\W000\VERIFY7-CLONE`
- Merge temiz doğrulama clone'u: `C:\Users\ihsan\.codex\worktrees\HedefOra\W000\MERGE-F52A8B7-CLONE`
- Kanıt zamanı: `2026-08-28T20:20:00+03:00`

## Sonuç

W000 no-feature monorepo, Codex runtime sözleşmesi, exact toolchain, frontend shell, CI/local PostgreSQL ve repository gate'leri exact `383cf667` PR head'inde clean-clone, GitHub quality, isolated security ve fresh cold review kapılarını geçti. PR #1 bu exact head'i ikinci parent yapan, tree'si birebir aynı `f52a8b7` merge commit'iyle `main`e alındı. Local merge-wrapper/full-tree ve exact main push quality PASS olduğu için W000 `COMPLETED`dır. Hosted CodeQL upload, Dependency Review ve private-plan branch protection `BLOCKED_EXTERNAL` kalır; owner'ın DEC-024 telafi kabulü bu sonuçları PASS yapmaz.

## Final exact evidence

| Gate | Exact hedef/kanıt | Sonuç |
|---|---|---|
| PR-head clean-clone full tree | `383cf667` / `2fc4fb2`; Node `24.20.0`, pnpm `11.24.0`, Git `2.39.5`, Go `1.26.7`, Python `3.12.13` | PASS; repository Node 11/11, frontend 3/3 ve statement/branch/function/line %100, build 16 module, Go/TOML/actionlint/Gitleaks/compose/diff/status temiz |
| PR-head GitHub quality | run `33155512881`, job `98797220995`, exact `383cf667` | PASS |
| Final security | session `01a04861-5700-79b3-840b-93dcd214c2c4`; `gpt-5.6-sol + ultra`; read-only/never | PASS; zero local findings/blockers; repository mutation `NONE` |
| Final cold | session `01a0486e-e3e5-7fc1-b7f6-1f949b670c04`; `gpt-5.6-sol + ultra`; read-only/never | PASS; zero local findings/blockers; repository mutation `NONE` |
| Review artifact integrity | `FINAL-REVIEWS-383cf66/SHA256SUMS.txt`; sanitized result SHA-256 `1f0177a43cf54cc23ec21a817c0647cf9c9b8ff938ad76556466b54559ab9fe8` | PASS, 23/23 copied artifact eşleşti; manifest strict check exit 0 |
| Merge topology | `f52a8b7`; parents `2efca6c` + `383cf667`; tree `2fc4fb2` | PASS; two-parent, ancestor, content-identical, `repolint -merge-wrapper` exit 0 |
| Merge clean-clone full tree | `MERGE-F52A8B7-CLONE`; exact `f52a8b7` | PASS; frozen Node/full JS, Go, Python, actionlint, Gitleaks, compose, diff/status exit 0 |
| Main push quality | run `33193519710`, job `98924751296`, exact `f52a8b7` | PASS |
| Hosted security/enforcement | PR Dependency Review; CodeQL runs `33155512718` ve `33193519721`; branch/ruleset API | `BLOCKED_EXTERNAL`; DEC-024/R-014/R-016 |

## Kapsam ve sözleşme

- OpenAPI 3.1 kökü additive scaffolding'dir; `paths` ve `webhooks` operation'ları boştur.
- Producer/consumer, generated client, migration veya compatibility window yoktur.
- W001 backend, DB, River, auth, planner veya ürün davranışı oluşturulmadı.
- Frontend yalnız erişilebilir Türkçe no-feature shell'dir; auth, router veya API client içermez.
- Legal/policy rolü ve gelecekteki tüm hukuk çıktıları `DRAFT_NOT_FOR_PRODUCTION`; aktivasyon owner gate'idir.
- Rollback, ilgili branch commit'lerini ters sırayla `git revert` etmektir; production/VPS mutation yoktur.

## Reviewer runtime ve exact isolation diagnostic

- Hedef project config'i `gpt-5.6-sol` + `ultra` kullanır; custom ajanlar model/effort override etmez.
- Önceki discovery smoke testinde 11 project custom agent'ın tamamı gerçek parent üzerinden spawn edildi: `TOTAL:11/11`. Bu sonuç isolation veya final review kanıtı değildir.
- Native Windows Codex `0.150.0-alpha.8` üzerinde `unelevated`, permission-profile ve `elevated` denemelerinin tamamında bağımsız canlı loopback listener bağlantı aldı; native Windows reviewer acceptance için kullanılamaz.
- Kabul edilen diagnostic ortam WSL2 Ubuntu 24.04 ve resmi Linux Codex `0.150.0` paketidir. Package SHA-256: `2d27b8569ca760eeb2bf21fa12bd31f59ac42b81617b340cf8958e9b38d743d5`; freshly extracted Codex binary SHA-256: `f0222a59e7d06f7b97014fb672731285b453b945fc0f0aab36c89278dec36e14`; `bwrap` SHA-256: `01fb705f067bd5365b63d8ad2323a61c8d007733ca5e649437e086f3fb9935d8`.
- Exact `1bd1729` config blob: `9c4ab4c5899e30b22770c275d5b2fbef4795410a`; security agent blob: `1c154ea4d22c39ca9b314c4bcd630891a9234db7`; cold agent blob: `317a017bbac5431684a7f1b43ae397088cbb2c2c`.
- Son başarılı exact harness kökü: `/tmp/hedefora-w000-isolation-1bd1729.y95K30JP`; target/tree `1bd1729fc9bb1f8ec86d381bc9ff947c03685b17` / `ce55605aa52ab1fe486a2fa4675e4748e522d146`; `harness.exit-code=0`. Güvenlik parent/child ve cold parent/child yalnız canonical `exec` wrapper'ı kullandı; credential içeriği okunmadı.

| Rol | Parent session | Child session | Hedef/koşum |
|---|---|---|---|
| Security isolation | `01a046b7-faf8-7343-adcc-d8a8ac8493b3` | `01a046b8-5ee0-7e30-b3de-2f27913e5f1b` | exact `1bd1729` run |
| Cold isolation | `01a046b8-e9c1-7a22-be9a-026f013fe520` | `01a046b9-568d-7350-a075-c6df6bb14cd4` | exact `1bd1729` run |

Dört session context'i de `model=gpt-5.6-sol`, `effort=none`, `approval_policy=never`, `sandbox_policy=read-only` verdi. Bu yalnız capability/isolation diagnostic'idir; final `ultra` security/cold review değildir.

Her iki child için doğrulanan sonuçlar:

```text
read_exit=0
write_exit=1
network_exit=7
secret_read_exit=1
glob_secret_read_exit=1
windows_secret_read_exit=1
apply_patch_outcome=denied_throw
apply_patch_file_exit=1
classifier_fixtures=pass
repository_status=""
```

- Linux isolated `CODEX_HOME`, Linux credential glob'ları ve Windows-mounted `/mnt/c/Users/ihsan` parent ile child'ın effective deny listesinde doğrulandı. Windows sentinel için yalnız `test -r` uygulandı; credential içeriği okunmadı, hash'lenmedi veya çıktıya yazılmadı.
- Shell yazma ve nested `apply_patch` ayrı ayrı reddedildi; probe dosyaları oluşmadı. Denial classifier yalnız sandbox/policy bağlamlı sinyalleri kabul etti; service outage, malformed patch ve ilgisiz runtime error fixture'ları reddedildi.
- Parent yalnız `spawn_agent` ve `wait_agent` kullandı. Child, kilitli iki JavaScript bloğunu byte-for-byte çalıştırdı ve sonuç parent final mesajıyla birebir eşleşti.
- Child tool listesi yalnız `apply_patch`, `create_goal`, `exec_command`, `get_goal`, `update_goal`, `update_plan`, `view_image`, `write_stdin` idi. MCP/app/connector/web/browser/computer/image-generation/plugin yüzeyi yoktu.
- Tarihsel `01a04644-675d-77a2-b310-022134a064a9` session'ı daha eski target üzerinde pre-remediation diagnostic'tir; `31d65b8` veya sonraki hedeflere kanıt olarak bağlanmaz.

## İlk cold review ve remediation matrisi

- Agent/session: `/root/cold_reviewer` / `01a045fd-df68-7c02-9b34-69b23cc2d6c8`
- Target/tree: `8d445875ce63b43eae9056149e7841380a5f3b66` / `35a80e214892f98550d1b13ad83cf9013f0bcb24`
- UTC: `2026-08-28T01:31:01.059Z–01:51:13.751Z`
- Verdict: `FAIL`; verdict self-report model/effort `UNKNOWN/UNKNOWN`; confidence `UNKNOWN`
- Korunan session context: `gpt-5.6-sol / ultra / never / read-only`
- Session artifact SHA-256: `b031c3b2d9d2cd725440c65c3c5e686ddc4d63a84cdc478b45b9af03d629940d`

| # | Seviye | Bulgu | Remediation | Durum |
|---|---|---|---|---|
| 1 | HIGH | PR/source ve CodeQL SHA kimliği | `0dfd3a5`, `4a36dfb` | Remediated; final/hosted verification açık |
| 2 | HIGH | Merge-wrapper topolojisi, ownership coverage ve gerçek merge yöntemi | `4a36dfb` | Local remediation var; GitHub policy açık |
| 3 | HIGH | Tracked Go formatter kapısı yok | `0dfd3a5` | Remediated; final review açık |
| 4 | MEDIUM | OpenAPI path-operation negatif fixture yok | `65b3a13` | Remediated; final review açık |
| 5 | HIGH | Generated/marker scanner ignored-directory, case ve fail-open kapsamı | `65b3a13`, `4a36dfb` | Remediated; final review açık |
| 6 | HIGH | Reviewer isolation child tool inventory ve remote-write yüzeyini kapsamıyor | `4a36dfb`, `b7b9519`, `db12cf8`; seal `2492e6f` | Exact isolation diagnostic PASS; final reviews açık |
| 7 | HIGH | Exact komut/süre/artifact ve hosted exit kanıtı eksik | `fa402f5`, correction `52a8a23`, seal `1bd1729` | `OPEN/PARTIAL` |
| 8 | HIGH | Backup/recovery ve GitHub protection/required-check kanıtı yok | DQ-004 + dış GitHub işlemleri | `OPEN`; zamanlama owner kararı |

## Historical exact `1bd1729` yerel ve hosted gate sonuçları

| Gate | Ortam/komut özeti | Sonuç |
|---|---|---|
| Frozen install + full JS gate | Node `24.20.0`, pnpm `11.24.0`, Git `2.39.5`; clean detached clone; `pnpm install --frozen-lockfile`; `pnpm ci:check` | `PASS`; exact full chain exit `0`; 502 package kuruldu. |
| Repository Node tests | `node --test scripts/*.test.mjs` | `PASS`, 8/8 |
| Frontend test/coverage | Vitest `4.1.11` | `PASS`, 3/3; statement/branch/function/line `%100` |
| Frontend build | Vite `8.2.2` | `PASS`; 16 module |
| OpenAPI/governance/generated/marker/license/audit | Root `pnpm ci:check` zinciri | `PASS`; production audit'te bilinen vulnerability yok |
| Go format/module/vet/test | Go `1.26.7`; tracked `gofmt -l`, `go mod verify`, `go vet ./...`, `go test ./...` | `PASS`, exit `0`; iki package |
| Ownership | `repolint -all -base 2efca6c... -head HEAD` | `PASS`; ownership `52a8a23` üzerinden sürekli ve manifest-only `1bd1729` trailing endpoint |
| TOML | Python `3.12.13`; validator + unittest | `PASS`; 4/4 |
| Secret scan | Gitleaks `8.30.1`; committed history | `PASS`; 35 commit, yaklaşık 513.91 KB, leak yok |
| Local PostgreSQL config | `docker compose -f infra/compose.dev.yml config --quiet` | `PASS`, exit `0` |
| Workflow lint | actionlint `1.7.12 -color` | `PASS`, exit `0` |
| Diff/worktree | `git diff --check`; detached clone status | `PASS`; exact HEAD `1bd1729`; tree `ce55605aa52ab1fe486a2fa4675e4748e522d146`; tracked tree temiz |

Bu tablo `5886a97` remediation'ını kapsamaz. `5886a97` üzerinde yalnız aşağıda kaydedilen bounded Node/Go remediation kontrolleri geçmiştir; yeni sealed target temiz-clone full gate'i `NOT_RUN` durumundadır.

GitHub PR #1 (`W000: bootstrap repository and governance runtime`) draft olarak historical exact `1bd1729` head'ine bağlıdır. CI run `33143640272` içindeki quality job `98759826096` tüm exact-source, secret, ownership, TOML, frozen JavaScript, build/audit ve Go adımlarını `PASS` tamamladı; bu sonuç `5886a97` değişikliklerini kapsamaz. Dependency review job `98759826273`, private/free planda özellik bulunmadığı için çalışamadı. CodeQL run `33143640327` Go/JavaScript init-extract-query aşamalarını tamamladı fakat upload `Resource not accessible by integration` ile reddedildi. Main branch protection API private/free plan için `403` verdi. Merge yöntemi yalnız merge commit olarak ayarlandı; squash/rebase kapalıdır. Bu üç hosted enforcement alanı `BLOCKED_EXTERNAL` kalır ve workflow'lar gevşetilmez. Current-target GitHub quality `NOT_RUN`; sealed target push'u bekleniyor.

Tam image kimlikleri:

- Node base: `node@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e`
- Yerel Node+Git image ID: `sha256:9027d4f58ed2069bf02fd186d5ed1b34754428f46bf7d13ce3a3a90c5ae6e37b`
- Go: `golang@sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514`
- Python: `python@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2`
- actionlint: `rhysd/actionlint@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667`
- gitleaks: `ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f`

Çalıştırılan literal gate komutları:

```text
pnpm install --frozen-lockfile
pnpm ci:check
gofmt -l ./tools/repolint/cmd/repolint/main.go ./tools/repolint/cmd/repolint/main_test.go ./tools/repolint/ownership.go ./tools/repolint/ownership_test.go
go mod verify
go vet ./...
go test ./...
go run ./tools/repolint/cmd/repolint -manifest state/W000-OWNERSHIP.json -all -base 2efca6c8b65e3342ad5309076b7cd0dedf816943 -head HEAD
python3 scripts/validate_toml.py
python3 -m unittest scripts/test_validate_toml.py
actionlint -color
gitleaks git . --redact --no-banner --no-color
docker compose -f infra/compose.dev.yml config --quiet
git diff --check
git status --short --branch
```

## Historical failed security review ve `5886a97` remediation

- Session: `01a04744-b2a7-70c2-8a15-4ae79a5c3372`; target/tree `1bd1729fc9bb1f8ec86d381bc9ff947c03685b17` / `ce55605aa52ab1fe486a2fa4675e4748e522d146`.
- Effective context: direct `exec`, Codex `0.150.0`, `gpt-5.6-sol`, `ultra`, `approval_policy=never`, `sandbox_policy=read-only`, `reviewer-readonly`, network restricted.
- Terminal verdict: `SECURITY_REVIEW_VERDICT: FAIL`; `LOCAL_FINDINGS: 2`; repository mutation ve forbidden tool surface yok; external gates ayrıca `BLOCKED_EXTERNAL`.
- Harness root: `/tmp/hfwr-1bd1729.O3rGD8wM`. Session 65 `exec` çağrısı ve 65 eşleşen output üretti. Terminal FAIL korunmuştur; ancak post-validator, gerçek runtime'ın bare JS key/backtick/inline `text(r)` wrapper biçimini aşırı dar JSON/newline grameriyle reddetti. Bu ek harness kusuru R-015 olarak açıldı; bulguları silmez veya downgrade etmez. Security FAIL nedeniyle cold review başlatılmadı.

| Bulgu | Seviye | Kanıt | Remediation | Durum |
|---|---|---|---|---|
| F-001 production license inventory optional/peer edge'leri ve aynı adın çoklu fiziksel sürümlerini kaybedebilir | MEDIUM | `scripts/check-licenses.mjs` yalnız `dependencies` ve name-keyed Map kullanıyordu; collector testi yoktu | `5886a97`: dependencies/optionalDependencies/peerDependencies closure; canonical-manifest ziyaret seti; tüm fiziksel kayıtları koruyan inventory; multi-version/license drift; direct/transitive optional, peer, missing optional ve duplicate metadata fixtures | CLOSED; exact `383cf667` clean-clone + security/cold PASS |
| F-002 ownership history scan pre-base side branch commit'lerini atlayabilir | HIGH | `commitsInRange` yalnız `--ancestry-path`; merge first-parent diff'i net-zero side history'yi göremeyebilir | `5886a97`: plain `base..head` closure + ancestry-set karşılaştırması; immutable base'den türemeyen newly-reachable commit fail-closed; pre-base add/delete merge fixture | CLOSED; exact `383cf667` clean-clone + security/cold PASS |

`5886a97` targeted remediation kanıtı: exact Node `24.20.0` ile `node --test scripts/check-licenses.test.mjs` 4/4, `node --test scripts/*.test.mjs` 11/11, `node scripts/check-licenses.mjs` ve `pnpm format:check` `PASS`; exact Go `1.26.7` ile tracked `gofmt -l`, `go mod verify`, `go vet ./...`, `go test ./...` `PASS`. İki patch ayrı read-only adversarial review'de `PASS` aldı; ardından exact `383cf667` full-tree/security/cold tekrarları da PASS verdi.

### Tarihsel security checkpoint

Read-only `security_privacy_review`, target `97586859ce272e8390fdf9b405533914f02c3885` üzerinde önceki dört security-fix grubuna `SECURITY_FIX_VERDICT:PASS` verdi. Bu yalnız tarihsel checkpoint'tir ve sonraki cold-review/runtime remediation'ını kapsamaz.

## Uygulanabilirlik ve açık kapılar

- DB migration up/down/upgrade: `NOT_APPLICABLE` — W000'da DB runtime/migration yok.
- River catalog/process tests: `NOT_APPLICABLE` — W001 artifact'ı yok.
- Planner property/golden: `NOT_APPLICABLE` — W002 artifact'ı yok.
- Ürün E2E: `NOT_APPLICABLE` — W000 no-feature shell; mevcut frontend component/a11y smoke testleri uygulandı.
- Staging deploy, DB backup/restore, rollback drill, SLO/alerts: `NOT_APPLICABLE` — W007 kapsamı; VPS'e mutation yapılmadı.
- İkinci şifreli off-site repository kopyası + recovery testi: W000 için `NOT_APPLICABLE`; W007/pre-user gate'i için `NOT_RUN`. DQ-004 owner kararıyla kapandı.
- GitHub PR quality CI: `PASS @ 383cf667`. Main push quality: `PASS @ f52a8b7`. Dependency Review, CodeQL upload ve ruleset/branch protection: `BLOCKED_EXTERNAL`; DEC-024 telafisi bunları PASS yapmaz.
- CodeRabbit/Sonar: `BLOCKED_EXTERNAL` — bağlı ve kanıtlanmış servis yok; sahte review üretilmedi.
- Final security ve cold re-review: `PASS @ 383cf667`; F-001/F-002 kapandı.

## Açık risk ve owner girdisi

- R-001/R-009/R-013: backup/recovery/kalıcı checkout W007 ve ilk gerçek kullanıcı/public launch/production promotion öncesi tamamlanır; W001 başlangıcını engellemez.
- R-011: küçük VPS yalnız staging/pre-production; gerçek kullanıcı ve production verisi alınmaz.
- R-012: native Windows sandbox loopback'i engellemiyor; reviewer yalnız executable sentinel geçmiş WSL/Linux yolunda çalışır.
- R-014: exact merge-only ve final merge-wrapper doğrulandı; branch/ruleset server-side enforcement private planda yok ve risk açık.
- R-015: semantic parser, backslashsız transport, tri-state terminal correlation ve adversarial/static/no-model regresyonları PASS; runtime yükseltmesinde tekrar zorunlu.
- R-016: pinned OSS SAST ve all-scope dependency gate'i W001 runtime davranışından önce zorunludur.
- VPS secret/SSH bilgisi istenmedi. Owner'ın secretsiz staging envanteri repo dışında kaydedildi; W007'de exact port/OS/vCPU/fingerprint doğrulanır.

## Post-exit bookkeeping ve sonraki wave

1. Bu kapanış/owner-decision değişiklikleri ayrı post-exit PR ve ownership seal ile doğrulanır; W000 end commit'i değişmez: `f52a8b7`.
2. W001 açılışında R-016 için pinned OSS SAST ve all-scope dependency vulnerability/license gate'i runtime davranışından önce uygulanır.
3. W007'de staging host, Cloudflare, off-site backup/recovery ve restore/rollback kanıtları ayrı owner gate'leriyle tamamlanır.
