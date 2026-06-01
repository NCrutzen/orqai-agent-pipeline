// Pipeline health weekly digest — Monday 06:00 Amsterdam.
//
// Reads the trailing 7 days of public.pipeline_health_snapshots (written every
// 2h by pipeline-health-monitor.ts) and emails a per-swarm trend summary via
// the Zapier Catch Hook (PIPELINE_HEALTH_WEBHOOK_URL).
//
// Because it summarises the rolling window rather than a cumulative log, issues
// that were resolved earlier in the week naturally fall out of the "current"
// view — you get the trend, not a re-litigation of already-fixed problems.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { postHealthWebhook, NOTIFY_TO } from "@/lib/inngest/health-webhook";

type Status = "ok" | "warning" | "error";

interface SnapshotRow {
  checked_at: string;
  swarm_type: string;
  queue_depth: number;
  failures_6h: number;
  throughput_6h: number;
  status: Status;
  notes: string | null;
}

export const pipelineHealthWeeklyDigest = inngest.createFunction(
  {
    id: "pipeline-health-weekly-digest",
    name: "Pipeline health weekly digest (Mon 06:00)",
    retries: 2,
    concurrency: { limit: 1 },
  },
  { cron: "TZ=Europe/Amsterdam 0 6 * * 1" },
  async ({ step }) => {
    const digest = await step.run("build-digest", async () => {
      const admin = createAdminClient();
      const now = new Date();
      const since = new Date(now.getTime() - 7 * 86_400_000);
      const sinceIso = since.toISOString();
      const midpoint = now.getTime() - 3.5 * 86_400_000;

      const { data, error } = await admin
        .from("pipeline_health_snapshots")
        .select(
          "checked_at, swarm_type, queue_depth, failures_6h, throughput_6h, status, notes",
        )
        .eq("mode", "live")
        .gte("checked_at", sinceIso)
        .order("checked_at", { ascending: true });
      if (error) {
        throw new Error(`Failed to read snapshots: ${error.message}`);
      }

      const rows = (data ?? []) as SnapshotRow[];
      const bySwarm = new Map<string, SnapshotRow[]>();
      for (const r of rows) {
        const list = bySwarm.get(r.swarm_type) ?? [];
        list.push(r);
        bySwarm.set(r.swarm_type, list);
      }

      const sections: string[] = [];
      let worstStatus: Status = "ok";

      for (const [swarm, list] of [...bySwarm.entries()].sort()) {
        const ticks = list.length;
        const errorTicks = list.filter((r) => r.status === "error").length;
        const warnTicks = list.filter((r) => r.status === "warning").length;
        const maxQueue = Math.max(...list.map((r) => r.queue_depth));
        const totalFailures = list.reduce((s, r) => s + r.failures_6h, 0);
        const latest = list[list.length - 1];
        if (latest.status === "error") worstStatus = "error";
        else if (latest.status === "warning" && worstStatus === "ok")
          worstStatus = "warning";

        // trend: error+warning ticks first half vs second half of the week
        const firstHalf = list.filter(
          (r) => Date.parse(r.checked_at) < midpoint,
        );
        const secondHalf = list.filter(
          (r) => Date.parse(r.checked_at) >= midpoint,
        );
        const badRate = (l: SnapshotRow[]) =>
          l.length === 0
            ? 0
            : l.filter((r) => r.status !== "ok").length / l.length;
        const d = badRate(secondHalf) - badRate(firstHalf);
        const trend =
          Math.abs(d) < 0.1 ? "stable" : d < 0 ? "improving ↓" : "worsening ↑";

        sections.push(
          `${swarm} — now ${latest.status.toUpperCase()} (trend: ${trend})\n` +
            `  ${errorTicks} error / ${warnTicks} warning of ${ticks} checks · ` +
            `${totalFailures} failed runs · peak pending ${maxQueue}\n` +
            `  latest: ${latest.notes ?? "—"}`,
        );
      }

      const message =
        `Pipeline health — weekly digest (${since.toISOString().slice(0, 10)} → ` +
        `${now.toISOString().slice(0, 10)})\n` +
        `Overall: ${worstStatus.toUpperCase()} · ${rows.length} snapshots across ${bySwarm.size} swarms\n\n` +
        (sections.length > 0
          ? sections.join("\n\n")
          : "No snapshots recorded this week — is pipeline-health-monitor running?") +
        `\n\nImmediate alerts fire separately, only on transition into error.`;

      return { message, severity: worstStatus, snapshotCount: rows.length };
    });

    const result = await step.run("post-digest-webhook", async () =>
      postHealthWebhook({
        event: "pipeline-health-weekly",
        message: digest.message,
        severity: digest.severity === "ok" ? "info" : digest.severity,
        notify_to: NOTIFY_TO,
        fired_at: new Date().toISOString(),
        test_mode: false,
      }),
    );

    return { ...digest, webhook: result };
  },
);
