---
phase: 56-icontroller-auto-labeling-van-accounts-aan-emails
status: shipped
closed_at: 2026-05-11
closed_by: triage (gsd-progress audit)
plans_executed: 9 (1 with explicit SUMMARY, 8 with stub SUMMARY pointing here)
verdict: production
---

# Phase 56 Closure Note

Phase 56 (iController auto-labeling van accounts aan emails) shipped to production. Documentation lag: only `56-00-SUMMARY.md` was written at the time; plans 01–08 carry stub summaries pointing here.

## Production evidence

- **Code modules**
  - `web/lib/inngest/functions/labeling-flip-cron.ts` — Wilson-CI flip cron with FLIP_N_MIN=50, writes `debtor.labeling_settings` per mailbox.
  - `web/lib/automations/debtor-email/llm-tiebreaker.ts` — strict json_schema tiebreaker with post-validate.
  - `web/lib/automations/debtor-email/resolve-debtor.ts` — 4-layer resolver pipeline (thread → sender → identifier → unresolved).
  - `web/lib/automations/debtor-email/nxt-zap-client.ts` — Bearer + lookup_kind + Zod-validated NXT lookups.
- **Migrations shipped**
  - `20260428_debtor_email_labeling_phase56.sql` (Wave 0 schema extension)
  - `20260429d_labeling_settings_brand_id.sql`
  - `20260429f_email_labels_identifier_match.sql`
  - `20260430c_email_labels_feedback_and_invoice_copy.sql`
  - `20260504a_email_labels_icontroller_tag_status.sql`
  - `20260507_phase74_labeling_settings_entity_check_fire_control.sql` (later extension)
- **Operational state**: labeling flip cron is live; mailboxes have been progressively flipped out of `dry_run` via the per-mailbox checklist in `56-08-PLAN.md`.

## What plans 01–08 covered

| Plan | Topic |
|------|-------|
| 56-01 | iController session + auto-labeling browser flow |
| 56-02 | NXT contactperson schema + Zap setup |
| 56-03 | iController label UI selector contract (probe) |
| 56-04 | LLM tiebreaker integration |
| 56-05 | Resolver pipeline + email_labels writes |
| 56-06 | label_dashboard_counts RPC + UI |
| 56-07 | Labeling-flip cron + Wilson CI |
| 56-08 | Per-mailbox flip checklist (operational, not code) |

All are reflected in shipped code and migrations above. No outstanding scope.
