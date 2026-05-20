---
slug: pipeline-side-effects-frozen
status: root_cause_found
trigger: |
  DATA_START
  Pipeline health tick Wednesday 2026-05-13 11:37 UTC (Δ vs Tue 14:37 — 21h gap).
  Classification stages are HEALTHY (+79 stage_0_safety completed, +32 LLM unknowns,
  +30 S1, +61 stage_0 safe verdicts) but ALL downstream side-effect handlers are
  FROZEN >24h:
    - categorize+archive (Outlook archive): frozen at 62 completed since Tue AM
    - icontroller_delete cleanup: frozen at 70 completed / 46 failed since Tue AM
    - routed_human_queue: frozen at 32 for ~48h
  Side signals:
    - zapier_ingest_classify "predicted" grew 103 → 164 (+61 in 21h, accelerating)
    - agent_runs.status="classifying" stuck at 67 for 48h+ (zombies)
    - First-ever Stage 0 injection_suspected verdict (n=1)
    - S3 depth dropped 72 → 65 despite +30 S1 (MAX rollup shifted or reclassification)
    - unknown_legacy 269 unchanged (yesterday's mystery backfill)
    - Latest errors: iController Tue 08:15 UTC "Delete verification failed" (no new fails — worker not running); Stage 0 mass-fail Mon 15:10 (pending=0, no new fails)
  Operator hypothesis: side-effect dispatcher crashed/disabled Mon/Tue evening
  and stayed down. Check Inngest dashboard for cleanup-icontroller-dispatch,
  outlook-archive, stage3-human-route last invocation timestamps.
  DATA_END
created: 2026-05-13T11:40:47Z
updated: 2026-05-13T12:10:00Z
---

# Debug: pipeline-side-effects-frozen

## Symptoms

- **Expected:** After Stage 0 safe + Stage 1 noise verdict, side-effect handlers fire:
  Outlook categorize+archive for noise rows, iController cleanup dispatch for
  matching noise categories, and Stage 3 human-queue routing for routable intents.
- **Actual:** All three side-effect handlers frozen >24h despite upstream classifiers
  producing new verdicts at normal rate. Zero new completed/failed rows for
  categorize+archive, icontroller_delete, or routed_human_queue since Tue ~AM.
- **Errors:** Latest iController fail = Tue 08:15 UTC "Delete verification failed"
  (stale — worker not running). Latest Stage 0 mass-fail = Mon 15:10 (25 empty
  error_messages, batch). No NEW errors in 24h — silence not crashes.
- **Timeline:** Worked Tue AM, stopped Tue afternoon/evening. Classifiers kept
  running (+79 stage_0_safety, +30 S1) but no downstream invocations.
- **Reproduction:** Observable via funnel-depth + handler-status counts in the
  pipeline health tick query (debtor-email swarm).

## Current Focus

- hypothesis: Commit `c4308b0` (Tue 2026-05-12 15:33 CET) added a dedup guard in
  `classifier-verdict-worker.ts` (the `stage1_categorize_archive` registry-driven
  dispatch path) that skips inserting a cleanup `automation_runs` row whenever
  ANY row exists with `(automation = dispatch.automation, result->>message_id = message_id)`,
  regardless of status. The guard has no status filter and no time window, so it
  short-circuits **all** cleanup inserts for any message_id that ever had a
  cleanup row written (completed, failed, deferred). Combined with mailbox
  forwarding (debiteuren@smeba-fire.be → debiteuren@smeba.nl, per project memory)
  every forwarded duplicate now silently no-ops, **and** any retry after a
  prior failed delete also no-ops.
- test: Query `automation_runs` where `automation='debtor-email-cleanup'`,
  `triggered_by='classifier-verdict-worker'`, `created_at > '2026-05-12T13:30:00Z'`
  — expect ~0 rows (confirms verdict-worker stopped queueing).
  Compare to `automation='debtor-email-cleanup'`, `triggered_by='stage-1-worker'`
  same window — expect the screen-worker's whitelist branch (which has NO dedup)
  to still produce rows IF the whitelist+auto-action branch is the active code
  path for affected mailboxes.
- expecting: Root cause = c4308b0 dedup guard is too broad. Fix = either
  (a) narrow the dedup to status IN ('deferred','pending') so we only block
  in-flight duplicates, or (b) drop the guard entirely and dedupe at delete-time
  on iController (the original symptom was a verify-failure, not a true double
  delete).
- next_action: confirm Stage 3 / Outlook freeze are the same root cause OR a
  separate issue (different writers). Stage 3 dispatcher has its own
  idempotency guards on `agent_runs.status` and `coordinator_runs.completed_at`
  that look correct in isolation, so Stage 3 freeze is likely a **separate**
  issue worth its own investigation — possibly the coordinator orchestrator
  not firing because Stage 1 noise verdicts are silently swallowed before
  Stage 2/3 fan-out.

## Evidence

- timestamp: 2026-05-13T12:00:00Z — Recent git log shows ONE commit in the
  freeze window (Tue 2026-05-12 13:33 UTC = 15:33 CET) that touched dispatch:
  `c4308b0 fix(debtor-email-cleanup): dedup cleanup queue inserts by message_id`.
  This is the only side-effect-touching commit in the relevant window — the
  rest are Phase 82.4 (UI / feedback table / fire-feedback) which do not
  participate in cleanup dispatch.

- timestamp: 2026-05-13T12:01:00Z — File: `web/lib/inngest/functions/classifier-verdict-worker.ts`
  lines 173-192. The dedup guard in the `categorize_archive` action branch:
  ```
  const { data: existing } = await admin
    .from("automation_runs")
    .select("id")
    .eq("automation", dispatch.automation)
    .eq("result->>message_id", message_id)
    .limit(1);
  if (existing && existing.length > 0) {
    return;
  }
  ```
  **Critical**: no `.in("status", [...])` filter and no `created_at` window.
  Any prior row for `(automation, message_id)` short-circuits the new insert.

- timestamp: 2026-05-13T12:02:00Z — Pre-commit message of c4308b0 confirms
  intent was forwarded-duplicate suppression only. But the implementation
  blocks **all** retries and **all** future cleanup attempts on any
  message_id seen before, even if the prior attempt failed (e.g. the
  "Delete verification failed" rows from Tue 08:15 UTC). This perfectly
  matches the operator's "no new failures, no new completions" silence.

- timestamp: 2026-05-13T12:03:00Z — Inngest serve route
  `web/app/api/inngest/route.ts` registers all expected functions:
  `classifierVerdictWorker`, `cleanupIControllerDispatch`,
  `cleanupIControllerShardWorker`, `stage3Dispatcher`,
  `coordinatorOrchestrator`, etc. No function deregistration; this rules
  out hypothesis "functions paused or not registered."

- timestamp: 2026-05-13T12:04:00Z — Screen-worker
  `web/lib/inngest/functions/classifier-screen-worker.ts` has a separate
  auto-action branch (line 532+) that inserts cleanup rows directly without
  a dedup guard (line 673 `queue-icontroller-cleanup`). That path is gated by
  `isWhitelistMatch && settings.auto_label_enabled`. If non-whitelisted noise
  rows fall through to the verdict-worker (Step 5 emit-verdict at line 748),
  they hit the broken dedup guard. This explains why the freeze affects
  primarily the verdict-worker-routed flow — and why some categorize+archive
  rows might still trickle in from the screen-worker whitelist branch.

- timestamp: 2026-05-13T12:05:00Z — Stage 3 dispatcher
  `web/lib/inngest/functions/stage-3-dispatcher.ts` lines 121-201 contains
  its own idempotency logic (agent_runs.status='predicted' guard +
  coordinator_runs.completed_at sentinel) but no recent commit touched it.
  Stage 3 "routed_human_queue" freeze at 32 for ~48h predates the Tue
  commit and is therefore likely a **separate** issue — possibly upstream
  coordinator-orchestrator not running, or no Stage 3 routable intents in
  the latest backlog. Recommend a separate debug session for Stage 3.

- timestamp: 2026-05-13T12:06:00Z — Hard-separation rule (RFC) verified:
  classifier-verdict-worker.ts operates strictly on `swarm_noise_categories`
  (Stage 1), stage-3-dispatcher.ts operates strictly on `swarm_intents`
  (Stage 3). No row is moved between the two. This investigation does not
  contradict the locked RFC; the bug is at the implementation layer (over-broad
  dedup predicate), not at the architecture layer.

## Eliminated

- "Inngest functions paused / deregistered" — `web/app/api/inngest/route.ts`
  registers all expected functions; no recent deletion. Also the operator
  reports Stage 0 + Stage 1 classifiers running normally, which means the
  Inngest serve route is healthy.
- "`inngest.send` destructured (CLAUDE.md `dae6276` regression)" — grep
  shows all call sites use the `(inngest.send as unknown as SendFn)({...})`
  inline cast pattern; no destructuring.
- "Replay-unsafe ID generation" — operator symptom is "no INSERT at all",
  not "INSERT-defaults + UPDATE no-op", which rules out the Phase 65 ID
  regeneration regression.
- "Phase 82.4 wiring break" — Phase 82.4 commits (`0782dfb`, `c3cb1a2`,
  `b1e2ef6` etc.) touch only the new email_feedback table and the
  override-link sites; none of them touch the verdict-worker / screen-worker /
  dispatcher / Stage 3 routing code paths.

## Resolution

_(pending — root cause identified; fix not yet applied)_

### Recommended fix

In `web/lib/inngest/functions/classifier-verdict-worker.ts` lines 184-192,
narrow the dedup predicate so it only blocks in-flight duplicates from the
same Outlook message_id, not historical completions or failures:

```ts
const { data: existing } = await admin
  .from("automation_runs")
  .select("id")
  .eq("automation", dispatch.automation)
  .eq("result->>message_id", message_id)
  .in("status", ["deferred", "pending", "running"])  // ← add this
  .limit(1);
if (existing && existing.length > 0) {
  return;
}
```

This preserves the original intent (suppress queue-time duplicates from
mailbox forwarding) while allowing:
1. A retry after a prior `failed` attempt (so transient iController errors
   self-recover the next time the message is reprocessed).
2. A re-classification of a previously-completed message (rare but legal —
   e.g. operator-driven re-trigger).

### Stage 3 freeze — separate work item

The "routed_human_queue frozen at 32 for ~48h" symptom is NOT explained by
this fix. Suggest opening a separate debug session keyed to:
`coordinator-orchestrator` or `stage-3-dispatcher` — confirm whether
new Stage 3 routable intents are being produced (S3 depth dropped 72 → 65
despite +30 S1 suggests rows are leaving S3, not entering it).
