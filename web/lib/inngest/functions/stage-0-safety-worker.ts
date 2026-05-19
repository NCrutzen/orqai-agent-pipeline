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
 * Phase 82.2-04 D-01/D-02 — single-emit refactor. All three code paths
 * (operator-override, budget-breach, main-path) fall through to ONE
 * `emitPipelineEvent` call inside the single `persist-and-emit` step.run.
 * Sub-type discriminator: `decision_details.emit_source` ∈
 * {operator-override, budget-breach, main-path}. New branches added later
 * cannot forget to emit because emission is mechanically guaranteed by the
 * function exit path — not a per-branch responsibility.
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
 *   topic=null on safe. Operator-override path SKIPs automation_runs writes
 *   (preserves pre-82.2-04 behavior: override branch never wrote to
 *   automation_runs — the operator-side surface owns that state).
 */

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import { regexScreen } from "@/lib/stage-0/regex-screen";
import { llmInjectionVerdict } from "@/lib/stage-0/llm-verdict";
import { stripQuotedHistory } from "@/lib/stage-0/strip-quoted-history";
import { normalizeBody } from "@/lib/stage-0/normalize-body";
import { OrqClientTimeoutError } from "@/lib/automations/orq-agents/client";
import {
  check as budgetCheck,
  type BudgetState,
} from "@/lib/stage-0/budget-counter";

/**
 * Phase 82.2-04 D-01 — discriminated union describing which branch reached
 * the single emit point. `kind` becomes `decision_details.emit_source`.
 */
type VerdictSource =
  | { kind: "operator-override" }
  | { kind: "budget-breach"; budget: BudgetState; reason: string }
  | {
      kind: "main-path";
      verdict: "safe" | "injection_suspected";
      regex_matched: string | null;
      llm_reason: string;
      matched_span: string | null;
      cost_cents: number;
      total_tokens: number;
      strip_changed: boolean;
      strip_delta_chars: number;
      strip_fallback_reason: string | null;
      normalize_changed: boolean;
      normalize_delta_chars: number;
      normalize_removed: string;
      normalize_fallback_reason: string | null;
    };

