---
captured: 2026-05-18
source: Phase 82.8 UAT — dry-run scope investigation
status: pending
priority: M
tags: [dry-run, gating, pipeline, review-pane, governance]
---

# Granular dry-run gating — per stage, per handler, with review-pane labeling

## The observation that triggered this

UAT against Phase 82.8 (2026-05-18) surfaced that `debtor.labeling_settings.dry_run`
**only gates intent labeling** (classifier-label-resolver → classifier-invoice-copy-handler
→ debtor-email-icontroller-tagger). The noise cleanup pipeline
(`debtor-email-icontroller-cleanup-worker.ts`) has **no dry-run gate** —
it runs against iController live regardless. As of 2026-05-18, this env
has 867 real iController delete operations on noise emails over the last
~4 weeks, even though SMEBA is officially in dry-run for intent labeling.

This contradicts the operator's mental model of what "dry_run" means.
The flag's name implies "nothing real happens for this mailbox"; in
reality it gates a narrow slice of behavior.

## The proposed change

Replace the single `labeling_settings.dry_run` boolean with **per-stage**
(and for Stage 4, **per-handler**) gating:

| Stage | Today | Proposed |
|---|---|---|
| Stage 0 (safety) | always live | always live (read-only) |
| Stage 1 (noise filter classification) | always live | always live (read-only) |
| Stage 1 side-effect (Outlook archive) | always live | `stage_1_archive_dry_run` flag |
| Stage 1 side-effect (iController cleanup) | always live | `stage_1_cleanup_dry_run` flag |
| Stage 2 (customer entity) | always live | always live (read-only) |
| Stage 3 (intent classifier) | always live | always live (read-only) |
| Stage 3 side-effect (intent labeling) | gated by `dry_run` | `stage_3_labeling_dry_run` flag |
| Stage 4 handler (e.g. invoice-copy) | gated by `dry_run` | `stage_4_handler_<name>_dry_run` map |

Optional generalization: a single `dry_run_gates jsonb` column on
`labeling_settings` keyed by stage+side-effect or stage+handler-name,
so new handlers don't require schema migrations.

## Review-pane labeling (the second half of the idea)

Today the Bulk Review surface presents predicted/dry-run rows alongside
live rows without visual differentiation. Operator must mentally track
which mailboxes are in dry-run. Proposed:

- Mark each row in the Review pane with a small `dry-run` chip when the
  stage/handler that produced it was in dry-run mode at the time.
- The chip is computed from the row's origin event's `decision_details`
  (we record dry-run status at emit time, not lookup time — survives
  flips later).
- Color contrast: dry-run chip uses muted/amber; live rows have no chip
  (default). Matches existing chip patterns (mailbox chip, predictor
  chip from Phase 82.7).

This makes the operator's mental model concrete and auditable.

## Why this matters

1. **Safety surface mismatch.** "Dry-run" as a single flag is too coarse.
   Operators sign off on dry-run intending NO real iController action,
   but cleanup-worker writes live regardless. Granular gates restore the
   safety contract.
2. **Promotion path clarity.** The auto-flip cron (`labeling-flip-cron.ts`)
   evaluates a single promotion threshold (`n >= 50 && ci_lo >= 0.95`)
   per mailbox. With per-stage gating, each gate can have its own
   promotion criteria — cleanup might promote at n=20, labeling at n=50,
   handlers at n=100.
3. **Observability for the operator.** Review-pane chips let the operator
   see at a glance "this was dry-run when the decision happened" without
   cross-referencing `labeling_settings`.

## Out of scope today

- Migration design (schema-level vs jsonb).
- UI prototyping for the chip.
- Backfilling historical rows with origin dry-run state (decision_details
  doesn't carry it today — would only apply forward).

## Open questions

- Stage 4 handlers: do we gate per-handler-instance (e.g. `invoice-copy`)
  or per-handler-class? Probably per-class since handler instances are
  registry-driven (swarms.side_effects[]).
- Should "always-live" stages (0, 1 classifier, 2, 3 classifier) get a
  kill-switch flag for cases where a runaway classifier needs to be
  paused entirely? Probably yes, but a different mechanism (feature flag,
  not labeling_settings).

## Next step

Spec phase when prioritised. Likely a v8.1 or v9 milestone item — not
blocking v8.0 closure.
