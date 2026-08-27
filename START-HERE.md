# Başlangıç Rehberi

Bu dosya, temiz HedefOra deposunun ilk 90 dakikasında uygulanacak sırayı tanımlar.

## 0. Ön koşullar

- Boş ve özel bir GitHub deposu
- Güncel Git
- Codex destekli ChatGPT masaüstü uygulaması
- GPT-5.6 Sol + Ultra erişimi
- Yerel geliştirme için WSL2 veya Linux ortamı
- Sunucuya erişim henüz açılacaksa ayrı staging ve production SSH anahtarları
- GitHub, Context7, CodeRabbit, SonarQube, Sentry, Resend ve Cloudflare hesap/bağlantıları

## 1. Paketi yerleştir

Paketi boş bir dizine çıkar. Eski HedefOra kodunu, zip kalıntılarını, `.env` dosyalarını veya doğrulanmamış kopyaları aynı dizine taşımayın.

Önerilen ilk Git akışı:

```bash
git init
git branch -M main
git add .
git commit -m "docs: establish HedefOra clean-start blueprint v0.1.0"
git remote add origin <PRIVATE_GITHUB_REMOTE>
git push -u origin main
```

Gerçek remote adresi belgelerde tutulmaz.

## 2. Yedek zincirini önce kur

Kod üretiminden önce `operations/REPOSITORY-BACKUP-POLICY.md` uygulanır. En az:

- GitHub private remote,
- ikinci şifreli off-site kopya veya Git bundle,
- yerel çalışma kopyası,
- haftalık geri yükleme doğrulaması

olmadan Wave 001 başlamaz.

## 3. Codex izin modu

Yerel geliştirme için başlangıç modu:

- workspace write,
- ağ yalnız ihtiyaç halinde,
- yazma ve hassas eylemlerde approval,
- production için daima owner approval.

Global “full access / never ask” kullanmayın. Bir ajan, sadece işi bitirmek için koruma seviyesini düşüremez.

## 4. Eklentileri hazırla

Tier 0 ve Tier 1 tanımlarını `plugins/PLUGIN-STRATEGY.md` içinden okuyun; bağlantı ve permission doğrulamasını `plugins/PLUGIN-INSTALL-CHECKLIST.md` ile yapın. Her eklenti her turda açık tutulmaz; `plugins/PLUGIN-TRIGGER-MATRIX.md` hangi aşamada hangisinin çağrılacağını söyler.

## 5. Codex projesini aç

- Codex uygulamasında bu klasörü proje olarak ekleyin.
- Model: GPT-5.6 Sol
- Intelligence: Ultra
- Proje kökü: bu `README.md` ve `AGENTS.md` dosyalarının bulunduğu dizin
- İlk çalıştırma: yerel makine veya ayrılmış development host

## 6. Başlat

`MASTER-TRIGGER.md` içindeki promptu yapıştırın. İlk görev Wave 000'dır. Wave 000:

- bütün Markdown sözleşmelerini denetler,
- karar çelişkilerini raporlar,
- güncel Codex formatına göre minimal `.codex/` çalışma katmanını üretir,
- repo iskeletini çıkarır,
- quality gate'leri kurar,
- henüz production deploy yapmaz.

## 7. İlk owner gate

Wave 000 ancak şu raporları verdikten sonra kapanır:

- kesin teknoloji/sürüm kilidi,
- oluşturulan repo ağacı,
- custom-agent config özeti,
- plugin bağlantı durumu,
- yerel test/CI ön koşulları,
- SSH ve staging hazırlık durumu,
- açık kararlar ve riskler.

Normal, geri alınabilir geliştirme seçimleri için kullanıcıya sürekli soru sorulmaz. Yalnız `delivery/OPERATING-MODEL.md` içindeki owner gate konularında durulur.

## 8. Sunucu bağlantısı

SSH erişimini uygulama kodundan önce değil; staging deploy yaklaşınca açın. Önce `operations/SSH-ACCESS-AND-SERVER-BOUNDARIES.md`, sonra `operations/SERVER-BOOTSTRAP-CHECKLIST.md` izlenir.
