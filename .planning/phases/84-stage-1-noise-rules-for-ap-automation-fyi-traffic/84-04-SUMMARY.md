---
phase: 84-stage-1-noise-rules-for-ap-automation-fyi-traffic
plan: 04
subsystem: stage-1-noise-filter
tags: [runbook, operator-handoff, shadow-window, d-05-gate, wilson-ci, corpus-evidence]
dependency_graph:
  requires:
    - 84-01-SUMMARY.md (CORPUS-SAMPLES.md with per-category positives + D-05 rollup)
    - 84-02-SUMMARY.md (16 candidate rules + 16 noise categories live in DB)
    - 84-03-SUMMARY.md (matchers + loopback worker rule live in code)
  provides:
    - "PROMOTION-RUNBOOK.md — operator-grade 7-section runbook for the 7-day shadow + D-05 promotion gate"
    - "CORPUS-SAMPLES.md Day 7 decision + promotion_date columns for inline outcome tracking"
    - "Per-category Day-7 disposition recommendations for all 16 (category, swarm) rows"
  affects:
    - "Operator owns the 7-day shadow + promotion / rollback decisions from this point"
    - "Phase 84 closure depends on operator executing the runbook end-to-end"
tech_stack:
  added: []
  patterns:
    - "Phase 60-08 RUNBOOK structural precedent (audience + step ordering + SQL inline)"
    - "Live-code constants over CONTEXT.md when they diverge (PROMOTE_CI_LO_MIN 0.92 from wilson.ts, not 0.95 from D-05)"
    - "Per-category decision matrix instead of generic per-category guidance"
key_files:
  created:
    - .planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/PROMOTION-RUNBOOK.md
    - .planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/84-04-SUMMARY.md
  modified:
    - .planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/CORPUS-SAMPLES.md
decisions:
  - "Runbook quotes live wilson.ts constants (PROMOTE_N_MIN=30, PROMOTE_CI_LO_MIN=0.92, DEMOTE_CI_LO_MAX=0.88) — CONTEXT D-05 mentions 0.95 but Phase 60-08 lowered it; live code wins"
  - "Disposition matrix explicitly flags 14/16 rows as EXTEND-SHADOW / HOLD-CANDIDATE because the corpus is short for 7 of 8 categories and the cron-Wilson path requires N>=30 bulk-review verdicts (unlikely in 7d at observed volumes)"
  - "Only own_outbound_invoice_loopback (debtor-email, 21 corpus positives) is on the D-05 corpus-path PROMOTE track at Day 7"
  - "Documented terminology drift between CONTEXT.md (auto_active, 0.95) and live code (promoted, 0.92) in Appendix A so the operator does not get confused"
  - "Flagged the classifier_rule_telemetry view's human_verdict-only filter as a critical caveat — Phase 84 candidate rules need the bulk-review queue to be worked during shadow for cron-path promotion to be reachable"
metrics:
  duration_min: 25
  tasks_completed: 1
  files_touched: 3
  commits: 1
completed: 2026-05-20
---

# Phase 84 Plan 04: Wave 3 — Operator-Shadow + Promotion Runbook Summary

**One-liner:** Authored PROMOTION-RUNBOOK.md (7 sections, all 16 rules in
the per-category decision matrix, live wilson.ts constants quoted, no
invented thresholds) + extended CORPUS-SAMPLES.md rollup with Day-7
decision + promotion_date columns. Plan-level Task 2 (the 7-day wall-clock
shadow window) is operator-driven and not executable by Claude — this
wave's artefacts make it runnable as written.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Author PROMOTION-RUNBOOK.md + CORPUS-SAMPLES.md Day-7 columns | `7fa00df4` | `.planning/phases/84-…/PROMOTION-RUNBOOK.md`, `.planning/phases/84-…/CORPUS-SAMPLES.md` |

(Task 2 — 7-day shadow — is operator-driven and waits for the operator to
follow the runbook over wall-clock time. It is intentionally NOT executed
by this wave.)

## Artefacts produced

### PROMOTION-RUNBOOK.md (new)

7-section operator runbook keyed to D-05's gate definition:

- **Section 0** — per-category Day-7 disposition matrix (16 rows: 8
  categories × 2 swarms). Each row carries: corpus_status (full / short /
  very-short / n/a), corpus_positives, recommended Day-7 default (PROMOTE
  / EXTEND-SHADOW / HOLD-CANDIDATE), and a one-line rationale. 14/16 rows
  are EXTEND-SHADOW or HOLD-CANDIDATE; only row 15
  (`own_outbound_invoice_loopback / debtor-email`) is on a PROMOTE track
  at Day 7 via the corpus-evidence path (b).
- **Section 1 — Day 0** — pre-flight verification SQL for the 16
  candidate rules + 16 noise categories, `CLASSIFIER_CRON_MUTATE` env-var
  confirmation, Day-0 shadow spot-check (rule_key populated on agent_runs
  AND `automation_runs.status='predicted'`, no auto-action). Shadow_start
  date recording instructions.
