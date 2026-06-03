// Pipeline health monitor — every 2 hours during business hours.
//
// This is the "brain" behind the pipeline_health_snapshots table. Each tick it:
//   1. Probes per-swarm health over a trailing 6h window (throughput, failures,
//      pending queue depth, heartbeat age) from public.automation_runs.
//   2. Derives an ok / warning / error status per swarm using fixed thresholds.
//   3. Writes one snapshot row per swarm into public.pipeline_health_snapshots.
//   4. Compares each new status against the PREVIOUS snapshot (the rolling
//      window). It POSTs an immediate alert email ONLY on a transition INTO
//      error (prev != error). An already-known, ongoing error does NOT re-mail
//      every 2h — that de-dup is the whole point of the snapshot history, so we
//      stop re-flagging problems that are already on the radar.
//
// The weekly Monday-06:00 digest (pipeline-health-weekly-digest.ts) reads the
// same table for the 7-day trend.
//
// Thresholds are constants below — tune them here. The webhook (Zapier Catch
// Hook → email) is configured via PIPELINE_HEALTH_WEBHOOK_URL; if unset, the
// snapshots are still written and the alert step is a logged no-op.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { postHealthWebhook, NOTIFY_TO } from "@/lib/inngest/health-webhook";

const SWARMS = ["debtor-email", "info-routing", "sales-email"] as const;
const WINDOW_HOURS = 6; // matches the failures_6h / throughput_6h columns

// Deviation thresholds (tune here).
const FAILURE_RATE_ERROR = 0.25;
const FAILURES_ERROR_MIN = 4;
const FAILURE_RATE_WARN = 0.1;
const FAILURES_WARN_MIN = 2;
const QUEUE_ERROR = 50;
const QUEUE_WARN = 20;

type Status = "ok" | "warning" | "error";
const RANK: Record<Status, number> = { ok: 0, warning: 1, error: 2 };
const worse = (a: Status, b: Status): Status => (RANK[a] >= RANK[b] ? a : b);

interface SwarmSnapshot {
  swarm_type: string;
  mode: "live";
  queue_depth: number;
  failures_6h: number;
  throughput_6h: number;
  heartbeat_age_minutes: number | null;
  status: Status;
  notes: string;
}

interface PrevRow {
  status: Status;
  throughput_6h: number;
}

interface AlertItem {
  swarm_type: string;
  status: Status;
  notes: string;
  prev_status: Status | null;
}

