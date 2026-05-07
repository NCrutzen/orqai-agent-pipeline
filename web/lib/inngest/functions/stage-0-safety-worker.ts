/**
 * Phase 64 — Stage 0 Input Safety Worker.
 *
 * Requirements: SAFE-01, SAFE-02, SAFE-03, BUDG-01.
 * Pitfalls mitigated:
 *   - Pitfall 1 — `retries: 0` so a budget-breach or LLM error never gets
 *     auto-retried (cost amplification). Failures land in the Kanban queue.
 *   - Pitfall 5 — `event.data.safety_overridden=true` short-circuits Stage 0
 *     and forwards directly to the classifier (operator-driven re-emit only).
 *   - Pitfall 6 — every side effect (`inngest.send`, DB write) is wrapped in
 *     `step.run` so Inngest replay never re-fires events.
 *
 * Wiring:
 *   trigger:  stage-0/email.received   (emitted by /ingest route)
 *   on safe:  classifier/screen.requested  → Stage 1
 *   on breach: pipeline/budget_breached    → budget-breach-handler
 *   on suspected: NO classifier emit; persists topic='safety_review' for HITL
 *
 * Persistence:
 *   automation_runs row written with the canonical Stage 0 result jsonb shape
 *   (RESEARCH Pattern 2). topic='safety_review' on injection_suspected,
 *   topic=null on safe.
 */

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import { regexScreen } from "@/lib/stage-0/regex-screen";
import { llmInjectionVerdict } from "@/lib/stage-0/llm-verdict";
import { OrqClientTimeoutError } from "@/lib/automations/orq-agents/client";
import {
  check as budgetCheck,
  type BudgetState,
} from "@/lib/stage-0/budget-counter";

