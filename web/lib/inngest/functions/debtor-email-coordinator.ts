// Phase 65 (D-10) — coordinator function rewritten in-place.
//
// Phase 66 (Plan 01) renamed the function id to
// "automations/debtor-email-coordinator" (kept the file/const/id aligned).
// Earlier Phase-1 single-label flow (classify → fetch
// document → generate body → create iController draft) is removed here — the
// per-intent handlers move to Plan 65-04 (orchestrator + synthesis) and the
// existing copy-document handler in web/app/api/automations/debtor*/. Plan 03
// owns: ranked classify → escalation gate → registry-driven single-shot OR
// orchestrator emit.
//
// retries: 0 (matches verdict-worker / label-resolver convention — Bulk Review
// retry button is the recovery path; auto-retry would amplify Orq cost on a
// stuck run).
//
// concurrency: entity-key limit 4 + run_id-key limit 1 (RESEARCH OQ3 — entity
// fan-out 4 keeps mailbox throughput while run_id 1 prevents duplicate
// dispatch under Inngest replay).

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { invokeIntentAgent } from "@/lib/automations/debtor-email/coordinator/invoke-intent";
import {
  createRun,
  findCachedOutput,
  mergeToolOutputs,
  updateRun,
} from "@/lib/automations/debtor-email/coordinator/agent-runs";
import {
  INTENT_VERSION_V2,
  type IntentAgentOutputV2,
} from "@/lib/automations/debtor-email/coordinator/types";
import { loadSwarmCategories, loadHandlerEvent } from "@/lib/swarms/registry";
import { evaluateEscalationGate } from "@/lib/automations/debtor-email/coordinator/escalation-gate";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";

const SWARM_TYPE = "debtor-email";

// Inngest's typed `inngest.send` rejects dynamic event names because the
// registry-driven dispatch chooses the event name at runtime from
// swarm_categories.swarm_dispatch. Cast through unknown — same pattern as
// classifier-verdict-worker.ts:162-165.
type DynamicSend = (payload: {
  name: string;
  data: Record<string, unknown>;
}) => Promise<unknown>;

