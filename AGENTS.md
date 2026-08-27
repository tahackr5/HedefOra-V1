# HedefOra — Codex Kök Talimatları

Bu dosya, repository düzeyindeki birincil Codex talimatıdır. Her görevden önce uygulanır.

## 1. Misyon

HedefOra'yı sıfırdan; güvenli, sürdürülebilir, test edilebilir, ekip çalışmasına uygun ve self-hosted dağıtıma hazır bir ürün olarak üret. Hız uğruna kanonik sözleşmeleri, test kanıtını, veri güvenliğini veya geri dönüş kabiliyetini feda etme.

## 2. Dil ve adlandırma

- Kullanıcıya ve ürün belgelerine Türkçe yaz.
- Kod, symbol, API field, migration ve commit mesajlarında açık İngilizce kullan.
- Teknik terimi ürün arayüzüne doğrudan taşımadan önce content-design sözlüğünü kontrol et.
- Kullanıcıyı suçlayan, utandıran veya başarı garantisi veren dil kullanma.

## 3. Önce oku, fakat tüm depoyu körlemesine yükleme

Her görevde minimum bağlam seti:

1. bu dosya,
2. `DECISIONS.md`,
3. `state/ACTIVE-WAVE.md`,
4. görevin dokunduğu product/architecture/delivery dosyaları,
5. ilgili ajan charter'ı ve skill.

Tüm belgeleri her turda yeniden okumak yasaktır. `FILE-INDEX.md` ile hedefli okuma yap. Ana oturumda ham test logları ve geniş keşif çıktıları tutma; alt ajanlar kısa, kanıtlı özet döndürsün.

## 4. Kanonik hiyerarşi ve çelişki

Öncelik:

1. `AGENTS.md`
2. `DECISIONS.md`
3. `product/` ve `architecture/`
4. `delivery/`
5. aktif wave ve görev brief'i
6. agent/skill/template belgeleri

Çelişki görünce:

- sessizce seçim yapma,
- iki tarafı ve etkisini `state/DECISION-QUEUE.md` içine yaz,
- güvenli ve geri alınabilir işlerle devam et,
- karar kritikse owner gate aç.

## 5. Model politikası

- Ana oturum: GPT-5.6 Sol, Ultra.
- Alt ajanlar parent runtime seçimini miras alır; model sessizce düşürülmez.
- Platform Ultra'yı alt ajana birebir aktaramıyorsa gerçek modeli/effort'u kanıtta belirt.
- Codex config değerlerini ezberden uydurma; Wave 000'da resmi OpenAI docs ile doğrula.

## 6. Orkestrasyon

Ana oturum `agents/00-ORCHESTRATOR.md` rolündedir.

- Read-heavy keşif, sözleşme analizi, test analizi ve review işleri alt ajanlara paralel verilebilir.
- Aynı anda en fazla dört yazan ajan çalışır.
- Aynı dosyanın aynı wave içinde yalnız bir yazma sahibi vardır.
- Security ve cold-review ajanları read-only çalışır.
- Tüm worktree'ler aynı immutable `WAVE_START_COMMIT` üzerinden açılır.
- Shared dosyalar yalnız orchestrator tarafından birleştirilir.
- Bir ajan kendisine atanmayan dosyayı değiştirmez; önerisini structured proposal olarak verir.

## 7. Kod üretim ilkeleri

- Önce sözleşme ve acceptance criteria, sonra kod.
- En küçük savunulabilir değişikliği yap.
- Modüler monolit sınırlarını koru; cross-domain doğrudan DB erişimi veya import oluşturma.
- OpenAPI/DB/event/job catalog drift'ine izin verme.
- Generated dosyaları elle düzenleme.
- Yeni production dependency için gerekçe, risk, lisans ve bakım değerlendirmesi olmadan ekleme yapma.
- Untracked TODO yasaktır. Takip edilen TODO issue, owner ve son tarih taşır; mevcut acceptance'ı bypass edemez.
- Testi skip ederek, assertion'ı gevşeterek veya kalite eşiğini düşürerek yeşil yapma.
- Hata durumlarını success'e dönüştüren placeholder/mock üretme.

## 8. Veri ve güvenlik değişmezleri

- Secret, private key, token veya gerçek `.env` içeriği repoya girmez.
- Production verisi development/test'e kopyalanmaz.
- Loglarda credential, raw token, hassas kişisel veri veya kaynak içeriği bulunmaz.
- Deterministik planlayıcı source of truth'tur; AI sonucu doğrudan aktif planı değiştiremez.
- Destructive account/admin/production işlemleri recent re-auth veya step-up ister.
- Upload doğrulanmadan READY olamaz.
- E-posta gönderimi, işlenme anında token/entitlement/consent durumunu yeniden doğrular.
- Hard delete ve audit retention birbirine zarar vermeyecek biçimde tasarlanır.
- Başarı garantisi, resmi kurum gibi görünme veya izinsiz içerik edinme yoktur.

## 9. Plugin politikası

Eklentiler amaç odaklı çağrılır; “hepsini kullan” yaklaşımı yoktur.

- Güncel teknik API: Context7 ve resmi provider docs.
- Git/PR/CI: GitHub.
- Kod review: CodeRabbit + Codex `/review` + cold reviewer.
- Static quality: SonarQube.
- Güvenlik: Codex Security; yalnız yetkili repo üzerinde.
- Runtime hata: Sentry.
- UI araştırma/prototip: Mobbin, Figma, 01 Superdesign; tasarım source of truth tek olmalı.
- Diyagram: Mermaid Chart; source Markdown içinde tutulur.
- Edge/e-posta: Cloudflare ve Resend yalnız ilgili wave'de.
- Agent/skill kalitesi: Plugin Eval.

Bir plugin yoksa veya bağlantısı başarısızsa sahte çıktı üretme. `BLOCKED_EXTERNAL` kaydı aç ve yerel, kanıtlanabilir işlerle devam et.

## 10. Production ve SSH

- Codex'e root hesabı veya sınırsız sudo verme.
- `hedefora-codex` gibi dedicated service account kullan.
- Staging ve production anahtarları ayrıdır.
- Production deploy, migration, secret rotation, DNS, backup silme, DB restore ve destructive komutlar owner approval ister.
- Prod SSH bağlantısı sıradan kod yazımında açık tutulmaz.
- Host key doğrulamasını kapatma; `StrictHostKeyChecking=no` kullanma.

## 11. Her değişiklik için bitiş kanıtı

Aşağıdakiler olmadan “tamamlandı” deme:

- değişen davranış ve gerekçe,
- değişen dosyalar,
- uygulanan sözleşmeler,
- çalıştırılan test/gate komutları ve exit sonucu,
- merge sonrası full-tree doğrulama,
- risk ve rollback,
- açık blocker/owner input,
- commit SHA ve branch/worktree.

## 12. Durma koşulları

Yalnız şu durumlarda owner'a dön:

- production veya geri döndürmesi zor mutation,
- secret/credential/hesap erişimi ihtiyacı,
- ürün kapsamını veya hukuki yükümlülüğü değiştiren karar,
- iki kanonik sözleşme arasındaki gerçek çelişki,
- veri kaybı/güvenlik olayı şüphesi,
- doğrulanamayan dış bağımlılık,
- acceptance criteria'yı koruyarak ilerlemenin mümkün olmaması.

Normal implementasyon ayrıntıları için tekrar tekrar soru sorma; en güvenli, en basit ve kanonik tercihi seçip karar kaydı bırak.
