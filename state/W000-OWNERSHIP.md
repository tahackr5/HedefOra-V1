# W000 Yazma Sahipliği ve Birleştirme Planı

> Bu dosyanın tek writer'ı orchestrator'dır. Tüm writer branch'leri değişmez `WAVE_START_COMMIT` olan `2efca6c8b65e3342ad5309076b7cd0dedf816943` üzerinden açılır.

Makine tarafından doğrulanan commit aralıkları ve path allowlist'leri `state/W000-OWNERSHIP.json` içindedir. İnsan tarafından okunabilir bu plan ile JSON manifesti birlikte kanoniktir. Schema v2, wave başlangıcından `verifiedThrough` commit'ine kadar tüm task'leri kesintisiz zincirler; self-referential son commit'te yalnız `state/W000-OWNERSHIP.json` değişebilir. Yerel PR-head doğrulaması `go run ./tools/repolint/cmd/repolint -manifest state/W000-OWNERSHIP.json -all -base 2efca6c8b65e3342ad5309076b7cd0dedf816943 -head HEAD` komutudur.

W000 GitHub PR'ı yalnız two-parent merge commit yöntemiyle birleştirilir; squash ve rebase yasaktır. Final `main` commit'inde aynı komut `-merge-wrapper` ile çalışır: birinci parent reviewed head'in atası, ikinci parent exact PR head'i ve final tree ikinci parent tree'siyle aynı olmalıdır. W000 branch üzerinde en fazla `READY_TO_MERGE`; `COMPLETED` yalnız final `main` push gate'inden sonra verilir.

## Runtime kanıtı

- Parent hedef runtime: `gpt-5.6-sol` + `ultra`.
- Alt ajanlar parent runtime'ını miras alır; custom-agent dosyaları model veya effort override etmez.
- Gerçek model/effort runtime tarafından görünürse her handoff'ta yazılır; görünmüyorsa `UNKNOWN` denir, tahmin edilmez.
- Aynı anda en fazla dört writer ve her path için tek writer kuralı geçerlidir.

## Tamamlanan salt-okunur işler

| Task | Ajan | Gerçek rol | Sonuç |
|---|---|---|---|
| W000-T01 | `infra_contracts` / Lovelace | blueprint denetçisi | Tamamlandı; DQ-001..003, DEC-021..023 ve ADR-0011..0012 ile çözüldü. |
| W000-T02 | `provider_research` / Aristotle | resmi provider/toolchain araştırmacısı | Tamamlandı; sürüm, lisans, uyumluluk ve supply-chain önerisi teslim edildi. |
| W000-T03 | `security_owner` / Franklin | runtime güvenlik denetçisi | Tamamlandı; elevated Windows helper arızası ve doğrulanmış unelevated read-only geçici yolu kaydedildi. |

## Aktif writer görevleri

### W000-T05A — Ortak runtime, sözleşme ve repository iskeleti

- Writer: orchestrator.
- Branch/worktree: `codex/w000-bootstrap` / repository root.
- Owned paths: `.codex/**`, `.editorconfig`, `.gitattributes`, `.gitignore`, `.node-version`, `.tool-versions`, `.spectral.yaml`, `go.mod`, `go.sum`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `contracts/**`, `scripts/**`, `tools/**`, `agents/10-LEGAL-POLICY-DRAFTER.md`, `delivery/AGENT-DISPATCH.md`, `delivery/CODEX-RUNTIME-GENERATION-SPEC.md`, `delivery/TOOLCHAIN-LOCK.md`, `FILE-INDEX.md`, `README.md`, `state/**`.
- Read paths: tüm kanonik governance, product, architecture ve delivery belgeleri.
- Forbidden paths: `apps/web/**`, `.github/**`, `infra/**` (yalnız handoff sonrası commit merge edilir).
- Shared proposals: bağımlılık kilidi, root script veya sözleşme talebi writer tarafından structured proposal olarak gelir; yalnız orchestrator uygular.
- Contract classification: yeni ve boş OpenAPI 3.1 kökü additive scaffolding'dir; producer/consumer yoktur. W001 davranışı, operation, generated client ve compatibility window oluşturmaz. Rollback ilgili scaffold commit'ini geri almaktır.
- Expected tests: TOML parse/schema, skill uniqueness/prompt fixtures, OpenAPI lint, governance/path checks, `go fmt`, `go vet ./...`, `go test ./...`, `go mod verify`, exact pnpm frozen install ve root CI scriptleri.

