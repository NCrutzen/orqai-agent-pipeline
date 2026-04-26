import { inngest } from "@/lib/inngest/client";
import { syncSwarmBridge } from "@/lib/automations/swarm-bridge/sync";
import { SWARM_BRIDGE_CONFIGS } from "@/lib/automations/swarm-bridge/configs";

/**
 * Generic swarm-bridge cron. Syncs every registered swarm's
 * automation_runs → swarm_jobs + agent_events on a business-hours window:
 * every 2 minutes, 06:00–19:58 Europe/Amsterdam, Mon–Fri (Phase 58 — cost
 * optimization). Outside the window, sync resumes at the next business-day
 * 06:00 tick. V7 dashboard sync latency: ≤2 min during business hours.
 *
 * Kept under the old id `automations/debtor-email-bridge` to preserve
 * Inngest run history. Despite the name, it now runs ALL bridge configs
 * in `SWARM_BRIDGE_CONFIGS`. Each config is synced in its own step.run
 * so one failing swarm does not block the others on retry.
 */
export const syncDebtorEmailBridgeCron = inngest.createFunction(
  {
    id: "automations/debtor-email-bridge",
    retries: 2,
  },
  { cron: "TZ=Europe/Amsterdam */2 6-19 * * 1-5" },
  async ({ step }) => {
    const results = [];
    for (const config of SWARM_BRIDGE_CONFIGS) {
      const result = await step.run(`sync:${config.swarmId}`, () =>
        syncSwarmBridge(config),
      );
      results.push(result);
    }
    return { bridges: results };
  },
);
