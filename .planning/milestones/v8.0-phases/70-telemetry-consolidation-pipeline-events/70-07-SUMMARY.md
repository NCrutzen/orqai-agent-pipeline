---
phase: 70-telemetry-consolidation-pipeline-events
plan: 07
subsystem: telemetry / docs
tags: [docs, requirements, phase-72-stub, traceability]
requires: [70-06]
provides:
  - Phase 72 promotion-recommender design memo (D-15 commitment)
  - REQUIREMENTS.md TELE-01..03 traceability closure
affects:
  - docs/agentic-pipeline/promotion-recommender.md
  - .planning/REQUIREMENTS.md
tech-stack:
  added: []
  patterns:
    - forward-reference docs as Phase-N → Phase-(N+2) hand-off contract
key-files:
  created:
    - docs/agentic-pipeline/promotion-recommender.md
  modified:
    - .planning/REQUIREMENTS.md
decisions:
  - "Stub follows docs/agentic-pipeline/README.md format conventions (status block, cross-link footer)"
  - "Documented input contract uses partial-index hot path from 70 D-04"
  - "Output table promotion_candidates fully specified so Phase 72 has zero schema-design ambiguity"
metrics:
  duration_minutes: 4
  tasks_completed: 2
  files_changed: 2
  completed: 2026-05-05
---

# Phase 70 Plan 07: Promotion-recommender stub + REQUIREMENTS.md TELE-* check-off Summary

**One-liner:** Shipped the Phase 72 hand-off memo (`promotion-recommender.md`) describing how the future cron will SELECT from `pipeline_events`, and flipped TELE-01..03 traceability rows to `complete` with verification anchors closing Phase 70's requirement coverage.

## What Shipped

### Task 1 — `docs/agentic-pipeline/promotion-recommender.md`

Created an 88-line stub (well above the 15-line floor) covering:

- **Purpose paragraph** framing the recommender as the closing loop of the v8.0 funnel (LERN-01..05).
- **Input contract**: canonical SELECT shape against `public.pipeline_events`, columns consumed (`decision`, `confidence`, `decision_details`, `override`, `eval_type`, `cost_cents`), and explicit reference to the Phase 70 D-04 partial index `pipeline_events_override_partial_idx` for override-driven candidate detection.
- **Output contract**: full proposed schema for `public.promotion_candidates` (`kind`, `expected_volume`, `expected_savings`, `evidence_event_ids uuid[]`, `proposed_change`, `status`).
- **Non-goals for v1**: never blocks the synchronous pipeline (LERN-02), never auto-applies without operator approval (LERN-04), no pre-Phase-70 backfill, no cross-swarm correlation.
- **Cross-links** to `README.md`, the Phase 70 CONTEXT D-15 anchor, and REQUIREMENTS.md §LERN-01..05.
- **Status block + footer** pinning the doc as STUB and clarifying Phase 70 only ships the read-side contract.

Acceptance criteria check (all green):
- `wc -l` → 88 (≥15)
- `grep -c "pipeline_events"` → 10 (≥2)
- `grep -c "Phase 72"` → 10 (≥2)
- `grep -c "STUB"` → 1 (≥1)
- `grep -c "promotion_candidates"` → 3 (≥1)

Commit: `66c18ed`.

### Task 2 — REQUIREMENTS.md traceability flip

Pre-existing state observed: the `- [x] **TELE-01..03**` checkboxes at lines 94-99 were **already** marked `[x]` from prior Phase 70 work. Only the traceability table at lines 163-165 still showed `pending`. So Task 2's effective scope reduced to the 3 traceability rows.

Diff (verbatim):

