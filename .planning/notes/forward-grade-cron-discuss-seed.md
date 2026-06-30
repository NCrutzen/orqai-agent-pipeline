# Forward-grade cron — fresh-phase discussion seed (off current main)

Source: comparison done 2026-06-25 between the deferred Phase-134 grade cron
(stale branch `workspace/info-routing-forward-grade`, pushed as record) and what
`origin/main` actually ships after closing V9.7 (#164).

## Problem (the gap on main)

main's forward **auto-flip** cron (`info-routing-forward-autoflip.ts`) ARMS live
Outlook forwarding by releasing per-bucket `stage_4_forward_buckets[x]=true`. But it
grades on the **proxy signal** — `swarm_review_signals.transition_kind = "category_edited"`
(the operator edited the AI's Outlook category label) — NOT on where mail was
**actually forwarded**. The real forward destination (the stronger, passive,
no-form ground-truth the operator asked for, memory `forward-match-as-wilson-ground-truth`)
exists ONLY in the one-shot `forward-wilson-backfill.ts` script — there is no
ongoing capture of it.

What main already has (do NOT redo): real routing_destinations map + 5 dept buckets
(#159), forward-wilson `.in()` chunk fix (#158), release gate lowered to
`FORWARD_WILSON_GATE = 0.70` (#162, operator decision), AI-Handled folder move.

## What the (deferred) grade cron adds

1. **Ongoing forward-match capture** — fetch real forwards from Graph each tick,
   match to the AI's predicted bucket, persist as first-class `forward_observed`
   signals in `swarm_review_signals` (vs the manual one-shot backfill).
2. **Coverage gate (D-05)** — a bucket releases only when ≥70% of its forwards are
   graded (distinct denominator from Wilson). main has no coverage gate.

## The pivotal reconciliation decision

main's autoflip already owns the release machinery (`planForwardBucketFlips` +
`release-forward-buckets`), the 0.70 Wilson gate, and per-brand/mailbox
reachability. It just reads the wrong signal. So the design fork is:

- **Option A — feed-signals (minimal, reuse main's release):** the new cron's ONLY
  job is capture forward-match → first-class `forward_observed` signals + coverage.
  Point the EXISTING autoflip at those signals instead of `category_edited`, and
  add the coverage gate to its plan. Smallest diff, keeps main's gate/reachability,
  no demotion. The stale branch did NOT do this (it predates main's autoflip-as-release).
- **Option B — replace (stale-branch approach):** new cron does capture AND release
  (Wilson+coverage); demote autoflip to monitoring-only. Self-contained but
  duplicates/replaces main's working release path.
- **Option C — hybrid:** cron captures + computes the per-bucket grade; autoflip
  stays the release executor, reading the cron's persisted grade.

Recommendation: **Option A** — upgrade the autoflip's INPUT from proxy to
forward-match + add coverage, rather than rebuild a parallel release path.

## DECISION (operator, 2026-06-25): Option A — feed main's autoflip.

Resulting phase scope (small, reconciled with main — NOT the stale standalone cron):
1. **Capture** real forwards (Graph, via `fetchForwardsByConversation`) → match to the
   AI's predicted bucket → persist first-class `forward_observed` signals into
   `swarm_review_signals` (ongoing; replaces the one-shot backfill as the source).
   Cherry-pick the pure `buildForwardSignalRow` + dedupe_key from the record branch.
2. **Repoint** `info-routing-forward-autoflip.ts`: read `forward_observed` (forward-match)
   signals instead of `transition_kind="category_edited"`; keep `planForwardBucketFlips`,
   the per-brand/mailbox reachability, and the 0.70 `FORWARD_WILSON_GATE` as-is.
3. **Add** the coverage gate (D-05: `computeBucketCoverage` + ≥0.70 coverage) to the
   autoflip release plan. Cherry-pick the pure helper from the record branch.
4. **Keep** main's gate at 0.70 (NOT 0.85). No autoflip demotion. No separate
   standalone grade cron, no `forward_grade_config` top-level column (capture rides the
   existing autoflip/behavior-sync cadence).

Net: ~upgrade autoflip's input signal + add coverage; reuse 3 pure helpers from the
record branch (`workspace/info-routing-forward-grade`). Far smaller than the deferred
standalone cron.

NOT in scope / still open for plan-phase:
- Slot/milestone (feeds V10.0 learning loop; or a focused standalone phase).
- Exact capture scheduling (ride autoflip's cron vs behavior-sync vs a thin step).
- Whether the `forward_observed` union members in signal-derive/transition-extract are
  needed under Option A or replaced by a lighter signal shape.

## Open items for the discussion / plan
- Slot/milestone: main renumbered "Phase 134" to the deferred ambient-loop (→ V10.0).
  This forward-grade capability is unslotted; it feeds the same V10.0 learning loop.
  Decide: V10.0-track phase vs a fresh V9.7.x vs standalone.
- Gate value: adopt main's 0.70 (not the stale branch's 0.85).
- Signal schema: does `forward_observed` need the union members + dedupe_key the
  stale branch added to `signal-derive`/`transition-extract`? (cherry-pickable.)
- `forward_grade_config` enablement: top-level swarms column (the stale branch's
  CR-01 fix) — still needed if the cron is a separate function; NOT needed under
  Option A if capture rides the existing autoflip/behavior-sync schedule.
- Reuse from the stale branch (cherry-pick candidates, all on the pushed record
  branch): `forward-signal.ts` (buildForwardSignalRow + dedupe), `computeBucketCoverage`
  + FORWARD_COVERAGE_GATE in `forward-wilson.ts`, the URL-chunk lessons.
