// Phase 87 readiness watcher — daily Inngest cron.
//
// Phase 87's R-04 precondition gate refuses to run until Phase 86's nightly
// cluster cron has accumulated:
//   - at least 5 rows in public.intent_proposal_clusters for debtor-email
//   - max(refreshed_at) within the last 7 days
//
// This function checks both conditions once per day. When the gate is
// satisfied AND no stage_3_retro_runs row exists yet (meaning the operator
// has not fired Phase 87 yet), it POSTs a tiny JSON payload to a Zapier
// Catch Hook webhook so the operator gets an email notification.
//
// Auto-disarm: once a stage_3_retro_runs row exists, the cron becomes a
// no-op. To re-arm (e.g. for a future re-run), the operator either deletes
// the marker rows or just lets the cron run silently.
//
// Setup steps for the operator (one-time, ~2 minutes):
//
//   1. In Zapier, create a new Zap:
//        Trigger: Webhooks by Zapier → Catch Hook (no auth needed for a
//                 single-use notifier; the URL is the secret)
//        Action 1 (optional): Filter — only continue if data.ready === true
//        Action 2: Gmail / Outlook → Send Email
//                  To: nick.crutzen.cb@moyneroberts.com
//                  Subject: "Phase 87 ready to fire — debtor-email retro-classify"
//                  Body: include {{cluster_count}}, {{max_refreshed_at_age_hours}}
//      Copy the Catch Hook URL.
//   2. Set the Vercel env var `PHASE_87_READINESS_WEBHOOK_URL` to that URL.
//   3. Redeploy Vercel. Cron starts firing the next morning.
//
// If `PHASE_87_READINESS_WEBHOOK_URL` is unset the function logs and exits
// silently — useful while the Zap is being set up.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

const REQUIRED_MIN_CLUSTERS = 5;
const FRESH_DAYS = 7;
const FRESH_MS = FRESH_DAYS * 86_400_000;
const NOTIFY_TO = "nick.crutzen.cb@moyneroberts.com";

export const phase87ReadinessNotify = inngest.createFunction(
  {
    id: "phase-87-readiness-notify",
    name: "Phase 87 — daily readiness watcher (R-04 gate)",
    retries: 1,
    concurrency: { limit: 1 },
  },
  // Daily 08:00 Amsterdam, 7 days/week. Phase 86's refresh cron is daily-04:00
  // so readiness can become true on any calendar day.
  { cron: "TZ=Europe/Amsterdam 0 8 * * *" },
  async ({ step }) => {
    const admin = createAdminClient();

    const probe = await step.run("probe-readiness", async () => {
      const { data: clusters, error: clusterErr } = (await admin
        .from("intent_proposal_clusters")
        .select("refreshed_at")
        .eq("swarm_type", "debtor-email")) as {
        data: Array<{ refreshed_at: string | null }> | null;
        error: unknown;
      };
      if (clusterErr) throw clusterErr as Error;
      const rows = clusters ?? [];
      const cluster_count = rows.length;
      let max_refreshed_at_ms = 0;
      for (const r of rows) {
        if (!r.refreshed_at) continue;
        const t = Date.parse(r.refreshed_at);
        if (Number.isFinite(t) && t > max_refreshed_at_ms) {
          max_refreshed_at_ms = t;
        }
      }
      const age_ms = Date.now() - max_refreshed_at_ms;
      const fresh = max_refreshed_at_ms > 0 && age_ms <= FRESH_MS;
      const count_ok = cluster_count >= REQUIRED_MIN_CLUSTERS;

      const { count: retro_count, error: retroErr } = (await admin
        .from("stage_3_retro_runs")
        .select("id", { count: "exact", head: true })) as {
        count: number | null;
        error: unknown;
      };
      if (retroErr) throw retroErr as Error;
      const already_fired = (retro_count ?? 0) > 0;

      return {
        cluster_count,
        max_refreshed_at_iso:
          max_refreshed_at_ms === 0
            ? null
            : new Date(max_refreshed_at_ms).toISOString(),
        max_refreshed_at_age_hours:
          max_refreshed_at_ms === 0
            ? null
            : Math.round((age_ms / 3_600_000) * 10) / 10,
        count_ok,
        fresh,
        already_fired,
        ready: count_ok && fresh && !already_fired,
      };
    });

    // No-op cases — log via the return value, no webhook.
    if (probe.already_fired) {
      return { skipped: "phase_87_already_fired", probe };
    }
    if (!probe.ready) {
      return { skipped: "gate_not_satisfied", probe };
    }

    const webhookUrl = process.env.PHASE_87_READINESS_WEBHOOK_URL;
    if (!webhookUrl) {
      return { skipped: "webhook_not_configured", probe };
    }

    const payload = {
      event: "phase-87-ready",
      ready: true,
      notify_to: NOTIFY_TO,
      message:
        "Phase 87 R-04 precondition gate is now satisfied. " +
        "Operator can fire debtor-email retro-classify via " +
        "`cd web && npx tsx scripts/run-retro-classify.ts --since <YYYY-MM-DD> " +
        "--until <YYYY-MM-DD> --sample-limit 50 --yes`.",
      cluster_count: probe.cluster_count,
      max_refreshed_at_iso: probe.max_refreshed_at_iso,
      max_refreshed_at_age_hours: probe.max_refreshed_at_age_hours,
      runbook:
        "docs/runbooks/inngest-function-rename-phase-88.1.md " +
        "(adjacent — Phase 87 runbook lives in 87-CONTEXT.md / 87-04-SUMMARY.md)",
      fired_at: new Date().toISOString(),
    };

    const result = await step.run("post-webhook", async () => {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Zapier webhook returned ${res.status}: ${text.slice(0, 200)}`,
        );
      }
      return { status: res.status };
    });

    return { sent: true, payload, ...result };
  },
);
