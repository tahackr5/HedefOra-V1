# Bilgi Mimarisi ve İçerik Tasarımı

## Birincil navigasyon

Authenticated uygulamada üst seviye kavramlar:

- Bugün
- Planım
- Kaynaklarım
- İlerlemem
- Ayarlar

Admin alanı ayrı yetki ve ayrı navigation boundary'dir.

## Kanonik ürün dili

| Teknik kavram | Kullanıcı dili |
|---|---|
| plan revision | plan güncellemesi |
| deterministic planner | planlama sistemi |
| job queued | işlem sıraya alındı |
| quarantine | güvenlik kontrolünde |
| retry | yeniden dene |
| skip | bu görevi atla |
| reschedule | başka zamana taşı |
| capacity violation | bu plan seçtiğin süreye sığmıyor |
| stale version | bilgiler başka bir oturumda değişmiş |

## “Bugün” görev kartı

Her kart şunları gösterebilir:

- konu ve kaynak,
- tahmini süre,
- amaç/gerekçe,
- başla/tamamla,
- başka zamana taşı,
- atla,
- gerekirse “Bu neden bugün?” açıklaması.

## Plan değişikliği açıklaması

Bir değişiklik ekranı:

- ne değişti,
- hangi input tetikledi,
- kaç görev/tarih etkilendi,
- kapasite veya hedef etkisi,
- kabul/ret seçenekleri

göstermelidir.

## Ton

- açık, sakin, yönlendirici,
- yargılayıcı değil,
- başarı garantisi vermeyen,
- resmi kurum gibi görünmeyen,
- kullanıcı kontrolünü vurgulayan,
- hata durumunda ne yapılacağını söyleyen.

Kaçınılacak örnekler:

- “Başarısız oldun.”
- “Serini bozdun.”
- “Bu planla kesin kazanırsın.”
- “Sistem senin için en doğru kararı verdi.”

Tercih edilen:

- “Bu görev tamamlanmadı. Planı yeniden dengelemek için iki seçenek var.”
- “Bu öneri, salı günündeki uygunluk değişikliğine göre hazırlandı.”

## Legal ve AI disclosure

- Özet ve tam metin ayrılır.
- Zorunlu ve opsiyonel consent açıkça ayrılır.
- AI kullanılan içerikte ne için kullanıldığı, sınırı ve fallback'i gösterilir.
- Kullanıcı içeriğinin model eğitimi için kullanıldığı iddia edilmez; gerçek provider sözleşmesine göre metin hazırlanır.
- Draft hukuk metni production'da aktif edilemez.
