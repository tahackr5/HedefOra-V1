# Deterministik Planlama Motoru Sözleşmesi

## Amaç

Kullanıcı hedefi, curriculum, kaynaklar ve availability verisinden tekrar üretilebilir, açıklanabilir bir çalışma planı oluşturmak.

## Source-of-truth inputları

- exam package ve version,
- target date,
- timezone,
- weekly availability windows,
- daily/session capacity limits,
- selected subjects/topics,
- source coverage metadata,
- prerequisite graph,
- task estimates,
- progress/completion history,
- user-approved exceptions.

AI önerisi planlayıcının zorunlu inputu değildir.

## Temel invariants

1. Görev zaman penceresi kullanıcının availability'siyle uyumludur.
2. Aynı slotta kapasiteyi aşan overlap oluşmaz.
3. Prerequisite tamamlanmadan bağımlı task zorunlu ACTIVE olamaz.
4. Plan revision immutable history bırakır.
5. Bir DRAFT/PROPOSED plan açık kabul olmadan ACTIVE olmaz.
6. Aynı input snapshot ve algorithm version, aynı sonucu üretir veya deterministic tie-break kullanır.
7. Tarihi geçmiş ve tamamlanmamış task sessizce kaybolmaz.
8. Skip ile reschedule farklı event ve farklı etki üretir.
9. Stale profile/plan version ile mutation reddedilir.
10. Algorithm version, rule reason codes ve input hash audit edilebilir.

## Plan durumları

- DRAFT
- PROPOSED
- ACTIVE
- SUPERSEDED
- CANCELLED
- COMPLETED

Status geçişleri explicit command ile ve transaction içinde yapılır.

## Replan tetikleri

- availability değişikliği,
- target date değişikliği,
- curriculum package revision,
- source ekleme/kaldırma,
- önemli missed task kümesi,
- kullanıcı explicit “planı yeniden düzenle” komutu.

Her tetik doğrudan ACTIVE planı overwrite etmez; yeni proposal/revision üretir.

## Açıklama reason code örnekleri

- AVAILABILITY_CHANGED
- TARGET_DATE_CHANGED
- MISSED_TASK_REBALANCE
- PREREQUISITE_ENFORCED
- DAILY_CAPACITY_LIMIT
- SOURCE_COVERAGE_CHANGED
- CURRICULUM_REVISION
- USER_RESCHEDULED

Registry tek kaynaktan generated veya parity-test edilmiş olmalıdır.

## Test yaklaşımı

- table-driven unit tests,
- property-based invariants,
- timezone/DST edge cases,
- randomized schedule generation,
- deterministic snapshot/golden tests,
- concurrent accept/replan race tests,
- large curriculum performance tests,
- mutation/rollback tests.
