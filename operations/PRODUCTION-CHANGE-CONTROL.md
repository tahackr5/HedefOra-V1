# Production Değişiklik Kontrolü

## Değişiklik sınıfları

### Standard

Önceden test edilmiş, düşük riskli ve geri alınabilir. Yine release record ve approval policy gerekir.

### Normal

Yeni release/config/migration; change brief, risk, test, rollback ve owner approval.

### Emergency

Aktif incident containment. Minimum güvenli onay, tam log ve sonradan postmortem.

## Change brief

- amaç ve user impact,
- environment,
- commit/image digest,
- migration/config/secret/DNS etkisi,
- preconditions,
- exact execution,
- verification,
- abort/rollback,
- owner/implementer/time window.

## Codex sınırı

Codex:

- plan ve command taslağı hazırlayabilir,
- staging'de izin politikasına göre uygulayabilir,
- production eylemi açık kullanıcı onayı olmadan çalıştıramaz,
- onayı genel/kalıcı yetki gibi yorumlayamaz,
- environment'i komut öncesi tekrar doğrular,
- secret değerini output/log'a yazmaz.

## Yasaklar

- doğrudan production DB shell ile plansız data fix,
- `latest` deploy,
- backup doğrulamadan migration,
- telemetry kapalı deploy,
- rollback olmadan destructive config,
- SSH host key doğrulamasını kapatma,
- approval'ı atlamak için alternate tool/plugin.