export const pipelineHealthMonitor = inngest.createFunction(
  {
    id: "pipeline-health-monitor",
    name: "Pipeline health monitor (every 2h, business hours)",
    retries: 2,
    concurrency: { limit: 1 },
  },
  // 08:00–18:00 Amsterdam, every 2 hours, Mon–Fri.
  { cron: "TZ=Europe/Amsterdam 0 8-18/2 * * 1-5" },
  async ({ step }) => {
    const { snapshots, alerts } = await step.run(
      "probe-and-snapshot",
      async () => {
        const admin = createAdminClient();
        const now = new Date();
        const sinceIso = new Date(
          now.getTime() - WINDOW_HOURS * 3_600_000,
        ).toISOString();

        const snaps: SwarmSnapshot[] = [];
        const alertItems: AlertItem[] = [];

        for (const swarm of SWARMS) {
          // throughput: completed in window
          const { count: throughput } = await admin
            .from("automation_runs")
            .select("id", { count: "exact", head: true })
            .eq("swarm_type", swarm)
            .eq("status", "completed")
            .gte("completed_at", sinceIso);

          // failures: failed in window (failed rows may lack completed_at → use created_at)
          const { count: failures } = await admin
            .from("automation_runs")
            .select("id", { count: "exact", head: true })
            .eq("swarm_type", swarm)
            .eq("status", "failed")
            .gte("created_at", sinceIso);

          // queue depth: currently pending
          const { count: queue } = await admin
            .from("automation_runs")
            .select("id", { count: "exact", head: true })
            .eq("swarm_type", swarm)
            .eq("status", "pending");

          // heartbeat: minutes since last completed run
          const { data: lastDone } = await admin
            .from("automation_runs")
            .select("completed_at")
            .eq("swarm_type", swarm)
            .eq("status", "completed")
            .order("completed_at", { ascending: false })
            .limit(1);
          const lastCompletedAt = lastDone?.[0]?.completed_at ?? null;
          const heartbeatAge =
            lastCompletedAt == null
              ? null
              : Math.round(
                  (now.getTime() - Date.parse(lastCompletedAt)) / 60_000,
                );

          // previous snapshot (rolling-window reference)
          const { data: prevData } = await admin
            .from("pipeline_health_snapshots")
            .select("status, throughput_6h")
            .eq("swarm_type", swarm)
            .eq("mode", "live")
            .order("checked_at", { ascending: false })
            .limit(1);
          const prev = (prevData?.[0] as PrevRow | undefined) ?? null;

          const tp = throughput ?? 0;
          const fl = failures ?? 0;
          const qd = queue ?? 0;
          const total = tp + fl;
          const failureRate = total > 0 ? fl / total : 0;

          let status: Status = "ok";
          const notes: string[] = [];

          if (fl >= FAILURES_ERROR_MIN && failureRate >= FAILURE_RATE_ERROR) {
            status = worse(status, "error");
            notes.push(
              `failure rate ${Math.round(failureRate * 100)}% (${fl}/${total}) over ${WINDOW_HOURS}h`,
            );
          } else if (
            fl >= FAILURES_WARN_MIN &&
            failureRate >= FAILURE_RATE_WARN
          ) {
            status = worse(status, "warning");
            notes.push(
              `elevated failures ${Math.round(failureRate * 100)}% (${fl}/${total}) over ${WINDOW_HOURS}h`,
            );
          }

          if (qd >= QUEUE_ERROR) {
            status = worse(status, "error");
            notes.push(`pending queue depth ${qd}`);
          } else if (qd >= QUEUE_WARN) {
            status = worse(status, "warning");
            notes.push(`pending queue depth ${qd}`);
          }

          // went-silent: was producing, now zero throughput in the window.
          // Uses the rolling window so low-volume swarms with steady-state 0
          // don't false-alarm — only a drop from >0 to 0 counts.
          if (tp === 0 && (prev?.throughput_6h ?? 0) > 0) {
            status = worse(status, "error");
            notes.push(
              `throughput dropped to 0 (was ${prev?.throughput_6h} last tick)` +
                (heartbeatAge != null
                  ? `, last completed ${heartbeatAge}m ago`
                  : ""),
            );
          }

          if (notes.length === 0) {
            notes.push(
              `ok — ${tp} completed, ${fl} failed, ${qd} pending (${WINDOW_HOURS}h)`,
            );
          }

          const snap: SwarmSnapshot = {
            swarm_type: swarm,
            mode: "live",
            queue_depth: qd,
            failures_6h: fl,
            throughput_6h: tp,
            heartbeat_age_minutes: heartbeatAge,
            status,
            notes: notes.join("; "),
          };
          snaps.push(snap);

          // Immediate alert ONLY on transition into error.
          if (status === "error" && prev?.status !== "error") {
            alertItems.push({
              swarm_type: swarm,
              status,
              notes: snap.notes,
              prev_status: prev?.status ?? null,
            });
          }
        }

        // Write all snapshots in one insert (memoized by step.run → no double
        // insert on retry).
        const { error: insErr } = await admin
          .from("pipeline_health_snapshots")
          .insert(
            snaps.map((s) => ({
              swarm_type: s.swarm_type,
              mode: s.mode,
              queue_depth: s.queue_depth,
              failures_6h: s.failures_6h,
              throughput_6h: s.throughput_6h,
              heartbeat_age_minutes: s.heartbeat_age_minutes,
              status: s.status,
              notes: s.notes,
            })),
          );
        if (insErr) {
          throw new Error(
            `Failed to insert pipeline_health_snapshots: ${insErr.message}`,
          );
        }

        return { snapshots: snaps, alerts: alertItems };
      },
    );

    if (alerts.length === 0) {
      return { snapshotsWritten: snapshots.length, alerted: false };
    }

    const lines = alerts.map(
      (a) =>
        `• ${a.swarm_type}: ${a.notes}` +
        (a.prev_status ? ` (was ${a.prev_status})` : " (new)"),
    );
    const message =
      `Pipeline health — NEW error${alerts.length > 1 ? "s" : ""} detected:\n\n` +
      lines.join("\n") +
      `\n\nThis fires once on transition into error; you won't be re-mailed ` +
      `every 2h while it persists. Next weekly digest: Monday 06:00.`;

    const result = await step.run("post-alert-webhook", async () =>
      postHealthWebhook({
        event: "pipeline-health-alert",
        message,
        severity: "error",
        notify_to: NOTIFY_TO,
        swarms_in_error: alerts.map((a) => a.swarm_type),
        fired_at: new Date().toISOString(),
        test_mode: false,
      }),
    );

    return {
      snapshotsWritten: snapshots.length,
      alerted: true,
      alerts,
      webhook: result,
    };
  },
);