export const debtorEmailCoordinator = inngest.createFunction(
  {
    id: "automations/debtor-email-coordinator",
    name: "Debtor Email Coordinator (Stage 3)",
    retries: 0,
    concurrency: [
      { key: "event.data.entity", limit: 4 },
      { key: "event.data.run_id", limit: 1 },
    ],
  },
  { event: "debtor-email/coordinator.requested" },
  async ({ event, step }) => {
    const email = event.data;
    const { email_id } = email;
    // Phase 66: event shape widened entity to `string | null | undefined`
    // (the new coordinator.requested event is producer-agnostic). Coerce to
    // the strict ENTITY union here — the producer (label-resolver) reads
    // entity from labeling_settings.entity which is the same union, and a
    // missing value defaults to "smeba" (debiteuren-mailbox baseline).
    const entity = (email.entity ?? "smeba") as
      | "smeba"
      | "berki"
      | "sicli-noord"
      | "sicli-sud"
      | "smeba-fire";
    const sender_domain = email.sender_domain ?? "";
    const inngest_run_id = event.id ?? `local-${email_id}`;
    const supabase = createAdminClient();

    // Phase 65 D-10 / Phase 64 D-15: Stage 0 (or callers pre-Phase 64) MAY
    // pass the coordinator run_id, automation_run_id, budget_run_id, and the
    // pre-created agent_run_id forward. When run_id is absent (legacy direct
    // emit) we synthesise one so coordinator_runs always has a key. The
    // synthesised id will not collide with a real Stage-0-emitted run because
    // coordinator_runs.run_id is a uuid PRIMARY KEY.
    // CLAUDE.md / Inngest pitfall: any non-deterministic value used inside
    // step.run side-effects (DB writes keyed on it) MUST be generated inside
    // step.run, otherwise replays regenerate it and INSERT/UPDATE race onto
    // different keys. Phase 65: run_id is the coordinator_runs PK and joins
    // every downstream step — has to be stable across replays.
    const run_id = await step.run("resolve-run-id", async () =>
      event.data.run_id ??
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? (crypto as { randomUUID(): string }).randomUUID()
          : `local-${email_id}-${Date.now()}`),
    );
    const automation_run_id = event.data.automation_run_id;
    const budget_run_id = event.data.budget_run_id;

    // ---- 1) Resolve agent_run_id (caller-provided OR create a fresh row) ----
    const agent_run_id = await step.run("create-agent-run", async () => {
      if (event.data.agent_run_id) return event.data.agent_run_id;
      return createRun(supabase, { email_id, inngest_run_id, entity });
    });

    // ---- 2) Insert coordinator_runs row early -------------------------------
    // Tentative escalation_decision='single_shot' / expected_handlers=1.
    // Both fields are overwritten after the gate evaluates.
    await step.run("create-coordinator-run", async () => {
      const { error } = await supabase.from("coordinator_runs").insert({
        run_id,
        automation_run_id: automation_run_id ?? null,
        email_id,
        swarm_type: SWARM_TYPE,
        ranked_intents: [],
        escalation_decision: "single_shot",
        expected_handlers: 1,
        budget_run_id: budget_run_id ?? null,
      });
      if (error) {
        throw new Error(`coordinator_runs insert: ${error.message}`);
      }
      await emitAutomationRunStale(supabase, "debtor-email-review");
    });

    try {
      // ---- 3) Classify intent (V2 ranked output, idempotent cache) ---------
      // Inngest's step.run wraps the return type in JsonifyObject which strips
      // zod-derived literal unions. Cast back to the v2 shape after the await
      // — the value is already validated by intentAgentOutputSchemaV2 inside
      // invokeIntentAgent (or originated from a previously validated cache row).
      const outputRaw = await step.run("classify-intent", async () => {
          const cached = await findCachedOutput<Record<string, unknown>>(
            supabase,
            email_id,
            "intent_version",
            INTENT_VERSION_V2,
            "tool_outputs",
          );
          const cachedFirst = cached?.intent_first_pass as
            | IntentAgentOutputV2
            | undefined;
          if (cachedFirst) return cachedFirst;

          const { output: fresh } = await invokeIntentAgent({
            email_id,
            inngest_run_id,
            subject: email.subject,
            body_text: email.body_text,
            sender_email: email.sender_email,
            sender_domain,
            mailbox: email.mailbox,
            entity,
            received_at: email.received_at,
          });

          // mergeToolOutputs requires JsonValue. The IntentAgentOutputV2 shape
          // is JSON-serialisable by construction (zod-validated literals +
          // strings/numbers/null), so the unknown cast is sound at runtime.
          await mergeToolOutputs(
            supabase,
            agent_run_id,
            "intent_first_pass",
            fresh as unknown as Parameters<typeof mergeToolOutputs>[3],
          );

          // Hoist top-1 onto agent_runs back-compat columns. v1 columns
          // (intent, confidence, sub_type, document_reference, language,
          // urgency, reasoning, intent_version) still exist on agent_runs
          // and are read by Bulk Review; the row is the back-compat surface
          // until Phase 66 migrates queries to coordinator_runs.ranked_intents.
          const top = fresh.ranked[0];
          await updateRun(supabase, agent_run_id, {
            intent: top.intent,
            sub_type: top.sub_type,
            document_reference: top.document_reference,
            language: fresh.language,
            confidence: top.confidence,
            urgency: fresh.urgency,
            intent_version: INTENT_VERSION_V2,
            reasoning: top.reasoning,
          });
          return fresh;
        },
      );
      const output = outputRaw as unknown as IntentAgentOutputV2;

      // ---- 4) Persist ranked_intents on coordinator_runs --------------------
      await step.run("persist-ranked", async () => {
        const { error } = await supabase
          .from("coordinator_runs")
          .update({ ranked_intents: output.ranked })
          .eq("run_id", run_id);
        if (error) throw new Error(`persist-ranked: ${error.message}`);
      });

      // ---- 5) Evaluate escalation gate -------------------------------------
      const decision = await step.run("evaluate-escalation-gate", async () => {
        const categories = await loadSwarmCategories(supabase, SWARM_TYPE);
        return evaluateEscalationGate(output, categories);
      });

      // ---- 6) Write escalation_decision + reason to coordinator_runs ------
      await step.run("write-escalation", async () => {
        const { error } = await supabase
          .from("coordinator_runs")
          .update({
            escalation_decision: decision.kind,
            escalation_reason:
              decision.kind === "orchestrator" ? decision.reason : null,
          })
          .eq("run_id", run_id);
        if (error) throw new Error(`write-escalation: ${error.message}`);
      });

      if (decision.kind === "single_shot") {
        // ---- 7a) Single-shot dispatch — Phase 68 (SWRM-02) registry-driven.
        // V2 ranked-intent dispatch reads from swarm_intents (per-intent
        // handler_event), NOT swarm_categories.swarm_dispatch. The two
        // registries route different stages: swarm_categories is the Stage 1
        // operator-override path (still consulted at line 196 for category
        // routing), swarm_intents is the Stage 3 ranked-intent path here.
        const top = output.ranked[0];
        const handler_event = await step.run("resolve-handler-event", async () => {
          const evt = await loadHandlerEvent(supabase, SWARM_TYPE, top.intent);
          if (!evt) {
            throw new Error(
              `no swarm_intents row for (${SWARM_TYPE}, ${top.intent}) — verify Phase 68 migration applied`,
            );
          }
          return evt;
        });

        await step.run("dispatch-single-shot", async () => {
          await (inngest.send as unknown as DynamicSend)({
            name: handler_event,
            data: {
              run_id,
              email_id,
              automation_run_id,
              intent: top.intent,
              ranked: output.ranked,
              budget_run_id,
              swarm_type: SWARM_TYPE,
            },
          });
        });

        await step.run("mark-coordinator-complete", async () => {
          const { error } = await supabase
            .from("coordinator_runs")
            .update({
              completed_at: new Date().toISOString(),
              completed_handlers: 1,
            })
            .eq("run_id", run_id);
          if (error) {
            throw new Error(`mark-coordinator-complete: ${error.message}`);
          }
          await emitAutomationRunStale(supabase, "debtor-email-review");
        });

        return {
          run_id,
          email_id,
          decision: "single_shot" as const,
          intent: top.intent,
          dispatch_event: handler_event,
        };
      }

      // ---- 7b) Orchestrator dispatch ---------------------------------------
      // Plan 04's orchestrator function listens on this event, runs the
      // planner agent, and updates coordinator_runs.expected_handlers to N
      // before fanning out per-intent handlers.
      await step.run("dispatch-orchestrator", async () => {
        await (inngest.send as unknown as DynamicSend)({
          name: "debtor-email/orchestrator.requested",
          data: {
            run_id,
            email_id,
            automation_run_id,
            ranked: output.ranked,
            language: output.language,
            urgency: output.urgency,
            escalation_reason: decision.reason,
            budget_run_id,
            swarm_type: SWARM_TYPE,
          },
        });
      });

      return {
        run_id,
        email_id,
        decision: "orchestrator" as const,
        escalation_reason: decision.reason,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await step.run("mark-failed", async () => {
        if (automation_run_id) {
          await supabase
            .from("automation_runs")
            .update({
              status: "failed",
              error_message: msg,
              completed_at: new Date().toISOString(),
            })
            .eq("id", automation_run_id);
        }
        await supabase
          .from("coordinator_runs")
          .update({ completed_at: new Date().toISOString() })
          .eq("run_id", run_id);
        await emitAutomationRunStale(supabase, "debtor-email-review");
      });
      throw err;
    }
  },
);
