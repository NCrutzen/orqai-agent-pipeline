---
status: testing
phase: 80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted
source:
  - 80-01-test-scaffolds-red-SUMMARY.md
  - 80-02-stage-3-dispatcher-SUMMARY.md
  - 80-03-classifier-refactor-and-register-SUMMARY.md
  - 80-04-SUMMARY.md
  - 80-05-SUMMARY.md
  - 80-06-SUMMARY.md
started: 2026-05-11T09:31:07Z
updated: 2026-05-11T09:40:00Z
---

## Current Test

number: 2
name: Predicted Runs Surface in Kanban Progress Lane
expected: |
  A new debtor email arriving (or replaying an existing one) goes through the
  classifier, gets `agent_runs.status='predicted'`, and appears in the Kanban
  "in progress" lane attributed to the agent **"Stage 3 Dispatcher"**. After
  the dispatcher runs, the row transitions to either the kanban-review lane
  (for routed-human-queue intents) or to a handler-driven lane.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
**Status:** passed (2026-05-11)
**Expected:** Fresh boot of the web app; `/api/inngest` lists `stage-3-dispatcher`; no startup errors.
**Result:** `next dev` ready in 3.7s, no compile/import errors. `/api/inngest` returned `function_count: 39` with `has_event_key` + `has_signing_key` true. `stage3Dispatcher` import + registration confirmed in `web/app/api/inngest/route.ts`. Pre-existing non-blocking warnings: stray root-level package-lock.json + middleware→proxy deprecation notice.

### 2. Predicted Runs Surface in Kanban Progress Lane
**Status:** BLOCKED — see Issues #1 and #2
**Expected:**
A new debtor email arriving (or replaying an existing one) goes through the
classifier, gets `agent_runs.status='predicted'`, and appears in the Kanban
"in progress" lane attributed to the agent **"Stage 3 Dispatcher"**. After
the dispatcher runs, the row transitions to either the kanban-review lane
(for routed-human-queue intents) or to a handler-driven lane.
**Result:** Cannot run end-to-end. Phase 80 is not deployed (26 commits
ahead of origin/main) and the `status='predicted'` namespace is already
in use by Stage 1's screen-worker, which makes 80-04's UI mapping
ambiguous on its face.

### 3. End-to-End `*/predicted` Event Flow in Inngest Dashboard
**Status:** queued
**Expected:**
In the Inngest dashboard, sending or replaying a debtor email produces:
- An event `debtor-email/predicted` (or analogous swarm/predicted).
- A run of `stage-3-dispatcher` consuming that event.
- The dispatcher run completes without error and writes either an
  `automation_runs` row (placeholder kanban) or a handler-event emission.

### 4. Backfilled Rows Now Visible in Routed-Human-Queue
**Status:** queued
**Expected:**
The 32 previously stranded `agent_runs` rows that were stuck on
`status='classifying'` now show `status='routed_human_queue'` and appear in
the Bulk Review / Kanban human-queue lane. Spot-check: pick 2–3
`agent_run_id`s from `web/backfill-stuck-no-kanban.json` is NOT what you
want — those are the 4 flag-only test fixtures. Instead, query the DB:
`SELECT id, status FROM agent_runs WHERE id IN (...);` for any of the
32 HAS_KANBAN IDs from the apply log (e.g. `004ccb5e-...`,
`049d4e3a-...`, `bcb4de18-...`, `c16ef4fa-...`).

### 5. Escalation Gate Still Routes Human-Only Intents Correctly
**Status:** queued
**Expected:**
A debtor email whose top intent has `requires_orchestration=false` in
`swarm_intents` (i.e. a human-queue intent) is routed to
`routed_human_queue` via the dispatcher's escalation gate, NOT to a
handler. Conversely, a debtor email with an automation-eligible intent
(e.g. `invoice_copy_request`) goes to the handler path. The
hard-separation rule (`swarm_intents` source-of-truth, not
`swarm_noise_categories`) holds.