export const stage0SafetyWorker = inngest.createFunction(
  { id: "stage-0/safety-worker", retries: 0 },
  { event: "stage-0/email.received" },
  async ({ event, step }) => {
    const data = event.data as {
      automation_run_id: string;
      email_id: string;
      message_id?: string;
      source_mailbox?: string;
      subject: string;
      // Production payload uses body_text; Plan 01 RED test uses body.
      // Worker accepts either to pin both contracts.
      body_text?: string;
      body?: string;
      entity?: string | null;
      mailbox_id?: number | null;
      safety_overridden?: boolean;
      // Phase 74 D-01 / D-02 — threaded from ingest route.
      swarm_type?: string;
    };

    const {
      automation_run_id,
      email_id,
      message_id = "",
      source_mailbox = "",
      subject,
      safety_overridden,
      entity = null,
      mailbox_id = null,
    } = data;
    const body = data.body_text ?? data.body ?? "";
    // Phase 74 D-01 — swarm_type is threaded from the ingest route via
    // events.ts schema (required field). The Stage-1 worker (Plan 04)
    // dispatches registry lookups per-swarm based on this value.
    if (!data.swarm_type) {
      throw new Error(
        "stage-0/safety-worker: missing event.data.swarm_type (required per Phase 74 D-01)",
      );
    }
    const swarm_type = data.swarm_type;
    // Phase 74 — staleChannel derived per-swarm so future swarms
    // (sales-email etc.) get their own realtime channel without code change.
    const staleChannel = `${swarm_type}-review`;

    const admin = createAdminClient();

    // Pitfall 5 — operator-driven safety override. Skip Stage 0 entirely.
    if (safety_overridden) {
      await step.run("emit-classifier-override", () =>
        inngest.send({
          name: "classifier/screen.requested",
          data: {
            automation_run_id,
            email_id,
            message_id,
            source_mailbox,
            subject,
            body_text: body,
            // Phase 74 D-01 / D-02 — threaded passthrough.
            swarm_type,
            entity,
            safety_overridden: true,
          },
        }),
      );
      return { skipped: "safety_overridden" } as const;
    }

    // Step 1 — pure regex screen (audit only; does NOT decide on its own).
    const regexResult = await step.run("regex-screen", () => regexScreen(body));

    // Step 2 — LLM verdict (Orq.ai, registry-driven).
    //
    // Phase 999.4 Fix B (D-02) — fail-open coercion on client deadline:
    // when the Orq fetch hits CLIENT_DEADLINE_MS (45s) and throws
    // OrqClientTimeoutError, return a synthetic verdict='safe' so the
    // pipeline forwards to Stage 1 (`classifier/screen.requested`) instead
    // of stranding the row in safety_review. The infrastructure failure
    // is auditable via `result.llm_reason` starting `timeout: client_deadline_exceeded`.
    //
    // Selectivity (Pitfall 1) — ONLY OrqClientTimeoutError is coerced.
    // Parse / schema / non-abort transport errors propagate so genuine
    // bugs surface in the worker's failure path.
    const llmResult = await step.run("llm-verdict", async () => {
      try {
        return await llmInjectionVerdict({ email_id, body, subject });
      } catch (err) {
        if (
          err instanceof OrqClientTimeoutError ||
          (err as { name?: string } | undefined)?.name === "OrqClientTimeoutError"
        ) {
          return {
            verdict: "safe" as const,
            reason: `timeout: client_deadline_exceeded — ${(err as Error).message}`,
            matched_span: null,
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
              cost_cents: 0,
            },
          };
        }
        throw err;
      }
    });

    // Step 3 — per-invocation budget guard (D-15).
    const budgetState: BudgetState = {
      cost_cents: llmResult.usage.cost_cents,
      token_count: llmResult.usage.total_tokens,
    };
    const budgetVerdict = await step.run("check-budget", () =>
      budgetCheck(budgetState),
    );

    if (budgetVerdict.breached) {
      // BUDG-01 / D-13 — breach is DATA, not exception. Emit and halt.
      await step.run("emit-budget-breach", () =>
        inngest.send({
          name: "pipeline/budget_breached",
          data: {
            automation_run_id,
            email_id,
            budget: budgetState,
            reason: budgetVerdict.reason ?? "budget breach",
          },
        }),
      );
      await emitAutomationRunStale(admin, staleChannel);
      return { halted: true } as const;
    }

    // Step 4 — persist verdict to automation_runs.
    const isInjection = llmResult.verdict === "injection_suspected";
    await step.run("persist-verdict", async () => {
      const { error } = await admin.from("automation_runs").insert({
        automation: staleChannel,
        status: isInjection ? "predicted" : "completed",
        swarm_type,
        topic: isInjection ? "safety_review" : null,
        entity,
        mailbox_id,
        result: {
          stage: "stage_0_safety",
          email_id,
          message_id,
          source_mailbox,
          verdict: llmResult.verdict,
          regex_matched: regexResult.matched,
          llm_reason: llmResult.reason,
          matched_span: llmResult.matched_span,
          cost_cents: llmResult.usage.cost_cents,
          token_count: llmResult.usage.total_tokens,
          safety_overridden: false,
        },
        triggered_by: "stage-0/safety-worker",
        completed_at: new Date().toISOString(),
      });
      if (error) {
        throw new Error(`automation_runs insert failed: ${error.message}`);
      }

      // Phase 70 — TELE-01 dual-write
      await emitPipelineEvent(admin, {
        swarm_type,
        stage: 0,
        email_id,
        decision: llmResult.verdict,
        confidence: null,
        decision_details: {
          regex_matched: regexResult.matched,
          llm_reason: llmResult.reason,
          matched_span: llmResult.matched_span,
          safety_overridden: false,
        },
        cost_cents: llmResult.usage.cost_cents,
        automation_run_id: automation_run_id ?? null,
        triggered_by: "pipeline",
      });
    });

    // Step 5 — forward to classifier ONLY on safe verdict.
    if (llmResult.verdict === "safe") {
      await step.run("forward-to-classifier", () =>
        inngest.send({
          name: "classifier/screen.requested",
          data: {
            automation_run_id,
            email_id,
            message_id,
            source_mailbox,
            subject,
            body_text: body,
            // Phase 74 D-01 / D-02 — threaded passthrough.
            swarm_type,
            entity,
          },
        }),
      );
    }

    await emitAutomationRunStale(admin, staleChannel);

    return {
      verdict: llmResult.verdict,
      regex_matched: regexResult.matched,
      cost_cents: llmResult.usage.cost_cents,
      token_count: llmResult.usage.total_tokens,
    };
  },
);
