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
import { loadSwarmNoiseCategories, loadSwarmIntents } from "@/lib/swarms/registry";
import { evaluateEscalationGate } from "@/lib/automations/debtor-email/coordinator/escalation-gate";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import { numericConfidence } from "@/lib/pipeline-events/types";

const SWARM_TYPE = "debtor-email";

// Inngest's typed `inngest.send` rejects dynamic event names because the
// registry-driven dispatch chooses the event name at runtime from
// swarm_noise_categories.swarm_dispatch. Cast through unknown — same pattern as
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

        // Phase 70 — TELE-01 dual-write (Wave 2 / Plan 04). One pipeline_events
        // row per Stage 3 decision. Lives inside the SAME step.run as the
        // coordinator_runs UPDATE per CONTEXT D-09 (single replay boundary).
        // event.data.email_id IS the canonical email_pipeline.emails.id (uuid)
        // per RESEARCH §Pitfall 3 — no null/text-id fallback (W-70-04 fix).
        const top = output.ranked[0];
        await emitPipelineEvent(supabase, {
          swarm_type: SWARM_TYPE,
          stage: 3,
          email_id,
          decision: top.intent,
          confidence: numericConfidence(top.confidence),
          decision_details: {
            ranked: output.ranked,
            language: output.language,
            urgency: output.urgency,
          },
          agent_run_id,
          automation_run_id: automation_run_id ?? null,
          triggered_by: "pipeline",
        });
      });

      // ---- 5) Evaluate escalation gate -------------------------------------
      const decision = await step.run("evaluate-escalation-gate", async () => {
        const categories = await loadSwarmNoiseCategories(supabase, SWARM_TYPE);
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
        // handler_event), NOT swarm_noise_categories.swarm_dispatch. The two
        // registries route different stages: swarm_noise_categories is the Stage 1
        // operator-override path (still consulted at line 196 for category
        // routing), swarm_intents is the Stage 3 ranked-intent path here.
        const top = output.ranked[0];
        const intent = await step.run("resolve-intent-row", async () => {
          const intents = await loadSwarmIntents(supabase, SWARM_TYPE);
          return intents.find((i) => i.intent_key === top.intent) ?? null;
        });
        if (!intent) {
          throw new Error(
            `no swarm_intents row for (${SWARM_TYPE}, ${top.intent}) — verify Phase 68 migration applied`,
          );
        }

        // Phase 76 (no_handler trigger): when the resolved intent's
        // handler_status is 'placeholder', no Stage 4 worker is registered.
        // Write a Kanban human-lane row instead of dispatching to a
        // non-existent handler. Closes the silent-dead-letter loop for the
        // 8-of-9 placeholder intents.
        if (intent.handler_status === "placeholder") {
          await step.run("kanban-no-handler", async () => {
            const { error } = await supabase.from("automation_runs").insert({
              automation: `${SWARM_TYPE}-kanban`,
              swarm_type: SWARM_TYPE,
              status: "pending",
              topic: top.intent,
              entity,
              result: {
                kanban_reason: "no_handler",
                intent: top.intent,
                confidence: top.confidence,
                email_id,
                automation_run_id: automation_run_id ?? null,
                coordinator_run_id: run_id,
              },
              triggered_by: "stage-3-no-handler",
            });
            if (error) {
              throw new Error(`kanban-no-handler insert: ${error.message}`);
            }
            await emitAutomationRunStale(supabase, `${SWARM_TYPE}-kanban`);
          });
          await step.run("mark-coordinator-deferred", async () => {
            const { error } = await supabase
              .from("coordinator_runs")
              .update({
                completed_at: new Date().toISOString(),
                completed_handlers: 0,
              })
              .eq("run_id", run_id);
            if (error) {
              throw new Error(
                `mark-coordinator-deferred: ${error.message}`,
              );
            }
            await emitAutomationRunStale(supabase, "debtor-email-review");
          });
          return {
            run_id,
            email_id,
            decision: "kanban_no_handler" as const,
            intent: top.intent,
          };
        }

        const handler_event = intent.handler_event;

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

      // ---- 7b) Phase 76 (low_confidence trigger / D-07 + D-09) -------------
      // The escalation gate decision (low_confidence | high_intent_count |
      // requires_orchestration_flag) writes a Kanban human-lane row instead
      // of dispatching debtor-email/orchestrator.requested. The orchestrator
      // worker stays in the codebase (CONTEXT D-07 — "Things to NOT touch")
      // but is no longer triggered from here. escalation-gate.ts stays a
      // pure function (D-09).
      await step.run("kanban-low-confidence", async () => {
        const { error } = await supabase.from("automation_runs").insert({
          automation: `${SWARM_TYPE}-kanban`,
          swarm_type: SWARM_TYPE,
          status: "pending",
          topic: output.ranked[0].intent,
          entity,
          result: {
            kanban_reason: "low_confidence",
            // decision.reason field name verified against
            // EscalationDecision union in escalation-gate.ts:14-22.
            gate_reason: decision.reason,
            ranked: output.ranked,
            email_id,
            automation_run_id: automation_run_id ?? null,
            coordinator_run_id: run_id,
          },
          triggered_by: "stage-3-low-confidence",
        });
        if (error) {
          throw new Error(`kanban-low-confidence insert: ${error.message}`);
        }
        await emitAutomationRunStale(supabase, `${SWARM_TYPE}-kanban`);
      });
      await step.run("mark-coordinator-deferred-orch", async () => {
        const { error } = await supabase
          .from("coordinator_runs")
          .update({
            completed_at: new Date().toISOString(),
            completed_handlers: 0,
          })
          .eq("run_id", run_id);
        if (error) {
          throw new Error(`mark-coordinator-deferred-orch: ${error.message}`);
        }
        await emitAutomationRunStale(supabase, "debtor-email-review");
      });

      return {
        run_id,
        email_id,
        decision: "kanban_low_confidence" as const,
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