type DownstreamEmit =
  | { name: "classifier/screen.requested"; data: Record<string, unknown> }
  | { name: "pipeline/budget_breached"; data: Record<string, unknown> }
  | null;

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
      // Phase 82.2 Plan 07 D-A — passthrough to Stage 1 (Plan 06 thick worker
      // writes the iController-cleanup audit row using these fields).
      from?: string | null;
      fromName?: string | null;
      receivedAt?: string | null;
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
      from = null,
      fromName = null,
      receivedAt = null,
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

    // ---------------------------------------------------------------------
    // Branch resolution. Each branch sets `verdictSource` + optionally
    // `downstreamEmit`, then FALLS THROUGH to the single persist-and-emit
    // step at the bottom. No branch returns early; the single-emit
    // invariant (D-01) is mechanically enforced by the function shape.
    // ---------------------------------------------------------------------
    let verdictSource: VerdictSource;
    let downstreamEmit: DownstreamEmit = null;

    // Pitfall 5 — operator-driven safety override. Skip Stage 0 verdict
    // computation entirely but still emit a pipeline_events row so the
    // override is observable in telemetry (Phase 82.2-04 D-01).
    if (safety_overridden) {
      verdictSource = { kind: "operator-override" };
      downstreamEmit = {
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
          // Phase 82.2 Plan 07 D-A — passthrough so Plan 06 thick Stage 1
          // worker can write auto-action audit rows without re-fetching.
          mailbox_id,
          from,
          fromName,
          receivedAt,
          safety_overridden: true,
        },
      };
    } else {
      // Stage-0-only body normalization. Strips Outlook / Mimecast / Q2Q
      // chrome (zero-width signature walls, "CAUTION: External Sender",
      // "Internal (…) / External (…)" envelope lines, "Protection by Q2Q"
      // banner) that the safety LLM was reading as injection signals.
      // Original body still flows to Stage 1 (Pitfall 4 below).
      const normalizeResult = await step.run("normalize-body", () =>
        normalizeBody(body),
      );

      // Phase 999.7 — strip quoted reply history before any classifier sees
      // the body. Sole consumer of the stripped body is Stage 0 (regex screen +
      // LLM verdict). The ORIGINAL body is forwarded to Stage 1 unchanged
      // (RESEARCH.md Pitfall 4) so noise rules like auto-reply / OOO that
      // depend on full-thread markers still fire.
      const stripResult = await step.run("strip-quoted-history", () =>
        stripQuotedHistory(normalizeResult.normalized),
      );
      const classifierBody = stripResult.stripped;

      // Step 1 — pure regex screen (audit only; does NOT decide on its own).
      const regexResult = await step.run("regex-screen", () =>
        regexScreen(classifierBody),
      );

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
          return await llmInjectionVerdict({
            email_id,
            body: classifierBody,
            subject,
          });
        } catch (err) {
          if (
            err instanceof OrqClientTimeoutError ||
            (err as { name?: string } | undefined)?.name ===
              "OrqClientTimeoutError"
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
        verdictSource = {
          kind: "budget-breach",
          budget: budgetState,
          reason: budgetVerdict.reason ?? "budget breach",
        };
        downstreamEmit = {
          name: "pipeline/budget_breached",
          data: {
            automation_run_id,
            email_id,
            budget: budgetState,
            reason: budgetVerdict.reason ?? "budget breach",
          },
        };
      } else {
        // Main path — set verdictSource and (for safe verdict) downstream emit.
        verdictSource = {
          kind: "main-path",
          verdict: llmResult.verdict,
          regex_matched: regexResult.matched,
          llm_reason: llmResult.reason,
          matched_span: llmResult.matched_span,
          cost_cents: llmResult.usage.cost_cents,
          total_tokens: llmResult.usage.total_tokens,
          strip_changed: stripResult.changed,
          strip_delta_chars: stripResult.delta_chars,
          strip_fallback_reason: stripResult.fallback_reason ?? null,
          normalize_changed: normalizeResult.changed,
          normalize_delta_chars: normalizeResult.delta_chars,
          normalize_removed: normalizeResult.removed,
          normalize_fallback_reason: normalizeResult.fallback_reason ?? null,
        };
        if (llmResult.verdict === "safe") {
          downstreamEmit = {
            name: "classifier/screen.requested",
            data: {
              automation_run_id,
              email_id,
              message_id,
              source_mailbox,
              subject,
              // Phase 999.7 Pitfall 4 — forward ORIGINAL body to Stage 1
              // (NOT classifierBody). Stage 1 noise filter needs full-thread
              // markers (auto-reply / OOO).
              body_text: body,
              // Phase 74 D-01 / D-02 — threaded passthrough.
              swarm_type,
              entity,
              // Phase 82.2 Plan 07 D-A — passthrough so Plan 06 thick Stage 1
              // worker can write the iController-cleanup audit row (which
              // previously lived in /ingest auto-action branch) without an
              // extra DB lookup. Sales-email may receive nulls — that path
              // has no auto-action chain.
              mailbox_id,
              from,
              fromName,
              receivedAt,
            },
          };
        }
      }
    }

    // -----------------------------------------------------------------------
    // Phase 82.2-04 D-01 — single persist-and-emit step.run.
    //
    // Atomicity (replay safety): automation_runs write + emitPipelineEvent +
    // downstream send all share ONE step.run boundary. Inngest replay
    // atomically retries the whole unit; the partial UNIQUE index
    // `pipeline_events_one_per_stage_email (email_id, swarm_type, stage)
    // WHERE email_id IS NOT NULL` (Plan 82.2-01) makes the emit idempotent
    // by absorbing the second-replay 23505. The downstream send is
    // fire-and-forget per Inngest semantics — re-sends produce the same
    // event id under Inngest's own dedup.
    //
    // Replay-safety check (CLAUDE.md Phase 65 / commit dd2583a):
    // `completedAt = new Date().toISOString()` is generated INSIDE step.run
    // so it stays stable across replays.
    // -----------------------------------------------------------------------
    await step.run("persist-and-emit", async () => {
      const completedAt = new Date().toISOString();

      // 1. automation_runs side: per-branch semantics.
      if (verdictSource.kind === "operator-override") {
        // Operator-override preserves pre-82.2-04 behavior: no automation_runs
        // write here. The operator surface that issued the override owns the
        // run row's state machine.
      } else if (verdictSource.kind === "budget-breach") {
        // BUDG-01 — preserve pre-82.2-04 contract: the worker does NOT
        // write to automation_runs on budget-breach. The downstream
        // `budget-breach-handler` (Inngest function listening on
        // `pipeline/budget_breached`) owns the status='failed' flip on
        // the originating run AND files a new human-review Kanban row.
        // Writing here would double-write with that handler.
      } else {
        // main-path — preserve the pre-refactor UPDATE-by-id + INSERT-fallback
        // pattern (Phase 82.x orphan-placeholder fix). UPDATE-by-id+status=pending
        // is replay-safe by design: the second replay's UPDATE matches zero
        // rows because status is no longer 'pending'.
        const isInjection = verdictSource.verdict === "injection_suspected";
        const verdictResult = {
          stage: "stage_0_safety",
          email_id,
          message_id,
          source_mailbox,
          verdict: verdictSource.verdict,
          regex_matched: verdictSource.regex_matched,
          llm_reason: verdictSource.llm_reason,
          matched_span: verdictSource.matched_span,
          cost_cents: verdictSource.cost_cents,
          token_count: verdictSource.total_tokens,
          safety_overridden: false,
          // Phase 999.7 — strip telemetry
          strip_changed: verdictSource.strip_changed,
          strip_delta_chars: verdictSource.strip_delta_chars,
          strip_fallback_reason: verdictSource.strip_fallback_reason,
          // Stage-0 body normalization telemetry
          normalize_changed: verdictSource.normalize_changed,
          normalize_delta_chars: verdictSource.normalize_delta_chars,
          normalize_removed: verdictSource.normalize_removed,
          normalize_fallback_reason: verdictSource.normalize_fallback_reason,
        };
        if (automation_run_id) {
          const { error } = await admin
            .from("automation_runs")
            .update({
              status: isInjection ? "predicted" : "completed",
              topic: isInjection ? "safety_review" : null,
              result: verdictResult,
              triggered_by: "stage-0/safety-worker",
              completed_at: completedAt,
            })
            .eq("id", automation_run_id)
            .eq("status", "pending");
          if (error) {
            throw new Error(
              `automation_runs update failed (id=${automation_run_id}): ${error.message}`,
            );
          }
        } else {
          const { error } = await admin.from("automation_runs").insert({
            automation: staleChannel,
            status: isInjection ? "predicted" : "completed",
            swarm_type,
            topic: isInjection ? "safety_review" : null,
            entity,
            mailbox_id,
            result: verdictResult,
            triggered_by: "stage-0/safety-worker",
            completed_at: completedAt,
          });
          if (error) {
            throw new Error(`automation_runs insert failed: ${error.message}`);
          }
        }
      }

      // 2. pipeline_events emit — ALWAYS, per Phase 82.2-04 D-01.
      //
      // Idempotency via the partial UNIQUE index from Plan 82.2-01: on
      // replay the second INSERT fails with 23505. Wrap in try/catch and
      // treat unique-violation as success — the row from the first attempt
      // is the canonical record.
      const { decision, decisionDetails } = computeEmitPayload(verdictSource);
      try {
        await emitPipelineEvent(admin, {
          swarm_type,
          stage: 0,
          email_id,
          decision,
          confidence: null,
          decision_details: decisionDetails,
          cost_cents:
            verdictSource.kind === "main-path"
              ? verdictSource.cost_cents
              : verdictSource.kind === "budget-breach"
                ? verdictSource.budget.cost_cents
                : null,
          automation_run_id: automation_run_id ?? null,
          triggered_by: "pipeline",
        });
      } catch (err) {
        // Postgres SQLSTATE 23505 = unique_violation. PostgREST surfaces this
        // via `error.code` in PostgrestError. The error thrown above is a
        // generic Error built from `pipeline_events insert failed: ...`
        // — match on the canonical Supabase wording.
        const msg = (err as Error).message ?? "";
        const isUniqueViolation =
          msg.includes("duplicate key value") ||
          msg.includes("23505") ||
          msg.includes("pipeline_events_one_per_stage_email");
        if (!isUniqueViolation) throw err;
        // Replay collision — first-pass row stands. Idempotent success.
      }

      // 3. Downstream emit, if any. Same step.run for replay atomicity.
      if (downstreamEmit) {
        await inngest.send({
          name: downstreamEmit.name,
          data: downstreamEmit.data,
        } as Parameters<typeof inngest.send>[0]);
      }
    });

    await emitAutomationRunStale(admin, staleChannel);

    // -----------------------------------------------------------------------
    // Return shape — preserved for caller-visible compatibility with the
    // pre-refactor return values. Worker tests assert these literals.
    // -----------------------------------------------------------------------
    if (verdictSource.kind === "operator-override") {
      return { skipped: "safety_overridden" } as const;
    }
    if (verdictSource.kind === "budget-breach") {
      return { halted: true } as const;
    }
    return {
      verdict: verdictSource.verdict,
      regex_matched: verdictSource.regex_matched,
      cost_cents: verdictSource.cost_cents,
      token_count: verdictSource.total_tokens,
    };
  },
);

