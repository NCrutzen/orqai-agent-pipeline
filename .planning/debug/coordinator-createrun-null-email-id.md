---
slug: coordinator-createrun-null-email-id
status: root_cause_found
mode: diagnose_only
trigger: |
  DATA_START
  Surfaced while diagnosing debtor-st2-stranded-no-st3-label. Of 37 Stage-3
  worker_failed events in 24h, 27 are a DISTINCT failure mode (not the debtor
  schema-mismatch strand): the coordinator is invoked with
  event.data.email_id = null (only a Graph message_id present), so the very
  first step `createRun` does an INSERT that violates NOT NULL on
  agent_runs.email_id -> `null value in column "email_id"`. These fail BEFORE
  any agent_runs row exists, so they are not "st2-resolved stuck-classifying"
  strands.

  SUSPECT: the current branch `fix/sales-multi-brand-scope` has UNCOMMITTED
  producer-layer changes:
    web/lib/automations/sales-email/lookups/offerte.ts
    web/lib/automations/sales-email/lookups/order.ts
    web/lib/automations/sales-email/lookups/sites.ts
    web/lib/automations/sales-email/resolve-customer.ts
  The coordinator handoff event (pipeline/coordinator.requested) is emitted by
  the Stage-2 producer; if that emit now omits/loses email_id under some
  multi-brand scope branch, it would explain a null email_id reaching createRun.
  UNCONFIRMED — could also be an upstream ingest/emit defect unrelated to the
  uncommitted diff. Determine which swarm(s) the 27 belong to.
  DATA_END
created: 2026-06-23
updated: 2026-06-23
---

# Debug: coordinator-createrun-null-email-id

## Symptoms

- 27 of 37 Stage-3 `worker_failed` events (24h) = `createRun: null value in
  column "email_id"`. Coordinator invoked with `event.data.email_id = null`.
- Fails at step 1 (createRun INSERT) before any agent_runs row exists.
- Distinct from the debtor schema-mismatch strand (that one creates rows then
  throws in classify-intent).

## Current Focus

- hypothesis: the Stage-2 producer that emits `pipeline/coordinator.requested`
  is, under some branch, emitting with `email_id` null/undefined. Prime suspect:
  uncommitted `fix/sales-multi-brand-scope` changes to `resolve-customer.ts` +
  sales lookups (offerte/order/sites). Alternative: upstream ingest writes a row
  without email_id, or the event shape changed and a field rename dropped it.
- test: (a) which swarm(s) do the 27 belong to? (sales vs debtor) — narrows it to
  the uncommitted sales diff or not; (b) read `git diff` of the 4 uncommitted
  files and trace whether the coordinator-emit path can now produce a null
  email_id (early return / changed object shape / lost field); (c) read the
  coordinator function's event-data contract (what it expects vs what the
  producer sends); (d) confirm against live data: pull a few of the 27 failed
  events and inspect the emitted event.data payload if persisted.
- expecting: either a swarm-scoped producer regression from the uncommitted diff
  (sales-only) OR a pre-existing upstream emit defect (both swarms / debtor).
- next_action: spawn gsd-debugger diagnose-only.

## Evidence

- ts: 2026-06-23
  checked: live pipeline_events, worker_failed last 24h grouped by swarm/stage
  found: 24 of the 27-class failures are swarm_type='info-routing', stage=3.
    The rest: debtor-email stage-1 (11) + debtor-email stage-3 (10, the SEPARATE
    schema-mismatch strand) + 1 info-routing stage-0. The null-email_id createRun
    mode is EXCLUSIVELY info-routing stage-3 (24 rows).
  implication: The trigger's prime suspect (sales fix/sales-multi-brand-scope
    diff) is WRONG — sales-email does not appear in the failures at all.

- ts: 2026-06-23
  checked: a sample failing pipeline_events row (id 0fd5bce8…) decision_details
  found: error_message = `createRun: null value in column "email_id" of relation
    "agent_runs" violates not-null constraint`; email_id=null; message_id (Graph
    id) present; automation_run_id present; agent_run_id=null;
    stage_label='debtor-email-coordinator'; triggered_by='onFailure'.
  implication: The shared Stage-3 coordinator received event.data.email_id=null
    with only a Graph message_id — exactly the described mode. Fails at createRun
    before any agent_runs row exists.

- ts: 2026-06-23
  checked: the automation_run behind a failure (id 58b6ee09…)
  found: automation='info-routing-review', swarm_type='info-routing', result is a
    Stage-0 safety verdict that DOES contain email_id='164dbe74…' +
    source_mailbox='info@fire-control.nl'. So the emails row exists with a real id.
  implication: email_id was resolvable upstream but was NEVER passed into the
    coordinator event — it is dropped at the dispatch seam, not missing from the DB.

