# PR Review Prompt

```text
Bu branch/PR'ı main'e karşı bağımsız incele. Kod değiştirme.

Parallel read-only subagents kullan:
1. correctness/data/race,
2. security/privacy/auth,
3. contracts/migrations/jobs,
4. tests/maintainability/operability.

AGENTS.md ve etkilenen acceptance docs'u oku. Findings-first yaz. Her finding severity, file/symbol, concrete evidence/reproduction, impact, missing test ve smallest fix taşısın. Style-only yorumları ele. Test çıktısını gerçekten görmeden PASS deme.

Sonunda blocking findings, non-blocking improvements, evidence gaps ve verdict ver.
```
