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

Her custom agent en az `name`, `description`, `developer_instructions` taşır. Read-only roller `sandbox_mode = "read-only"` olur. Writer roller parent approvals'ı miras alır; production full-access tanımlanmaz.

## Model

- Ana kullanıcı seçimi: GPT-5.6 Sol + Ultra.
- Custom agent `model` alanı gerekiyorsa `gpt-5.6-sol` doğrulanır.
- Ultra'nın hangi config alanına karşılık geldiği tahmin edilmez; parent live runtime override korunur.
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
- Read-only agent write denemesinde reddedilir.
- Writer forbidden path'e dokunamaz veya orchestrator gate'ine düşer.
- Skill selector skill'leri görür.
- Root AGENTS loaded-source raporunda görünür.
- Subagent summaries main context'e ham log yığmaz.
