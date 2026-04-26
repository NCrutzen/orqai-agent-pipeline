import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * iController-cleanup DISPATCHER. Fires on cron, fetches up to
 * PARALLELISM × BATCH_SIZE_PER_WORKER pending rows, warms up the parallel
 * session-keys, and emits one `icontroller/cleanup.shard.requested`
 * event per shard. Each event becomes its own Inngest run → its own
 * Vercel invocation with a full 300s budget → its own Browserless
 * session. That way one shard crashing doesn't block the others.
 *
 * Phase 58 (cost optimization): cron is windowed to business hours —
 * every 5 min, 06:00–19:55 Europe/Amsterdam, Mon–Fri. Emails arriving
 * outside the window queue in `automation_runs(stage='pending')` and
 * are picked up at the next business-day 06:00 tick.
 *
 * Set `ICONTROLLER_PARALLELISM=3` in Vercel env to enable fan-out.
 * Default 1 = sequential single-worker mode (identical to pre-refactor).
 */

const PARALLELISM = Math.max(
  1,
  Math.min(10, parseInt(process.env.ICONTROLLER_PARALLELISM || "1", 10)),
);
const BATCH_SIZE_PER_WORKER = 5;

interface PendingResult {
  stage: string;
  message_id: string;
  from: string;
  subject: string;
  received_at: string;
  icontroller?: string;
}

interface PendingRow {
  id: string;
  result: PendingResult;
}

export const cleanupIControllerDispatch = inngest.createFunction(
  {
    id: "automations/debtor-email-icontroller-dispatch",
    retries: 1,
    concurrency: { limit: 1 },
  },
  { cron: "TZ=Europe/Amsterdam */5 6-19 * * 1-5" },
  async ({ step }) => {
    const admin = createAdminClient();
    const totalNeeded = PARALLELISM * BATCH_SIZE_PER_WORKER;

    const pending = await step.run("load-pending", async () => {
      const { data, error } = await admin
        .from("automation_runs")
        .select("id, result")
        .eq("automation", "debtor-email-review")
        .in("status", ["deferred", "pending"])
        .eq("result->>stage", "icontroller_delete")
        .eq("result->>icontroller", "pending")
        .order("completed_at", { ascending: true })
        .limit(totalNeeded);
      if (error) throw new Error(`load-pending: ${error.message}`);
      return (data ?? []) as PendingRow[];
    });

    if (pending.length === 0) {
      return { dispatched: 0, workers: 0, parallelism: PARALLELISM };
    }

    // Dedupe on message_id — upstream can occasionally insert dupes.
    const seen = new Set<string>();
    const todo = pending.filter((p) => {
      const id = p.result.message_id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // Round-robin partition — each shard gets roughly todo.length/N items.
    // No pre-warmup: each worker logs in independently against its own
    // session-key (openIControllerSession reads `_N` from Supabase and
    // runs loginIfNeeded if cookies are stale). An earlier warmup step
    // that opened a session in the dispatcher caused 5-min timeouts when
    // Browserless connects hung. 3 parallel logins are acceptable — it's
    // the same load as the old cron already made per item.
    const shards: PendingRow[][] = Array.from({ length: PARALLELISM }, () => []);
    todo.forEach((row, idx) => shards[idx % PARALLELISM].push(row));

    const events = shards
      .map((rows, workerIndex) => ({
        name: "icontroller/cleanup.shard.requested" as const,
        data: { workerIndex, rows },
      }))
      .filter((e) => e.data.rows.length > 0);

    await step.sendEvent("dispatch-shards", events);

    return {
      dispatched: todo.length,
      workers: events.length,
      parallelism: PARALLELISM,
    };
  },
);
