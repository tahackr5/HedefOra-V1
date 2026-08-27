# Ürün Vizyonu

## Problem

Sınav adayları çoğu zaman çok sayıda kaynak, değişken zaman, belirsiz öncelik ve aksayan günlük rutin arasında sürdürülebilir bir çalışma planı kuramaz. Statik takvimler gerçek hayattaki gecikme, atlama ve yeni kaynakları açıklanabilir biçimde yönetmez.

## Çözüm

HedefOra, kullanıcının sınav hedefi, kullanılabilir zamanı, kaynakları ve ilerlemesinden deterministik bir plan üretir. Kullanıcı her gün yalnızca “Bugün” görünümünde ne yapacağını, neden yapacağını ve tamamlamazsa ne olacağını görür. Plan değişiklikleri izlenebilir ve kullanıcı kontrolündedir.

## Ürün ilkeleri

1. **Açıklanabilirlik:** “Neden bu görev?”, “Neden tarih değişti?” sorularının cevabı vardır.
2. **Kontrol:** AI veya otomasyon, kullanıcının bilgisi dışında aktif planı değiştirmez.
3. **Gerçekçilik:** Plan kapasiteyi aşmaz; missed task'ı gizlemez veya utandırmaz.
4. **Az sürtünme:** İlk kullanılabilir plan onboarding'den sonra dakikalar içinde oluşur.
5. **Güven:** Kaynak, veri, consent, silme ve AI kullanımı açık anlatılır.
6. **Erişilebilirlik:** Klavye, ekran okuyucu, kontrast ve reduced-motion desteklenir.
7. **Tek kavram dili:** Mobile/desktop ve product/API dokümanlarında aynı anlamlar korunur.

## Birincil kullanıcı

18 yaş ve üzeri, Türkiye'de KPSS/ALES/DGS sınavına hazırlanan ve düzenli bir plan kurmak isteyen birey.

## İlk değer anı

Kullanıcı:

- sınavını,
- hedef tarihini,
- haftalık uygunluk saatlerini,
- en az bir kaynak veya konu kümesini

girince sistem ilk deterministik draft planı üretir. Kullanıcı inceleyip kabul edince plan ACTIVE olur.

## Başarı sinyalleri

Ürün başarı garantisi vermez. Ürün sağlığı şu davranışsal ve teknik sinyallerle ölçülür:

- onboarding tamamlama,
- ilk plan üretme süresi,
- plan kabul oranı,
- günlük görev açma/tamamlama,
- erteleme/atlama sonrası başarılı yeniden planlama,
- açıklama ekranı kullanımı,
- kullanıcı kontrollü export/delete başarısı,
- hata oranı ve görev kuyruğu gecikmesi.
