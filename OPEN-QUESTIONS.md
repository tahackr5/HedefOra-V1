# Açık Sorular

Bu dosya ürün geliştirmeyi engellemeyen, fakat launch öncesi owner veya dış sağlayıcı yanıtı isteyen soruları toplar. Aktif karar gerektiren öğeler `state/DECISION-QUEUE.md` içine taşınır.

## Owner girdisi gerekenler

1. İlk public landing mesajında tek bir hero segment mi öne çıkacak: KPSS, ALES veya DGS?
2. Marka kimliği için mevcut logo/renk/font kaynağı var mı, yoksa Figma'da sıfırdan mı üretilecek?
3. Hedef production alan adı ve Cloudflare hesabı hangi owner'a ait olacak?
4. Sunucu sağlayıcısı, Linux dağıtımı, CPU/RAM/disk ve yedek hedefi nedir?
5. Production PostgreSQL aynı hostta mı, ayrı hostta mı çalışacak?
6. S3-compatible object storage kendi sunucumuzda mı, harici sağlayıcıda mı olacak?
7. Resend domain doğrulaması ve gönderici adı nedir?
8. KVKK/Terms/Privacy metinlerini onaylayacak hukuk sahibi kimdir?
9. KPSS/ALES/DGS curriculum package'larını doğrulayacak içerik sahibi kimdir?
10. Sentry self-hosted mi, SaaS mı kullanılacak?

## Bloklamayan varsayımlar

Owner yanıtına kadar:

- marka token'ları nötr ve değiştirilebilir tutulur,
- production host bilgileri placeholder değil environment input olarak ele alınır,
- local/staging geliştirme ilerler,
- legal metinler `DRAFT_NOT_FOR_PRODUCTION` durumunda kalır,
- içerik paketi olmadan teknik altyapı test edilir fakat curriculum gate PASS ilan edilmez.
