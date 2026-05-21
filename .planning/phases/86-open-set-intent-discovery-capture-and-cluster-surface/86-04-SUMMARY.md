---
phase: 86-open-set-intent-discovery-capture-and-cluster-surface
plan: 04
subsystem: intent-proposals
tags: [operator-runbook, verification-log, observation-window, autonomous-false, docs]
requires:
  - public.intent_proposals_v1 (Plan 01 view)
  - public.intent_proposal_clusters (Plan 01 snapshot table)
  - public.intent_proposal_views (Plan 01 telemetry table)
  - web/lib/inngest/functions/intent-proposals-refresh.ts (Plan 02 cron)
  - web/app/(dashboard)/automations/[swarm]/intent-proposals/* (Plan 03 surface)
provides:
  - .planning/phases/86-.../86-OPERATOR-RUNBOOK.md (day-0/7/14/21/28 + weekly cadence + SQL helpers + escalation)
  - .planning/phases/86-.../86-VERIFICATION-LOG.md (append-only operator log scaffold; Phase 87 input)
  - .planning/phases/86-.../86-DAY-0-CHECKPOINT.md (pre-flight verification doc; gates start of observation window)
affects:
  - none (zero code changes; zero schema changes; pure docs deliverable)
tech_stack:
  added: []
  patterns:
    - "Operator-paced wall-clock observation window driven by cadence runbook + append-only log + day-0 gate"
    - "Cut-and-paste runnable SQL in the runbook (no operator interpretation; $CLUSTER_ID is the only placeholder)"
    - "Drift #4 plan-time refinement of CONTEXT Success #1 captured in runbook + this SUMMARY (CONTEXT.md untouched, per plan deviation_rules)"
key_files:
  created:
    - .planning/phases/86-open-set-intent-discovery-capture-and-cluster-surface/86-OPERATOR-RUNBOOK.md
    - .planning/phases/86-open-set-intent-discovery-capture-and-cluster-surface/86-VERIFICATION-LOG.md
    - .planning/phases/86-open-set-intent-discovery-capture-and-cluster-surface/86-DAY-0-CHECKPOINT.md
  modified: []
decisions:
  - "Plan task-list specifies 2 artefacts (RUNBOOK + LOG) but the executor prompt's must_haves listed a 3rd (DAY-0-CHECKPOINT). DAY-0 doc shipped as a separate file because the day-0 pre-flight is logically distinct from the 4-week cadence runbook + needs its own gate. Pre-flight summary appears in BOTH the runbook (§Day 0) AND the standalone checkpoint doc — runbook is the operator's table of contents, checkpoint doc is the cut-and-paste tick-list"
  - "Runbook spot-check SQL uses migration-source-of-truth column names (intent_proposal_clusters.id, intent_proposal_clusters.window_end) instead of the plan-04 draft SQL (cluster_id, refresh_window_end). The draft column names do NOT exist on the snapshot table per 20260520_phase86_intent_proposal_clusters.sql — silently writing them into operator-facing SQL would have produced SQLSTATE 42703 on first run. Rule 1 deviation (correctness bug in plan-time draft)"
  - "Day-0 step 6 (V3 smoke confirmation via web/scripts/phase85-smoke-v3.ts) is marked OPTIONAL — natural inbound debtor traffic will produce V3 proposals organically and smoke-script outputs are explicitly excluded from Success #1/#2/#3 totals. Smoke is a plumbing verification tool, not a metric source. Mirrors the executor prompt's calibration-vs-operational distinction"
  - "Verification log uses fill-in-the-blank tables (no JSON, no markdown frontmatter scraping). Operator-friendly format takes precedence over machine-parseable format because Phase 87 closure is a human retro, not an automated pipeline"
  - "Task 2 of the plan is a checkpoint:human-verify that the operator (not the executor) must walk. This SUMMARY does NOT claim Task 2 PASS — it claims the day-0 doc + verification log + runbook are ready for the operator to execute Task 2. Per plan's autonomous: false, this is the correct handoff state"
metrics:
  duration_minutes: 4
  completed_at: 2026-05-20T15:51:11Z
  tasks_completed: 1
  files_created: 3
  files_modified: 0
  commits: 1
---

# Phase 86 Plan 04: Operator Runbook + Verification Log + Day-0 Checkpoint Summary

Three append-only docs that hand the discovery surface from "shipped" to "validated." Wave 4 of Phase 86 — no code changes, no schema changes; the artefacts ARE the deliverable. The operator drives the next 4 weeks; this plan only writes the script.

## Tasks Completed

| # | Task | Commit | Files |
|---|---|---|---|
| 1 | Operator runbook + verification log + day-0 checkpoint | `31b66e58` | `86-OPERATOR-RUNBOOK.md`, `86-VERIFICATION-LOG.md`, `86-DAY-0-CHECKPOINT.md` |
| 2 | Day-0 pre-flight human-verify checkpoint | n/a — operator-owned (plan is `autonomous: false`) | — |

Task 2 is a `checkpoint:human-verify` that the operator must walk against the live production dashboard. This executor's job stops at handing over a clean day-0 doc; Task 2 ticks the boxes in `86-DAY-0-CHECKPOINT.md` and copies the verdict into `86-VERIFICATION-LOG.md` § "Day 0 baseline."

## Verified Locally

- `test -f` for all three target files → present (commit `31b66e58`).
- `grep -c "Success #" 86-OPERATOR-RUNBOOK.md` → 18 occurrences (≥4 required; one per criterion across the cadence table + the per-check sections).
- `grep -nE "Day 7|Day 14|Day 21|Day 28" 86-OPERATOR-RUNBOOK.md` → each day named at least once in headings.
- Runbook spot-check SQL column names cross-checked against `supabase/migrations/20260520_phase86_intent_proposal_clusters.sql` — `id`, `window_end`, `member_count`, `sample_email_ids`, `centroid_label`, `member_labels`, `refreshed_at` all exist; the plan-draft names (`cluster_id`, `refresh_window_end`) **do not** and were corrected.
- Day-0 checkpoint schema queries return the columns documented in the Plan 01 migrations (verified against the migration files in this worktree).
- No code touched; no migration touched; no test suite to re-run.

## Drift #4 Refinement (rationale)

CONTEXT.md Success #1 reads: *"Within 7 days of Phase 85 going live, the proposals tab shows ≥5 distinct clusters with ≥3 samples each."*

`86-RESEARCH.md` §Q4 forecast (HIGH-confidence on smoke data):

- ~5 V3 proposals per week at current Stage 3 volume.
- Week 1: 1–2 clusters with ≥3 samples, 3–5 singletons.
- Week 3–4: 4–6 clusters with ≥3 samples (original ≥5 target reachable).

The original "≥5 by day 7" target was forecast-incompatible — it would have failed even on a perfectly-working pipeline. The runbook documents the refined trajectory:

- **Day 7 sub-criterion:** ≥1 cluster surfaces (proves V3 → view → cron → snapshot pipeline writes through).
- **Day 14 primary:** ≥2 clusters of ≥3 (proves clustering works at threshold 0.85).
- **Day 21–28:** ≥5 clusters of ≥3 (original Success #1 target, relaxed in time, NOT in substance).

CONTEXT.md is NOT edited (per plan `<deviation_rules>` — drift #4 is a plan-time operational adjustment, not a re-decision). The refinement lives in the runbook AND in this SUMMARY only.

## Day-0 Pre-flight Status

**Not yet executed by the operator.** Pre-flight gate is a `checkpoint:human-verify` (plan Task 2) — orchestrator/operator walks `86-DAY-0-CHECKPOINT.md` against the live production dashboard. Calendar dates for day-7/14/21/28 and the 4 Friday checks are placeholders in `86-VERIFICATION-LOG.md` § "Calendar dates" — operator fills them in once day-0 PASS.

**Note for the operator running day-0 first time:** at scaffold time (2026-05-20 15:46 UTC) the Phase 85 V3 consumer code had just merged (PR #32 at 15:14 UTC) and no inbound debtor email had yet exercised the V3 emit path. The runbook + day-0 doc both call out that `intent_proposals_v1` returning `count = 0` on the first run is the expected post-deploy steady state — proceed with the smoke step (§6 of day-0) if waiting for organic traffic is impractical.

## Calendar Dates for the Observation Window

The operator fills these in `86-VERIFICATION-LOG.md` § "Calendar dates" once day-0 PASS. Suggested defaults if day-0 PASS lands on date D:

| Check        | Suggested date | Notes |
| ------------ | -------------- | ----- |
| Day 0        | D              | Pre-flight |
| Day 7        | D + 7d         | Success #1 sub-criterion |
| Day 14       | D + 14d        | Success #1 primary refined + Success #2 first check |
| Day 21       | D + 21d        | Success #1 original target |
| Day 21–28    | D + 21..28d    | Success #3 (clusters must hit member_count ≥10 first) |
| Day 28       | D + 28d        | Confirmation re-run |
| Friday wk-1  | first Friday after D | Success #4 weekly |
| Friday wk-2  | second Friday | Success #4 weekly |
| Friday wk-3  | third Friday  | Success #4 weekly |
| Friday wk-4  | fourth Friday | Success #4 weekly |

Owner: the engineer running v8.1 stabilisation rotation. Same person updates the log entries; corrections are append-only (new dated entry beats overwriting an old verdict).

## Owner of Verification Log Entries

Default owner: **operator running the debtor-email pipeline** (v8.1 rotation engineer). Log entries are append-only — if a verdict needs revising, append a new entry with the new date and rationale rather than editing the original. Phase 87 closure reads the full history.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug / column-name correctness] Runbook spot-check SQL uses `id` + `window_end`, not `cluster_id` + `refresh_window_end`**
- **Found during:** Task 1 SQL drafting cross-check against the migration source.
- **Issue:** `86-04-PLAN.md` Task 1 action body contains a draft helper SQL referencing `WHERE cluster_id = $CLUSTER_ID` and `refresh_window_end >= now() - interval '7 days'`. Neither column exists on `public.intent_proposal_clusters` per `supabase/migrations/20260520_phase86_intent_proposal_clusters.sql` (PK is `id`, the window-bound column is `window_end`, and the "fresh-after-cron" column is `refreshed_at`).
- **Fix:** Runbook spot-check helper SQL uses `WHERE id = '$CLUSTER_ID'`, filters by `refreshed_at > now() - interval '24 hours'`, and casts `unnest(sample_email_ids)::uuid` before joining `pipeline_events.id` (the `sample_email_ids` column is `text[]`, not `uuid[]`, per the migration). Inline schema note in the runbook (§Day 21–28 spot-check) points the operator at the migration file for verification.
- **Files modified:** `86-OPERATOR-RUNBOOK.md`
- **Commit:** `31b66e58`

**2. [Rule 2 — Missing functionality] Added a standalone `86-DAY-0-CHECKPOINT.md`**
- **Found during:** Task 1 scoping against the executor prompt's `<must_haves>` block.
- **Issue:** The plan `files_modified` lists only RUNBOOK + LOG. The executor prompt explicitly requires a third artefact, `86-DAY-0-CHECKPOINT.md`, capturing pre-flight verifications operator-runnable today. Day-0 verification is materially different from the cadence runbook (single one-shot gate vs recurring cadence) and benefits from its own file.
- **Fix:** Shipped DAY-0 doc as a peer artefact. Day-0 content also appears (in condensed form) in the runbook §"Day 0 — Pre-flight" — the runbook is the table of contents, the checkpoint doc is the tick-list.
- **Files modified:** `86-DAY-0-CHECKPOINT.md`
- **Commit:** `31b66e58`

### Architectural Changes

None.

## Cross-References Embedded in the Artefacts

| Link from | Link to | Purpose |
| --- | --- | --- |
| Runbook header | `86-DAY-0-CHECKPOINT.md` | Pre-flight gate before cadence starts |
| Runbook §Day 21–28 spot-check | `supabase/migrations/20260520_phase86_intent_proposal_clusters.sql` | Operator can verify column names against migration |
| Runbook §Failure modes | `.planning/todos/pending/2026-05-20-phase85-v2-retirement.md` | V2/V3 overlap during day-7 → day-14 window |
| Runbook §Cross-references | `.planning/phases/85-.../85-AGENT-RITUAL-LOG.md` | Phase 85 promotion (classifier rules; not Phase 86's promotion path) |
| Runbook §Cross-references | "Phase 87 retro-classification" | Phase 87 needs ≥5 cluster snapshots before kickoff |
| Day-0 doc §6 | `web/scripts/phase85-smoke-v3.ts` | Calibration-only V3 emit forcing tool |
| Verification log § "Aggregate verdict" | Phase 87 closure input | Source of truth Phase 87 reads |

## Known Stubs

None. The artefacts are scaffolds-with-templates, NOT stubs in the sense of "code rendered with empty data." Every fill-in-the-blank in `86-VERIFICATION-LOG.md` is **intended** to be filled by the operator over the next 28 days — empty values today are the documented day-0 state, not a coverage gap.

## Threat Flags

None. Three markdown files under `.planning/`; no new code, no new HTTP surface, no new trust boundary, no new RLS surface. The SQL the runbook prescribes is read-only on tables that are already RLS-on (`intent_proposal_clusters` is service-role-write/authenticated-read per Plan 01; `intent_proposal_views` is service-role-write/authenticated-INSERT per Plan 01).

## TDD Gate Compliance

Plan declares `type: execute` (not `type: tdd`), so plan-level RED/GREEN/REFACTOR does not apply. Task 1 has no `tdd="true"` attribute; tests are not applicable to a docs-only deliverable.

## Self-Check: PASSED

**File-level (FOUND via `test -f`):**
- `.planning/phases/86-open-set-intent-discovery-capture-and-cluster-surface/86-OPERATOR-RUNBOOK.md` ✓
- `.planning/phases/86-open-set-intent-discovery-capture-and-cluster-surface/86-VERIFICATION-LOG.md` ✓
- `.planning/phases/86-open-set-intent-discovery-capture-and-cluster-surface/86-DAY-0-CHECKPOINT.md` ✓

**Commit (FOUND via `git log --oneline`):**
- `31b66e58` docs(86-04): operator runbook + verification log + day-0 checkpoint ✓

**Plan `<verification>` block:**
- [x] `86-OPERATOR-RUNBOOK.md` exists with all 4 Success criteria mapped to a check cadence (Success #1..#4 each appear in the cadence table + their own check section)
- [x] `86-VERIFICATION-LOG.md` exists with empty templates for day-7/14/21/28 + 4 weekly checks + day-21–28 spot-check + aggregate-verdict + anomaly section
- [ ] Operator has walked the day-0 pre-flight — **DEFERRED** to operator (Task 2 checkpoint, plan `autonomous: false`)
- [x] Drift #4 refinement is documented in the runbook AND this SUMMARY; `86-CONTEXT.md` stays unchanged

**Plan `<success_criteria>`:**
- [x] All 4 CONTEXT Success criteria have a documented check cadence in the runbook
- [ ] Day-0 pre-flight passed (Task 2 checkpoint) — **OPERATOR-OWNED**, not in executor scope
- [x] Verification log scaffold ready for week-1 entries
- [x] Drift #4 refinement captured in runbook + SUMMARY

**Executor prompt `<must_haves>`:**
- [x] PROMOTION-RUNBOOK-style operator runbook covers day-0, day-7, day-14, day-21, day-28, weekly cadences
- [x] Each check has explicit SQL (no "operator figures it out" gaps)
- [x] Day-21-28 includes the spot-check SQL helper for top-3 clusters
- [x] `86-VERIFICATION-LOG.md` scaffold with empty templates for each check date
- [x] `86-DAY-0-CHECKPOINT.md` documents pre-flight verifications
- [x] All 4 Success criteria from CONTEXT addressed (R-01, R-02 mitigation visible in #3 + #Failure modes; #1, #2, #4 in the cadence checks)
- [x] Failure-mode escalations documented (zero proposals, many singletons, one huge cluster, low operator engagement, storage bloat)

**Outstanding operator actions (Phase 86 not closed until):**
- [ ] Operator walks `86-DAY-0-CHECKPOINT.md` and copies verdict to `86-VERIFICATION-LOG.md` § "Calendar dates"
- [ ] Day-7 / Day-14 / Day-21 / Day-28 entries filled in across the 4-week window
- [ ] Friday Week 1 / 2 / 3 / 4 entries filled in
- [ ] Phase 87 closure recommendation written in `86-VERIFICATION-LOG.md` § "Aggregate verdict"
