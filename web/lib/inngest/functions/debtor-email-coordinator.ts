// Phase 80 Plan 03 — coordinator refactored to a thin Stage 3 classifier.
//
// Per docs/agentic-pipeline/stage-3-coordinator.md and 80-CONTEXT.md
// `<decisions>` Classifier Refactor Boundaries, the classifier's locked
// 9-step responsibility list:
//   1. Resolve agent_run_id (caller-provided OR fresh).
//   2. Insert coordinator_runs row.
//   3. Invoke Intent Agent (cache-aware).
//   4. Write tool_outputs.intent_first_pass via mergeToolOutputs.
//   5. Hoist top-1 onto agent_runs back-compat columns.
//   6. Persist ranked_intents on coordinator_runs (+ pipeline_events TELE-01).
//   7. Flip agent_runs.status 'classifying' → 'predicted' (race-guarded).
//   8. Emit `<swarm_type>/predicted` for the cross-swarm Stage 3.5 dispatcher.
//   9. Return.
//
// Hard separation rule (Stage 1 vs Stage 3): this file ONLY consults Stage 3
// (intent classification). Stage 1 noise registries are never read here.
//
// Dispatch logic (escalation gate, swarm_intents lookup, handler_event emit,
// Kanban no_handler/low_confidence writes) MOVED to stage-3-dispatcher.ts in
// Phase 80 Plan 02. The dispatcher subscribes to `*/predicted` events.
//
// retries: 0 — Bulk Review retry button is the recovery path.
// concurrency: entity-key 4 + run_id-key 1.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { invokeIntentAgent } from "@/lib/automations/debtor-email/coordinator/invoke-intent";
import { assembleInput } from "@/lib/automations/debtor-email/coordinator/assemble-input";
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
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import { numericConfidence } from "@/lib/pipeline-events/types";

const SWARM_TYPE = "debtor-email";

// Phase 83 Plan 06 (D-08 fallback) — static tenant-domain list while
// swarms.tenant_domains is not yet registry-driven. TODO(phase-84 D-03):
// swap to a registry lookup over swarms.tenant_domains JSONB once Phase 84
// ships that column. See T-83-19 mitigation in 83-06-PLAN.md.
const TENANT_DOMAINS = ["smeba.nl", "smeba-fire.be", "moyneroberts.com"];

// Phase 83 Plan 06 (D-09) — hard cap on the Stage 3 assembled input.
const STAGE_3_INPUT_CAP_CHARS = 8000;

