# Sunucu Bootstrap Kontrol Listesi

## Envanter

- [ ] Linux dağıtımı ve destek süresi
- [ ] CPU/RAM/disk/IOPS
- [ ] public/private network
- [ ] timezone UTC; uygulama user timezone ayrı
- [ ] disk encryption/provider controls
- [ ] off-site backup target
- [ ] domain/Cloudflare ownership

## OS hardening

- [ ] security updates
- [ ] root SSH login kapalı
- [ ] password auth kapalı (break-glass plan hariç)
- [ ] firewall default deny
- [ ] fail2ban/rate limit veya provider equivalent
- [ ] NTP/time sync
- [ ] unattended security patch policy
- [ ] audit/auth log retention
- [ ] ayrı service accounts

## Runtime

- [ ] OCI runtime ve compose/orchestrator version lock
- [ ] non-root containers
- [ ] read-only filesystem where possible
- [ ] resource limits
- [ ] healthchecks
- [ ] image registry auth scoped
- [ ] deploy/release directories owner/mode

## PostgreSQL

- [ ] PostgreSQL 17
- [ ] app/migration/backup/read roles ayrılmış
- [ ] public listener yok veya strict firewall/TLS
- [ ] durable volume
- [ ] backup + WAL/PITR yaklaşımı
- [ ] monitoring/connection/lock settings
- [ ] restore rehearsal target

## Edge

- [ ] Cloudflare DNS/TLS
- [ ] origin allowlist/private route
- [ ] WAF/rate-limit baseline
- [ ] exact CORS origins
- [ ] health endpoint public bilgi sızdırmıyor

## Observability

- [ ] Sentry environment/release
- [ ] metrics/log/traces
- [ ] log rotation/redaction
- [ ] alert recipients/escalation
- [ ] disk/CPU/memory/DB/queue/backup alarms

## Codex

- [ ] dedicated account
- [ ] SSH key/policy
- [ ] no root/unlimited sudo
- [ ] Codex installed/authenticated
- [ ] project directory only
- [ ] production approvals active
- [ ] remote app-server not public