- **Section 2 — Days 1-7** — daily SQL for `classifier_rule_telemetry` +
  `classifier_rule_evaluations` snapshots; disagreement triage workflow;
  D-03 loopback regression spot-check (R-02 mitigation re-verification);
  Stage 3 volume-drop spot-check (CONTEXT verifications 3-4).
- **Section 3 — Day-7 gate** — explicit Path (a) Wilson and Path (b)
  corpus-evidence criteria; HOLD vs EXTEND fallbacks; sales-email
  per-swarm decision table (R-04 mitigation).
- **Section 4 — Promotion action** — Method A (CLASSIFIER_CRON_MUTATE
  one-tick flip in Vercel) and Method B (hand UPDATE with safety
  `AND status='candidate'` clause). Regression-guard query that MUST
  return zero rows before any promotion.
- **Section 5 — Rollback** — per-swarm single-row drop (R-04), full
  demotion post-promotion, tenant_domains-only loopback disable (R-05).
  Includes the Outlook label-recovery query (rule_key + time-window
  filter) for the FP recovery path; explicit "NEVER drop the
  swarms.tenant_domains column" rule.
- **Section 6 — D-03 sample-check** — 10-row sample matrix (5 inbound
  positives + 5 outbound negatives) for the Day-1 R-02 regression
  verification.
- **Section 7 — Closure signal** — Phase 84 closure conditions (all 16
  rows dispositioned, CONTEXT verifications 1-6 satisfied, operator
  signals closure via /gsd:resume).
- **Appendix A** — CONTEXT vs live-code terminology drift (auto_active
  vs promoted, 0.95 vs 0.92).
- **Appendix B** — quick-reference table mapping each concept (status
  machine, telemetry view, evaluation log, whitelist gate, etc.) to its
  table/file location.

### CORPUS-SAMPLES.md (touched)

Added two columns to the "Promotion gate (D-05) status" rollup table:
- `Day 7 decision (operator fills in)` — EXTEND / PROMOTE / HOLD /
  DROP-sales-email per row.
- `promotion_date` — the date Method A or Method B promotion ran.

Added a fill-rule legend below the table mapping each disposition keyword
to the corresponding section of PROMOTION-RUNBOOK.md.

## Operator next-step (explicit)

**Start the shadow window on the day the operator confirms Wave 2 + Wave 1
deploy is live in production AND `CLASSIFIER_CRON_MUTATE` is unset/false.**

Concrete sequence:
1. Open `PROMOTION-RUNBOOK.md`, Section 1 — run Day-0 verification SQL.
2. If all four Day-0 checks pass (16 rules, 16 noise rows, env-var
   correct, shadow spot-check shows status='predicted' on bulk-review),
   record `Shadow window started: YYYY-MM-DD` in CORPUS-SAMPLES.md.
3. From Day 1 onward, follow Section 2 daily and Section 6 once.
4. At Day 7, run the Section 3 gate evaluation per row.
5. For each row that clears Path (a) or Path (b), follow Section 4
   (Method A for Wilson-path clears, Method B for corpus-path clears).
6. For rows that don't clear: EXTEND-SHADOW or HOLD-CANDIDATE per the
   Section 0 disposition matrix.
7. When all 16 rows are dispositioned: signal `Phase 84 closure complete`
   via `/gsd:resume` with the per-category summary.

The runbook is runnable without further Claude input.

## Pending operator actions

| Action | Owner | Blocking | Notes |
|--------|-------|----------|-------|
| Confirm Wave 2 + Wave 1 deploy is live in Vercel production | Operator | Yes | Inngest dashboard + Vercel deploy log |
| Confirm `CLASSIFIER_CRON_MUTATE` is unset or `false` in Vercel | Operator | Yes | Before recording shadow_start |
| Start shadow window (record shadow_start in CORPUS-SAMPLES.md per category) | Operator | Yes | All 16 rows take the same date |
| Daily telemetry snapshot (Section 2.1) for 7 days | Operator | Yes | SQL captured; output filed in CORPUS-SAMPLES.md |
| D-03 loopback Day-1 sample-check (Section 6) | Operator | Yes (R-02 mitigation) | 10-row sample matrix template provided |
| Day-7 D-05 gate evaluation per (category, swarm) row | Operator | Yes | Section 3 matrix + section 4 regression-guard query |
| Method A / Method B promotion per eligible row | Operator | Yes | Section 4 with exact SQL |
| Per-swarm sales-email drop (R-04) IF FP surfaces | Operator | Conditional | Section 5.1 UPDATE |
| Phase 84 closure signal `/gsd:resume` | Operator | Yes | Section 7 |

## Defects flagged (not fixed in this wave — out of scope per plan deviation rules)

These are surfaced for orchestrator review; none block Wave 3 acceptance.

