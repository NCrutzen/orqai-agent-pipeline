---
phase: 55-debtor-email-pipeline-hardening
status: superseded
closed_at: 2026-05-11
closed_by: triage (gsd-progress audit)
original_planned: 2026-04-23
plans_executed: 0
plans_total: 5
verdict: partially-delivered-via-different-architecture
---

# Phase 55 Closure Note

Phase 55 was planned 2026-04-23 as "debtor-email pipeline hardening" with four bundles (A: multi-mailbox, B: iController draft idempotency, C: review-lane fixes + generic verdict route, D: self-training Phase 1 hooks via `public.agent_runs`).

**None of the five 55-NN-PLAN.md files were executed under the Phase 55 banner.** The hardening goals were nevertheless achieved along a different architectural path: the Phase 63 RFC reframed the debtor-email swarm as a 5-stage agentic pipeline (Stage 0 safety → 1 noise → 2 entity → 3 coordinator → 4 handler), and the work that was scoped to Phase 55 either landed verbatim under later phases or was superseded by the new design.

## Where each plan landed

| Plan | Original Scope | Outcome | Landed Under |
|------|----------------|---------|--------------|
| **55-01** | `public.agent_runs` schema with `swarm_type` discriminator, version cols, human_verdict | ✅ **Delivered** | `supabase/migrations/20260428_public_agent_runs.sql` (schema verified: `swarm_type`, `intent_version`, `body_version`, `human_verdict` all present). Extended by Phase 74 (`entity_nullable`, `status_extended`), Phase 80 (`stuck_classifying_view`), Phase 999.8 (`predictor` column). |
| **55-02** | Drop hardcoded `ICONTROLLER_COMPANY`; per-row `mailbox_id` resolution | ✅ **Delivered** | `web/lib/automations/debtor-email/mailboxes.ts` + `icontroller_mailbox_id` used across `classifier-label-resolver.ts`, `classifier-invoice-copy-handler.ts`, `labeling-flip-cron.ts`, `label-email/route.ts`. Confirmed in production for smeba, smeba-fire, fire-control, sicli-noord/sud, berki. |
| **55-03** | `debtor.icontroller_drafts` table, `drafts-repository.ts`, HTML-comment marker for idempotency | ❌ **Superseded** by Phase 69 (handler-canonicalisation): Stage-4 handlers manage their own per-handler idempotency keys; the centralised draft-sentinel pattern was abandoned. No `icontroller_drafts` migration shipped; no `web/lib/automations/icontroller/drafts-repository.ts` exists. |
| **55-04** | Generic `/automations/review/[runId]` route + provenance chips on v7 Kanban | ❌ **Superseded** by Phase 71 (Bulk Review 4-axis redesign) + Phase 82 (unified stage-keyed shell). The single per-row review route was replaced by the Bulk Review surface with 4-axis override; provenance is now expressed via the predictor/confidence chip strip (Phase 999.8) and stage badges rather than the originally-scoped chip set. The route directory `web/app/(dashboard)/automations/review/[runId]/` does not exist. |
| **55-05** | All writes go to `public.agent_runs` with `swarm_type='debtor_email'` + git-sha versioning | ✅ **Largely delivered** | Triage writes carry `swarm_type` (introduced with the Plan-01 migration); version columns are populated and evolved through Phase 999.8 (predictor attribution). Build-time git-sha caching pattern was not adopted as originally specified — versions are set by the call site instead. Functional equivalent achieved. |

## Why this happened

Between the Phase 55 planning date (2026-04-23) and today, the Phase 63 RFC (2026-04-29) re-scoped the entire debtor-email pipeline. The new 5-stage funnel made the original Bundle-B (centralised draft sentinel) and Bundle-C (per-run review route + chip taxonomy) obsolete: handlers became responsible for their own idempotency, and the review surface unified into Bulk Review.

Bundles A and D (multi-mailbox + `public.agent_runs`) survived the rewrite because they were infrastructure rather than UX, and they shipped on time — just without the Phase 55 directory ever being marked complete.

## Operational impact

- `gsd-progress` was treating Phase 55 as the current phase because it has 5 PLAN.md files and 0 SUMMARY.md files. Routing was suggesting `/gsd-execute-phase 55`, which would have re-attempted scope that is either already delivered (01/02/05) or no longer applicable (03/04).
- The five PLAN.md files are retained for historical traceability. They are not to be executed.

## What's actually current

As of 2026-05-11 the active surface is Phase 999.8 (Stage-1 LLM confidence gate + predictor attribution) — VERIFICATION marked `human_needed` with 2 outstanding browser smokes. See `.planning/phases/999.8-*/999.8-VERIFICATION.md`.
