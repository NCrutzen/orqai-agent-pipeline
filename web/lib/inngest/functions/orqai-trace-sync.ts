import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { callOrqaiMcp } from "@/lib/orqai/mcp";
import {
  ListSpansResponseSchema,
  ListTracesResponseSchema,
  type TraceItem,
} from "@/lib/orqai/trace-mapper.schema";
import {
  maxEndTime,
  spansToAgentEvents,
  type AgentEventInsert,
} from "@/lib/orqai/trace-mapper";

/**
 * Inngest cron function that pulls trace/span data from Orq.ai every two
 * minutes and maps each span to agent_events rows in Supabase.
 *
 * Architecture:
 *   1. Load all swarms (projects) with a non-null orqai_project_id.
 *   2. Load per-swarm sync watermarks in one round-trip.
 *   3. For each swarm, fetch new traces since the watermark (bounded by a
 *      15-minute lookback window and a hard cap of 200 traces per run),
 *      fetch spans per trace, map to agent_events, and upsert with
 *      ON CONFLICT DO NOTHING on the partial unique (span_id, event_type)
 *      index.
 *   4. Update the watermark to the newest trace end_time so the next tick
 *      only fetches new data.
 *
 * Side-effects live inside step.run() so Inngest replay memoizes them
 * correctly. Per-swarm failures are isolated so a broken mapping in swarm
 * A does not block swarm B.
 *
 * Idempotency: the partial unique index on agent_events(span_id, event_type)
 * makes re-processing a trace a no-op at the DB level. The watermark is
 * the fast-path filter; the index is the safety net.
 */

const LOOKBACK_WINDOW_MINUTES = 15;
const TRACES_PER_PAGE = 50;
const MAX_PAGES_PER_RUN = 4; // 4 x 50 = 200 traces/swarm/tick ceiling
const MAX_SPANS_PER_TRACE = 50;

interface MappedSwarm {
  id: string;
  orqai_project_id: string;
}

interface SyncStateRow {
  swarm_id: string;
  last_end_time: string | null;
  last_cursor: string | null;
}

interface SwarmSyncResult {
  swarm_id: string;
  inserted: number;
  error?: string;
}

export const syncOrqaiTraces = inngest.createFunction(
  {
    id: "analytics/orqai-trace-sync",
    retries: 3,
    onFailure: async ({ error, step }) => {
      await step.run("record-failure", async () => {
        const admin = createAdminClient();
        await admin.from("settings").upsert(
          {
            key: "orqai_trace_sync_last_error",
            value: {
              error: error.message,
              timestamp: new Date().toISOString(),
            },
          },
          { onConflict: "key" }
        );
      });
    },
  },
  { cron: "*/2 * * * *" }, // Every 2 minutes
  async ({ step }) => {
    // Step 1: swarms with an Orq.ai project mapping
    const swarms = await step.run("load-mapped-swarms", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("projects")
        .select("id, orqai_project_id")
        .not("orqai_project_id", "is", null);
      if (error) throw new Error(`Failed to load swarms: ${error.message}`);
      return (data ?? []) as MappedSwarm[];
    });

    if (swarms.length === 0) {
      return {
        swarmsSynced: 0,
        eventsInserted: 0,
        reason: "no-mapped-swarms",
      };
    }

    // Step 2: watermarks for every mapped swarm (single round-trip)
    const watermarks = await step.run("load-watermarks", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("orqai_sync_state")
        .select("swarm_id, last_end_time, last_cursor");
      if (error) throw new Error(`Failed to load watermarks: ${error.message}`);
      const map: Record<string, SyncStateRow> = {};
      for (const row of (data ?? []) as SyncStateRow[]) {
        map[row.swarm_id] = row;
      }
      return map;
    });

    // Step 3: per-swarm sync isolated in its own step (granular retry + idempotency)
    const results: SwarmSyncResult[] = [];
    let totalInserted = 0;

    for (const swarm of swarms) {
      const result = await step.run(
        `sync-swarm-${swarm.id}`,
        async (): Promise<SwarmSyncResult> => {
          try {
            const inserted = await syncSwarm(
              swarm,
              watermarks[swarm.id] ?? null
            );
            return { swarm_id: swarm.id, inserted };
          } catch (err) {
            const message =
              err instanceof Error ? err.message : String(err);
            const admin = createAdminClient();
            await admin.from("orqai_sync_state").upsert(
              {
                swarm_id: swarm.id,
                last_error: message,
                last_synced_at: new Date().toISOString(),
              },
              { onConflict: "swarm_id" }
            );
            return { swarm_id: swarm.id, inserted: 0, error: message };
          }
        }
      );
      results.push(result);
      totalInserted += result.inserted;
    }

    return {
      swarmsSynced: swarms.length,
      eventsInserted: totalInserted,
      results,
    };
  }
);

