import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateBriefing } from "@/lib/v7/briefing/generate";

/**
 * Inngest cron that forces a fresh briefing for every swarm with registered
 * agents, every 30 minutes. The 5-minute cache TTL on swarm_briefings covers
 * on-demand regeneration; this cron is the outer heartbeat that guarantees
 * briefings don't go stale when nobody's in the UI.
 *
 * Per-swarm failures are isolated in their own step.run so a broken swarm
 * never blocks others. Failures are logged inside generateBriefing itself.
 */

interface SwarmRow {
  swarm_id: string;
}

interface RefreshResult {
  swarm_id: string;
  ok: boolean;
  reason?: string;
}

export const refreshBriefings = inngest.createFunction(
  {
    id: "analytics/briefing-refresh",
    retries: 3,
    onFailure: async ({ error, step }) => {
      await step.run("record-failure", async () => {
        const admin = createAdminClient();
        await admin.from("settings").upsert(
          {
            key: "orqai_briefing_refresh_last_error",
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
  // Schedule disabled — was { cron: "*/30 * * * *" } (every 30 min). Now manual-only:
  // trigger via the "analytics/briefing-refresh.run" event. Re-enable = restore the cron line.
  { event: "analytics/briefing-refresh.run" },
  async ({ step }) => {
    const swarms = await step.run("list-swarms-with-agents", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("swarm_agents")
        .select("swarm_id");
      if (error)
        throw new Error(`Failed to list swarm_agents: ${error.message}`);
      const unique = new Set<string>();
      for (const row of (data ?? []) as SwarmRow[]) {
        unique.add(row.swarm_id);
      }
      return Array.from(unique);
    });

    if (swarms.length === 0) {
      return {
        swarmsRefreshed: 0,
        reason: "no-swarms-with-agents",
      };
    }

    const results: RefreshResult[] = [];
    for (const swarmId of swarms) {
      const result = await step.run(
        `refresh-${swarmId}`,
        async (): Promise<RefreshResult> => {
          const r = await generateBriefing(swarmId, { force: true });
          return { swarm_id: swarmId, ok: r.ok, reason: r.reason };
        }
      );
      results.push(result);
    }

    return {
      swarmsRefreshed: swarms.length,
      results,
    };
  }
);