/**
 * Phase 82.2-04 D-02 — translate the branch-discriminated VerdictSource into
 * the `(decision, decision_details)` pair emitted to pipeline_events. The
 * `emit_source` key on `decision_details` is the canonical sub-type
 * discriminator downstream consumers (Bulk Review, V9 trace) filter on.
 */
function computeEmitPayload(verdictSource: VerdictSource): {
  decision: string;
  decisionDetails: Record<string, unknown>;
} {
  if (verdictSource.kind === "operator-override") {
    return {
      decision: "safe",
      decisionDetails: {
        emit_source: "operator-override",
        safety_overridden: true,
      },
    };
  }
  if (verdictSource.kind === "budget-breach") {
    return {
      decision: "over_budget",
      decisionDetails: {
        emit_source: "budget-breach",
        reason: verdictSource.reason,
        budget: verdictSource.budget,
      },
    };
  }
  return {
    decision: verdictSource.verdict,
    decisionDetails: {
      emit_source: "main-path",
      regex_matched: verdictSource.regex_matched,
      llm_reason: verdictSource.llm_reason,
      matched_span: verdictSource.matched_span,
      safety_overridden: false,
      // Phase 999.7 — strip telemetry
      strip_changed: verdictSource.strip_changed,
      strip_delta_chars: verdictSource.strip_delta_chars,
      strip_fallback_reason: verdictSource.strip_fallback_reason,
    },
  };
}
