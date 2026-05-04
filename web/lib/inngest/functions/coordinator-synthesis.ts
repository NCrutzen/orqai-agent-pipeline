// Phase 65 D-04/D-05/D-06 — Stage 3.5 synthesis Inngest function.
//
// Listens on `debtor-email/synthesis.requested` (emitted by
// notifyCoordinatorComplete when claim_synthesis=true — exactly one Stage 4
// handler caller wins the synthesis-dispatch claim per RESEARCH Pitfall 2
// race-guard).
//
// Loads coordinator_runs + HandlerOutput[] (via output-adapter) for the run,
// invokes synthesis-agent, posts the body to /api/automations/debtor/create-draft,
// and persists partial_synthesis flag + completed_at.
//
// retries: 0 — Pitfall 1 (cost amplification on auto-retry).
// D-05 (partial synthesis): synthesis runs even if some handlers failed; if
// ALL handlers failed (handlerOutputs.length === 0), skip the draft creation
// but still close out the coordinator_runs row with partial_synthesis=true.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { invokeOrqAgent } from "@/lib/automations/orq-agents/client";
import { synthesisOutputSchema } from "@/lib/automations/debtor-email/coordinator/synthesis-types";
import { loadHandlerOutputsForRun } from "@/lib/automations/debtor-email/handlers/output-adapter";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";

const SYNTHESIS_AGENT_KEY = "synthesis-agent";

type CoordinatorRunRow = {
  run_id: string;
  email_id: string | null;
  automation_run_id: string | null;
  failed_handlers: number;
  ranked_intents: Array<{ intent: string }> | null;
};

export const coordinatorSynthesis = inngest.createFunction(
  {
    id: "automations/debtor-email-synthesis",
    retries: 0,
    concurrency: [{ key: "event.data.run_id", limit: 1 }],
  },
  { event: "debtor-email/synthesis.requested" } as unknown as {
    event: keyof import("@/lib/inngest/events").Events;
  },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const data = (event as unknown as { data: Record<string, unknown> }).data;
    const run_id = data.run_id as string;

    try {
      // 1. Load coordinator_runs row + handler outputs.
      const loaded = await step.run("load-handler-outputs", async () => {
        const { data: cr, error } = await admin
          .from("coordinator_runs")
          .select(
            "run_id, email_id, automation_run_id, failed_handlers, ranked_intents",
          )
          .eq("run_id", run_id)
          .single();
        if (error) throw new Error(`coordinator_runs lookup failed: ${error.message}`);
        const outputs = await loadHandlerOutputsForRun(admin, run_id);
        return { coordinatorRun: cr as CoordinatorRunRow, handlerOutputs: outputs };
      });

      const coordinatorRun = loaded.coordinatorRun;
      const handlerOutputs = loaded.handlerOutputs;
      const partial = (coordinatorRun.failed_handlers ?? 0) > 0 || handlerOutputs.length === 0;

      let synthesisOutput: {
        body_html: string;
        detected_tone: "neutral" | "de-escalation";
        synthesis_version: string;
      } | null = null;

      if (handlerOutputs.length > 0) {
        // 2. Synthesise (D-06).
        synthesisOutput = await step.run("synthesise", async () => {
          const ranked = coordinatorRun.ranked_intents ?? [];
          const failed_intents = (coordinatorRun.failed_handlers ?? 0) > 0
            ? ranked
                .filter((r) => !handlerOutputs.find((h) => h.intent === r.intent))
                .map((r) => r.intent)
            : [];
          const { raw } = await invokeOrqAgent(SYNTHESIS_AGENT_KEY, {
            run_id,
            handler_outputs: handlerOutputs,
            partial,
            failed_intents,
          });
          const validated = synthesisOutputSchema.safeParse(raw);
          if (!validated.success) {
            throw new Error(
              "synthesis-agent output schema mismatch: " +
                JSON.stringify(validated.error.issues),
            );
          }
          return validated.data;
        });

        // 3. Create iController draft via the existing route.
        await step.run("create-icontroller-draft", async () => {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "";
          const url = `${baseUrl}/api/automations/debtor/create-draft`;
          const res = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.AUTOMATION_WEBHOOK_SECRET ?? ""}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email_id: coordinatorRun.email_id,
              automation_run_id: coordinatorRun.automation_run_id,
              bodyHtml: synthesisOutput!.body_html,
              detectedTone: synthesisOutput!.detected_tone,
              source: "phase-65-synthesis",
              run_id,
            }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`create-draft route failed: ${res.status} ${text.slice(0, 200)}`);
          }
        });
      }
      // If handlerOutputs.length === 0 (all handlers failed), skip synthesis but still close the run.

      // 4. Persist + Bulk Review revalidation.
      await step.run("persist", async () => {
        await admin
          .from("coordinator_runs")
          .update({
            completed_at: new Date().toISOString(),
            partial_synthesis: partial,
          })
          .eq("run_id", run_id);
        await emitAutomationRunStale(admin, "debtor-email-review");
      });

      return {
        ok: true,
        run_id,
        partial_synthesis: partial,
        synthesised: handlerOutputs.length > 0,
        outputs: handlerOutputs.length,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await step.run("mark-failed", async () => {
        const { data: cr } = await admin
          .from("coordinator_runs")
          .select("automation_run_id")
          .eq("run_id", run_id)
          .maybeSingle();
        const arid = (cr as { automation_run_id?: string } | null)?.automation_run_id;
        if (arid) {
          await admin
            .from("automation_runs")
            .update({
              status: "failed",
              error_message: msg,
              completed_at: new Date().toISOString(),
            })
            .eq("id", arid);
        }
        await admin
          .from("coordinator_runs")
          .update({ completed_at: new Date().toISOString() })
          .eq("run_id", run_id);
        await emitAutomationRunStale(admin, "debtor-email-review");
      });
      throw err;
    }
  },
);
