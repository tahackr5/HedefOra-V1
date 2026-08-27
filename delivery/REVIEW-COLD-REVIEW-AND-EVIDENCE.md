# Review, Cold Review ve Evidence

## Normal review

Sıra:

1. Codex built-in `/review` veya read-only reviewer,
2. CodeRabbit PR review,
3. Sonar/static findings,
4. domain/security specialist,
5. builder fix,
6. re-review.

Review style-only gürültü yerine correctness, security, regression, contract ve test gap'e öncelik verir.

## Security review

- threat boundary,
- attacker-controlled inputs,
- authz bypass,
- state/replay/race,
- data exposure/logging,
- SSRF/upload/parser,
- admin/worker capability,
- dependency/config.

Codex Security bulgusu otomatik gerçek kabul edilmez; evidence ve reachability doğrulanır. Dismissal gerekçeli ve audit edilebilir olur.

## Cold review

Wave exit öncesi fresh-context read-only ajan:

- builder chat/handoff yorumlarına güvenmez,
- yalnız canonical docs, target diff, tests ve evidence okur,
- kod değiştirmez,
- PASS/FAIL verir,
- finding severity, file/symbol, reproduction ve missing evidence döndürür.

Cold reviewer aynı değişikliği yazan ajan olamaz.

## Evidence paketi

- wave/task ID,
- start/end commit,
- branch/worktree,
- agents/model/runtime,
- changed files,
- acceptance mapping,
- test commands/exits,
- plugin scan/review IDs,
- migration/deploy/rollback evidence,
- open risks/blockers,
- reviewer verdict.

## Kanıt dürüstlüğü

Çalıştırılmayan test “PASS”, bağlanmayan plugin “reviewed”, yapılmayan restore “verified” olarak yazılamaz. Böyle durumlar NOT_RUN veya BLOCKED_EXTERNAL'dır.
