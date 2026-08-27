# Release Readiness Prompt

```text
Bu commit/image için staging veya production release readiness denetimi yap. $hedefora-release-readiness skill'ini kullan. Deployment yapma; yalnız owner approval sonrası production mutation yapılabilir.

Full merged-tree gates, migration compatibility, staging smoke/E2E/load/accessibility, Sentry/alerts, backup freshness/restore rehearsal, rollback drill, SBOM/provenance, dependency/license, Codex Security deep scan, Sonar, CodeRabbit/Codex review ve fresh cold review kanıtlarını doğrula.

Her kanıtı exact commit/digest ve timestamp ile eşleştir. NOT_RUN/BLOCKED'i PASS yapma. Son verdict yalnız GO, NO_GO veya BLOCKED olsun; açık owner approvals ve risks'i listele.
```
