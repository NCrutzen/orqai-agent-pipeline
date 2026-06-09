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
// Phase 113 Plan 02 (Q1 seam) — the per-swarm Stage 3 OUTPUT-schema lookup.
// This is the swarm-agnostic map that replaces a literal swarm branch: the
// coordinator names NO swarm — it looks the schema up by the derived
// swarm_type key. The sales schema is imported by THIS registry file, never
// by the coordinator, so the coordinator carries zero sales import/literal.
import { intentSchemaForSwarm } from "@/lib/automations/debtor-email/coordinator/intent-schema-registry";
import { loadSwarm } from "@/lib/swarms/registry";
// Phase 113 Plan 05 (D-08 / D-09) — the swarm-agnostic Stage-3 ROUTING gate.
// Read BEFORE the predicted-emit; when gated, persist the verdict (already done
// by persist-ranked) but withhold flip-status-predicted + emit-predicted so the
// dispatcher never fires (routing held in dry-run observation). Registry-driven,
// fail-closed, NO swarm-name literal. Seeded debtor=open (live emit preserved) /
// sales=gated. The dispatcher (stage-3-dispatcher.ts) is NEVER edited — the hold
// is achieved by the coordinator withholding the emit, the classifier-owned seam.
import { isStage3RoutingGated } from "@/lib/pipeline-gating/dry-run-gate";
import {
  createRun,
  findCachedOutput,
  mergeToolOutputs,
  updateRun,
} from "@/lib/automations/debtor-email/coordinator/agent-runs";
import {
  INTENT_VERSION_V2,
  INTENT_VERSION_V3,
  type IntentAgentOutputV2,
  type IntentAgentOutputV3,
} from "@/lib/automations/debtor-email/coordinator/types";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import { numericConfidence } from "@/lib/pipeline-events/types";
import { TENANT_DOMAINS_BY_SWARM } from "@/lib/automations/debtor-email/coordinator/tenant-domains.generated";

// Phase 110 Plan 03 (SWARM-02) — the module-level swarm-type constant was
// retired. swarm_type now derives per-invocation from the event payload
// (event.data.swarm_type, with the event-name prefix as fallback), mirroring
// the already-generic stage-3-dispatcher.ts. This makes the coordinator the
// shared cross-swarm Stage 3 runner: 113's sales-intent-agent dispatches
// through it with zero further edits. Tenant domains + the
// `<swarm_type>/predicted` emit + coordinator_runs.swarm_type are all keyed
// off the derived value inside the handler body below.

// Phase 83 Plan 06 (D-09) — hard cap on the Stage 3 assembled input.
const STAGE_3_INPUT_CAP_CHARS = 8000;

