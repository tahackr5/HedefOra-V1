# Repository Yedek Politikası

Bu politika ilk günden desired-state'tir. İkinci şifreli kopya ve sıfırdan recovery kanıtı W001 başlangıcını engellemez; W007 kapsamında ve en geç ilk gerçek kullanıcı, public launch veya production promotion öncesinde hard gate'tir.

## Kanonik source

- GitHub repository ana remote'dur; current visibility DEC-025 uyarınca public'tir ve private geçiş ayrı hosted-capability yeniden doğrulama gate'idir.
- `main` için branch/ruleset protection hedef kontroldür; doğrulanmadan etkin varsayılmaz.
- release tags protected/signed mümkünse.
- branch protection ve required checks.

Canlı GitHub planı/ayarları bu kontrolleri sağlamıyorsa durum `BLOCKED_EXTERNAL` kalır. DEC-025 altındaki exact-SHA owner-controlled protokolü geçici ilerleme sağlar fakat main'i server tarafında protected yapmaz; `R-014` kapanmaz.

## İkinci kopya

En az bir seçenek:

- ikinci Git provider mirror,
- şifreli off-site bare mirror,
- şifreli günlük `git bundle` object storage.

Chat sohbeti, ZIP download linki veya tek PC klasörü yedek değildir.

## Sıklık

- Her tamamlanan task/wave commit + push.
- Günlük automated mirror/bundle.
- Haftalık integrity/fetch/fsck.
- Aylık clone-from-zero testi.
- Release öncesi tagged bundle ve package manifest.

## Yerel koruma

- Repo yalnız `C:\Projeler\HedefOra` gibi kanonik dizinde.
- ZIP ve export'lar `backups/` dışında; repo içine nested archive konmaz.
- `.env`, SSH key ve auth cache hiçbir backup artifact ile karışmaz.
- Disk/OneDrive sync tek başına yeterli sayılmaz.

## Silme

Remote repo, branch, tag, release veya backup silme owner approval ve ikinci doğrulama ister. Retention otomasyonu en az bir immutable good copy bırakır.

## Recovery testi

Boş dizinde:

1. primary remote erişilemez varsay,
2. second copy'den clone/restore,
3. manifest/commit/tag doğrula,
4. docs validator/build bootstrap çalıştır,
5. sonuç ve süreyi ledger'a yaz.