// Inngest's typed `inngest.send` rejects dynamic event names because the
// `<swarm_type>/predicted` event name is composed at runtime from SWARM_TYPE.
// Cast through unknown — same pattern as classifier-verdict-worker.ts and
// stage-3-dispatcher.ts. CLAUDE.md / Phase 65 dae6276: never alias
// inngest.send (loses `this`-binding); call via this cast each time.
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

    // CLAUDE.md / Inngest pitfall: any non-deterministic value used inside
    // step.run side-effects (DB writes keyed on it) MUST be generated inside
    // step.run, otherwise replays regenerate it and INSERT/UPDATE race onto
    // different keys. run_id is the coordinator_runs PK and joins every
    // downstream step — has to be stable across replays.
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
    // Phase 80: escalation_decision moved to the dispatcher; we keep the
    // legacy 'single_shot' default here to avoid a schema touch.
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
      //
      // Phase 83 D-06: the side-effects below (email row select for
      // body_full_text, conversation_context select for priors, and the
      // pure assembleInput call) live inside this same step.run boundary
      // so Inngest replay re-derives the assembled input deterministically.
      const classifyResult = await step.run("classify-intent", async () => {
          // Phase 83 D-10 reader switch — fetch body_full_text with body_text
          // fallback. The event payload still carries body_text (legacy emit
          // shape) but Plan 83-03 dual-writes body_full_text; we prefer the
          // wider field. If neither column is populated yet on a not-yet-
          // backfilled row, fall back to event.data.body_text.
          const { data: emailRow } = await supabase
            .from("emails")
            .select("body_full_text, body_text")
            .eq("id", email_id)
            .maybeSingle();
          const bodyFull =
            (emailRow as { body_full_text?: string | null } | null)
              ?.body_full_text
            ?? (emailRow as { body_text?: string | null } | null)?.body_text
            ?? email.body_text
            ?? "";

          // Phase 83 D-04 — conversation_context priors, ordered position ASC.
          const { data: priorsRows } = await supabase
            .from("conversation_context")
            .select("position, sender_email, subject, received_at, body_text")
            .eq("email_id", email_id)
            .order("position", { ascending: true });
          const priors = (priorsRows ?? []).map(
            (r: Record<string, unknown>) => ({
              position: Number(r.position),
              senderEmail: (r.sender_email as string | null) ?? null,
              subject: (r.subject as string | null) ?? null,
              receivedAt: (r.received_at as string | null) ?? null,
              bodyText: (r.body_text as string | null) ?? null,
            }),
          );

          const assembled = assembleInput({
            subject: email.subject ?? "",
            bodyFull,
            priors,
            tenantDomains: TENANT_DOMAINS,
            capChars: STAGE_3_INPUT_CAP_CHARS,
          });

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

          // Cache hit reuses the prior LLM output but MUST still hoist it
          // onto THIS agent_run_id — otherwise duplicate triggers for the
          // same email_id (manual replay scripts, upstream redelivery) leave
          // the new agent_runs row with intent=null + tool_outputs={}.
          const output: IntentAgentOutputV2 = cachedFirst
            ?? (await invokeIntentAgent({
              email_id,
              inngest_run_id,
              subject: email.subject,
              body_text: email.body_text,
              assembled_input: assembled.text,
              sender_email: email.sender_email,
              sender_domain,
              mailbox: email.mailbox,
              entity,
              received_at: email.received_at,
            })).output;

          // mergeToolOutputs requires JsonValue. The IntentAgentOutputV2 shape
          // is JSON-serialisable by construction (zod-validated literals +
          // strings/numbers/null), so the unknown cast is sound at runtime.
          await mergeToolOutputs(
            supabase,
            agent_run_id,
            "intent_first_pass",
            output as unknown as Parameters<typeof mergeToolOutputs>[3],
          );

          // Hoist top-1 onto agent_runs back-compat columns. v1 columns
          // (intent, confidence, sub_type, document_reference, language,
          // urgency, reasoning, intent_version) still exist on agent_runs
          // and are read by Bulk Review; the row is the back-compat surface
          // until later migrations push queries to coordinator_runs.ranked_intents.
          const top = output.ranked[0];
          await updateRun(supabase, agent_run_id, {
            intent: top.intent,
            sub_type: top.sub_type,
            document_reference: top.document_reference,
            language: output.language,
            confidence: top.confidence,
            urgency: output.urgency,
            intent_version: INTENT_VERSION_V2,
            reasoning: top.reasoning,
          });
          // Phase 83 D-09 telemetry: surface input_chars + truncated so the
          // persist-ranked step writes coordinator_runs.decision_details.input_size.
          return {
            output,
            inputSize: {
              input_chars: assembled.inputChars,
              truncated: assembled.truncated,
            },
          };
        },
      );
      const output = (classifyResult as unknown as {
        output: IntentAgentOutputV2;
        inputSize: { input_chars: number; truncated: boolean };
      }).output;
      const inputSize = (classifyResult as unknown as {
        output: IntentAgentOutputV2;
        inputSize: { input_chars: number; truncated: boolean };
      }).inputSize;

      // ---- 4) Persist ranked_intents on coordinator_runs --------------------
      await step.run("persist-ranked", async () => {
        const { error } = await supabase
          .from("coordinator_runs")
          .update({ ranked_intents: output.ranked })
          .eq("run_id", run_id);
        if (error) throw new Error(`persist-ranked: ${error.message}`);

        // Phase 70 — TELE-01 dual-write. One pipeline_events row per Stage 3
        // decision. Lives inside the SAME step.run as the coordinator_runs
        // UPDATE per CONTEXT D-09 (single replay boundary). event.data.email_id
        // IS the canonical email_pipeline.emails.id (uuid).
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
            // 2026-05-19 — Stage 3 audit-panel evidence expansion.
            // Persist the model/prompt version + the classifier inputs so the
            // audit UI can render an INPUTS section without a JOIN back to
            // agent_runs. Subject is excerpted to ≤140 chars (the panel uses
            // it as a "you sent the classifier THIS" reminder, not a full
            // body view — the existing Show full email link covers that).
            intent_version: INTENT_VERSION_V2,
            inputs: {
              sender_email: email.sender_email ?? null,
              sender_domain: sender_domain || null,
              mailbox: email.mailbox ?? null,
              entity,
              subject_excerpt: (email.subject ?? "").slice(0, 140) || null,
              received_at: email.received_at ?? null,
            },
            // Phase 83 D-09 telemetry — assembled-input size + truncation
            // flag for post-deploy monitoring of token-bloat / R-01 watch.
            input_size: {
              input_chars: inputSize.input_chars,
              truncated: inputSize.truncated,
            },
          },
          agent_run_id,
          automation_run_id: automation_run_id ?? null,
          triggered_by: "pipeline",
        });
      });

      // ---- 5) Flip agent_runs.status: classifying → predicted -------------
      // First-class observable state per docs/agentic-pipeline/stage-3-coordinator.md.
      // Race guard via .eq("status", "classifying"): only flip from classifying,
      // idempotent against double-runs (a replay or duplicate trigger lands on a
      // status that is no longer 'classifying' and the UPDATE is a no-op).
      await step.run("flip-status-predicted", async () => {
        const { error } = await supabase
          .from("agent_runs")
          .update({ status: "predicted" })
          .eq("id", agent_run_id)
          .eq("status", "classifying");
        if (error) throw new Error(`flip-status-predicted: ${error.message}`);
      });

      // ---- 6) Emit `<swarm_type>/predicted` for the Stage 3.5 dispatcher --
      // Cross-swarm contract: the dispatcher subscribes to `*/predicted` and
      // routes via swarm_intents.handler_status. Zero hardcoded swarm names on
      // the dispatcher side — swarm_type is part of the payload.
      await step.run("emit-predicted", async () => {
        await (inngest.send as unknown as DynamicSend)({
          name: `${SWARM_TYPE}/predicted`,
          data: {
            swarm_type: SWARM_TYPE,
            run_id,
            agent_run_id,
            email_id,
            automation_run_id: automation_run_id ?? null,
            budget_run_id: budget_run_id ?? null,
            ranked: output.ranked,
            language: output.language,
            urgency: output.urgency,
            entity,
          },
        });
      });

      return { run_id, email_id, decision: "predicted" as const };
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
