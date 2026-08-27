# Ürün Kabul Ölçütleri

## Hesap ve güven

- Yeni kullanıcı gerekli legal versionları kabul etmeden kayıt tamamlanmaz.
- E-posta doğrulanmadan provider-cost, upload, export ve AI gibi capability'ler açılamaz.
- Password reset tokenı tek kullanımlık, süreli ve güvenli saklanır.
- Refresh replay/reuse davranışı tek kanonik state machine ile test edilir.
- Hesap silme recent re-auth, açık kapsam ve audit ile yapılır.

## Onboarding

- KPSS/ALES/DGS seçimi sınava özgü alanları ve metni gösterir.
- Availability overlap DB veya bounded command tarafından reddedilir.
- İlk plan input özeti kullanıcıya gösterilir.
- DRAFT plan kullanıcı onayı olmadan ACTIVE olmaz.
- Medyan onboarding-to-first-plan hedefi ürün telemetry'sinde ölçülebilir olmalıdır.

## Bugün ve plan

- Bugün ekranı tek bir timezone semantiği kullanır.
- Complete, skip ve reschedule ayrı event/state transition üretir.
- Replan sonucu “neden değişti” açıklaması taşır.
- Eski version ile update 409/typed conflict döndürür.
- Plan generation aynı input snapshot ile deterministic testten geçer.

## Upload/source

- Unsupported/malicious dosya READY olamaz.
- User-safe reason code ve support yolu vardır.
- Worker, side effect öncesi current account/entitlement/state'i tekrar doğrular.
- Source silme, bağlı planları bozmadan impact preview üretir.

## AI

- AI unavailable olduğunda core planlama çalışmaya devam eder.
- Quota/cost/time limitleri vardır.
- AI çıktısı provenance/disclosure taşır.
- AI sonucu doğrudan ACTIVE planı mutate etmez.
- Prompt injection içeren source, privileged tool veya secret erişimi kazanamaz.

## Admin

- Admin read ve mutation yetkileri ayrıdır.
- Yıkıcı mutation action-bound step-up ister.
- Her admin mutation actor, target, reason, request ID ve outcome ile audit edilir.
- Retry idempotent ve bounded'dır.

## Erişilebilirlik ve performans

- Klavye ile ana flow tamamlanabilir.
- Focus görünür ve modal focus trap doğrudur.
- WCAG AA kontrast hedeflenir.
- Reduced-motion desteklenir.
- Public landing LCP ve authenticated Today flow için SLO bütçeleri ölçülür.

## Launch

- Backup/restore rehearsal PASS.
- Codex Security deep scan, Sonar gate, CodeRabbit/Codex review ve cold review açık kritik bulgu bırakmaz.
- Production secrets repo/CI log/artifact içinde bulunmaz.
- Rollback ve incident runbook gerçek staging provasında çalıştırılır.
