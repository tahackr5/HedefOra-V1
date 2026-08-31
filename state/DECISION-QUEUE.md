# Decision Queue

> Orchestrator records unresolved canonical decisions here. Owner resolution is copied to `DECISIONS.md` or ADR and this item is closed.

## Closed

### DQ-001 — W000 buildable skeleton / application-code boundary

- Opened by / date: orchestrator + `infra_contracts` / 2026-08-28
- Conflicting files/sections: `MASTER-TRIGGER.md` steps 5 and 9; `delivery/WAVE-PLAN.md` W000/W001
- Decision needed: Define which executable artifacts may exist in W000 without implementing W001 product/platform behavior.
- Options: configuration-and-test harness only; or minimal buildable bootstrap code with no domain/API/DB/River/health behavior.
- Security/privacy/cost/migration impact: Starting W001 behavior early can bypass contract and gate ordering; a non-buildable skeleton cannot satisfy W000 exit.
- Work that can continue safely: Git/state, Codex runtime, toolchain lock, CI configuration and non-feature validators.
- Blocking wave/gate: W000 clean build/test.
- Owner decision: NOT_REQUIRED unless scope expands; orchestrator may choose the smallest reversible interpretation and record it in ADR/`DECISIONS.md`.
- Resolution: No-feature executable scaffolding/tooling is permitted in W000; W001 runtime and product behavior remains gated. Recorded as DEC-021 / ADR-0011.
- Closed commit: `525134128a8d5c83dedc87be046440416375bb95`

### DQ-002 — Wave-aware merged-tree gate semantics

- Opened by / date: orchestrator + `infra_contracts` / 2026-08-28
- Conflicting files/sections: `delivery/QUALITY-GATES-AND-DOD.md` merged-tree gate; `delivery/WAVE-PLAN.md` staged feature delivery
- Decision needed: Define evidence status for suites whose owning feature/artifact does not exist in the active wave.
- Options: require every future suite in W000; or allow explicit `NOT_APPLICABLE` with scope/path evidence while never converting `NOT_RUN` to PASS.
- Security/privacy/cost/migration impact: False PASS hides missing coverage; requiring future suites makes honest W000 exit impossible.
- Work that can continue safely: Implement and run every gate applicable to W000 artifacts; retain absent feature gates as non-PASS.
- Blocking wave/gate: W000 merged-tree/cold-review verdict.
- Owner decision: NOT_REQUIRED unless a current acceptance criterion would be waived; orchestrator may clarify process without lowering an existing applicable gate.
- Resolution: Explicit `NOT_APPLICABLE` requires wave/path evidence, is never PASS and cannot cover an existing artifact or acceptance. Recorded as DEC-022 / ADR-0011.
- Closed commit: `525134128a8d5c83dedc87be046440416375bb95`

### DQ-003 — Static package manifest lifecycle

- Opened by / date: orchestrator + `infra_contracts` / 2026-08-28
- Conflicting files/sections: `PACKAGE-MANIFEST.md` scope; `PACKAGE-VALIDATION.md` Important boundary; Wave 000 code generation
- Decision needed: Decide whether the v0.1.0 manifest is an immutable handoff baseline or must be regenerated after every repository change.
- Options: immutable baseline tied to initial commit plus release manifests; or living full-tree manifest updated on every commit.
- Security/privacy/cost/migration impact: A living self-referential manifest creates routine drift and weakens provenance; an unlabeled static manifest produces misleading failures after legitimate development.
- Work that can continue safely: Preserve original hashes and Git history; do not recalculate them silently.
- Blocking wave/gate: Blueprint consistency and repository validator design.
- Owner decision: NOT_REQUIRED; lifecycle clarification is reversible and does not change product scope.
- Resolution: The v0.1.0 manifest is immutable and tied to the initial blueprint commit; later provenance uses Git/release manifests. Recorded as DEC-023 / ADR-0012.
- Closed commit: `525134128a8d5c83dedc87be046440416375bb95`

### DQ-004 — Repository backup gate zamanlaması