// Stage 3 now emits the canonical typed `pipeline/predicted` event (a literal
// key in Events), so `inngest.send` is called directly — no dynamic-name cast
// needed. CLAUDE.md / Phase 65 dae6276: never alias inngest.send (loses
// `this`-binding); always call inngest.send(...) inline.

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
  // Phase 110 Plan 03 — wildcard trigger, mirroring stage-3-dispatcher.ts:51.
  // Fan-in from every swarm's Stage 2 producer (`<swarm>/coordinator.requested`).
  // Canonical cross-swarm fan-in. Inngest matches event names EXACTLY — the
  // former `*/coordinator.requested` glob never matched `<swarm>/coordinator.
  // requested`, so the coordinator silently received ZERO events (debtor + sales
  // Stage 3 dead since the glob shipped). Every ranked-intent swarm's Stage 2
  // producer now emits the single `pipeline/coordinator.requested` event with
  // `swarm_type` in the payload; a new swarm needs no change here.
  { event: "pipeline/coordinator.requested" },
  async ({ event, step }) => {
    // The canonical event carries the coordinator payload + a REQUIRED
    // swarm_type (the routing discriminator). No event-name fallback: the
    // shared event name ("pipeline/...") is no longer swarm-bearing.
    const email = event.data;
    const { email_id } = email;
    // swarm_type is authoritative from the payload (SWARM-02 — data-driven, not
    // a literal branch). Deterministic, safe to derive outside step.run.
    const swarm_type = email.swarm_type;
    // Phase 110 Plan 03 — tenant domains keyed by the DERIVED swarm_type, with
    // a fail-closed empty default (T-110-07): an unknown swarm_type yields an
    // empty domain list rather than throwing. Spread to a fresh mutable
    // string[] because the generated map value is `readonly` (`as const`) and
    // assembleInput expects string[].
    const TENANT_DOMAINS: string[] = [
      ...(TENANT_DOMAINS_BY_SWARM[
        swarm_type as keyof typeof TENANT_DOMAINS_BY_SWARM
      ] ?? []),
    ];
    // Phase 66: event shape widened entity to `string | null | undefined`
    // (the new coordinator.requested event is producer-agnostic). Coerce to
    // the strict ENTITY union here — the debtor producer (label-resolver)
    // reads entity from labeling_settings.entity which is the same union, and
    // a missing value defaults to "smeba" (debiteuren-mailbox baseline). Phase
    // 110 Plan 03: sales ingest writes entity:null — the `?? "smeba"` default
    // preserves debtor behavior; downstream consumers that don't need entity
    // (sales) simply ignore it. Widen the cast target to accept the union; the
    // debtor default is NOT dropped.
    const entity = (email.entity ?? "smeba") as
      | "smeba"
      | "berki"
      | "sicli-noord"
      | "sicli-sud"
      | "smeba-fire";
    const sender_domain = email.sender_domain ?? "";
    const inngest_run_id = event.id ?? `local-${email_id}`;
    const supabase = createAdminClient();

    // ---- Phase 113 Plan 02 (Q1 seam) — per-swarm Stage 3 dispatch -----------
    // Resolve the per-swarm Orq agent KEY from the DB registry
    // (swarms.stage3_coordinator_agent_key) and the per-swarm output SCHEMA from
    // the swarm-keyed map. Both are looked up by the DERIVED swarm_type — the
    // coordinator names NO swarm. This realizes the per-swarm classifier
    // dispatch as a registry + map lookup (Phase 110 D-07), NOT a dispatcher
    // edit and NOT a literal `if (swarm_type === ...)` branch. Debtor is
    // byte-neutral: its registry key is "debtor-intent-agent" (or the fail-safe
    // default) and its schema is the V2/V3 tolerant union — identical to the
    // pre-parameterization invoke. A third swarm onboards with a schema-map
    // entry + a registry row and ZERO coordinator edits.
    const stage3AgentKey = await step.run("load-swarm-agent-key", async () => {
      const swarmRow = await loadSwarm(supabase, swarm_type);
      // Fail-safe to the debtor agent when the registry row is missing or the
      // key column is null — a misconfiguration must not cross-dispatch.
      return swarmRow?.stage3_coordinator_agent_key ?? "debtor-intent-agent";
    });
    // Pure lookup (no DB) — resolve OUTSIDE step.run. Fail-safe to the debtor
    // schema for an unknown/misconfigured swarm_type (the codegen invariant
    // guarantees sales always has an entry post-Plan-03).
    const stage3Schema = intentSchemaForSwarm(swarm_type);

    // CLAUDE.md / Inngest pitfall: any non-deterministic value used inside
    // step.run side-effects (DB writes keyed on it) MUST be generated inside
    // step.run, otherwise replays regenerate it and INSERT/UPDATE race onto
    // different keys. run_id is the coordinator_runs PK and joins every
    // downstream step — has to be stable across replays.
    const run_id = await step.run("resolve-run-id", async () =>
      email.run_id ??
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? (crypto as { randomUUID(): string }).randomUUID()
          : `local-${email_id}-${Date.now()}`),
    );
    const automation_run_id = email.automation_run_id;
    const budget_run_id = email.budget_run_id;

    // ---- 1) Resolve agent_run_id (caller-provided OR create a fresh row) ----
    const agent_run_id = await step.run("create-agent-run", async () => {
      if (email.agent_run_id) return email.agent_run_id;
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
        swarm_type,
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

          // Phase 85 D-07 — cache-key flips to V3. Version-literal flip
          // automatically invalidates V2 cache rows (findCachedOutput filters
          // on `intent_version = INTENT_VERSION_V3`). Transient window: until
          // Plan 03 deploys the V3 agent prompt, cache-miss → V2 output stored
          // under V3 cache key. The discriminated union accepts both shapes
          // so no run breaks; rows naturally re-key once V3 ships (PATTERNS §A).
          const cached = await findCachedOutput<Record<string, unknown>>(
            supabase,
            email_id,
            "intent_version",
            INTENT_VERSION_V3,
            "tool_outputs",
          );
          const cachedFirst = cached?.intent_first_pass as
            | IntentAgentOutputV2
            | IntentAgentOutputV3
            | undefined;

          // Cache hit reuses the prior LLM output but MUST still hoist it
          // onto THIS agent_run_id — otherwise duplicate triggers for the
          // same email_id (manual replay scripts, upstream redelivery) leave
          // the new agent_runs row with intent=null + tool_outputs={}.
          const output: IntentAgentOutputV2 | IntentAgentOutputV3 = cachedFirst
            ?? (await invokeIntentAgent(
              {
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
              },
              // Phase 113 Plan 02 (Q1 seam) — the SINGLE parameterized invoke.
              // Per-swarm agent key (from the DB registry) + per-swarm output
              // schema (from the swarm-keyed map). For debtor these resolve to
              // "debtor-intent-agent" + the V2/V3 union — byte-neutral. Sales
              // dispatches through THIS same call with no second code path.
              { agent_key: stage3AgentKey, schema: stage3Schema },
            )).output;

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
            // Phase 85 D-07 — provenance sourced from the LLM response, not
            // a hardcoded constant. Audit trail now records the actual
            // intent_version the agent returned (V2 or V3).
            intent_version: output.intent_version,
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
        output: IntentAgentOutputV2 | IntentAgentOutputV3;
        inputSize: { input_chars: number; truncated: boolean };
      }).output;
      const inputSize = (classifyResult as unknown as {
        output: IntentAgentOutputV2 | IntentAgentOutputV3;
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
          swarm_type,
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
            // Phase 85 D-07 — intent_version reflects the actual agent output
            // shape (V2 or V3), not a hardcoded constant.
            intent_version: output.intent_version,
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
            // Phase 85 D-04 — additive telemetry, only present on V3 outputs.
            // Phase 86 reads from this JSONB to build the proposal-capture
            // surface. Closed-list path (proposal=null) still emits the keys
            // for shape stability; open-set path carries the snake_case
            // candidate + reason. NO `swarm_intents` write — intents live
            // only in JSONB telemetry per V9.0 promotion gating.
            ...(output.intent_version === INTENT_VERSION_V3 && {
              intent_proposal: output.intent_proposal,
              proposal_reason: output.proposal_reason,
            }),
            // Phase 113 Plan 02 (Q1 seam) — additive, swarm-agnostic axis.
            // The sales schema sets entity_relationship; the debtor schema
            // lacks the field so it reads `undefined` and is omitted. No schema
            // migration, no swarm name — a pure `!= null` guard on JSONB.
            ...((output as { entity_relationship?: unknown }).entity_relationship !=
              null && {
              entity_relationship: (output as { entity_relationship?: unknown })
                .entity_relationship,
            }),
          },
          agent_run_id,
          automation_run_id: automation_run_id ?? null,
          triggered_by: "pipeline",
        });
      });

      // ---- 4.5) Stage-3 ROUTING gate (Phase 113 Plan 05, D-08 / D-09) -------
      // Swarm-agnostic, registry-driven, fail-closed. Sits BETWEEN persist-ranked
      // (the verdict is already on coordinator_runs + pipeline_events → visible in
      // Bulk Review) and flip-status-predicted / emit-predicted. When ROUTING is
      // GATED for this swarm (dry_run_config.stage_3_routing=true), the
      // predicted-emit is WITHHELD so the Stage 3.5 dispatcher never fires and
      // Kanban routing is held — D-08 dry-run observation. The verdict stays
      // visible; routing is the only thing held. When OPEN (false), the
      // flip+emit run exactly as before (debtor's live path — seeded false).
      //
      // CRITICAL debtor-neutrality (T-113-10): this reads the DEDICATED
      // `stage_3_routing` key (NOT stage_3_labeling). debtor is seeded
      // stage_3_routing=false → OPEN → its predicted-emit fires every run,
      // byte-identical to today. NO `if (swarm_type === ...)` branch — the gate
      // is purely a registry read keyed by the derived swarm_type. The shared
      // dispatcher is untouched: the hold is achieved by the coordinator
      // (the per-swarm classifier dispatch point) withholding the emit.
      //
      // Held-state marker: when held we stamp coordinator_runs.decision_details
      // .routing_held=true so the dead-letter reconciliation (Plan 05 Task 2)
      // counts a HELD verdict as a TERMINAL, visible state — never a dead-letter.
      const routingGated = await step.run("load-stage3-routing-gate", async () => {
        const swarmRow = await loadSwarm(supabase, swarm_type);
        return isStage3RoutingGated(swarmRow);
      });

      if (routingGated) {
        // GATED — persist the held-state marker and SKIP flip+emit. The verdict
        // is already visible (persist-ranked). The dispatcher never fires.
        await step.run("mark-routing-held", async () => {
          const { error } = await supabase
            .from("coordinator_runs")
            .update({
              decision_details: { routing_held: true },
              completed_at: new Date().toISOString(),
            })
            .eq("run_id", run_id);
          if (error) throw new Error(`mark-routing-held: ${error.message}`);
        });
        // Terminal, visible, NON-dead-letter outcome. agent_runs stays in
        // 'classifying' on purpose: the predicted-emit is the flip's only
        // consumer, and holding it means routing is held — Bulk Review reads
        // coordinator_runs.ranked_intents for the verdict regardless of the
        // agent_runs status. A green-light flip (stage_3_routing→false) lets
        // subsequent runs flip+emit normally (reversible per D-09).
        return { run_id, email_id, decision: "predicted_held" as const };
      }

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

      // ---- 6) Emit canonical `pipeline/predicted` for the Stage 3.5 dispatcher
      // Cross-swarm contract: the dispatcher subscribes to the single
      // `pipeline/predicted` event and routes via swarm_intents.handler_status,
      // reading swarm_type from the payload (the event name is swarm-agnostic).
      await step.run("emit-predicted", async () => {
        await inngest.send({
          name: "pipeline/predicted",
          data: {
            swarm_type,
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
