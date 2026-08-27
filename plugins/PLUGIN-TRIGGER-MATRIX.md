# Plugin Tetikleme Matrisi

| Aşama | Birincil | İkincil | Çağrılmaması gereken |
|---|---|---|---|
| W000 toolchain/docs | Context7, OpenAI Developers | GitHub | UI/video generators |
| Architecture | Context7, Mermaid Chart | API Documentation Checker | IcePanel source-of-truth yapılmadıkça |
| UX discovery | Mobbin | 01 Superdesign | aynı anda çoklu generator |
| Canonical UI | Figma | Mobbin reference | Canva/UX Pilot/Visily vb. parallel truth |
| Backend/frontend coding | Context7, GitHub | OpenAI Developers | web scraping tools |
| PR review | Codex `/review`, CodeRabbit | SonarQube | reviewer'ın doğrudan prod yazması |
| Security | Codex Security | security reviewer | unauthorized targets |
| Email | Resend | Sentry | Twilio |
| Edge/deploy | Cloudflare, GitHub | Sentry | Vercel/Render/Netlify |
| Runtime incident | Sentry | GitHub, Cloudflare/Resend ilgiliyse | design tools |
| Skill quality | Plugin Eval | OpenAI Developers | plugin listesi büyütme |
| Prelaunch public site | Agent Ready | Uxia | deploy generators |

## Trigger kuralları

1. Plugin çağrısı görevin acceptance'ına somut katkı sağlamalıdır.
2. Aynı veri için canonical source belirlenir.
3. Plugin çıktısı dosya/PR/scan ID veya evidence ile kaydedilir.
4. Bağlantı yoksa sahte çıktı yok; `BLOCKED_EXTERNAL`.
5. Plugin write yapacaksa owner/approval policy uygulanır.
6. Tool sonucu code/test ile doğrulanmadan final gerçek kabul edilmez.
