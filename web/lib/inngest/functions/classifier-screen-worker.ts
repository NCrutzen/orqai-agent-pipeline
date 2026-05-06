// Phase 74 Plan 04 — classifier-screen-worker.
//
// Stage 0 → Stage 1 seam consumer. Listens on `classifier/screen.requested`
// (emitted by stage-0/safety-worker) and produces a Stage-1 verdict via
// registry-driven regex-then-LLM classification.
//
// D-16 step ordering:
//   1. load-swarm-row     — swarms + swarm_categories for event.data.swarm_type
//   2. regex              — dynamic-import swarms.stage1_regex_module (D-03/D-04)
//                           and call its `classify({subject, from, bodySnippet})`.
//                           Skipped (regex outcome 'unknown') when stage1_regex_module
//                           is null (sales-email per D-03).
//   3. llm-call           — only when regex returned 'unknown'. Invokes the
//                           cross-cutting Orq agent `stage-1-category-classifier`
//                           with the call-time closed-category list (D-07).
//                           Persists agent_runs row INSIDE step.run with a
//                           UUID generated INSIDE step.run (Phase 65 replay-
//                           safety learning, CLAUDE.md). Errors caught and
//                           coerced to ('unknown','low') with status='failed'
//                           (D-11). retries:0 — no cascading retries.
//   4. emit-pipeline-event — Phase 70 dual-write of one canonical Stage-1 row.
//   5. emit-verdict        — `classifier/verdict.recorded` via the SendFn cast
//                            pattern from classifier-label-resolver.ts:34
//                            (CLAUDE.md commit dae6276 — NEVER destructure
//                            inngest.send).
//
// REQ-6: ZERO `swarm_type === 'X'` literal branches. Everything is registry-
// driven via swarms + swarm_categories. The static-check test in
// classifier-screen-worker.test.ts enforces this with a regex grep.
//
// Pitfall 6: empty categories list short-circuits to 'unknown' BEFORE the
// LLM call so Orq isn't invoked with an empty <categories> block.
//
// retries:0 — same rationale as Phase 65 workers. Failures surface via
// status='failed' on agent_runs and via predicted_category='unknown' on the
// verdict event; downstream verdict-worker routes 'unknown' through the
// existing label-resolver / manual_review chain.

import { z } from "zod";
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm, loadSwarmCategories } from "@/lib/swarms/registry";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import { numericConfidence } from "@/lib/pipeline-events/types";
import { invokeOrqAgent } from "@/lib/automations/orq-agents/client";

// D-06 output shape. `reasoning` allowed nullable for telemetry-only field.
const Stage1OutputSchema = z.object({
  category_key: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  reasoning: z.string().nullable(),
});

// CLAUDE.md commit dae6276 — never destructure inngest.send; we cast inline
// per call to widen past the strict EventSchemas union.
type SendFn = (p: {
  name: string;
  data: Record<string, unknown>;
}) => Promise<unknown>;

