# Codex Ana Tetikleme Promptu

Aşağıdaki metni Codex uygulamasında, repository kökünde ve **GPT-5.6 Sol + Ultra** seçiliyken tek mesaj olarak verin.

```text
/goal HedefOra'yı bu repository içindeki Markdown blueprint'e göre sıfırdan, production-grade kalitede üret.

ÇALIŞMA MODU
- Bu depo şu anda bilinçli olarak documentation-only durumdadır.
- Önce AGENTS.md, START-HERE.md, DECISIONS.md, FILE-INDEX.md ve state/ACTIVE-WAVE.md dosyalarını oku.
- Ardından yalnız Wave 000 için gereken product/, architecture/, delivery/, agents/ ve .agents/skills belgelerini hedefli oku; bütün depoyu ana bağlama körlemesine yükleme.
- Ana oturum orchestrator'dır. GPT-5.6 Sol Ultra kullan. Bağımsız read-heavy analizleri alt ajanlara delege et; sonuçları ham log yerine kısa, kanıtlı özet olarak topla.
- Aynı anda en fazla dört write-capable ajan çalıştır. Aynı dosyaya iki writer atama. Security ve cold review ajanlarını read-only tut.

WAVE 000 HEDEFİ
1. Markdown sözleşmelerini tutarlılık, eksiklik, uygulanabilirlik ve güvenlik açısından denetle.
2. Çelişki varsa state/DECISION-QUEUE.md içine exact dosya/başlık/etki ile yaz. Owner gate gerektirmeyen geri alınabilir seçimlerde karar verip DECISIONS.md'e ADR bağlantılı kayıt ekle.
3. Resmi OpenAI Codex belgelerini OpenAI Developers üzerinden doğrula. Güncel formatla minimal project-scoped .codex/config.toml ve .codex/agents/*.toml üret. Agent charters agents/*.md dosyalarından türetilsin. Model gpt-5.6-sol olsun; Ultra'nın runtime eşlemesini ezberden uydurma, parent live override'ı koru ve gerçek ayarı raporla.
4. .agents/skills altındaki instruction-only skills'i doğrula. Plugin Eval ile evaluate edilebilecek test senaryolarını hazırla; başarı iddiası yalnız gerçekten çalıştırıldıysa yazılsın.
5. Monorepo iskeletini oluştur: Go modular monolith backend, PostgreSQL 17 + River, React/TypeScript frontend, OpenAPI contract, migrations, tests, CI, docs ve deploy katmanı. Exact dependency sürümlerini Context7/resmi docs ile doğrula ve lock et.
6. Root ve gerektiği kadar nested AGENTS.md/AGENTS.override.md oluştur; root talimatı 32 KiB altında ve progressive-disclosure odaklı olsun.
7. Quality gates'i baştan kur: formatting, lint/static analysis, unit, integration, contract drift, migration up/down, dependency/license/secret scan, frontend typecheck, accessibility smoke, merged-tree validation.
8. GitHub private repo/branch/worktree modelini kur. Tüm worktree'ler immutable WAVE_START_COMMIT'ten açılsın. Shared-file proposal ve orchestrator-only merge kuralını uygula.
9. Uygulama koduna yalnız Wave 000 exit gate geçtikten sonra başla. Wave 001'e otomatik geçebilirsin; production deploy yapma.

PLUGIN STRATEJİSİ
- Güncel docs: Context7 ve OpenAI Developers.
- Repo/PR/CI: GitHub.
- Diyagram: Mermaid Chart; Mermaid source repo içinde.
- UI discovery: Mobbin; canonical tasarım: Figma; hızlı prototip: 01 Superdesign. Birden fazla generator'ı aynı ekran için source of truth yapma.
- Review: Codex /review, CodeRabbit ve SonarQube.
- Güvenlik: Codex Security ile yetkili repo üzerinde değişiklik ve milestone scan'i; önemli release öncesi deep scan.
- Runtime: Sentry.
- E-posta ve edge: Resend ve Cloudflare yalnız ilgili wave'de.
- Agent/skill denetimi: Plugin Eval.
- Bir plugin bağlı değilse çıktı uydurma; BLOCKED_EXTERNAL yaz ve kalan işi sürdür.

DEĞİŞMEZLER
- Deterministik planlayıcı source of truth; AI yalnız bounded async enhancement.
- Redis, ikinci broker, mikroservis, native mobile, ödeme, sosyal ağ, gamification/leaderboard, izinsiz scraping/transcript/media download MVP dışı.
- Secret/private key/token repoya girmez.
- Codex'e root veya sınırsız sudo verilmez. Staging ve prod ayrı SSH key/account/policy kullanır.
- Production mutation, migration, DNS, secret rotation, restore, destructive admin ve rollout için owner approval gerekir.
- Test skip, assertion zayıflatma, lint threshold düşürme, placeholder success ve generated code elle düzenleme yasaktır.
- Untracked TODO yasaktır.

HER WAVE KAPANIŞI
- state/ACTIVE-WAVE.md ve state/RELEASE-LEDGER.md güncellensin.
- Başlangıç/bitiş commit SHA, ajanlar, worktree'ler, değişen dosyalar, test/gate komutları, sonuçlar, açık riskler, rollback ve blocker'lar yazılsın.
- Merge sonrası full-tree suite çalışsın.
- Fresh-context read-only cold review çalışsın.
- Exit gate geçmeden sonraki wave'e geçme.

İLK YANIT FORMATI
A. Yüklenen talimat kaynakları
B. Wave 000 görev DAG'ı
C. Spawn edilen ajanlar ve read/write sahiplikleri
D. Kullanılacak pluginler ve bağlantı durumu
E. İlk risk/çelişki listesi
F. Başlangıç commit'i ve çalışma planı

Planı açıklayıp bırakma; Wave 000'ı gerçekten uygula. Yalnız AGENTS.md'deki owner gate durumlarında dur.
```