async function syncSwarm(
  swarm: MappedSwarm,
  watermark: SyncStateRow | null
): Promise<number> {
  const admin = createAdminClient();

  const now = new Date();
  const lookbackBoundary = new Date(
    now.getTime() - LOOKBACK_WINDOW_MINUTES * 60_000
  ).toISOString();
  const startTimeAfter =
    watermark?.last_end_time && watermark.last_end_time > lookbackBoundary
      ? watermark.last_end_time
      : lookbackBoundary;

  // Paginated fetch of traces since the watermark
  const collectedTraces: TraceItem[] = [];
  let cursor: string | null | undefined;
  for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    const raw = await callOrqaiMcp("list_traces", {
      project_id: swarm.orqai_project_id,
      start_time_after: startTimeAfter,
      limit: TRACES_PER_PAGE,
      ...(cursor ? { cursor } : {}),
    });
    const parsed = ListTracesResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `list_traces schema mismatch: ${parsed.error.message}`
      );
    }
    collectedTraces.push(...parsed.data.items);
    if (!parsed.data.has_more || !parsed.data.next_cursor) break;
    cursor = parsed.data.next_cursor;
  }

  if (collectedTraces.length === 0) {
    await admin.from("orqai_sync_state").upsert(
      {
        swarm_id: swarm.id,
        last_synced_at: new Date().toISOString(),
        last_error: null,
        last_inserted_count: 0,
      },
      { onConflict: "swarm_id" }
    );
    return 0;
  }

  // Per-trace: fetch spans -> map -> upsert
  let insertedThisSwarm = 0;
  for (const trace of collectedTraces) {
    let rawSpans: unknown;
    try {
      rawSpans = await callOrqaiMcp("list_spans", {
        trace_id: trace.trace_id,
        limit: MAX_SPANS_PER_TRACE,
      });
    } catch (err) {
      console.warn(
        `[orqai-trace-sync] list_spans failed for trace ${trace.trace_id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      continue;
    }

    const parsed = ListSpansResponseSchema.safeParse(rawSpans);
    if (!parsed.success) {
      console.warn(
        `[orqai-trace-sync] list_spans parse failed for trace ${trace.trace_id}: ${parsed.error.message}`
      );
      continue;
    }

    const events: AgentEventInsert[] = spansToAgentEvents(
      parsed.data.items,
      swarm.id,
      trace
    );
    if (events.length === 0) continue;

    const { error, count } = await admin
      .from("agent_events")
      .upsert(events, {
        onConflict: "span_id,event_type",
        ignoreDuplicates: true,
        count: "exact",
      });

    if (error) {
      console.warn(
        `[orqai-trace-sync] insert failed for trace ${trace.trace_id}: ${error.message}`
      );
      continue;
    }
    insertedThisSwarm += count ?? 0;
  }

  // Advance watermark to the newest end_time we observed
  const newWatermark = maxEndTime(collectedTraces);
  await admin.from("orqai_sync_state").upsert(
    {
      swarm_id: swarm.id,
      last_end_time: newWatermark ?? watermark?.last_end_time ?? null,
      last_synced_at: new Date().toISOString(),
      last_error: null,
      last_inserted_count: insertedThisSwarm,
    },
    { onConflict: "swarm_id" }
  );

  return insertedThisSwarm;
}
