import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  openIControllerSession,
  deleteEmailOnPage,
  closeIControllerSession,
} from "@/lib/automations/debtor-email-cleanup/browser";

const ICONTROLLER_COMPANY = "smebabrandbeveiliging";

// Hoeveel pending items per cron-invocatie proberen. Elke delete kost
// ~15-25s (Browserless login + search + delete). Vercel Pro timeout is
// 60s per invocatie, maar step.run splitst elk item in een eigen
// invocatie — dus theoretisch mag dit hoger. We houden 'm op 5 om
// Browserless concurrency en rate-limits niet te stressen; met een 5-min
// cron is dat een throughput van 60 items/uur = 1440/dag.
const BATCH_SIZE = 5;

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

/**
 * iController-cleanup cron. Pakt elke 5 min pending-rijen op die door de
 * review-UI zijn achtergelaten (stage=icontroller_delete, icontroller=
 * pending). Sinds de server-action-refactor (commit a808a25) wordt
 * iController niet meer synchroon gedaan — de review-UI logt alleen een
 * pending-row en deze cron vult 'm later in.
 *
 * Idempotent: elk verwerkt item krijgt een NIEUWE stage=icontroller_delete
 * rij met status=completed en icontroller=deleted|not_found|failed. De
 * oorspronkelijke pending-rij blijft staan voor audit — `already_done`
 * detectie in de catchup-script kijkt naar deleted|not_found-rijen, niet
 * naar pending.
 */
export const cleanupIControllerPending = inngest.createFunction(
  {
    id: "automations/debtor-email-icontroller-cleanup",
    retries: 1,
    // Voorkom dat twee runs tegelijk op dezelfde Browserless-session
    // zitten (elk item opent een eigen context, maar sequentiëel is
    // veiliger voor iController's session-state).
    concurrency: { limit: 1 },
  },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const admin = createAdminClient();

    // Stap 1: haal de oudste wachtende rijen op. `deferred` = nieuw
    // contract (swarm-bridge toont deze in de "Ready" lane); `pending`
    // = legacy rijen van voor de contract-change. Beiden verwerken zodat
    // oude in-flight werk niet achterblijft.
    const pending = await step.run("load-pending", async () => {
      const { data, error } = await admin
        .from("automation_runs")
        .select("id, result")
        .eq("automation", "debtor-email-review")
        .in("status", ["deferred", "pending"])
        .eq("result->>stage", "icontroller_delete")
        .eq("result->>icontroller", "pending")
        .order("completed_at", { ascending: true })
        .limit(BATCH_SIZE);
      if (error) throw new Error(`load-pending: ${error.message}`);
      return (data ?? []) as PendingRow[];
    });

    if (pending.length === 0) {
      return { processed: 0, remaining: 0 };
    }

    // Dedupe op message_id: meerdere pending-rijen voor hetzelfde bericht
    // kunnen bestaan als er iets misging bij een eerdere log. We processen
    // elk bericht één keer.
    const seen = new Set<string>();
    const todo = pending.filter((p) => {
      const id = p.result.message_id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // Stap 2: één browsersessie voor de hele batch. De login + navigate
    // dance (~8-12s) gebeurt één keer i.p.v. N keer — grootste winst qua
    // wall-clock tijd én Browserless-units. Alle per-item DB updates en
    // het iController-delete zitten in één step.run; bij partial failure
    // retryt Inngest de hele step (rows die al op completed staan worden
    // via de admin.update idempotent overschreven).
    const results = await step.run("delete-batch", async () => {
      const out: Array<{
        message_id: string;
        outcome: "deleted" | "not_found" | "failed";
        error?: string;
      }> = [];

      const session = await openIControllerSession("production");
      try {
        for (const row of todo) {
          const r = row.result;

          // Flip naar `pending` zodat de kanban de kaart naar "In progress"
          // schuift en een volgende cron-tick deze rij niet dubbelpakt.
          await admin
            .from("automation_runs")
            .update({
              automation: "debtor-email-cleanup",
              status: "pending",
              result: { ...r, processed_by: "inngest-cleanup-cron" },
            })
            .eq("id", row.id);

          try {
            const icRes = await deleteEmailOnPage(session.page, session.cfg, {
              company: ICONTROLLER_COMPANY,
              from: r.from,
              subject: r.subject,
              receivedAt: r.received_at,
            });
            const errText = icRes.error ?? "";
            const icStatus: "deleted" | "not_found" | "failed" =
              icRes.success && icRes.emailFound
                ? "deleted"
                : !icRes.emailFound && /email not found|company .* not found/i.test(errText)
                  ? "not_found"
                  : "failed";

            await admin
              .from("automation_runs")
              .update({
                automation: "debtor-email-cleanup",
                status: icStatus === "failed" ? "failed" : "completed",
                result: {
                  ...r,
                  icontroller: icStatus,
                  screenshots: icRes.screenshots,
                  processed_by: "inngest-cleanup-cron",
                },
                error_message: icStatus === "failed" ? errText || null : null,
                completed_at: new Date().toISOString(),
              })
              .eq("id", row.id);

            out.push({
              message_id: r.message_id,
              outcome: icStatus,
              error: errText || undefined,
            });
          } catch (err) {
            const msg = String(err);
            await admin
              .from("automation_runs")
              .update({
                automation: "debtor-email-cleanup",
                status: "failed",
                result: {
                  ...r,
                  icontroller: "failed",
                  processed_by: "inngest-cleanup-cron",
                },
                error_message: msg,
                completed_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            out.push({ message_id: r.message_id, outcome: "failed", error: msg });
          }
        }
      } finally {
        await closeIControllerSession(session);
      }

      return out;
    });

    // Stap 3: rapporteer hoeveel items er nog te doen zijn.
    const remaining = await step.run("count-remaining", async () => {
      const { count, error } = await admin
        .from("automation_runs")
        .select("id", { count: "exact", head: true })
        .eq("automation", "debtor-email-review")
        .in("status", ["deferred", "pending"])
        .eq("result->>stage", "icontroller_delete")
        .eq("result->>icontroller", "pending");
      if (error) return null;
      return count ?? 0;
    });

    return {
      processed: results.length,
      deleted: results.filter((r) => r.outcome === "deleted").length,
      not_found: results.filter((r) => r.outcome === "not_found").length,
      failed: results.filter((r) => r.outcome === "failed").length,
      remaining,
    };
  },
);
