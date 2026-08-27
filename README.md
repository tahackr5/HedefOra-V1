# HedefOra — Codex Markdown Blueprint

**Paket sürümü:** 0.1.0  
**Tarih:** 2026-08-27  
**Durum:** CLEAN START / DOCUMENTATION-ONLY / IMPLEMENTATION NOT STARTED

Bu depo, HedefOra uygulamasının sıfırdan ve kontrollü biçimde üretilmesi için kanonik Markdown sözleşmelerini içerir. Paket bilinçli olarak yalnızca Markdown dosyalarından oluşur:

- uygulama kodu yoktur,
- çalıştırılabilir script yoktur,
- TOML/JSON/YAML yapılandırması yoktur,
- secret, token, özel anahtar veya gerçek sunucu adresi yoktur,
- geçmiş projeden derlenmiş kod ya da güvenilmeyen kalıntı yoktur.

Amaç, Codex'in önce bağlamı ve kuralları doğru anlaması; ardından Wave 000 içinde güncel Codex belgelerine göre gereken çalışma dosyalarını ve uygulama iskeletini üretmesidir.

## Ürün özeti

HedefOra; Türkiye'deki yetişkin sınav adaylarının KPSS, ALES ve DGS hazırlığını planlamasına yardım eden, açıklanabilir ve kullanıcı kontrolündeki bir çalışma planlama ürünüdür.

MVP'nin merkezi:

1. güvenli hesap ve onboarding,
2. kaynak/katalog tanımlama,
3. deterministik çalışma planı üretimi,
4. “Bugün” görev akışı,
5. tamamlama, erteleme, atlama ve yeniden planlama,
6. isteğe bağlı, sınırlandırılmış ve asenkron yapay zekâ desteği,
7. kullanıcı verisi üzerinde açık gizlilik, dışa aktarma ve silme denetimi,
8. güvenli self-hosted dağıtım, gözlemlenebilirlik ve geri dönüş.

## Kanonik teknoloji yönü

- **Backend:** Go modüler monolit
- **Veritabanı:** PostgreSQL 17
- **İş kuyruğu:** River / PostgreSQL tabanlı işler
- **Frontend:** React + TypeScript; public sayfalar indekslenebilir, uygulama alanı istemci etkileşimli
- **API:** OpenAPI 3.1, contract-first, generated client
- **Dağıtım:** Kendi Linux sunucumuzda OCI container'ları; Cloudflare edge/gateway
- **E-posta:** Resend
- **Hata/performans:** Sentry ve açık standart telemetry
- **AI ilkesi:** Deterministik çekirdek kaynak gerçektir; AI yalnız bounded async enhancement'tır

Kesin kütüphane sürümleri Wave 000'da Context7 ve resmi belgelerle doğrulanıp kilitlenir. Eski eğitim verisine dayanarak sürüm uydurulmaz.

## Belge hiyerarşisi

Çelişki halinde aşağıdaki sıra geçerlidir:

1. `AGENTS.md`
2. `DECISIONS.md`
3. `product/` ve `architecture/` içindeki kanonik sözleşmeler
4. `delivery/` yürütme ve kalite protokolleri
5. `state/ACTIVE-WAVE.md`
6. ajan charter'ları, skills, prompt ve template'ler

Çözülemeyen çelişki tahmin edilmez; `state/DECISION-QUEUE.md` içine yazılır ve owner gate açılır.

## İlk kullanım

1. `START-HERE.md` dosyasını okuyun.
2. `plugins/PLUGIN-INSTALL-CHECKLIST.md` içindeki eklentileri kurun veya doğrulayın.
3. Paketi boş bir özel Git deposuna koyun ve ilk commit'i oluşturun.
4. Codex'te proje kökünü açın; model olarak **GPT-5.6 Sol**, intelligence olarak **Ultra** seçin.
5. Üretim ortamında değil, önce yerel/staging ortamında çalışın.
6. `MASTER-TRIGGER.md` içindeki promptu tek seferde verin.

## En kritik güvenlik kararı

“Codex sunucuya tamamen erişsin” hedefi, **root veya sınırsız makine erişimi** anlamına gelmez. Doğru hedef:

> Codex, HedefOra repo/deploy dizinleri ve gerekli servis işlemleri üzerinde tam proje erişimine sahip, fakat işletim sisteminin geri kalanı, production secret'ları ve yıkıcı root işlemleri üzerinde sınırlı bir servis hesabıyla çalışır.

Ayrıntılar `operations/SSH-ACCESS-AND-SERVER-BOUNDARIES.md` içindedir.

## Paket bütünlüğü

`PACKAGE-MANIFEST.md`, kendisi hariç tüm Markdown dosyalarının SHA-256 değerlerini içerir. ZIP içindeki tüm normal dosyaların uzantısı `.md` olmalıdır.
