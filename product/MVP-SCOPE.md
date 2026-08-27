# MVP Kapsamı

## Dahil

### Public ve hesap

- indekslenebilir landing, ürün/özellik/güven sayfaları,
- kayıt, giriş, çıkış,
- e-posta doğrulama,
- şifre sıfırlama,
- session/refresh continuity,
- profil ve notification preference,
- Terms/Privacy/KVKK versioned consent,
- veri dışa aktarma ve hesap silme akışı.

### Onboarding

- KPSS, ALES veya DGS seçimi,
- hedef sınav tarihi ve tercihe bağlı hedef bilgisi,
- timezone ve haftalık uygunluk pencereleri,
- çalışma tercihi ve makul günlük yük sınırı,
- başlangıç kaynakları/konuları,
- taslak özet ve açık onay.

### Kaynak ve curriculum

- onaylı sınav/konu katalogları,
- kullanıcı tarafından eklenen kaynak metadata'sı,
- izinli dosya yükleme,
- quarantine, validation ve analysis lifecycle,
- kaynak sahipliği/izin beyanı,
- abuse report ve admin review.

### Planlama

- deterministik draft plan üretimi,
- kullanıcı kabulü ile ACTIVE plan,
- günlük görevler,
- complete, skip ve reschedule ayrı davranışları,
- kapasite/availability kontrolü,
- missed task sonrası açıklanabilir replan,
- plan revision history,
- hedef/availability/source değişikliğinde yeni öneri.

### AI enhancement

- opt-in veya açık disclosure,
- source analysis, summary veya açıklama önerileri,
- async job, quota ve maliyet sınırı,
- confidence/provenance,
- deterministic fallback,
- AI çıktısının aktif planı otomatik mutate etmemesi.

### Admin ve operasyon

- curriculum/source/legal registry yönetimi,
- quarantined upload inceleme,
- abuse/takedown ve appeal,
- job/operation görünürlüğü ve kontrollü retry,
- audit ve security event sorgulama,
- health, metrics, tracing ve incident runbook.

## MVP dışı

- ödeme/subscription,
- native iOS/Android,
- sosyal ağ, chat, mesajlaşma veya takipçi sistemi,
- leaderboard, rekabet, streak baskısı veya utandırıcı gamification,
- kurum/öğretmen marketplace,
- otomatik sınav başvurusu,
- unofficial scraping, paywall bypass, transcript/media indirme,
- kullanıcı adına web sitelerinde sınav/ödev çözme,
- under-18 hesaplar,
- OAuth/social login,
- mikroservisler,
- Redis veya ikinci message broker,
- real-time collaborative editing,
- başarı/sıralama garantisi.

## Scope değişikliği

Yeni özellik:

1. feature brief,
2. product acceptance,
3. security/privacy impact,
4. data/API/job impact,
5. test ve rollout planı

olmadan active wave'e alınmaz.
