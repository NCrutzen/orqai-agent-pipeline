---
phase: 55-debtor-email-pipeline-hardening
plan: 05
status: superseded
landed_at: web/lib/automations/debtor-email/triage/* (via Phase 55-01 migration + later evolutions)
---

Superseded. Functional equivalent achieved: triage writes carry `swarm_type='debtor_email'`; `intent_version` and `body_version` are populated by call sites and evolved through Phase 999.8 (predictor attribution). Build-time git-sha caching pattern was not adopted as originally scoped. See `55-CLOSURE.md`.