### W000-T05B — Frontend no-feature scaffold

- Writer: `provider_research` / Aristotle, frontend builder rolü.
- Branch: `wave/W000/W000-T05B-frontend`.
- Worktree: `C:\Users\ihsan\.codex\worktrees\HedefOra\W000\T05B`.
- Owned paths: `apps/web/**`.
- Read paths: root governance; `product/INFORMATION-ARCHITECTURE-AND-CONTENT.md`; `product/ACCEPTANCE-CRITERIA.md`; `architecture/SYSTEM-ARCHITECTURE.md`; `agents/05-FRONTEND-DESIGN-SYSTEM.md`; W000 kararları.
- Forbidden paths: owned path dışındaki tüm repository dosyaları; özellikle root lock/config, contracts, state ve CI.
- Shared proposals: yalnız `templates/SHARED-CHANGE-PROPOSAL.md` biçiminde handoff metni; dosyaya yazılmaz.
- Scope: React/TypeScript/Vite buildable, erişilebilir, no-feature shell ve kendi test/config dosyaları. Router, veri istemcisi, auth, ürün davranışı, public indexability framework kararı veya W001+ stub'ı yoktur.
- Expected tests: format check, ESLint, strict TypeScript, Vitest component/negative test ve production build; exact Node 24.20.0 + pnpm 11.24.0 yoksa `BLOCKED_ENV` raporlanır ve merged-tree gate zorunlu kalır.

### W000-T05C — CI ve yerel altyapı scaffold

- Writer: `infra_contracts` / Lovelace, infra builder rolü.
- Branch: `wave/W000/W000-T05C-ci-infra`.
- Worktree: `C:\Users\ihsan\.codex\worktrees\HedefOra\W000\T05C`.
- Owned paths: `.github/**`, `infra/**`.
- Read paths: root governance; `delivery/DEPENDENCY-AND-SUPPLY-CHAIN.md`; `delivery/QUALITY-GATES-AND-DOD.md`; `delivery/TEST-STRATEGY.md`; `architecture/DEPLOYMENT-AND-RECOVERY.md`; `agents/07-INFRA-RELEASE-OBSERVABILITY.md`; toolchain araştırma özeti.
- Forbidden paths: owned path dışındaki tüm repository dosyaları; özellikle root lock/config, contracts, apps ve state.
- Shared proposals: root script/dependency gereksinimleri handoff'ta structured proposal olarak verilir; writer root dosyası değiştirmez.
- Scope: exact-SHA GitHub Actions, least-privilege permissions, concurrency, timeout ve yalnız W000 artifact'larını test eden CI; digest-pinned PostgreSQL 17.11 yerel compose scaffold. Deploy, DNS, SSH, secret veya production mutation yoktur.
- Expected tests: workflow YAML parse/lint, action SHA/tag doğrulaması, compose config ve image digest doğrulaması; Docker/GitHub erişimi yoksa ayrı `BLOCKED_EXTERNAL` kanıtı.

## Generated, vendor ve secret politikası

- Generated artifact elle düzenlenmez; W000'da boş OpenAPI kökünden client/server üretimi `NOT_APPLICABLE` ve W001 gate'idir.
- `node_modules`, build çıktısı, cache, coverage, binary veya vendored source commitlenmez.
- Gerçek `.env`, token, private key, password, cookie, MFA/recovery veya production verisi okunmaz ve commitlenmez.
- Örnek config yalnız açıkça sahte ve güvenli değerler içerir; secret scan merged tree'de zorunludur.

## Dependency ve merge sırası

1. T05A root runtime/toolchain/contract scaffold.
2. T05B frontend commit'i.
3. T05C CI/infra commit'i.
4. Orchestrator root lockfile ve merged-tree uyarlaması.
5. T06 read-only security review.
6. Fresh-context T06 cold review.
7. GitHub PR checks ve yalnız merge-commit entegrasyonu.
8. Final `main` merge-wrapper + full-tree push gate'i.

Writer kendi branch'inde conflict'i `ours/theirs` ile çözmez. Orchestrator her commit için immutable base diff'ini owned/forbidden path'lerle karşılaştırır; kapsam dışı path varsa merge gate `FAIL` olur.