```diff
@@ -160,9 +160,9 @@ Filled by roadmapper after phase mapping.
 | CANO-02 | Phase 69 | complete (jsonb-of-objects registry + TS codegen; migration 20260505a) |
 | CANO-03 | Phase 69 | complete (orq_agents.swarm_type='cross-cutting' for body agent; migration 20260505b) |
 | CANO-04 | Phase 69 | complete (smeba-uk fixture verified zero-prompt-edit onboarding; live smoke green) |
-| TELE-01 | Phase 70 | pending |
-| TELE-02 | Phase 70 | pending |
-| TELE-03 | Phase 70 | pending |
+| TELE-01 | Phase 70 | complete (migration 20260506a applied; pipeline_events schema + 5 stage emit sites green; tests in 70-03/04/05) |
+| TELE-02 | Phase 70 | complete (dual-write pattern verified; legacy tables classifier_rules/agent_runs/email_labels/automation_runs preserved; consumer code unchanged) |
+| TELE-03 | Phase 70 | complete (Bulk Review API rewired to pipeline_events in 70-06; Phase 72 recommender stub shipped per D-15 in 70-07) |
 | REVW-01 | Phase 71 | pending |
 | REVW-02 | Phase 71 | pending |
 | REVW-03 | Phase 71 | pending |
```

`git diff --stat .planning/REQUIREMENTS.md` → `1 file changed, 3 insertions(+), 3 deletions(-)`. Zero collateral edits.

Acceptance criteria check (all green):
- `grep -c "^- \[x\] \*\*TELE-0"` → 3
- `grep -c "^- \[ \] \*\*TELE-0"` → 0
- `grep -E "^\| TELE-0[123] \| Phase 70 \| complete" | wc -l` → 3

Commit: `78f39ba`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Scope reduction] Task 2 checkbox flip was a no-op**

- **Found during:** Task 2 read-first step
- **Issue:** The plan instructed flipping `- [ ] **TELE-0X**` → `- [x] **TELE-0X**` in §Telemetry consolidation (lines 92-96). On read, the checkboxes were already `[x]` (set by prior Phase 70 work — likely 70-01 or 70-02 closure). Re-flipping was either a no-op or destructive.
- **Fix:** Skipped the checkbox edit; performed only the traceability-table edit (Task 2 step 2 — the actually-needed work). Plan acceptance criteria for `grep -c "^- \[x\] \*\*TELE-0" returns 3` and `grep -c "^- \[ \] \*\*TELE-0" returns 0` were already satisfied at task start, and remain satisfied at task end.
- **Files modified:** none beyond the traceability table.
- **Commit:** `78f39ba`.

This is a Rule 3 alignment-with-reality, not a missed scope item — the plan's intended end-state is achieved.

## Verification

```bash
$ test -f docs/agentic-pipeline/promotion-recommender.md && wc -l docs/agentic-pipeline/promotion-recommender.md
      88 docs/agentic-pipeline/promotion-recommender.md

$ grep -c "pipeline_events" docs/agentic-pipeline/promotion-recommender.md
10
$ grep -c "Phase 72" docs/agentic-pipeline/promotion-recommender.md
10
$ grep -c "STUB" docs/agentic-pipeline/promotion-recommender.md
1
$ grep -c "promotion_candidates" docs/agentic-pipeline/promotion-recommender.md
3

$ grep -c "^- \[x\] \*\*TELE-0" .planning/REQUIREMENTS.md
3
$ grep -c "^- \[ \] \*\*TELE-0" .planning/REQUIREMENTS.md
0
$ grep -E "^\| TELE-0[123] \| Phase 70 \| complete" .planning/REQUIREMENTS.md | wc -l
       3
```

All success criteria green:
- D-15 stub shipped.
- REQUIREMENTS.md reflects Phase 70 completion.
- TELE-01..03 traceable to Phase 70 via complete-status rows with verification anchors.

## Self-Check: PASSED

- `docs/agentic-pipeline/promotion-recommender.md` → FOUND
- Commit `66c18ed` (Task 1) → FOUND in `git log`
- Commit `78f39ba` (Task 2) → FOUND in `git log`
- REQUIREMENTS.md TELE-* traceability rows → all 3 show `complete` with anchors
