# Repository Yedek Politikası

Bu politika, önceki yedek kaybının tekrarını önlemek için Wave 001 ön koşuludur.

## Kanonik source

- GitHub private repository ana remote.
- `main` protected; doğrudan force push/delete engelli.
- release tags protected/signed mümkünse.
- branch protection ve required checks.

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
