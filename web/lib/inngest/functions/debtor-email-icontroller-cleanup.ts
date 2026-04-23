import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  openIControllerSession,
  deleteEmailOnPage,
  closeIControllerSession,
} from "@/lib/automations/debtor-email-cleanup/browser";

const ICONTROLLER_COMPANY = "smebabrandbeveiliging";

// Parallelle tabs binnen één browser-context — één iController-login,
// N onafhankelijke pages die tegelijk items afwerken. 3 is conservatief
// t.o.v. iController's server-side rate limits; units blijven laag
// omdat het één Browserless-sessie is.
const PARALLELISM = 3;
// Items per cron-tick. Verdeeld over PARALLELISM tabs, dus elke tab
// krijgt ~5 items. Met event-based waits zit per-item tijd op ~8-12s,
// dus een batch van 15 in parallel duurt ~40-60s per cron.
const BATCH_SIZE = 15;

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
      type Outcome = {
        message_id: string;
        outcome: "deleted" | "not_found" | "failed";
        error?: string;
      };

      // Verdeel todo over PARALLELISM workers via round-robin, zodat
      // elke worker ongeveer evenveel items krijgt ook bij kleine batches.
      const chunks: PendingRow[][] = Array.from(
        { length: PARALLELISM },
        () => [],
      );
      todo.forEach((row, idx) => chunks[idx % PARALLELISM].push(row));

      const session = await openIControllerSession("production");
      try {
        // Eén login + navigate is al gedaan door openIControllerSession
        // op session.page. Extra tabs delen de cookies (same context) dus
        // hoeven niet opnieuw in te loggen — deleteEmailOnPage doet een
        // eigen goto(/messages) aan het begin van elke iteratie.
        const pages = [session.page];
        for (let i = 1; i < PARALLELISM; i++) {
          pages.push(await session.context.newPage());
        }

        const processOne = async (row: PendingRow, page: typeof session.page): Promise<Outcome> => {
          const r = row.result;

          await admin
            .from("automation_runs")
            .update({
              automation: "debtor-email-cleanup",
              status: "pending",
              result: { ...r, processed_by: "inngest-cleanup-cron" },
            })
            .eq("id", row.id);

          try {
            const icRes = await deleteEmailOnPage(page, session.cfg, {
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

            return {
              message_id: r.message_id,
              outcome: icStatus,
              error: errText || undefined,
            };
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
            return { message_id: r.message_id, outcome: "failed", error: msg };
          }
        };

        // Fan-out: elke worker verwerkt zijn chunk sequentieel op de
        // eigen page; workers lopen parallel. Eén worker die crasht
        // neemt de andere niet mee — we wrappen per-item al in try/catch.
        const workerResults = await Promise.all(
          chunks.map(async (chunk, workerIdx) => {
            const page = pages[workerIdx];
            const out: Outcome[] = [];
            for (const row of chunk) {
              out.push(await processOne(row, page));
            }
            return out;
          }),
        );
        return workerResults.flat();
      } finally {
        await closeIControllerSession(session);
      }
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
