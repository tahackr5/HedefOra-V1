# Codex Runtime Generation Spec

Bu paket Markdown-only kalır. Codex'in gerçek custom-agent katmanı TOML gerektirdiği için Wave 000, güncel resmi Codex formatını doğruladıktan sonra aşağıdaki dosyaları üretir.

## Üretilecek minimum katman

- `.codex/config.toml`
- `.codex/agents/orchestrator.toml`
- `.codex/agents/product-ux-content.toml`
- `.codex/agents/architecture-contracts-data.toml`
- `.codex/agents/backend-platform-auth.toml`
- `.codex/agents/content-planning-ai.toml`
- `.codex/agents/frontend-design-system.toml`
- `.codex/agents/quality-testing.toml`
- `.codex/agents/infra-release-observability.toml`
- `.codex/agents/security-privacy-review.toml`
- `.codex/agents/cold-reviewer.toml`
- `.codex/agents/legal-policy-drafter.toml`

Her custom agent en az `name`, `description`, `developer_instructions` taşır. Read-only roller `default_permissions = "reviewer-readonly"` ve `approval_policy = "never"` olur. `reviewer-readonly`, Codex `:read-only` profilini genişletir; command network'ünü kapatır ve credential taşıyan kullanıcı dizinlerinin içeriklerini bounded deny glob'larıyla okumayı reddeder. Glob kullanımı, credential dizini bulunmayan veya bozuk symlink taşıyan hostlarda sandbox başlangıcının exact-path mount hatasıyla durmasını önler; `glob_scan_max_depth = 8` davranışı schema validator ve WSL executable probe ile kilitlenir. Writer roller parent permissions/approvals katmanını miras alır; production full-access tanımlanmaz. Legal/policy ajanının her çıktısı `DRAFT_NOT_FOR_PRODUCTION` olarak kalır ve owner kararı olmadan aktive edilmez.

## Model

- Ana kullanıcı seçimi: GPT-5.6 Sol + Ultra.
- Custom agent `model` alanı gerekiyorsa `gpt-5.6-sol` doğrulanır.
- W000 resmi Codex belgeleri ve yerel model catalog'u üzerinden `model_reasoning_effort = "ultra"` alanını doğrular; parent live runtime override yine korunur.
- Spawn edilen ajan gerçek model/effort'u handoff'a yazar.

## Concurrency

Config maksimum concurrent agent thread sayısını ürünün single-writer kuralıyla uyumlu sınırlar. Yüksek thread limiti, yüksek writer sayısı anlamına gelmez. Orchestrator aynı anda en fazla dört writer görevlendirir.

## Skills

Repo-scoped instruction-only skills zaten `.agents/skills/*/SKILL.md` altındadır. W000:

- metadata name/description doğrular,
- duplicate name kontrol eder,
- prompt-match testleri hazırlar,
- gereksiz skill eklemez.

## AGENTS layering

Root `AGENTS.md` kanonik. Kod oluşunca yalnız gerçek module-specific istisna varsa nested `AGENTS.md` veya `AGENTS.override.md` eklenir. Root içeriği kopyalanmaz.

## Hooks ve automation

Hook veya policy script ancak:

- current Codex docs ile format doğrulandıysa,
- Windows/WSL/Linux portability test edildiyse,
- fail-open/fail-closed davranışı açıkça test edildiyse,
- bootstrap paket manifestini bozmayacak şekilde code phase'de üretildiyse

eklenir.

Talimat metni gerçek enforcement yerine geçmez. Kritik single-writer/path/secret/gate kuralları mümkün olduğunca CI/hook/test ile executable olur.

## Runtime acceptance

- Codex config parse edilir.
- Her custom agent listelenir ve doğru sandbox ile spawn edilebilir.
- Security ve cold-review parent run'ları da `reviewer-readonly` + `never` başlatılır; write-capable remote tools verilmez.
- Reviewer parent, user config'i yüklemeden; apps/plugins/MCP elicitation, browser/computer, image generation, hooks ve web-search yüzeylerini explicit kapatan live override'larla başlatılır. Project custom-agent dosyaları aynı deny-set'i, `web_search = "disabled"`, `tools.web_search = false`, code-mode namespace dışlamalarını ve boş `mcp_servers` tablosunu defense-in-depth olarak taşır. İzole koşum standart `~/.codex` dışında bir `CODEX_HOME` kullanıyorsa resolved absolute runtime dizini ayrıca live filesystem deny listesine eklenir; `~/.codex` kuralının onu kapsadığı varsayılmaz. Parent live override'larının child'a yeniden uygulandığı executable probe ile doğrulanır.
- Her iki read-only agent repository dosyalarını okuyabilir; repository'ye yazamaz, credential dizinlerini okuyamaz ve loopback network'e bağlanamaz. Probe dosyası oluşmaz, bağımsız loopback listener logu boş kalır ve child tool inventory'sinde MCP/app/connector/web/browser/computer/image-generation/plugin aracı bulunmaz.
- Her writer diff'i recorded `owned_paths`/`forbidden_paths` ile orchestrator tarafından karşılaştırılır; kapsam dışı değişiklik merge gate'ini FAIL yapar. Custom-agent sandbox'ı path ownership enforcement'ıymış gibi raporlanmaz.
- Skill selector skill'leri görür.
- Statik prompt fixture coverage gerçek semantic selector sonucu gibi raporlanmaz; positive/negative runtime prompt probe sonucu ayrıca kaydedilir.
- Root AGENTS loaded-source raporunda görünür.
- Subagent summaries main context'e ham log yığmaz.

Codex CLI `0.150.0-alpha.8` native Windows `unelevated` ve `elevated` sandbox'ları bu repository'nin canlı `curl` loopback sentinel'inde bağlantıyı engellemedi. Bu nedenle reviewer acceptance native Windows üzerinde verilemez. W000 reviewer koşumları WSL2/Linux üzerinde, SHA-256 ile doğrulanmış resmi Codex paketi ve Linux `bwrap + seccomp` sandbox'ı ile çalışır. Runtime sürümü değiştiğinde hem native Windows hem WSL davranışı yeniden sentinel ile ölçülür; yalnız gerçek listener bağlantı almadığında uygun yol kullanılabilir.
