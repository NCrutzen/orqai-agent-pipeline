// ClickUp → Postgres cache sync (read-cache for the "Mijn tickets" pages).
//
// Listens to the SAME event the outbound notifier uses
// ("support-tickets/clickup-status.received", emitted by the clickup-webhook
// route AND by the cache-backfill route). On each event it re-fetches the full
// task from ClickUp and mirrors it into support_tickets_cache /
// support_ticket_comments, so the pages never call ClickUp live.
//
// Two functions fan out from one event — this is intentional and independent of
// clickupOutbound (notifications): Inngest delivers the event to every function
// whose trigger matches.
//
// CLAUDE.md guards observed:
//   - Function-id LOCKED: "support-tickets-clickup-cache-sync" — NEVER rename
//     (in-flight runs would orphan). retries: 3.
//   - All side effects inside ONE step.run boundary (replay safety).
//   - now() is computed inside the cache-layer writes (new Date()), i.e. inside
//     the step.run callback, so timestamps are deterministic per attempt.
//   - NO direct OpenAI/Anthropic SDK; ClickUp access only via the read client.

import { inngest } from "@/lib/inngest/client";
import {
  fetchTaskForSync,
  fetchCommentsForSync,
} from "@/lib/automations/support-tickets/clickup-read-client";
import {
  upsertCachedTicket,
  replaceCachedComments,
  deleteCachedTicket,
  deleteCachedSolutions,
} from "@/lib/automations/support-tickets/ticket-cache";

export interface CacheSyncEvent {
  clickup_task_id: string;
  event_type: string;
  history_items: Array<Record<string, unknown>>;
  received_at: string;
}

export type CacheSyncDecision =
  | "deleted"
  | "removed_not_found"
  | "synced";

export interface CacheSyncResult {
  ok: true;
  decision: CacheSyncDecision;
  group?: "open" | "rejected" | "resolved";
}

/**
 * Pure runner. Re-fetches the task and mirrors it into the cache tables.
 * Throws on a transient ClickUp/DB error so Inngest retries (at-least-once is
 * desirable — a missed sync would leave the cache stale).
 */
export async function runCacheSync(event: CacheSyncEvent): Promise<CacheSyncResult> {
  const id = event.clickup_task_id;

  // ClickUp "taskDeleted" → drop from cache (FK cascade clears comments/solutions).
  if (event.event_type.toLowerCase().includes("delete")) {
    await deleteCachedTicket(id);
    return { ok: true, decision: "deleted" };
  }

  const synced = await fetchTaskForSync(id);
  if ("error" in synced) {
    throw new Error(`cache-sync fetch failed for ${id}: ${synced.error}`);
  }
  if ("notFound" in synced) {
    // Task gone or no longer visible to our token → treat as removal.
    await deleteCachedTicket(id);
    return { ok: true, decision: "removed_not_found" };
  }

  const record = synced.record;
  await upsertCachedTicket(record);
  await replaceCachedComments(id, await fetchCommentsForSync(id));
  // NB: translations are NOT generated here. With ~1900 tickets on the Support
  // list, pre-translating every ticket × 3 locales would be thousands of mostly
  // never-viewed Orq calls. Instead the pages translate read-through on view
  // (see getCachedTicketsByEmails / getOrTranslate) and cache the result.

  // When a ticket is NOT resolved, drop any cached solution. This covers the
  // resolved → active transition (user requirement) and is idempotent for
  // tickets that were never resolved. A resolved ticket keeps its solution;
  // the detail page regenerates it read-through if the source content changed.
  if (record.ticket_group !== "resolved") {
    await deleteCachedSolutions(id);
  }

  return { ok: true, decision: "synced", group: record.ticket_group };
}

/**
 * Inngest function. Function-id LOCKED: "support-tickets-clickup-cache-sync".
 * NEVER rename — in-flight runs would orphan on rename. retries: 3.
 */
export const clickupCacheSync = inngest.createFunction(
  { id: "support-tickets-clickup-cache-sync", retries: 3 },
  { event: "support-tickets/clickup-status.received" },
  async ({ event, step }) => {
    return await step.run("sync-ticket-cache", async () =>
      runCacheSync(event.data as CacheSyncEvent),
    );
  },
);