- Opened by / date: orchestrator + independent evidence reviewer / 2026-08-28
- Conflicting files/sections: `DECISIONS.md` DEC-016; `operations/REPOSITORY-BACKUP-POLICY.md` giriş paragrafı; `START-HERE.md` §2; `delivery/WAVE-PLAN.md` W001/W007
- Decision needed: İkinci şifreli off-site repository kopyası ve recovery testinin W001 başlangıcını mı, yalnız public launch/production promotion'ı mı bloke edeceğini belirle.
- Options: DEC-016'yı izleyip launch ön koşulu olarak tutmak; veya önceki repository kaybı nedeniyle W001 başlangıç ön koşuluna yükseltip DEC-016/WAVE-PLAN/operasyon belgesini birlikte güncellemek.
- Security/privacy/cost/migration impact: Erken gate veri kaybı riskini azaltır fakat W001 geliştirmesini external backup hazırlığına bağlar; launch-only gate geliştirmeyi hızlandırır fakat ikinci kopya oluşana kadar tek-repository riskini açık bırakır.
- Work that can continue safely: W000 final review, GitHub PR/check ve merge gate'leri; production/VPS mutation yoktur.
- Blocking wave/gate: W001'e otomatik geçiş. W000 exit'i bloke etmez.
- Owner decision: Owner, W001'i engellemeyen W007/pre-user hard gate seçeneğini 2026-08-28 tarihinde açıkça onayladı.
- Resolution: İkinci şifreli off-site repository kopyası ve sıfırdan recovery testi W001 başlangıç blocker'ı değildir; W007 kapsamında ve en geç ilk gerçek kullanıcı, public launch veya production promotion öncesinde zorunludur. DEC-016 açıklaması ve ADR-0014 ile kaydedildi.
- Closed commit: `9f7703b8411a5252afc54a53174b824eefcdb37a`

## Open

### DQ-005 — Public repository ve R-016 kullanım sözleşmesi

- Opened by / date: orchestrator + security review / 2026-08-31
- Conflicting files/sections: `DECISIONS.md` DEC-024; `architecture/ADR-REGISTER.md` ADR-0013; `delivery/DEPENDENCY-AND-SUPPLY-CHAIN.md` R-016 Semgrep kullanım sınırı; canlı GitHub repository görünürlüğü
- Decision needed: Repository public kalacaksa R-016/Semgrep owner-internal kullanım, foreign head ve rule distribution sınırlarını yeniden tanımlamak; aksi halde repository'yi private'a döndürmek.
- Options: public repository + makine-doğrulanır owner-only internal scanning sözleşmesi; veya private repository + DEC-024 telafi modeli.
- Security/privacy/cost/migration impact: Public kaynak kodu yayımlar ve fork/foreign head sınırını kritik yapar; owner-only fail-closed sözleşme rule dağıtımı/scanning-as-a-service riskini sınırlar. API/DB/veri migration etkisi yoktur. Hosted CodeQL/Dependency Review public repository'de kullanılabilir; branch protection yokluğu residual kalır.
- Work that can continue safely: Read-only inceleme, Dependency Review/Default Setup doğrulaması ve owner kararı beklenirken merge dışındaki geri alınabilir kontrol düzlemi hazırlığı.
- Blocking wave/gate: PR #3 exact-head merge ve yeni trusted base.
- Owner decision: `Repository public kalsın; DEC-024 ve R-016 public-repository remediation’ını onaylıyorum.` — 2026-08-31.
- Resolution: DEC-025 / ADR-0015 public repository + owner-controlled internal R-016 sözleşmesini kabul eder; foreign repository head acquisition öncesi bloklanır, rule byte'ları dağıtılmaz, public/private görünürlük kanıta bağlanır ve exact yeni head yeniden doğrulanır.
- Implementation status: `IN_PROGRESS`; exact remediation commit üretildiğinde Closed bölümüne SHA ile taşınır.

## Item template

- ID:
- Opened by / date:
- Conflicting files/sections:
- Decision needed:
- Options:
- Security/privacy/cost/migration impact:
- Work that can continue safely:
- Blocking wave/gate:
- Owner decision:
- Closed commit:
