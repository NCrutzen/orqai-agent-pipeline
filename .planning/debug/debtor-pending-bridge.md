---
slug: debtor-pending-bridge
status: root_caused
trigger: debtor-email automation_runs stuck in status='pending' even though pipeline_events for Stage 0/1/3 all fire; sales-email unaffected; many rows duplicated from Zapier double-fire
created: 2026-05-11T15:35:00Z
updated: 2026-05-11T16:10:00Z
---

# Debug: debtor-pending-bridge

## Symptoms

DATA_START
- ~20 debtor-email `automation_runs` rows stuck at `status='pending'` over last 24h in production (Supabase project `mvqjhlxfvtqqubqgdvhz`).
- Ages range 1h to 7h+. Sample run ids: `3ce41a26-f848-4e69-99aa-46775dc2404c`, `0484e134-3513-4b1b-980c-ece984e8d4f9`, `0f08940d-8f0a-46dd-adc0-03c611df6963`, `626227b2-434a-4431-92dd-4fa528dbc8d2` (email_id=NULL — anomaly).
- For every stuck row, `pipeline_events` for Stage 0, Stage 1, AND Stage 3 are all written successfully (typically 2 events per stage because of Zapier double-fire). So the pipeline workers RAN; only the `automation_runs.status` advancement is missing.
- Sales-email is unaffected — Phase 74 production smoke shows sales-email rows correctly progressing (146 agent_runs with inngest_run_id, clean decision_details).
- Duplicate-fire pattern: same `email_id` produces two `automation_runs` rows ~10-30s apart (Zapier ingest emitting same email twice).
- Some debtor rows DO complete normally (e.g. handoff mentions `4aefb2d0` reaching `predicted`, `dcd3dddc` reaching `completed`). So the bug is intermittent or only affects a subset of debtor rows.
- Earliest evidence trail in `.planning/phases/74-stage-1-llm-category-classifier-swarm-agnostic-fills-the-mis/HANDOFF-2026-05-06.md` flagged this as "Inngest stuck-pending" but never root-caused.
- Phase 80 introduced `predicted` as a first-class state with a classifier→dispatcher split. The bridge that updates `automation_runs.status` from `pending`→`predicted` is owned by Phase 80's new classifier/dispatcher. Suspect this bridge is silently failing for debtor-email.
DATA_END

## Hypotheses (initial)

