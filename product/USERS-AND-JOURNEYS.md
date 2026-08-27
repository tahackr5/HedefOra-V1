# Kullanıcılar ve Ana Yolculuklar

## Roller

### Learner

Kendi profilini, hedefini, kaynaklarını, planını ve verisini yönetir. Başka kullanıcının verisini göremez.

### Content Reviewer

Sınav curriculum package'larını ve kaynak metadata'sını inceler. Kullanıcı hesabı veya production secret yönetemez.

### Support/Admin

Rapor, operation, abuse, legal registry ve destek akışlarını yönetir. Yıkıcı işlemler step-up ve audit ister.

### System Worker

River job'larını işler. HTTP session yetkisi taşımaz; işi çalıştırmadan güncel entitlement ve state'i yeniden doğrular.

## Journey 1 — Kayıttan ilk plana

1. Kullanıcı landing'den kayıt olur.
2. Legal document versionlarını görür ve gerekli consent'leri verir.
3. E-posta doğrulaması tamamlanır.
4. Sınav, tarih, timezone, availability ve kaynak seçer.
5. Sistem input özetini ve olası plan kapasitesini açıklar.
6. Deterministik DRAFT plan oluşur.
7. Kullanıcı planı inceler ve kabul eder.
8. Plan ACTIVE olur, “Bugün” açılır.

## Journey 2 — Günlük çalışma

1. Kullanıcı “Bugün” ekranını açar.
2. Görev süresi, konu, kaynak ve gerekçeyi görür.
3. Complete, reschedule veya skip seçer.
4. Sistem sonucu ve plan etkisini açıklar.
5. Gerekliyse yeni plan revision önerilir; kullanıcı görür.

## Journey 3 — Availability değişikliği

1. Kullanıcı haftalık uygunluğunu değiştirir.
2. Version/If-Match ile stale write korunur.
3. Sistem mevcut planın etkisini simüle eder.
4. Kullanıcı öneriyi kabul ederse yeni revision ACTIVE olur.

## Journey 4 — Source upload

1. Kullanıcı sahiplik/izin beyanı verir.
2. Upload QUARANTINED başlar.
3. Boyut, format, malware ve policy validation çalışır.
4. Uygun içerik analysis queue'ya geçer.
5. READY yalnız tüm zorunlu kapılar geçince olur.
6. Failure, user-safe reason code ve retry/appeal yolu ile görünür.

## Journey 5 — Veri dışa aktarma ve silme

1. Kullanıcı recent re-auth yapar.
2. Export job enqueue edilir; worker current state'i yeniden kontrol eder.
3. Süresi sınırlı download üretilir.
4. Delete request açık kapsam ve bekleme süresi ile onaylanır.
5. Session'lar revoke edilir; hard-delete policy sonunda çalışır.
6. Yasal/audit retention ile silme sınırları açıkça gösterilir.