**1. Terminology drift between CONTEXT.md and live code**
- CONTEXT D-05 references `auto_active` and Wilson lower `>= 0.95`.
- Live `classifier_rules.status` enum is `candidate / promoted / demoted /
  manual_block` — no `auto_active`.
- Live `PROMOTE_CI_LO_MIN` is `0.92` (lowered from 0.95 in Phase 60-08).
- **Resolution:** runbook uses live-code values + Appendix A maps the
  CONTEXT terms as synonyms. CONTEXT.md is a locked planning artefact;
  amending it post-hoc is out of scope. If the operator wants to re-raise
  the threshold to 0.95 post-Phase-84, that is a follow-up wilson.ts
  constant edit + redeploy.

**2. `classifier_rule_telemetry` view only counts rows with `human_verdict`**
- View definition (`supabase/migrations/20260428_classifier_rule_telemetry.sql`):
  `WHERE ar.rule_key is not null AND ar.human_verdict is not null`.
- For a Phase 84 rule sitting at `status='candidate'`, the whitelist gate
  at `classifier-screen-worker.ts:566` does not auto-action. Matched rows
  fall through to the bulk-review branch (status='predicted') where the
  operator hand-verdicts them.
- **Consequence:** the cron-driven Wilson path (Method A) is ONLY reachable
  if the operator works the bulk-review queue during the 7-day shadow.
  If the queue sits unworked, `n` stays at 0 and the cron will not
  promote any rule.
- **Resolution:** documented as a critical architecture note in the
  runbook's "Live constants" section so the operator knows the bulk-review
  queue is part of the shadow workflow, not optional.

**3. Sales-email rows seeded `kind='agent_intent'` (per Phase 84-02 D-08
parity)** but Phase 84 has no LLM 2nd-pass for these noise keys at the
sales-email worker. The sales-email rows can only accumulate telemetry via
LLM-synthesized `llm:{category_key}:{confidence}` rule_keys (Phase 89
SC-89-02 mechanism per `classifier-screen-worker.ts:328-333`), which means
the sales-email rule_key strings in `classifier_rules` will not match the
agent_runs `rule_key` produced by the LLM (which carries the
`llm:<key>:<conf>` shape). This may break the Wilson-path on the
sales-email side specifically.
- **Resolution:** flagged for follow-up plan. Phase 84-04 does not need to
  resolve it because: (a) zero sales-email corpus positives across all 8
  categories means Wilson-path was already unreachable in practice; (b)
  the disposition matrix recommends EXTEND-SHADOW / HOLD-CANDIDATE on all
  sales-email rows; (c) the operator will discover this naturally via
  Section 2.1 telemetry snapshots showing N=0 on sales-email rows
  indefinitely.
- **Recommended follow-up:** Phase 85+ should either (i) seed sales-email
  rule_keys with the `llm:` prefix shape, or (ii) extend
  `classifier_rule_telemetry` view to map `llm:<key>:<conf>` -> `<key>`
  for purposes of cross-counting. Out of scope for Phase 84.

## Deviations from Plan

### No auto-fixes triggered

Plan 84-04 produced no code changes — only documentation artefacts. No
Rules 1-3 deviations applied. Per the plan's explicit deviation rules:
- Did not execute promotion SQL (operator action gated on shadow data that
  doesn't exist yet).
- Did not invent Wilson-CI thresholds (read from live code; flagged the
  CONTEXT-vs-live drift in the runbook).
- Did not modify matcher code or migrations (Wave 2 locked).
- Did not fix the three flagged defects above inline (scope creep —
  documented as recommended follow-ups instead).

## Self-Check: PASSED

Verified after writing this SUMMARY:
- FOUND: `.planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/PROMOTION-RUNBOOK.md`
- FOUND: `.planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/84-04-SUMMARY.md`
- FOUND: `.planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/CORPUS-SAMPLES.md` (Day 7 columns present)
- FOUND: commit `7fa00df4` via `git log --oneline -1`
- FOUND: all 6 mandatory H2 sections of PROMOTION-RUNBOOK.md per plan acceptance criteria (`grep` confirms "Shadow Window Start" + "Daily Shadow Monitoring" + "D-05 Gate Evaluation" + "Promotion Action" + "Rollback Procedure" + "Closure Signal")
- FOUND: per-category disposition matrix with all 16 (category, swarm) rows enumerated explicitly
- FOUND: "NEVER drop the swarms.tenant_domains column" hardening rule in Section 5.3 (R-05)
- FOUND: Section 3 references both Wilson path (N>=30, lower>=0.92) and corpus path (>=10 positives, 0 FPs)
- FOUND: Section 4 covers both Method A (CLASSIFIER_CRON_MUTATE flip) and Method B (hand UPDATE) with exact SQL
- FOUND: Section 6 D-03 loopback Day-1 sample-check covers 5 inbound + 5 outbound rows
