# Architecture Decision Register

## ADR-0001 — Clean-start, documentation-first

**Durum:** Accepted  
Eski yedeklerin kaybolması ve önceki paketlerde drift/orkestrasyon sorunları nedeniyle kod taşınmayacak. Önce küçük, kanonik Markdown sözleşmesi; sonra güncel Codex runtime katmanı ve kod üretilecek.

## ADR-0002 — Go modular monolith

**Durum:** Accepted  
İlk ürün için mikroservis karmaşıklığı yerine net domain boundaries, tek deployable codebase ve ayrılabilir process modes kullanılacak.

## ADR-0003 — PostgreSQL 17 + River

**Durum:** Accepted  
Transactional data ve job queue tek consistency boundary'de tutulacak. MVP'de Redis/broker eklenmeyecek.

## ADR-0004 — Deterministic planner, bounded AI

**Durum:** Accepted  
Planın tekrar üretilebilirliği, açıklanabilirliği ve fallback'i AI provider'a bağlı olmayacak. AI yalnız isteğe bağlı async enrichment sağlar.

## ADR-0005 — Contract-first API

**Durum:** Accepted  
OpenAPI 3.1 public contract'tır; generated client ve drift gates zorunludur.

## ADR-0006 — Self-hosted private origin + Cloudflare edge

**Durum:** Accepted  
Origin kendi Linux sunucumuzda çalışır; public attack surface edge/gateway ile sınırlandırılır.

## ADR-0007 — Dedicated Codex service account

**Durum:** Accepted  
Passwordless SSH kullanılabilir; fakat root ve sınırsız sudo yoktur. Codex'in “tam erişimi” proje dizini, build/deploy artifact'ı ve allowlisted service operations ile sınırlıdır.

## ADR-0008 — Single-writer worktree governance

**Durum:** Accepted  
Parallel read-heavy ajanlar teşvik edilir; write-heavy işlerde dosya başına tek owner, immutable base commit ve orchestrator-only shared merge uygulanır.

## ADR-0009 — Progressive disclosure

**Durum:** Accepted  
Root AGENTS kısa kalır; görev belgeleri, agent charter ve skills yalnız gerektiğinde yüklenir. Ana oturum ham log deposuna çevrilmez.

## ADR-0010 — Plugin minimalism

**Durum:** Accepted  
Birden çok overlapping araç aynı source of truth rolünü üstlenmez. Eklentiler wave/iş amacına göre çağrılır.

## Yeni ADR şablonu

`templates/ADR.md` kullanılır. Yeni karar burada yalnız tek satır özetle indekslenir.
