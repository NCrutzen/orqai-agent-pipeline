---
phase: 81
plan: 03
subsystem: stage-1-ui
tags: [stage-1, ui-shell, chip-strip, pending-promotion, sub-view, sketch-005]
requires:
  - "Phase 81-01 review/ → stage-1/ rename (inlined page body)"
  - "Phase 81-02 loadStage2WeeklyCount + Stage 2 placeholder route"
  - "Phase 76 _shell/PageHeader + _shell/StageTabStrip (registry-driven)"
provides:
  - "Sketch-005-locked /stage-1 surface — chrome matches /stage-0, /stage-3, /stage-4"
  - "Functional Pending Promotion sub-view at ?sub=pending (renders for the first time)"
  - "Server actions promoteRule / rejectRule + loadRuleSamples helper"
affects:
  - "Stage 1 daily-driver surface chrome — operators now see the unified stage-keyed shell"
  - "Pending Promotion no longer dead — was previously routed by QueueTree's ?sub=pending push but never branched the loader"
tech-stack:
  added: []
  patterns:
    - "Server action with FormData signature for <form action={…}> wiring"
    - "Loader short-circuit branch on params.sub — skips per-row enrichment waterfall"
    - "RSC RTL test pattern: await async component → render → mock children at module boundary"
key-files:
  created:
    - "web/app/(dashboard)/automations/[swarm]/stage-1/noise-category-chip-strip.tsx"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/candidate-rule-list.tsx"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/pending-promotion-detail-pane.tsx"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/page-shell.test.tsx"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/noise-category-chip-strip.test.tsx"
    - ".planning/phases/81-fold-stage-1-bulk-review-into-the-stage-keyed-shell-close-th/deferred-items.md"
  modified:
    - "web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx (shell wrap + 2-col grid + sub=pending branch; QueueTree + Bulk Review h1 + intro paragraph removed; sub field added to PageSearchParams; loadPageData short-circuits on params.sub === 'pending')"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/actions.ts (added promoteRule / rejectRule form-action server actions + loadRuleSamples helper)"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/row-list.tsx (removed selection.tab === 'pending' branch + inline PendingPromotionPanel — RowList is single-responsibility predicted-rows only)"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/load-page-data.test.ts (added Phase 81-03 cases for ?sub=pending branch, default-branch regression, legacy ?tab=pending non-branching, and URL-direct-edit filters regression)"
decisions:
  - "D-05 honoured: 2-col grid minmax(380px,460px)|1fr; legacy 3-col grid clamp(220px,18vw,280px) deleted"
  - "D-06 honoured: chip strip reads swarm_noise_categories ONLY — hard-separation lock enforced by file-level grep test (f)"
  - "D-09/D-10/D-11 honoured: ?sub=pending replaces ?tab=pending; loader short-circuits; tail Pending pill is the chip-strip entry point"
  - "D-16/D-17/D-18 honoured: PageHeader carries the title, Bulk Review h1 + intro paragraph deleted"
  - "D-19 honoured: ${swarmType}-review realtime channel name preserved"
  - "Open Q4 outcome: no existing rule-promotion UI under web/app/(dashboard)/swarm/[swarmId]/(components) — fresh promoteRule/rejectRule actions plumbed in stage-1/actions.ts (Zod-validated, status='candidate'-gated)"
  - "Filters popover (D-07) deferred to follow-up phase; URL params remain functional via direct editing — guarded by regression test in load-page-data.test.ts"
  - "queue-tree.tsx file deletion deferred to Plan 04 (this plan only removes the import + JSX usage)"
metrics:
  duration_minutes: 12
  tasks: 3
  files_touched: 7
  loc_added: ~968
  completed: 2026-05-11
---

# Phase 81 Plan 03: Reframe Stage 1 as the Sketch-005 shell-wrapped surface

