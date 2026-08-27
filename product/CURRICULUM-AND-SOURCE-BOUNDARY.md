# Curriculum ve Kaynak Sınırı

## Curriculum package

Her sınav paketi versioned ve immutable yayın birimidir:

- exam family,
- year/ruleset,
- subject/topic hierarchy,
- prerequisites,
- estimated effort metadata,
- effective dates,
- provenance,
- reviewer/approval evidence,
- status.

Durumlar:

- DRAFT
- IN_REVIEW
- APPROVED
- SUPERSEDED
- REJECTED

KPSS, ALES ve DGS için APPROVED package olmadan curriculum launch gate geçmez.

## Kullanıcı kaynağı

Kullanıcının eklediği kaynak yalnız metadata veya izinli upload olarak kabul edilir. Sistem:

- telif/erişim bypass etmez,
- paywall aşmaz,
- resmi olmayan transcript veya medya indirmez,
- platform hesabını otomatik scrape etmez,
- “internet üzerinde var” olmasını kullanım izni saymaz.

## Upload lifecycle

1. INITIATED
2. UPLOADING
3. QUARANTINED
4. VALIDATING
5. ANALYZING
6. READY veya REJECTED/FAILED

Upload completion hiçbir zaman doğrudan READY yapmaz.

## Validation

- content type ve magic bytes,
- size/page/duration limitleri,
- malware scan,
- decompression bomb kontrolü,
- filename/path normalization,
- parser sandbox,
- ownership/permission attestation,
- retention class,
- duplicate/content hash.

## Abuse ve takedown

- report intake,
- temporary quarantine,
- reviewer decision,
- user notification,
- appeal,
- immutable audit,
- legal hold ile delete policy ayrımı.

Admin bir report'u sessizce silemez veya evidence zincirini değiştiremez.
