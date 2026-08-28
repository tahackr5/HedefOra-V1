# Dependency ve Supply-Chain Politikası

## Ekleme ölçütleri

Yeni production dependency için:

- gerçek problem ve neden standard library/mevcut dependency yetmiyor,
- bakım/maintainer sağlığı,
- lisans,
- security history,
- transitive dependency maliyeti,
- bundle/runtime etkisi,
- exit/replacement planı

yazılır.

## Sürüm kilidi

- exact lockfiles,
- toolchain version file,
- reproducible install,
- dependency bot PR'ları küçük ve review edilmiş,
- major update ADR/compat planı.

Exact sürümler Context7 ve resmi docs ile W000'da doğrulanır; bu blueprint sürüm uydurmaz.

## Artifact güveni

- CI source commit'ten build eder,
- immutable digest,
- SBOM,
- vulnerability scan,
- provenance/attestation,
- release artifact outside developer laptop,
- production deploy yalnız approved artifact.

## Private-plan vulnerability ve lisans telafisi

Hosted Dependency Review kullanılamadığında sonuç `BLOCKED_EXTERNAL` kalır. W001 runtime davranışından önce:

- pnpm ve Go manifest/lock kapsamının tamamını tarayan pinned OSS advisory scanner,
- production closure yanında development ve unknown scope'u kapsayan high/critical vulnerability gate,
- açık lisans allow/deny politikası ve unknown-license fail-closed davranışı,
- scanner binary/image, rules ve advisory DB digest'i,
- vulnerable development/unknown-scope, disallowed/unknown-license ve stale/missing DB negatif fixture'ları

zorunludur. Network, parse, timeout veya scanner internal error success'e map edilmez.

## Package script güvenliği

Install/build scriptleri review edilir; gereksiz lifecycle script ve internet fetch engellenir. CI tokenları scoped ve short-lived olmalıdır.

## Plugin/MCP supply chain

- Eklenti sayısı minimum tutulur.
- Permission ve provider trust incelenir.
- Overlapping high-privilege remote-control eklentileri kurulmaz.
- Plugin output source-of-truth kabul edilmeden code/test evidence ile doğrulanır.
- Bir plugin production secret okuyamaz veya yıkıcı işlemi onaysız yapamaz.