### 6. RFC Doc Matches Shipped Architecture
**Status:** queued
**Expected:**
Open `docs/agentic-pipeline/stage-3-coordinator.md`. The doc describes:
- The classifier-only role of `debtor-email-coordinator.ts`.
- The new `predicted` agent_runs status.
- The Stage 3.5 dispatcher with wildcard `*/predicted` subscription.
- The hard-separation rule restated twice.
- A `## Cross-Swarm Dispatcher Contract` section that lets you wire a
  second swarm (e.g. sales-email Phase 78) by registry-rows + classifier
  function only — no copy-paste dispatch logic.

## Issues

### Issue #1 — Phase 80 not deployed (severity: high, blocks UAT)
Local `main` is **26 commits ahead** of `origin/main`. None of Phase 80
(classifier refactor, Stage 3.5 dispatcher, UI sync, backfill script,
RFC doc lock) is in production yet. End-to-end UAT (tests 2, 3, 5) is
impossible until the branch is pushed and Vercel deploys.
**Decision required:** push now, deploy, then resume UAT. Or hold until
Issue #2 is resolved.

### Issue #2 — `status='predicted'` namespace collision between Stage 1 and Stage 3 (severity: high, design defect)
Production already writes `agent_runs.status='predicted'` from Stage 1's
`classifier-screen-worker.ts` (line 211) to denote "Stage 1 noise category
predicted." Phase 80's classifier ALSO writes `status='predicted'` to denote
"Stage 3 intent predicted." Live counts (2026-05-11):

- `sales-email` predicted (Stage 1 noise): 125 rows
- `debtor-email` predicted (Stage 1 noise): 91 rows
- Stage 3 intent-predicted: 0 (not deployed)

Concrete consequences once Phase 80 deploys:
1. **UI mis-attribution**: 80-04's `case "predicted": return "Stage 3
   Dispatcher"` in `triageAgentFromStatus` will attribute every Stage 1
   prediction to Stage 3.
2. **Status field semantics collapse**: any monitoring/alert query that
   keys on `status='predicted'` can no longer tell the two populations
   apart without inspecting `tool_outputs ? 'intent_first_pass'` vs
   `tool_outputs ? 'stage1_category'`.
3. **Dispatcher trigger is safe** (it subscribes to the `*/predicted`
   *event*, and screen-worker emits `classifier/verdict.recorded`,
   not a `*/predicted` event) — so the runtime collision is contained
   to the status-string semantics, not the event bus.

**Suggested fixes (pick one before push):**
- (A) Rename Phase 80's new status to something unambiguous
  (e.g. `intent_predicted` or `stage3_predicted`) and update the
  literal-union, the classifier emit, the dispatcher precondition,
  the UI sync arms, and the backfill script accordingly.
- (B) Keep the shared status string but disambiguate in
  `triageAgentFromStatus` / `triageStageFromStatus` by checking
  `tool_outputs ? 'intent_first_pass'` (Stage 3) vs
  `tool_outputs ? 'stage1_category'` (Stage 1).
- (C) Document the overload explicitly in the RFC and accept the
  ambiguity (lowest effort, highest long-term cost).

### Issue #3 — RFC "post-backfill steady-state = 0" claim is incorrect (severity: low, doc accuracy)
`docs/agentic-pipeline/stage-3-coordinator.md` ("Stuck-Status Meaning")
footnote claims `agent_runs WHERE status='classifying' AND
tool_outputs ? 'intent_first_pass'` baseline = 0 after backfill. Reality
post-apply: 29 unflippable residuals (4 NO_KANBAN + 25 MULTI_KANBAN)
remain by design. Either narrow the alert query (exclude rows whose
companion `automation_runs.{swarm}-kanban` row count ≠ 1) or revise
the baseline to "≈ 29 stable residuals; alert on growth."

## Notes

- Phase 80 is mostly backend plumbing; most of these tests require live
  Inngest / DB access. UI test (#2) is the only browser-visible item.
- Production backfill was executed on 2026-05-11: 32 HAS_KANBAN rows
  flipped to `routed_human_queue`. 29 residual rows remain (4 NO_KANBAN
  test fixtures + 25 MULTI_KANBAN duplicate cluster) — these are
  intentionally flag-only and out of scope.
- Note the RFC's "post-backfill steady-state = 0" claim does not match
  the live count (29 unflippable residuals). May need a follow-up RFC
  edit or alert-query filter — flag as an issue if you want it tracked
  here.
