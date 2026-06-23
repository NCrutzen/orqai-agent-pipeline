// Incremental ClickUp → Postgres cache refresh via the ClickUp API (NOT Zapier).
//
// Why a poll instead of per-event Zapier webhooks: forwarding every ClickUp
// change through a Zapier shim burns a Zapier task per change (expensive at
// ~1900 tickets). Instead this cron asks ClickUp directly for only the tasks
// changed since our watermark (`date_updated_gt`) and re-syncs those — zero
// Zapier load, and only genuinely-changed tickets are fetched in full.
//
// Relationship to the webhook path: clickupCacheSync still listens to the
// real-time webhook event (immediate sync when Zapier does fire, e.g. for
// status notifications). This poll is the reliable baseline that keeps the
// whole cache fresh without depending on how broadly the Zapier shim is wired.
//
// Watermark = max(date_updated) across the cache, minus an overlap buffer so a
// task updated right at the boundary (or during a cron gap, e.g. over a
// weekend) is not missed. Re-syncing a task is idempotent (upsert).
//
// CLAUDE.md guards: business-hours TZ cron; cron string lives in createFunction
// (never in a /** */ block — the slash-star would close the comment); all side
// effects inside one step.run; now() computed inside step.run (replay-safe).
// NOTE: deletions are NOT detected by an incremental poll (a deleted task
// simply stops appearing) — those still come through the taskDeleted webhook,
// or a periodic full reconcile (see check:ticket-cache).

import { inngest } from "@/lib/inngest/client";
import { fetchAllTaskIds } from "@/lib/automations/support-tickets/clickup-read-client";
import { getMaxDateUpdated } from "@/lib/automations/support-tickets/ticket-cache";
import { runCacheSync } from "@/lib/automations/support-tickets/clickup-cache-sync";

const OVERLAP_BUFFER_MS = 60 * 60 * 1000; // 1h re-fetch overlap (idempotent)
const INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000; // when the cache is empty

export interface CachePollResult {
  ok: true;
  since: string; // ISO of the watermark used
  changed: number;
  synced: number;
  failed: number;
}

/** Resolve the `date_updated_gt` watermark (ms) from the cache's newest row. */
async function resolveSinceMs(nowMs: number): Promise<number> {
  const maxIso = await getMaxDateUpdated();
  if (!maxIso) return nowMs - INITIAL_LOOKBACK_MS;
  const maxMs = new Date(maxIso).getTime();
  if (!Number.isFinite(maxMs)) return nowMs - INITIAL_LOOKBACK_MS;
  return maxMs - OVERLAP_BUFFER_MS;
}

/**
 * Pure runner: fetch the tasks changed since the watermark and re-sync each
 * into the cache. Throws on a ClickUp enumeration error so Inngest retries;
 * per-task failures are counted but don't abort the batch.
 */
export async function runCachePoll(nowMs: number): Promise<CachePollResult> {
  const sinceMs = await resolveSinceMs(nowMs);

  const result = await fetchAllTaskIds({ updatedSince: sinceMs });
  if ("error" in result) {
    throw new Error(`cache-poll enumerate failed: ${result.error}`);
  }

  const received_at = new Date(nowMs).toISOString();
  let synced = 0;
  let failed = 0;
  for (const id of result.ids) {
    try {
      await runCacheSync({
        clickup_task_id: id,
        event_type: "cache-poll",
        history_items: [],
        received_at,
      });
      synced++;
    } catch {
      failed++;
    }
  }

  return {
    ok: true,
    since: new Date(sinceMs).toISOString(),
    changed: result.ids.length,
    synced,
    failed,
  };
}

/**
 * Inngest cron. Function-id LOCKED: "support-tickets-clickup-cache-poll".
 * Runs every 10 minutes during business hours (Amsterdam, Mon–Fri); the
 * watermark catches anything updated during off-hours/weekend gaps on the next
 * tick. retries: 2.
 */
export const clickupCachePoll = inngest.createFunction(
  { id: "support-tickets-clickup-cache-poll", retries: 2 },
  { cron: "TZ=Europe/Amsterdam */10 6-19 * * 1-5" },
  async ({ step }) => {
    // now() inside step.run for replay safety (Phase 65 leer dd2583a).
    return await step.run("poll-clickup-updates", async () =>
      runCachePoll(new Date().getTime()),
    );
  },
);