1. **Bridge handler (classifier→dispatcher) fails the `pending`→`predicted` UPDATE for debtor-email** — possibly because the row lookup key is wrong (Phase 65 replay-id learning re-surfacing?) or because the swarm_type isn't being threaded through the new dispatcher.
2. **Zapier double-fire creates conflicting concurrent updates** that lose the status write (last-writer-wins on a row that hasn't been written yet).
3. **Stage 3 worker writes pipeline_events but never emits the bridge event** that triggers the `automation_runs` status flip.
4. **Inngest function for the bridge is registered for sales-email but not for debtor-email** (registry-driven dispatch gap from Phase 75 prep, which restored debtor categorize_archive but maybe missed an event binding).

## Files likely involved

- `web/lib/inngest/functions/classifier-screen-worker.ts` (Phase 74 worker — writes pipeline_events, advances agent_runs)
- `web/lib/inngest/functions/classifier-verdict-worker.ts` (verdict dispatcher — should update automation_runs)
- `web/lib/inngest/functions/debtor-email/coordinator.ts` (Stage 3 — fires)
- `web/lib/inngest/functions/debtor-email/dispatcher.ts` (Phase 80 split — bridge between classifier and Stage 4)
- `web/lib/automations/swarm-bridge/sync.ts` (UI status mapping — Phase 80-04 added `predicted` case here)
- Ingest route at `web/app/api/automations/debtor-email/ingest/route.ts` (idempotency / dedup)

## Recent reference commits

- `5b46175` (Phase 74 closed; smoke confirmed bug is real)
- Phase 80 series (look for status state-machine refactor commits)

## Current Focus

hypothesis: ROOT CAUSED — combined H1/H2 invariant failure. Two distinct populations conflated in symptoms:
  (a) 23 of 25 "stuck" rows are by-design Kanban placeholder rows (`automation='debtor-email-kanban'`, `triggered_by` in `stage-3-no-handler`/`stage-3-low-confidence`). Per `docs/agentic-pipeline/stage-3-coordinator.md` Stuck-Status Meaning table, `routed_human_queue` (and the parallel `automation_runs.status='pending'` for the Kanban row) is the **terminal human-triage state**. No alert. Not a bug.
  (b) 2 genuinely-stuck rows are `automation='debtor-email-review'`, `triggered_by='zapier:ingest'`, `result.stage='stage_0_safety_pending'`. These are the "Stage 0 pending placeholder" rows created up-front by the ingest route. Nothing on the success path updates them: Stage 0 worker INSERTS its own verdict row (with a different `triggered_by='stage-0/safety-worker'` and a different id) rather than UPDATE-ing the pending placeholder. Phase 65 sweeper only matches `triggered_by LIKE 'stage-0/%'`, so it doesn't sweep `zapier:ingest` placeholders.
  Why only some debtor rows: ingest route is called once per receiving mailbox the same email forwards into (e.g. `debiteuren@smeba.nl` + `debiteuren@smeba-fire.be` both receive the same forwarded message). Each call creates its OWN `automation_runs` placeholder AND fires its OWN `stage-0/email.received` event. Stage 0 advances ONE of them (the one whose event won the per-message inngest dedup at the email_pipeline.emails uniqueness layer, then propagated through Stage 0→1→3→verdict-worker which DOES update by id). The OTHER placeholder rows (one per "loser" mailbox) are orphaned at `stage_0_safety_pending` forever.
  Sales-email is immune because it has a single source mailbox (`verkoop@smeba.nl`) — no duplicate-per-mailbox placeholders.

test: confirmed via REST query:
  - 20 rows `debtor-email-kanban` / `stage-3-no-handler` + 3 rows `stage-3-low-confidence` = expected terminal-pending Kanban rows.
  - 2 rows `debtor-email-review` / `zapier:ingest` / `stage_0_safety_pending` = the orphan placeholders.
  - Sample message `AAkALgA...h3imMgAA` produced 3 `automation_runs` rows (smeba `626227b2`, smeba-fire `7ad9b928`, plus stage-0 verdict `c3c09834`). Only smeba-fire's row advanced to `completed` because Stage 0 verdict was attached to it; smeba's `626227b2` is the orphan.

expecting: identify the exact UPDATE that's expected to advance `pending`→`predicted` for debtor-email and prove it's either not running, or running with a where-clause that matches zero rows
next_action: choose fix shape — see Resolution.fix below.
reasoning_checkpoint: 
tdd_checkpoint: 

## Evidence

- timestamp: 2026-05-11T16:00:00Z
  source: SQL query against `automation_runs` filtered by `swarm_type=debtor-email AND status=pending AND created_at > 2026-05-10`
  finding: 25 stuck rows split into three buckets — 20 stage-3-no-handler Kanban (by-design terminal), 3 stage-3-low-confidence Kanban (by-design terminal), 2 zapier:ingest stage_0_safety_pending (the actual orphan placeholders).

- timestamp: 2026-05-11T16:02:00Z
  source: SQL query joining `automation_runs` + `pipeline_events` on `result->>message_id = 'AAkALgAAAAAAHYQDEapmEc2byACqAC-EWg0AfVu6CoIRQ0Cue2Zmzx_SzAACh3imMgAA'`
  finding: same Outlook message id produced THREE automation_runs rows (smeba ingest placeholder `626227b2`, smeba-fire ingest placeholder `7ad9b928`, stage-0 verdict insert `c3c09834`). Stage 0 verdict was linked to smeba-fire's automation_run_id, advancing only that branch. Smeba's `626227b2` never received an UPDATE.

- timestamp: 2026-05-11T16:05:00Z
  source: `web/lib/inngest/functions/stage-0-safety-worker.ts` line 187 + `web/app/api/automations/debtor-email/ingest/route.ts` line 380
  finding: Architecture mismatch — ingest route creates a `status='pending'` placeholder row `triggered_by='zapier:ingest'`. Stage 0 worker INSERTS a fresh `status='completed'` row `triggered_by='stage-0/safety-worker'`. The Stage 0 worker NEVER updates the ingest placeholder by id. The `automation_run_id` carried in events is used for `pipeline_events.automation_run_id` and downstream verdict-worker writes, not for advancing the Stage-0 placeholder itself.

- timestamp: 2026-05-11T16:07:00Z
  source: `web/lib/inngest/functions/automation-runs-sweeper.ts` line 48
  finding: Sweeper filters `WHERE triggered_by LIKE 'stage-0/%'` — does NOT match `zapier:ingest`. So the orphan placeholders never get reaped either.

- timestamp: 2026-05-11T16:08:00Z
  source: `docs/agentic-pipeline/stage-3-coordinator.md` Stuck-Status Meaning table + Phase 80 dispatcher.
  finding: Per the RFC, dispatcher's placeholder branch deliberately INSERTs a NEW `automation_runs` row at `status='pending'` for the Kanban surface (`triggered_by='stage-3-no-handler'`). That row's `pending` is the terminal human-triage state, NOT a bug. Symptom (a) was misread.

## Eliminated

- H1 (bridge handler fails pending→predicted UPDATE for debtor-email) — sales-email going through the same stage-3-dispatcher with the same handler logic confirms the dispatcher works. The "stuck pending" Kanban rows are intentional terminal state per RFC.
- H3 (Stage 3 worker writes pipeline_events but never emits the bridge event) — pipeline_events show `<swarm>/predicted` flow runs; agent_runs for advanced rows reach `predicted` cleanly.
- H4 (Inngest function not registered) — registration is fine; sales-email uses identical wiring.

## Resolution

root_cause: **Architectural duplication of "pending" semantics at Stage 0 ingest.** The debtor-email ingest route was extended (Phase 64 SAFE-01..03) to create a `status='pending'` placeholder `automation_runs` row before firing `stage-0/email.received`, so that the Stage 0 worker would have a stable id and the budget-breach-handler could mark it failed on breach. But on the success path, the Stage 0 worker INSERTS its own verdict row at `status='completed'`/`'predicted'` (line 187 of `stage-0-safety-worker.ts`) with `triggered_by='stage-0/safety-worker'`, never UPDATE-ing the original `zapier:ingest` placeholder. The placeholder is then orphaned forever.

The bug is invisible for sales-email (single source mailbox: only one placeholder per message) and for debtor-email when the email is delivered to only one mailbox. It surfaces when the same Outlook message_id is forwarded into multiple Moyne-monitored debtor mailboxes (e.g. `verkoop@smeba.nl` forwarded into both `debiteuren@smeba.nl` AND `debiteuren@smeba-fire.be`): each ingest call creates its own placeholder + fires its own Stage-0 event, but downstream `email_pipeline.emails` is upserted on `source_id` (Outlook id), so the actual processing flow runs only against the first/winning automation_run_id. The other ingest's placeholder rows have no path to status='completed'.

Secondary observation: 23 of 25 "stuck" rows in the original symptom set were a **false alarm**. The Stage 3.5 dispatcher's placeholder branch (`stage-3-no-handler`, `stage-3-low-confidence`) intentionally INSERTs `automation='debtor-email-kanban'` rows at `status='pending'` as the terminal Kanban human-triage state per the locked RFC (`docs/agentic-pipeline/stage-3-coordinator.md` Stuck-Status Meaning + Transition Table). Any future "stuck pending" alert must filter these out by `automation != '*-kanban'` AND `triggered_by NOT IN ('stage-3-no-handler','stage-3-low-confidence')`.

fix: not applied — three viable fix shapes for Phase 80.x or Phase 82 to choose between:

1. **(Smallest) Make Stage 0 worker UPDATE the placeholder by id, not INSERT a new row.** In `stage-0-safety-worker.ts` Step 4 (`persist-verdict`), if `automation_run_id` was provided by the caller, UPDATE that row's status + result; otherwise INSERT (preserves the LLM-bound budget-breach path). Touches one function, one step.

2. **Sweeper widens its filter** to include `triggered_by='zapier:ingest' AND result->>stage='stage_0_safety_pending'` so orphaned placeholders get reaped after 15 min. Doesn't actually fix the data; only stops the stuck-row alert from firing. Acceptable as a stopgap.

3. **Stop creating the ingest-side placeholder entirely.** Pass `automation_run_id=null` into `fireStage0Event`, let Stage 0 own the entire row lifecycle. Requires reconciling budget-breach-handler's row-by-id contract (does it need a row to mark failed before Stage 0 starts? — verify).

Recommended: **(1) + the alert-filter cleanup**. Fix (1) is the canonical alignment with Phase 80's "single observable row per pipeline" intent (the Stage 0 placeholder + Stage 0 verdict are TWO rows for the SAME message, which already violates the "one row per pipeline run" principle the RFC pushes elsewhere). The alert-filter cleanup removes the spurious Kanban-row noise from the stuck-pending dashboard so the real signal is visible.

verification: 
files_changed: 