export const classifierScreenWorker = inngest.createFunction(
  { id: "classifier/screen-worker", retries: 0 },
  { event: "classifier/screen.requested" },
  async ({ event, step }) => {
    const {
      automation_run_id,
      email_id,
      message_id,
      source_mailbox,
      subject,
      body_text,
      swarm_type,
      entity,
    } = event.data as {
      automation_run_id: string;
      email_id: string;
      message_id: string;
      source_mailbox: string;
      subject: string;
      body_text: string;
      swarm_type: string;
      entity?: string | null;
    };

    if (!swarm_type) {
      // Registry-driven principle: a missing swarm_type is a Stage 0 emit-site
      // bug, not a silent default. Throw so the caller observes it.
      throw new Error(
        "classifier-screen-worker: event.data.swarm_type is required",
      );
    }

    const admin = createAdminClient();

    // ───── Step 1: load swarm row + categories (D-16.1) ────────────────
    const { swarmRow, categories } = await step.run(
      "load-swarm-row",
      async () => {
        const sw = await loadSwarm(admin, swarm_type);
        if (!sw) {
          throw new Error(`swarms row not found for ${swarm_type}`);
        }
        const cats = await loadSwarmCategories(admin, swarm_type);
        return { swarmRow: sw, categories: cats };
      },
    );

    // ───── Step 2: regex (D-16.2, D-03, D-04) ─────────────────────────
    // Skipped when stage1_regex_module is null (sales-email per D-03).
    const regexOutcome = await step.run("regex", async () => {
      if (!swarmRow.stage1_regex_module) {
        return {
          invoked: false,
          category: "unknown" as string,
          matchedRule: null as string | null,
        };
      }
      // D-04: dynamic import. Errors throw → run fails (D-12). Vite/Vitest
      // resolves the path through its module graph (test mocks the module
      // at the canonical alias).
      const mod = (await import(swarmRow.stage1_regex_module)) as {
        classify: (input: {
          subject: string;
          from: string;
          bodySnippet: string;
        }) => { category: string; matchedRule: string | null };
      };
      const result = mod.classify({
        subject: subject ?? "",
        // sender_email is not on the classifier/screen.requested payload
        // post-Plan-02. The debtor regex's auto_reply / OOO / payment
        // patterns are subject + body driven; a missing `from` doesn't
        // affect classification quality for those branches.
        from: "",
        bodySnippet: (body_text ?? "").slice(0, 2000),
      });
      return {
        invoked: true,
        category: result.category,
        matchedRule: result.matchedRule,
      };
    });

    let finalCategoryKey: string = regexOutcome.category;
    let llmInvoked = false;
    let llmConfidence: "low" | "medium" | "high" | null = null;
    let llmReasoning: string | null = null;
    let llmError: string | null = null;
    let llmCategoryKey: string | null = null;
    let agentRunId: string | null = null;

    // ───── Step 3: LLM call only on regex='unknown' (D-16.3, D-10, D-11) ─
    if (regexOutcome.category === "unknown") {
      // Pitfall 6: empty registry → coerce to 'unknown' BEFORE the LLM call.
      // Filtering `enabled` here also handles the case where every category
      // is disabled mid-flight. registry helpers already filter enabled=true,
      // but we double-check defensively against fixture-supplied rows.
      const enabledCategories = categories.filter((c) => c.enabled !== false);

      if (enabledCategories.length === 0) {
        finalCategoryKey = "unknown";
      } else {
        const llmResult = await step.run("llm-call", async () => {
          // Phase 65 replay-id learning (CLAUDE.md): non-deterministic
          // values used as DB keys MUST be generated INSIDE step.run.
          const id = crypto.randomUUID();
          const inngestRunId = event.id ?? `local-${message_id}`;
          try {
            const result = await invokeOrqAgent(
              "stage-1-category-classifier",
              {
                subject: subject ?? "",
                body_text: body_text ?? "",
                categories: enabledCategories.map((c) => ({
                  category_key: c.category_key,
                  display_label: c.display_label,
                })),
              },
            );
            const parsed = Stage1OutputSchema.parse(result.raw);
            // D-10 confidence gate: 'low' coerces to 'unknown'.
            const finalKey =
              parsed.confidence === "low" ? "unknown" : parsed.category_key;

            const insertSuccess = await admin.from("agent_runs").insert({
              id,
              swarm_type,
              automation_run_id: automation_run_id ?? null,
              email_id,
              inngest_run_id: inngestRunId,
              entity: entity ?? null,
              status: "predicted",
              confidence: parsed.confidence,
              reasoning: parsed.reasoning,
              tool_outputs: {
                stage1_category: parsed.category_key,
                gated_to: finalKey,
              },
            });
            if (insertSuccess.error) {
              // Log + throw so the catch block writes a 'failed' agent_runs
              // row AND surfaces the schema/CHECK violation in the Inngest
              // run log instead of silently no-op'ing.
              console.error(
                `[classifier-screen-worker] agent_runs insert failed:`,
                insertSuccess.error,
              );
              throw new Error(
                `agent_runs insert failed: ${insertSuccess.error.message}`,
              );
            }

            return {
              id,
              category_key: parsed.category_key,
              confidence: parsed.confidence,
              reasoning: parsed.reasoning,
              finalKey,
              error: null as string | null,
            };
          } catch (err) {
            // D-11: coerce to ('unknown', 'low'); persist error_message
            // AND tool_outputs.error. Do NOT rethrow — the run continues
            // through pipeline_events emit + verdict emit.
            const msg = err instanceof Error ? err.message : String(err);
            const failureInsert = await admin.from("agent_runs").insert({
              id,
              swarm_type,
              automation_run_id: automation_run_id ?? null,
              email_id,
              inngest_run_id: inngestRunId,
              entity: entity ?? null,
              status: "failed",
              confidence: "low",
              reasoning: null,
              error_message: msg,
              tool_outputs: { error: msg },
            });
            if (failureInsert.error) {
              // Even the failure-path INSERT failed — log loudly so the
              // Inngest run log shows the underlying schema issue. Do NOT
              // re-throw (D-11: pipeline must continue to emit verdict).
              console.error(
                `[classifier-screen-worker] failure-path agent_runs insert ALSO failed:`,
                failureInsert.error,
              );
            }
            return {
              id,
              category_key: "unknown",
              confidence: "low" as const,
              reasoning: null,
              finalKey: "unknown",
              error: msg,
            };
          }
        });

        llmInvoked = true;
        agentRunId = llmResult.id;
        llmConfidence = llmResult.confidence;
        llmReasoning = llmResult.reasoning;
        llmError = llmResult.error;
        llmCategoryKey = llmResult.category_key;
        finalCategoryKey = llmResult.finalKey;
      }
    }

    // ───── Step 4: pipeline_events dual-write (D-16.4) ────────────────
    await step.run("emit-pipeline-event", async () => {
      await emitPipelineEvent(admin, {
        swarm_type,
        stage: 1,
        email_id,
        decision: finalCategoryKey,
        confidence: numericConfidence(llmConfidence ?? null),
        decision_details: {
          regex: regexOutcome,
          llm_invoked: llmInvoked,
          llm_category_key: llmCategoryKey,
          llm_confidence: llmConfidence,
          llm_reasoning: llmReasoning,
          llm_error: llmError,
          final_category_key: finalCategoryKey,
          entity: entity ?? null,
        },
        agent_run_id: agentRunId,
        automation_run_id: automation_run_id ?? null,
        triggered_by: "pipeline",
      });
    });

    // ───── Step 5: emit verdict (D-16.5) ──────────────────────────────
    // CLAUDE.md commit dae6276 — inline cast, NEVER destructure inngest.send.
    // decision='approve' matches the existing classifier-verdict-worker
    // contract: verdict-worker dispatches via swarm_categories.action, not
    // via decision; preserve those semantics.
    await step.run("emit-verdict", async () =>
      (inngest.send as unknown as SendFn)({
        name: "classifier/verdict.recorded",
        data: {
          automation_run_id,
          swarm_type,
          decision: "approve",
          message_id,
          source_mailbox,
          predicted_category: finalCategoryKey,
          override_category: null,
        },
      }),
    );

    return {
      ok: true,
      regex_category: regexOutcome.category,
      llm_invoked: llmInvoked,
      final_category_key: finalCategoryKey,
    };
  },
);
