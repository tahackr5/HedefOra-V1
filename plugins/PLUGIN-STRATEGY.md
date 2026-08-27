# Plugin Stratejisi

## İlke

Daha çok eklenti daha iyi sonuç demek değildir. Aynı görevi yapan araçları birlikte açmak tool-selection belirsizliği, context gürültüsü, permission ve supply-chain yüzeyini büyütür. Her wave için en küçük araç seti kullanılır.

## Mevcut kurulu eklentiler — çekirdek kullanım

### Sürekli değer sağlayanlar

- **GitHub:** repo, issue, PR, CI ve publish akışları.
- **Context7:** güncel framework/library docs ve sürüm doğrulama.
- **OpenAI Developers:** güncel Codex/OpenAI resmi uygulama rehberi.
- **Mermaid Chart:** architecture/flow/ERD render ve syntax doğrulama; source repo Markdown'dır.
- **CodeRabbit:** PR-level ikinci code review.
- **SonarQube:** static analysis ve maintainability/security quality gate.
- **Sentry:** runtime error, trace ve release regression.
- **Resend:** email provider docs/operations.
- **Cloudflare:** edge, DNS, gateway ve private-origin rehberi.
- **Plugin Eval:** HedefOra skills ve plugin workflow'larının değerlendirilmesi.
- **Agent Ready:** launch öncesi public site agent-readability scan.
- **Plugin Management:** kurulum, bağlantı ve permission yönetimi.

### Tasarım aşamasında

- **01 Superdesign:** hızlı UI/visual prototip; final source of truth değildir.

### Yalnız ihtiyaç olursa

- **Twilio Developer Kit:** HedefOra MVP'de telefoni yok; devre dışı bırakılabilir.
- **Build MCP Apps:** HedefOra core için gerekli değildir; ileride HedefOra MCP/App yapılırsa.
- **Sites:** core uygulama yerine ayrı hızlı landing denemesi gerekirse; canonical product build değildir.
- **Documents/PDF/Spreadsheets/Presentations/Template Creator/Visualize/Default templates:** rapor veya içerik artefaktı gerektiğinde; kod akışında sürekli açık tutulmaz.

## Kurulması gerekenler

### Tier 0 — Şimdi kur

1. **Codex Security** — resmi repo security scan ve finding validation.

### Tier 1 — Tasarım başlamadan kur

2. **Figma** — ekipçe canonical design source olacaksa.
3. **Mobbin** — UI/UX reference research; kopyalama değil pattern analizi.

### Tier 2 — İhtiyaç halinde

4. **API Documentation Checker** — OpenAPI ve dokümantasyon kapsamını bağımsız kontrol etmek için.
5. **Uxia** — prototip/live usability ve accessibility araştırması için pilot aşamada.

## Şimdilik kurulmaması gerekenler

- SentinelX, Remote Desktop Commander veya benzeri high-privilege remote control: SSH ile aynı ihtiyacı tekrarlar ve attack surface büyütür.
- Supabase, Neon, WoWSQL, MongoDB Atlas, Aiven: kendi PostgreSQL mimarisiyle çakışır.
- Vercel, Render, Netlify, Railway, DigitalOcean deploy eklentileri: self-hosted kararımızla çakışır; sağlayıcı değişirse yeniden değerlendirilir.
- Datadog/Honeycomb: Sentry + açık telemetry başlangıçta yeterli; ikinci observability stack premature.
- Birden fazla UI/site generator: Figma + seçili prototyping tool dışında design drift yaratır.
- Firecrawl/Tavily/Parallel Search: teknik docs için Context7/resmi docs varken core code flow'a gerekmez.
- ArmorCodex/SentinelX gibi üçüncü taraf policy/agent kontrol araçları: ancak ayrı security/vendor review sonrası.

## Permission

- Read-only research eklentileri mümkünse read-only.
- GitHub write, Cloudflare, Resend ve production bağlantılarında write-before-ask.
- Global full access yok.
- Production credential eklenti chat'ine yapıştırılmaz.
