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

Her custom agent en az `name`, `description`, `developer_instructions` taşır. Read-only roller `sandbox_mode = "read-only"` ve `approval_policy = "never"` olur. Writer roller parent approvals'ı miras alır; production full-access tanımlanmaz. Legal/policy ajanının her çıktısı `DRAFT_NOT_FOR_PRODUCTION` olarak kalır ve owner kararı olmadan aktive edilmez.

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
- Security ve cold-review parent run'ları da `read-only` + `never` başlatılır; write-capable remote tools verilmez.
- Reviewer parent, user config'i yüklemeden; apps/plugins/MCP elicitation, browser/computer, image generation, hooks ve web-search yüzeylerini explicit kapatan live override'larla başlatılır. Project custom-agent dosyaları aynı deny-set'i ve boş `mcp_servers` tablosunu defense-in-depth olarak taşır; parent live override'larının child'a yeniden uygulandığı kabul edilir.
- Her iki read-only agent yerel write ve loopback network denemesinde reddedilir; probe dosyası oluşmaz, loopback listener bağlantı almaz ve child tool inventory'sinde MCP/app/connector/web/browser/computer/image-generation aracı bulunmaz.
- Her writer diff'i recorded `owned_paths`/`forbidden_paths` ile orchestrator tarafından karşılaştırılır; kapsam dışı değişiklik merge gate'ini FAIL yapar. Custom-agent sandbox'ı path ownership enforcement'ıymış gibi raporlanmaz.
- Skill selector skill'leri görür.
- Statik prompt fixture coverage gerçek semantic selector sonucu gibi raporlanmaz; positive/negative runtime prompt probe sonucu ayrıca kaydedilir.
- Root AGENTS loaded-source raporunda görünür.
- Subagent summaries main context'e ham log yığmaz.

Native Windows elevated sandbox helper düzelene kadar reviewer negatif testleri explicit `windows.sandbox="unelevated"` CLI override'ı ile yapılabilir. Bu geçici fallback project config'e kalıcı yazılmaz; elevated helper arızası risk kaydında açık kalır.
