# Inngest Function Rename — Phase 88.1

**Cutover:** _to be filled in at merge time — record the merge timestamp + Vercel deploy id_
**PR:** _to be filled in_
**Operator:** _to be filled in_

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

---

## Post-merge smoke (T+5 min)

Send one synthetic event per new event name. Use a payload that the function will validate-then-reject early so no real production side effects fire (e.g. a non-existent automation_run_id).

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