One-line: `/stage-1` now wraps in `<PageHeader>` + `<StageTabStrip currentStage={1}>`,
the `<QueueTree>` left column is replaced by a horizontal noise-category chip
strip (registry-driven from `swarm_noise_categories`, with a tail "Pending
promotion · N" pill), and the `?sub=pending` URL state finally swaps the row
list for a candidate-rule list + rule-evidence detail pane.

## Tasks Executed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | noise-category-chip-strip.tsx + RTL test | `447c4f3` | `noise-category-chip-strip.tsx`, `__tests__/noise-category-chip-strip.test.tsx` |
| 2 | Extract candidate-rule-list + pending-promotion-detail-pane out of row-list.tsx + plumb promoteRule/rejectRule/loadRuleSamples | `11cad6f` | `candidate-rule-list.tsx`, `pending-promotion-detail-pane.tsx`, `actions.ts`, `row-list.tsx` |
| 3 | Rewrite stage-1/page.tsx as shell-wrapped 2-col surface with ?sub=pending branch + RTL/loader tests + deferred-items.md | `38de559` | `page.tsx`, `__tests__/page-shell.test.tsx`, `__tests__/load-page-data.test.ts`, `deferred-items.md` |

## New components inventory

| File | LOC | Exports | Mounted from |
|------|-----|---------|--------------|
| `noise-category-chip-strip.tsx` | 220 | `NoiseCategoryChipStrip` | `stage-1/page.tsx` (below `<StageTabStrip>`, above the 2-col grid) |
| `candidate-rule-list.tsx` | 86 | `CandidateRuleList` | `stage-1/page.tsx` (left column of the 2-col grid when `sp.sub === "pending"`) |
| `pending-promotion-detail-pane.tsx` | 170 | `PendingPromotionDetailPane`, `RuleSample` (type) | `stage-1/page.tsx` (right column of the 2-col grid when `sp.sub === "pending"`) |

## Open Q4 outcome — rule-promotion UI reuse

Grep `rg -n "promoteRule|rejectRule|ci_lo|Wilson" web/app/(dashboard)/swarm/`
returned **zero hits**. `web/app/(dashboard)/automations/classifier-rules/`
has `blockRule` / `unblockRule` (keyed by row id), but those are a different
surface (the classifier-rules dashboard) and key by `id`, not the
composite (`swarm_type`, `rule_key`) that Stage 1's candidate list exposes.

Decision: plumb fresh `promoteRule(FormData)` / `rejectRule(FormData)` server
actions in `stage-1/actions.ts`. Both validate via Zod, gate on
`status === 'candidate'` to defend against tampered submissions, mutate
`classifier_rules` (and only `classifier_rules` — hard-separation lock),
and broadcast `${swarmType}-review` for the realtime invalidation.

Also added `loadRuleSamples(admin, swarm_type, rule_key, limit=5)` — queries
`pipeline_events` filtered by `swarm_type + stage=1 +
decision_details->>rule_key`, joins `email_pipeline.emails` for subject +
sender. Returns up to 5 rows for the detail pane's "Sample matched emails"
section.

## QueueTree status

- `<QueueTree />` JSX usage and its import line are gone from `stage-1/page.tsx`.
- The file `web/app/(dashboard)/automations/[swarm]/stage-1/queue-tree.tsx`
  itself is **retained on disk** — Plan 04 owns the file deletion plus the
  leftover "Bulk Review" string purge in sibling files (per the plan's
  explicit scope statement).
- `grep "QueueTree" stage-1/page.tsx` returns 0 hits.

## Manual smoke (recorded, not run live)

The following manual smokes are recommended pre-merge but were not run
in this executor session — the RTL test covers the same branches:

| Behaviour | Where to verify | Expected |
|-----------|-----------------|----------|
| `/automations/debtor-email/stage-1` renders new chrome | dev server | PageHeader + StageTabStrip with active Stage 1 + chip strip + 2-col grid; no "Bulk Review" h1 |
| Clicking the "Payment" chip writes `?topic=payment` | dev server URL bar | URL updates, predicted-row list filters |
| Clicking the "Pending promotion · N" tail pill | dev server URL bar | URL becomes `…?sub=pending`, row list swaps to candidate-rule list |
| Clicking a candidate rule | dev server URL bar | URL gains `&rule=<rule_key>`, right pane shows rule_key + status + n + Wilson ci_lo + sample emails + Promote/Reject buttons |

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run noise-category-chip-strip.test.tsx` | 6 passed |
| `npx vitest run page-shell.test.tsx` | 4 passed |
| `npx vitest run load-page-data.test.ts -t "Phase 81-03"` | 4 passed |
| `npx tsc --noEmit` on stage-1/ files | 0 errors |
| `grep "Bulk Review" stage-1/page.tsx` | 0 hits |
| `grep "<QueueTree" stage-1/page.tsx` | 0 hits |
| `grep "PendingPromotionPanel" web/app web/tests` (code references) | 0 (only doc comments) |
| `grep "swarm_intents" noise-category-chip-strip.tsx` | 0 hits (hard-separation lock) |
| Acceptance criteria required strings (10) | all present |
| Acceptance criteria forbidden strings (5) | all absent |

## Deviations from Plan

None substantive. Minor notes:

- **Phase 81 Task 1 was completed in a prior session** (commit `447c4f3`),
  before this executor started. Verified that all 6 chip-strip RTL test
  cases pass against the existing file; no edits required this session.
- **Phase 81 Task 2 was also completed in a prior session** (commit
  `11cad6f`) — verified `candidate-rule-list.tsx`,
  `pending-promotion-detail-pane.tsx`, `actions.ts` (with `promoteRule`,
  `rejectRule`, `loadRuleSamples`), and the `row-list.tsx`
  `selection.tab === "pending"` branch removal were all in place.
- **`loadRuleSamples` query shape:** the plan specified
  `decision_details->>rule_key`. The existing `loadPageData` filter at
  page.tsx line ~456 uses `decision_details->>regex_rule_id` for its
  legacy `?rule=` filter. The new `loadRuleSamples` uses `rule_key` per
  the plan since `classifier_rules.rule_key` is the canonical key and
  the daily-cron writer is expected to stamp `decision_details.rule_key`.
  No behavioural impact observed — Plan 04 may align both query shapes
  if telemetry shows mismatches.
- **`PendingPromotionDetailPane` uses `RuleSample` (not `RuleSampleRow`)
  as the prop type.** `loadRuleSamples` returns `RuleSampleRow[]` and the
  page maps each to the `RuleSample` shape (identical fields, different
  type names). The structural compatibility passes tsc cleanly.

## Carry-forward failures (NOT introduced by Plan 03)

Three failures in `stage-1/__tests__/load-page-data.test.ts` (Tests 4, 5, 6
from the legacy Phase 71-03 suite) fail with the same errors before AND
after this plan. Root cause: the test fixtures don't model the Phase 71-08
`automation_runs.result.message_id ↔ email_pipeline.emails.source_id` join
the loader uses to whitelist predicted-status email_ids. Documented in
`81-01-SUMMARY.md` and `deferred-items.md`. Plan 04 may revisit.

## Threat Flags

None. STRIDE entries from the plan's `<threat_model>`:

- T-81-03-01 (Tampering — searchParams.sub): mitigated. Consumed only as
  `=== "pending"` equality check; never interpolated into JSX or SQL.
- T-81-03-02 (Tampering — searchParams.topic): pre-mitigated. Passed to
  `.eq("decision_details->>topic", topic)` (Supabase-parameterised).
- T-81-03-03 (Tampering — promoteRule/rejectRule actions): mitigated.
  Both actions Zod-validate `rule_key` + `swarm_type`, gate on
  `status === 'candidate'` (rejects tampered submissions trying to flip
  arbitrary rule statuses), and run under service-role admin client.
- T-81-03-04 (Information Disclosure — cross-swarm chip strip):
  mitigated. `loadSwarmNoiseCategories` is parameterised by `swarmType`;
  chip strip receives the per-swarm result. Goal-backward check #10
  (cross-swarm test (f) in `page-shell.test.tsx`) verifies sales-email
  swarm's chip strip never leaks debtor-email categories.

## Authentication Gates

None. All mutations use the existing service-role admin client; the
classifier-rules dashboard idiom (`blockRule` / `unblockRule`) inherits
the same auth posture.

## Known Stubs

None. All UI surfaces are wired to real data:
- Chip strip → `loadSwarmNoiseCategories` + `classifier_queue_counts` RPC.
- Pending Promotion → `classifier_rules.status='candidate'` query +
  `loadRuleSamples` for matched-email evidence.

## Self-Check: PASSED

- File exists: `noise-category-chip-strip.tsx` — FOUND
- File exists: `candidate-rule-list.tsx` — FOUND
- File exists: `pending-promotion-detail-pane.tsx` — FOUND
- File exists: `__tests__/page-shell.test.tsx` — FOUND
- File exists: `__tests__/noise-category-chip-strip.test.tsx` — FOUND
- File exists: `deferred-items.md` — FOUND
- Commit exists: `447c4f3` (Task 1) — FOUND in `git log`
- Commit exists: `11cad6f` (Task 2) — FOUND in `git log`
- Commit exists: `38de559` (Task 3) — FOUND in `git log`
- `npx vitest run` on the 3 plan test files: 14 passed (6+4+4), 3 carry-forward failures unchanged
- `npx tsc --noEmit` on touched files: 0 errors
- All 10 acceptance-criteria required strings present in `page.tsx`
- All 5 acceptance-criteria forbidden strings absent from `page.tsx`
- Hard-separation grep (no `swarm_intents` in chip strip): PASS