- ts: 2026-06-23
  checked: all emit sites of `pipeline/coordinator.requested`
    (grep web/lib, excluding tests)
  found: ONLY web/lib/inngest/functions/stage-2-customer-resolver.ts emits it
    (two sites: line 500-521 generic branch, line 685+ debtor branch). Both set
    `email_id: emailRow.id` (a non-null PK; the worker throws at line 168/179 if
    emailRow is missing). debtor-email-coordinator.ts only LISTENS for it.
  implication: A coordinator event with email_id=null cannot originate from
    stage-2-customer-resolver. There must be a DIFFERENT producer.

- ts: 2026-06-23
  checked: stage-2-customer-resolver trigger list (lines 71-74)
  found: it listens ONLY for `debtor-email/stage-2.customer-resolve.requested`
    and `sales-email/stage-2.customer-resolve.requested`. info-routing is NOT a
    trigger. So info-routing never enters Stage 2 customer resolution.
  implication: info-routing's coordinator event is produced elsewhere — the
    classifier-verdict-worker swarm_dispatch path.

- ts: 2026-06-23
  checked: classifier-verdict-worker.ts swarm_dispatch case (lines 347-373)
  found: it fires the event named in the registry column `swarm_dispatch` with
    payload `{ automation_run_id, swarm_type, category_key, message_id,
    source_mailbox }` — NO email_id field at all.
  implication: Whatever event swarm_dispatch points to receives message_id but
    never email_id. If it points straight at the coordinator, the coordinator
    sees email_id=undefined.

- ts: 2026-06-23
  checked: live swarm_noise_categories for action='swarm_dispatch'
  found: sales-email.unknown → 'sales-email/stage-2.customer-resolve.requested';
    debtor-email.unknown → 'sales-email/attachments.extract.requested' (→ Stage
    1.5 → Stage 2); info-routing.unknown → 'pipeline/coordinator.requested'.
  implication: ROOT CAUSE. debtor + sales route their 'unknown' verdict into a
    Stage-2 (or 1.5→2) producer that LOADS the emails row and emits the
    coordinator event WITH email_id=emailRow.id. info-routing's registry points
    the 'unknown' verdict DIRECTLY at the Stage-3 coordinator, skipping Stage 2.
    The verdict-worker dispatch payload carries no email_id → coordinator
    createRun INSERTs email_id=null → NOT NULL violation.

- ts: 2026-06-23
  checked: timeline. First-ever info-routing stage-3 worker_failed =
    2026-06-17T06:52:50Z; cluster spans 2026-06-22T12:11 → 2026-06-23T09:03 (the
    24 in-window). The info-routing.unknown registry row updated_at =
    2026-06-17T06:38:25Z (14 min before the first failure). Original seed
    migration 20260521b set action='manual_review', swarm_dispatch=NULL (safe).
  found: the row was changed from manual_review/NULL to swarm_dispatch/
    'pipeline/coordinator.requested' on 2026-06-17, with NO corresponding
    migration file in supabase/migrations (a live Management-API edit).
  implication: This is a PRE-EXISTING registry misconfiguration dated 2026-06-17,
    NOT a regression from today's (2026-06-23) fix/sales-multi-brand-scope diff.
    The sales lookups/resolve-customer changes are unrelated and (as of now)
    already committed (9106cf74, e4949e9b) — the working tree is clean.

## Eliminated

- hypothesis: The uncommitted fix/sales-multi-brand-scope diff (offerte/order/
    sites/resolve-customer) drops email_id from the coordinator emit.
  evidence: (a) None of the 27 failures are sales-email — they are all
    info-routing. (b) Those 4 files are now committed (9106cf74, e4949e9b);
    working tree is clean — there is no uncommitted diff to blame. (c) The sales
    emit path (stage-2-customer-resolver generic branch) sets email_id=emailRow.id
    and is not on info-routing's code path at all. (d) Failures predate the sales
    commits by 6 days (first 2026-06-17).
  ts: 2026-06-23

- hypothesis: Upstream ingest wrote an emails row without an id (or the emails
    row is missing) so email_id is genuinely null.
  evidence: The automation_run result for a failing case contains a valid
    email_id (164dbe74…) and the email passed Stage 0/1. The emails row exists;
    email_id is dropped at the verdict-worker→coordinator dispatch seam, not
    absent from the DB.
  ts: 2026-06-23

## Resolution

