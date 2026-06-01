---
phase: 87
plan: 05
type: execute
status: complete
completed: 2026-05-30
requirements: [REQ-87-04, REQ-87-05]
---

# 87-05 Summary — Retro baseline closure

## What was delivered

The full Phase 87 closure deliverable: the V3 Stage 3 retro pass run against the
v8.1 window and the falsifiable baseline report.

- **Full retro run** `dd88887c-bbe2-4dd0-980d-518237fa1d7f` — 105 emails (window
  2026-04-20→05-20), 766,775 tokens, 0 failures. Preceded by a 41-email smoke
  (`a8844444…`). Side-channel isolation verified: 0 leaked `agent_runs.predicted`,
  0 leaked `pipeline_events` stage-3 rows.
- **`87-BASELINE-REPORT.md`** — 4 D-04 sections + SC checklist. Hand-graded
  (20-row diff): 16 correct / 0 incorrect / 4 ambiguous → **SC-4 PASS**.

## SC outcomes

- **SC-1 (catch-all ≥50% reclassify away): REFUTED — usefully.** Catch-all stayed
  flat (24→25 on real-customer mail). Hand-grading shows V3 is *correct*: the
  catch-all is large because non-actionable traffic (internal forwards, FYI,
  Coupa/Ariba automated mail) reaches Stage 3. **The next lever is upstream
  Stage 1 noise filtering, not Stage 3 prompt tuning.**
- **SC-2 (noise absent from Stage 3): REFUTED for the pre-Phase-84 window — expected.**
- **SC-3 (≥5 proposal clusters): PASS** — 101 live clusters; emerging intents
  `vendor_onboarding_request`, `wka_data_request`, `cdd_kyc_data_request`.
- **SC-4 (precision ≥70%): PASS** — 16/16 (100%) or 80% counting ambiguous.

## Deviation — loopback misclassification incident (found + mitigated)

Building the report surfaced a live production bug in the **Phase 84**
`own_outbound_invoice_loopback` rule: it keys on the *forwarder's* domain, so
colleagues forwarding customer dunning/rejection/credit mail into `debiteuren@`
from own-domain mailboxes were **classified as noise (loopback)** and kept out of
the Stage 3 actionable pipeline. A read-only V3 re-classification of the 67
loopback classifications found **27 (40%) carried real actions**.

**Verified correction (Graph dry-run 2026-05-30):** these were NOT actually
archived — `categorize_archive` only fires behind `isWhitelistMatch &&
auto_label_enabled` (false here), and `triage_shadow_mode` suppressed any Outlook
action. 25/27 are still in the inbox; 2 were human-deleted. Impact was contained;
the fix still matters before auto-archive graduates out of shadow mode.

Mitigation shipped this session:
- **PR #58** — fixed a separate `reconstructInput` schema-scope bug (`public.emails`
  → `email_pipeline.emails`) that blocked the retro run.
- **PR #59** — registry-gated the loopback rule + migration disabling it
  (`20260530_disable_own_outbound_loopback.sql`). Deployed; rule confirmed
  disabled (0 new loopback events since).
- **`87-LOOPBACK-RECOVERY.md`** — 27 recovery candidates tracked (operator
  re-dispatch is a deferred follow-up).

## Follow-ups (Track B — not blocking milestone closure)

1. (Optional, low-priority) re-dispatch the 27 misclassified emails into the Bulk Review actionable lane — they're already in operators' inboxes, so not urgent.
2. Build a **true-system-loopback matcher** so noise filtering can be safely
   re-enabled (pairs with Phase 999.6 Ariba/SAP); re-enable the registry row then.

## Artifacts

- `87-BASELINE-REPORT.md` (hand-graded)
- `87-LOOPBACK-RECOVERY.md`
- `supabase/migrations/20260530_disable_own_outbound_loopback.sql`
- Tables populated: `stage_3_retro_runs` (run `dd88887c`), `intent_volume_baselines`
