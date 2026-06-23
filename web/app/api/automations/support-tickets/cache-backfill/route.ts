// POST /api/automations/support-tickets/cache-backfill
//
// One-time / reconciliation backfill for the ClickUp ticket read-cache. Webhooks
// only cover FUTURE changes, so after the cache tables ship (migration
// 20260617_support_tickets_cache.sql) this route seeds them with the existing
// tickets — and can be re-run any time to reconcile drift from missed webhooks.
//
// It does NOT write the cache directly. It enumerates every task id on the
// Support list and fans out the SAME Inngest event the live webhook uses
// ("support-tickets/clickup-status.received"), so the clickup-cache-sync
// function does the actual fetch + upsert (one durable, retryable path).
//
// Auth: shared secret via `x-webhook-secret` header (AUTOMATION_WEBHOOK_SECRET),
//   matching the team's internal-ops convention (see api/klachten/ingest).
//
// inngest.send binding-safety: NEVER destructure inngest.send (CLAUDE.md commit
//   dae6276). Use the inline SendFn cast.

import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { fetchAllTaskIds } from "@/lib/automations/support-tickets/clickup-read-client";
import { runCacheSync } from "@/lib/automations/support-tickets/clickup-cache-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type InngestEvent = { name: string; data: Record<string, unknown> };
type SendFn = (p: InngestEvent | InngestEvent[]) => Promise<unknown>;

const BATCH_SIZE = 500;

export async function POST(req: Request) {
  const expected = process.env.AUTOMATION_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (req.headers.get("x-webhook-secret") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await fetchAllTaskIds();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const { ids } = result;
  const received_at = new Date().toISOString();

  // mode=sync: populate the cache inline via the real sync logic, no Inngest.
  // Intended for local testing / environments without an Inngest worker (and as
  // a small-list reconcile). Sequential to respect ClickUp/Orq rate limits;
  // beware maxDuration for large lists — prefer the default fan-out in prod.
  if (new URL(req.url).searchParams.get("mode") === "sync") {
    let synced = 0;
    const failed: Array<{ id: string; error: string }> = [];
    for (const id of ids) {
      try {
        await runCacheSync({
          clickup_task_id: id,
          event_type: "cache-backfill",
          history_items: [],
          received_at,
        });
        synced++;
      } catch (err) {
        failed.push({ id, error: String(err) });
      }
    }
    return NextResponse.json({ ok: true, mode: "sync", total: ids.length, synced, failed });
  }

  const events: InngestEvent[] = ids.map((clickup_task_id) => ({
    name: "support-tickets/clickup-status.received",
    data: {
      clickup_task_id,
      event_type: "cache-backfill",
      history_items: [],
      received_at,
    },
  }));

  try {
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      await (inngest.send as unknown as SendFn)(events.slice(i, i + BATCH_SIZE));
    }
  } catch (err) {
    return NextResponse.json(
      { error: `inngest.send failed: ${String(err)}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, dispatched: events.length });
}