root_cause: |
  Pre-existing REGISTRY MISCONFIGURATION on the info-routing swarm (not a code
  bug, not the sales diff). The `swarm_noise_categories` row
  (swarm_type='info-routing', category_key='unknown') has
  action='swarm_dispatch' and swarm_dispatch='pipeline/coordinator.requested',
  changed live on 2026-06-17T06:38 (no migration file).

  The Stage-2→3 contract is that the coordinator event MUST carry the resolved
  DB `email_id`. Only the Stage-2 producer (stage-2-customer-resolver.ts) emits
  `pipeline/coordinator.requested`, and it sources email_id from the loaded
  emails row (`email_id: emailRow.id`). The classifier-verdict-worker's generic
  swarm_dispatch path (classifier-verdict-worker.ts:360-372) fires the registered
  event with only `{automation_run_id, swarm_type, category_key, message_id,
  source_mailbox}` — it has a Graph message_id but NO email_id (email_id
  resolution is Stage 2's job).

  Because info-routing points swarm_dispatch DIRECTLY at the coordinator instead
  of at a Stage-2 resolve event (as debtor and sales correctly do), the
  coordinator receives event.data.email_id=undefined. The very first coordinator
  step `createRun` (debtor-email-coordinator.ts:214 → agent-runs.ts:33
  `email_id: input.email_id`) INSERTs NULL into agent_runs.email_id, which has a
  NOT NULL constraint → every info@ "unknown"/real-business email fails before
  any agent_runs row is created.

  Exact loci:
  - Misconfig: public.swarm_noise_categories (info-routing,'unknown').swarm_dispatch
    = 'pipeline/coordinator.requested' (should be a Stage-2 producer event, or the
    info-routing flow needs a producer that resolves email_id before the coordinator).
  - Drop site: web/lib/inngest/functions/classifier-verdict-worker.ts:365-371
    (swarm_dispatch payload omits email_id — correct for a Stage-2 target,
    insufficient for a direct-to-coordinator target).
  - Failure site: web/lib/inngest/functions/debtor-email-coordinator.ts:122
    (`const { email_id } = email;`) → :214 createRun →
    web/lib/automations/debtor-email/coordinator/agent-runs.ts:33.

fix: |
  NOT APPLIED (diagnose-only). Fix direction (decide with the operator —
  depends on whether info-routing is meant to reach Stage 3 at all yet):

  Option A (revert to safe behavior — matches original 20260521b intent): set the
  info-routing 'unknown' row back to action='manual_review', swarm_dispatch=NULL.
  The verdict surfaces in Bulk Review for operator triage and the coordinator is
  never invoked. Smallest, lowest-risk; stops the 100%-failure of real info@ mail
  immediately. Appropriate if info-routing Stage 3 routing is not actually live.

  Option B (wire info-routing through a real Stage-2 producer): point
  swarm_dispatch at a producer event that loads the emails row and emits
  coordinator.requested WITH email_id=emailRow.id — i.e. give info-routing its own
  Stage-2 entry like sales/debtor (e.g. reuse a resolve/extract producer, or add
  an info-routing Stage-2 step). Required if info-routing IS meant to classify
  intents at Stage 3 (V9.7 routing-first). Larger change.

  Option C (defensive, does NOT fix routing): make the coordinator resolve
  email_id from message_id when email_id is absent (load emails row by
  source_id/internet_message_id, as stage-2-customer-resolver does at lines
  87-96). Closes the NOT NULL crash for any future direct-dispatch swarm, but on
  its own would still route info-routing into Stage 3 — only desirable combined
  with Option B's intent.

  Whichever is chosen, persist it as a MIGRATION (the current state is an
  undocumented live edit) so the registry stops drifting.

  Recommendation: confirm intent with operator. If info-routing Stage 3 is not
  yet a deliberate go-live → Option A now (one-row UPDATE migration). If it IS
  intended → Option B (+ optionally C as a guard).

verification: |
  Not performed (diagnose-only). To verify a fix: send/replay an info@ "unknown"
  business email and confirm either (A) it lands in Bulk Review with no
  coordinator invocation and no worker_failed, or (B) the coordinator runs with a
  non-null email_id and an agent_runs row is created. Confirm no new
  `createRun: null value in column "email_id"` pipeline_events appear.

files_changed: []

backfill_replay: |
  The 24 (this-window) / 27 (trigger) failed events created NO agent_runs and NO
  coordinator_runs rows (they died at step 1), so there is no partial/corrupt
  Stage-3 state to clean up. Their automation_runs are marked failed
  (recordWorkerFailure via onFailure). Once the registry is fixed, NEW info@ mail
  stops failing on its own. The already-failed emails would need a REPLAY to be
  processed (they will not retry themselves) — either re-dispatch the
  info-routing 'unknown' verdict for those automation_runs, or re-ingest the
  affected message_ids. Low urgency unless those specific info@ emails must be
  routed; the population is bounded (24 in 24h) and identifiable by
  decision_details.message_id on the failed pipeline_events.

remaining_unknowns: |
  - WHO/WHY changed the registry row on 2026-06-17 (no migration; likely a
    routing-swarm wiring attempt per the V9.7 routing-first decision in MEMORY,
    but unconfirmed). Worth confirming so the fix matches intent (Option A vs B).
  - Whether info-routing Stage 3 intent classification is actually configured
    (swarms.stage3_coordinator_agent_key, intentSchemaForSwarm entry). If absent,
    Option A is clearly correct; if present, Option B is the intended target.
