# SSH Erişimi ve Sunucu Sınırları

## Hedef

Codex şifresiz SSH ile HedefOra development/staging ve gerektiğinde production hostuna bağlanabilsin; fakat hostun tamamında root yetkisi taşımasın.

## Hesaplar

Öneri:

- `hedefora-codex-staging`
- `hedefora-codex-prod`

veya en az ayrı authorized key/policy. Production hesabı günlük geliştirme için kullanılmaz.

## Anahtarlar

Yerel makinede ayrı ED25519 anahtarları:

```powershell
ssh-keygen -t ed25519 -a 100 -f "$env:USERPROFILE\.ssh\hedefora_staging_ed25519" -C "hedefora-codex-staging"
ssh-keygen -t ed25519 -a 100 -f "$env:USERPROFILE\.ssh\hedefora_prod_ed25519" -C "hedefora-codex-prod"
```

Private key:

- repoya, chat'e, ticket'a veya sunucu artifact'ına girmez,
- OS permission ile korunur,
- staging/prod arasında paylaşılmaz,
- kayıp/şüphede rotate edilir.

“Sunucuya şifresiz giriş”, private key'in mutlaka parolasız olması demek değildir. Tercih edilen yöntem anahtara passphrase koyup Windows/OpenSSH `ssh-agent` içinde açmaktır. Kesintisiz otomasyon için parolasız key zorunlu olursa bu key yalnız ilgili environment hesabında, dar filesystem/sudo/network sınırlarıyla kullanılmalıdır.

## SSH config

```sshconfig
Host hedefora-staging
  HostName <STAGING_HOST_OR_PRIVATE_IP>
  User hedefora-codex-staging
  IdentityFile ~/.ssh/hedefora_staging_ed25519
  IdentitiesOnly yes
  ServerAliveInterval 30
  ServerAliveCountMax 3
  StrictHostKeyChecking yes

Host hedefora-prod
  HostName <PRODUCTION_HOST_OR_PRIVATE_IP>
  User hedefora-codex-prod
  IdentityFile ~/.ssh/hedefora_prod_ed25519
  IdentitiesOnly yes
  ServerAliveInterval 30
  ServerAliveCountMax 3
  StrictHostKeyChecking yes
```

Host key fingerprint out-of-band doğrulanır. `StrictHostKeyChecking=no` kullanılmaz.

## Codex remote

- Önce terminalde `ssh hedefora-staging` başarılı olmalı.
- Remote host login shell PATH'inde `codex` bulunmalı ve yetkili kullanıcı hesabıyla authenticate edilmelidir.
- Codex app server transportu public internete doğrudan açılmaz.
- Uzak erişim public IP yerine VPN/mesh/private network ile tercih edilir.

## Filesystem yetkisi

Codex hesabı yalnız:

- repo/worktree dizinleri,
- build cache,
- deploy release dizini,
- uygulama-owned log/artifact alanı,
- gerekli socket/service command

üzerinde yetkilidir.

`/root`, diğer kullanıcı home'ları, SSH host private keys, DB backup encryption keys ve production secret store okunamaz.

## Sudo

Sınırsız `NOPASSWD: ALL` yasaktır. Gerekiyorsa allowlist wrapper veya exact commands:

- hedefora service status,
- approved release activate/rollback script,
- app-owned service restart,
- read-only journal filter

ile sınırlandırılır. Shell escape verebilen editor/pager/command allowlist'e konmaz.

## Deployment ayrımı

En güvenli model:

- Codex build/test/PR yapar,
- CI imzalı artifact üretir,
- staging deploy otomatik/approval policy,
- production deploy owner onayıyla release command,
- Codex production secret içeriğini görmez.

## Audit ve revoke

- SSH auth logları saklanır,
- her key comment/owner/environment ile envanterlenir,
- offboarding/revoke test edilir,
- 90 gün veya risk bazlı rotation,
- kullanılmayan key kaldırılır.
