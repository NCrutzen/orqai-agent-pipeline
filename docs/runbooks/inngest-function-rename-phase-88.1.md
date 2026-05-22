# Inngest Function Rename — Phase 88.1

**Cutover:** 2026-05-22 03:43:13 UTC (squash-merge of PR #52) — Vercel production deploy completed 2026-05-22 03:44:03 UTC
**PR:** [#52](https://github.com/Moyne-Roberts/agent-workforce/pull/52) — squash commit `35879683719a1bc134ac597d3a4896a62457c818`
**Vercel deploy:** https://vercel.com/moyne-roberts/agent-workforce/6ZtBuUhGBFHuj8be4U7mopv7BDcQ
**Operator:** Nick (cutover executed during quiet window — 0 in-flight runs verified pre-merge)

This runbook documents the rename of four Inngest functions and their three coupled event names. The rename is a pure refactor with no behavior change. Inngest treats function-id changes as **new functions**; historical runs under the old ids remain queryable in the Inngest dashboard under those old ids forever, but they are orphaned from the new functions. Use the mapping table below when looking up historical runs.

---

## Mapping table

| Stage | Legacy function id | New function id | Legacy event name | New event name |
|---|---|---|---|---|
| 2 | `classifier/label-resolver` | `stage-2-customer-resolver` | `debtor-email/label-resolve.requested` | `debtor-email/stage-2.customer-resolve.requested` |
| 2 | `automations/debtor-email-icontroller-tagger` | `stage-2-icontroller-label-applier` | `debtor-email/icontroller-tag.requested` | `debtor-email/stage-2.icontroller-label.requested` |
| 1 | `automations/debtor-email-icontroller-shard-worker` | `stage-1-icontroller-noise-cleanup` | `icontroller/cleanup.shard.requested` | `debtor-email/stage-1.icontroller-cleanup.requested` |
| 1 | `automations/debtor-email-icontroller-dispatch` | `stage-1-icontroller-noise-cleanup-dispatcher` | _(cron-only, no event)_ | _(cron-only)_ |

Source-file renames (preserved via `git mv`, so blame survives):

| Old path | New path |
|---|---|
| `web/lib/inngest/functions/classifier-label-resolver.ts` | `web/lib/inngest/functions/stage-2-customer-resolver.ts` |
| `web/lib/inngest/functions/debtor-email-icontroller-tagger.ts` | `web/lib/inngest/functions/stage-2-icontroller-label-applier.ts` |
| `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts` | `web/lib/inngest/functions/stage-1-icontroller-noise-cleanup.ts` |
| `web/lib/inngest/functions/debtor-email-icontroller-cleanup-dispatcher.ts` | `web/lib/inngest/functions/stage-1-icontroller-noise-cleanup-dispatcher.ts` |

---

## Pre-merge checklist (T-5 min)

1. **Pick a quiesce window.** The cleanup-dispatcher cron is `TZ=Europe/Amsterdam */5 6-19 * * 1-5`. Safest windows:
   - Outside cron hours (any time before 06:00 or after 19:55 Amsterdam; or any time Sat/Sun).
   - **OR** between cron ticks during business hours — wait until just after the dispatcher fires (`HH:00`, `HH:05`, `HH:10`, etc.) and you have ~4 minutes of low risk.

2. **Confirm no in-flight runs** for the four old-id functions in the Inngest dashboard (or via this SQL):
   ```sql
   SELECT 'pipeline_events stage=2 (last 5min)' AS surface,
          COUNT(*) FILTER (WHERE created_at > now() - interval '5 minutes') AS n
   FROM pipeline_events
   WHERE stage = 2 AND swarm_type = 'debtor-email'
   UNION ALL
   SELECT 'automation_runs in-flight',
          COUNT(*)
   FROM automation_runs
   WHERE status IN ('running', 'queued', 'in_progress');
   ```
   Both rows should show `n = 0` (or very low — the same functions clear naturally in seconds).

3. **CI checks green** on the v8.1 → main PR (typecheck, lint, build, test, codegen drift).

If any of the above fails, abort and pick a different window.

---

## Merge + deploy (T-0)

1. Merge the PR. Squash strategy preserves a single commit on `main`.
2. Vercel auto-deploys; takes ~3 min.
3. Inngest re-syncs the function registry on the next request to `/api/inngest`. The new function ids will appear within ~60 seconds of the deploy completing.
4. **🚨 RUN THE REGISTRY UPDATES IMMEDIATELY POST-DEPLOY** — see next section. Skipping this step silently drops every "unknown" debtor email through the floor until you notice.

---

## Registry updates (T-0 + 30s) — MANDATORY

Stage 1 reads `swarm_noise_categories.swarm_dispatch` to know which event to fire. The Stage 2 customer-resolver dispatches side-effects from `swarms.side_effects`. Both reference legacy event names by string and must be updated atomically with the function rename. Without this step, Stage 1 → Stage 2 routing breaks silently.

**Lesson learned 2026-05-22:** the original Phase 88.1 cutover skipped this step. Between deploy at 03:44 UTC and the fix at ~04:50 UTC, one production email (Factuurportal rejection to debiteuren@smeba-fire.be) reached Stage 1 = "unknown" and then sat in limbo — Stage 1 fired the legacy event name; no listener existed under the new function id. automation_run row reads `status='completed'` but no `pipeline_events stage=2` was written.

Run these as part of cutover:

```sql
-- 1. Stage 1 → Stage 2 dispatch (unknown bucket)
UPDATE swarm_noise_categories
SET swarm_dispatch = 'debtor-email/stage-2.customer-resolve.requested'
WHERE swarm_type = 'debtor-email'
  AND category_key = 'unknown'
  AND swarm_dispatch = 'debtor-email/label-resolve.requested';

-- 2. Stage 2 → tagger side-effect dispatch
UPDATE swarms
SET side_effects = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'event' = 'debtor-email/icontroller-tag.requested'
        THEN jsonb_set(elem, '{event}', '"debtor-email/stage-2.icontroller-label.requested"')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(side_effects) AS elem
)
WHERE swarm_type = 'debtor-email'
  AND side_effects::text LIKE '%debtor-email/icontroller-tag.requested%';

-- 3. Verification sweep — all three rows MUST return zero
SELECT 'swarm_noise_categories', COUNT(*) FROM swarm_noise_categories
WHERE swarm_dispatch IN ('debtor-email/label-resolve.requested','debtor-email/icontroller-tag.requested','icontroller/cleanup.shard.requested')
UNION ALL
SELECT 'swarm_intents.handler_event', COUNT(*) FROM swarm_intents
WHERE handler_event IN ('debtor-email/label-resolve.requested','debtor-email/icontroller-tag.requested','icontroller/cleanup.shard.requested')
UNION ALL
SELECT 'swarms.side_effects', COUNT(*) FROM swarms
WHERE side_effects::text ~ 'debtor-email/label-resolve|debtor-email/icontroller-tag|icontroller/cleanup\.shard';
```

If any row returns non-zero, the cutover is incomplete.

**Recovering stuck emails between deploy and registry fix:**
Any email with Stage 0 + Stage 1 emitted but no Stage 2 emit during the broken window is recoverable. From the Inngest dashboard → Functions → `stage-2-customer-resolver` → Send Event:

```json
{
  "name": "debtor-email/stage-2.customer-resolve.requested",
  "data": {
    "automation_run_id": "<reuse the existing automation_runs.id for that email>",
    "swarm_type": "debtor-email",
    "category_key": "unknown",
    "message_id": "<email_pipeline.emails.internet_message_id or similar>",
    "source_mailbox": "<email_pipeline.emails.mailbox>"
  }
}
```

Find stuck emails:
```sql
WITH stage_emits AS (
  SELECT email_id, array_agg(stage ORDER BY stage) AS stages
  FROM pipeline_events
  WHERE swarm_type = 'debtor-email'
    AND created_at BETWEEN '<deploy_timestamp>'::timestamptz AND '<registry_fix_timestamp>'::timestamptz
  GROUP BY email_id
)
SELECT email_id, stages
FROM stage_emits
WHERE stages = ARRAY[0,1]::smallint[];  -- got past Stage 1 but not Stage 2
```

---

## Post-merge smoke (T+5 min)

Send one synthetic event per new event name. Use a payload that the function will validate-then-reject early so no real production side effects fire (e.g. a non-existent automation_run_id).

**Easiest path — Inngest dashboard "Send Event"** (no local prod key needed):

1. Open https://app.inngest.com/env/production/functions
2. Find each new function id (`stage-2-customer-resolver`, `stage-2-icontroller-label-applier`, `stage-1-icontroller-noise-cleanup`)
3. Click "Send Event" on each function — paste the corresponding payload from the JSON blocks below
4. Confirm a run appears in the function's run history within ~5 seconds

**Alternative — TypeScript script** (requires the production `INNGEST_EVENT_KEY` available locally — pull from Vercel env if needed):

```ts
// from web/ root, in a Node REPL or one-off script
import { inngest } from "@/lib/inngest/client";

// Stage 2 customer-resolver smoke
await inngest.send({
  name: "debtor-email/stage-2.customer-resolve.requested",
  data: {
    automation_run_id: "00000000-0000-0000-0000-000000000000",
    swarm_type: "debtor-email",
    category_key: "unknown",
    message_id: "smoke-test-msg",
    source_mailbox: "debiteuren@smeba.nl",
  },
});

// Stage 2 icontroller-label-applier smoke
await inngest.send({
  name: "debtor-email/stage-2.icontroller-label.requested",
  data: {
    email_label_id: "00000000-0000-0000-0000-000000000000",
    email_id: "00000000-0000-0000-0000-000000000000",
    automation_run_id: "00000000-0000-0000-0000-000000000000",
    customer_account_id: "smoke",
    customer_name: null,
    source_mailbox: "debiteuren@smeba.nl",
    icontroller_mailbox_id: 0,
    icontroller_company: null,
    icontroller_message_url: "https://example.invalid/",
    entity: null,
    sender_email: "smoke@example.invalid",
    subject: "Phase 88.1 smoke",
    received_at: new Date().toISOString(),
  },
});

// Stage 1 noise-cleanup worker smoke
await inngest.send({
  name: "debtor-email/stage-1.icontroller-cleanup.requested",
  data: {
    workerIndex: 0,
    rows: [],
  },
});
```

For each: confirm in the Inngest dashboard that a run appears under the **new** function id within ~5 seconds.

The cleanup-dispatcher is cron-only — no smoke event. It fires on its own cron tick within 5 minutes during business hours; observe a tick in the dashboard.

---

## 1h verification (T+60 min)

Real production traffic should have exercised the renamed functions in the meantime. Confirm:

```sql
-- Stage 2 telemetry continues (verifies stage-2-customer-resolver still emits)
SELECT stage, swarm_type, COUNT(*) AS n, MAX(created_at) AS last_seen
FROM pipeline_events
WHERE created_at > now() - interval '1 hour'
  AND swarm_type = 'debtor-email'
GROUP BY stage, swarm_type
ORDER BY stage;
```

Expected: stage=2 row exists with `n > 0` (assuming there was inbound traffic on debtor mailboxes in the last hour during business hours). If `n = 0` and there IS inbound traffic but no stage=2 events, that's a real failure — check Inngest dashboard for failed runs under the new function id.

---

## Rollback

The function-id rename is a code-only change. Rollback = revert the merge on `main` → Vercel redeploys with old ids → Inngest re-registers the legacy function ids.

Caveats:
- Any events fired under the **new** event names while the rename was live will sit in the Inngest queue unrouted after rollback (until the new function id is gone, Inngest will still try; once removed, they'll fail). Production traffic during the post-merge window WILL fire new event names — so a rollback within minutes of merge is safe (queue mostly empty); a rollback hours later requires manual re-dispatch of unrouted events.

If a rollback proves necessary, document the timestamp + reason here and open a follow-up issue.

---

## Historical lookups

When debugging "what did `stage-2-customer-resolver` do before $cutover_timestamp?", search the Inngest dashboard for the **legacy** function id from the mapping table above. Same row-by-row run data, different id namespace.

To find pre-rename agent_runs / pipeline_events / coordinator_runs rows attributable to the renamed functions, look at the `created_at` filter — anything `< cutover_timestamp` was the legacy function; anything `>=` is the new one.
