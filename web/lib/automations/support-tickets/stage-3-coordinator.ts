// Plan 03-03 Task 2 — Stage 3 Coordinator Inngest function.
//
// Listens on `support-tickets/stage-3.coordinator.requested` (emitted by
// Stage 2 — see stage-2-enrichment.ts).
//
// Pipeline (each step durable via step.run in the wrapper):
//   (1) load support_tickets row by id
//       → quarantine defense-in-depth: if pii_quarantine=true OR
//         quarantine_state != null, emit 'stage_3_coordinator_quarantine_blocked'
//         and return early (NO agent call, NO Stage 4 trigger).
//   (2) load the Stage 2 aggregate pipeline_events row's decision_details
//       → Zod-parse through pipelineStageContextSchema. On failure, emit
//         'stage_3_coordinator_failed' with reason='stage2_context_invalid'.
//   (3) load `public.swarm_intents` rows where swarm_type='support-tickets'
//       (5 rows seeded by Phase 1 migration). Build Set for layer-B
//       hallucination guard.
//   (4) invoke the support-coordinator-agent via Orq /v3/router/responses
//       (see invoke-coordinator-agent.ts — uses inline config per 03-02 spec).
//       CoordinatorAgentError → emit 'stage_3_coordinator_failed' with the
//       error code as reason.
//   (5) apply guards (pure logic):
//         - layer-B hallucination check: chosen_intent ∉ registry Set
//           → override to clarification-needed + downgrade confidence
//         - verdict invariant FORWARD: incomplete + non-clarification
//           → override intent to clarification-needed
//         - verdict invariant REVERSE: complete + clarification-needed
//           → override verdict to incomplete
//         - any override downgrades confidence='low' and changes decision
//           to the appropriate '_violated' / '_hallucinated_intent' variant.
//   (6) cost-check: stage2_cost_cents + stage3 cost > ceiling?
//       → decision='stage_3_coordinator_cost_ceiling_exceeded', suppress
//         Stage 4 trigger, but STILL persist proposed_intent (we already paid).
//       NOTE: reuses SUPPORT_STAGE2_COST_CEILING_CENTS env var per execution
//       context W-1 fix (do NOT create a new env var; the existing name is a
//       misnomer post-Phase 3 but is now treated as a per-submission total).
//   (7) persist: UPDATE support_tickets with proposed_intent fields +
//       stage3_completed_at + stage3_cost_cents + clarification_questions
//       (if applicable). INSERT ONE aggregate pipeline_events row at stage=3.
//   (8) emit Stage 4 trigger ONLY on happy decisions (stage_3_coordinator,
//       _invariant_violated, _hallucinated_intent) — NOT on quarantine /
//       cost-ceiling / failed. Wrap in try/catch — aggregate row is already
//       durably written, log non-fatal on send failure (T-02-29 mitigation).
//
// Function-id LOCKED: `stage-3-support-tickets-coordinator`. NEVER rename.
//
// Phase 1 lesson (b7266f21): supabase-js v2 returns { data, error } and does
// NOT throw. We surface .error as a thrown Error so Inngest retries.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  pipelineStageContextSchema,
  type PipelineStageContext,
} from "./pipeline-stage-context";
import {
  SUPPORT_TICKETS_INTENTS,
  type CoordinatorOutput,
  type SupportTicketIntent,
} from "./coordinator-types";
import {
  invokeCoordinatorAgent as defaultInvokeCoordinatorAgent,
  CoordinatorAgentError,
  type InvokeCoordinatorAgentArgs,
  type InvokeCoordinatorAgentResult,
} from "./invoke-coordinator-agent";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const TRIGGERED_BY = "support-tickets:stage-3-coordinator";
const DEFAULT_COST_CEILING_CENTS = 50;

export type Stage3RequestedEvent = {
  support_ticket_id: string;
  submission_id: string;
};

export type Stage3Decision =
  | "stage_3_coordinator"
  | "stage_3_coordinator_invariant_violated"
  | "stage_3_coordinator_hallucinated_intent"
  | "stage_3_coordinator_cost_ceiling_exceeded"
  | "stage_3_coordinator_quarantine_blocked"
  | "stage_3_coordinator_failed";

export type Stage3Result =
  | {
      ok: true;
      decision: Stage3Decision;
      effective_intent: SupportTicketIntent | null;
      effective_verdict: "complete" | "incomplete" | null;
      stage3_cost_cents: number;
    }
  | {
      ok: false;
      reason: string;
      decision: "stage_3_coordinator_failed";
    };

export interface Stage3Deps {
  supabase: SupabaseAdmin;
  sendEvent: (payload: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
  invokeAgent: (
    args: InvokeCoordinatorAgentArgs,
  ) => Promise<InvokeCoordinatorAgentResult>;
  now: () => Date;
  costCeilingCents: number;
  orqApiKey: string | undefined;
}

type StageTicket = {
  id: string;
  submission_id: string;
  submitter_id: string;
  transcript: string | null;
  submitter_locale: "nl" | "en" | "fr" | null;
  proposed_system: string | null;
  proposed_system_status: string | null;
  user_chosen_type: string | null;
  stage2_cost_cents: number | null;
  pii_quarantine: boolean | null;
  quarantine_state: string | null;
};

async function writeStage3Event(
  supabase: SupabaseAdmin,
  args: {
    decision: Stage3Decision;
    decision_details: Record<string, unknown>;
    duration_ms: number;
    cost_cents?: number | null;
    automation_run_id: string;
    email_id: string;
  },
): Promise<void> {
  const row: Record<string, unknown> = {
    swarm_type: "support-tickets",
    stage: 3,
    decision: args.decision,
    decision_details: args.decision_details,
    duration_ms: args.duration_ms,
    triggered_by: TRIGGERED_BY,
    automation_run_id: args.automation_run_id,
    email_id: args.email_id,
  };
  if (args.cost_cents != null) row.cost_cents = args.cost_cents;
  const res = await supabase.from("pipeline_events").insert(row);
  if ((res as { error?: unknown } | null)?.error) {
    const err = (res as { error?: { message?: string } }).error;
    throw new Error(
      `pipeline_events insert (decision=${args.decision}) failed: ${err?.message ?? "unknown"}`,
    );
  }
}

interface GuardResult {
  effective_intent: SupportTicketIntent;
  effective_verdict: "complete" | "incomplete";
  effective_confidence: "high" | "medium" | "low";
  decision: Stage3Decision;
  clarification_questions: string[] | null;
  override_reason: string | null;
}

/**
 * Apply layer-B hallucination guard + bidirectional verdict invariant.
 * Pure function — no I/O. Visible for tests.
 */
export function applyStage3Guards(
  output: CoordinatorOutput,
  registry: Set<string>,
): GuardResult {
  let effective_intent: SupportTicketIntent = output.chosen_intent;
  let effective_verdict: "complete" | "incomplete" = output.completeness_verdict;
  let effective_confidence: "high" | "medium" | "low" = output.confidence;
  let decision: Stage3Decision = "stage_3_coordinator";
  let clarification_questions: string[] | null = null;
  let override_reason: string | null = null;

  // Layer B — registry-membership check. We bypass the Zod-typed enum here
  // because Zod only ENSURES it's one of SUPPORT_TICKETS_INTENTS — the
  // registry could theoretically diverge from the literal-union (e.g. an
  // intent removed from DB but still in the code enum). Use both checks.
  if (
    !registry.has(output.chosen_intent) ||
    !SUPPORT_TICKETS_INTENTS.includes(output.chosen_intent)
  ) {
    effective_intent = "clarification-needed";
    effective_verdict = "incomplete";
    effective_confidence = "low";
    decision = "stage_3_coordinator_hallucinated_intent";
    clarification_questions =
      output.missing_information ??
      ["Could you describe the issue in more detail?"];
    override_reason = `hallucinated_intent:${output.chosen_intent}`;
    return {
      effective_intent,
      effective_verdict,
      effective_confidence,
      decision,
      clarification_questions,
      override_reason,
    };
  }

  // Verdict invariant — FORWARD: incomplete + non-clarification
  if (
    effective_verdict === "incomplete" &&
    effective_intent !== "clarification-needed"
  ) {
    effective_intent = "clarification-needed";
    effective_confidence = "low";
    decision = "stage_3_coordinator_invariant_violated";
    clarification_questions =
      output.missing_information ??
      ["Could you describe the issue in more detail?"];
    override_reason = "invariant_forward:incomplete_non_clarification";
    return {
      effective_intent,
      effective_verdict,
      effective_confidence,
      decision,
      clarification_questions,
      override_reason,
    };
  }

  // Verdict invariant — REVERSE: complete + clarification-needed
  if (
    effective_verdict === "complete" &&
    effective_intent === "clarification-needed"
  ) {
    effective_verdict = "incomplete";
    effective_confidence = "low";
    decision = "stage_3_coordinator_invariant_violated";
    clarification_questions =
      output.missing_information ??
      ["Could you describe the issue in more detail?"];
    override_reason = "invariant_reverse:complete_clarification";
    return {
      effective_intent,
      effective_verdict,
      effective_confidence,
      decision,
      clarification_questions,
      override_reason,
    };
  }

  // Happy path: agent itself chose clarification-needed
  if (effective_intent === "clarification-needed") {
    clarification_questions = output.missing_information;
  }

  return {
    effective_intent,
    effective_verdict,
    effective_confidence,
    decision,
    clarification_questions,
    override_reason,
  };
}

const HAPPY_DECISIONS = new Set<Stage3Decision>([
  "stage_3_coordinator",
  "stage_3_coordinator_invariant_violated",
  "stage_3_coordinator_hallucinated_intent",
]);

/**
 * Pure orchestrator — testable without an Inngest runtime. The Inngest
 * wrapper below calls into this through a single step.run boundary; sub-step
 * granularity is intentionally NOT broken into separate step.run blocks
 * because the entire flow is short-lived (one Orq call) and the side-effects
 * land in ONE aggregate pipeline_events row at the end.
 */
export async function runStage3Coordinator(
  event: Stage3RequestedEvent,
  deps: Stage3Deps,
): Promise<Stage3Result> {
  const { supabase, sendEvent, invokeAgent, now, costCeilingCents, orqApiKey } =
    deps;
  const startedAt = now();

  // (1) Load ticket
  const ticketRes = await supabase
    .from("support_tickets")
    .select(
      "id, submission_id, submitter_id, transcript, submitter_locale, proposed_system, proposed_system_status, user_chosen_type, stage2_cost_cents, pii_quarantine, quarantine_state",
    )
    .eq("id", event.support_ticket_id)
    .maybeSingle();
  if (ticketRes.error) {
    throw new Error(
      `support_tickets lookup failed: ${(ticketRes.error as { message?: string }).message ?? "unknown"}`,
    );
  }
  const ticket = ticketRes.data as StageTicket | null;
  if (!ticket) {
    // No row → write a failed audit and exit. We still want a stage-3 row for
    // traceability.
    await writeStage3Event(supabase, {
      decision: "stage_3_coordinator_failed",
      decision_details: { reason: "ticket_not_found" },
      duration_ms: Math.round(now().getTime() - startedAt.getTime()),
      automation_run_id: event.support_ticket_id,
      email_id: event.submission_id,
    });
    return {
      ok: false,
      reason: "ticket_not_found",
      decision: "stage_3_coordinator_failed",
    };
  }

  const stepResults: Record<string, unknown> = {
    submission_id: ticket.submission_id,
  };

  // (1b) Quarantine defense-in-depth (T-03-14)
  if (
    ticket.pii_quarantine === true ||
    (ticket.quarantine_state != null && ticket.quarantine_state !== "")
  ) {
    await writeStage3Event(supabase, {
      decision: "stage_3_coordinator_quarantine_blocked",
      decision_details: {
        ...stepResults,
        pii_quarantine: ticket.pii_quarantine === true,
        quarantine_state: ticket.quarantine_state ?? null,
        reason: "quarantine_at_runtime",
      },
      duration_ms: Math.round(now().getTime() - startedAt.getTime()),
      automation_run_id: ticket.id,
      email_id: ticket.submission_id,
    });
    return {
      ok: true,
      decision: "stage_3_coordinator_quarantine_blocked",
      effective_intent: null,
      effective_verdict: null,
      stage3_cost_cents: 0,
    };
  }

  // (2) Load Stage 2 aggregate pipeline_events row
  const stage2Res = await supabase
    .from("pipeline_events")
    .select("decision_details")
    .eq("email_id", ticket.submission_id)
    .eq("swarm_type", "support-tickets")
    .eq("stage", 2)
    .in("decision", [
      "stage_2_enrichment",
      "stage_2_enrichment_pii_quarantined",
    ])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if ((stage2Res as { error?: unknown } | null)?.error) {
    const err = (stage2Res as { error?: { message?: string } }).error;
    throw new Error(
      `pipeline_events stage=2 lookup failed: ${err?.message ?? "unknown"}`,
    );
  }
  const stage2Row = (stage2Res as { data: { decision_details: unknown } | null })
    .data;
  if (!stage2Row || !stage2Row.decision_details) {
    await writeStage3Event(supabase, {
      decision: "stage_3_coordinator_failed",
      decision_details: { ...stepResults, reason: "stage2_row_missing" },
      duration_ms: Math.round(now().getTime() - startedAt.getTime()),
      automation_run_id: ticket.id,
      email_id: ticket.submission_id,
    });
    return {
      ok: false,
      reason: "stage2_row_missing",
      decision: "stage_3_coordinator_failed",
    };
  }
  // The stage-2 aggregate decision_details carries the PipelineStageContext
  // v1 fields PLUS additional step-results (system_detect, embed_search,
  // m365, etc.). Extract only the v1 context fields for Zod-parsing.
  const dd = stage2Row.decision_details as Record<string, unknown>;
  const candidate = {
    context_version: dd.context_version,
    prior_tickets_same_user: dd.prior_tickets_same_user ?? [],
    prior_tickets_same_system: dd.prior_tickets_same_system ?? [],
    similar_tickets: dd.similar_tickets ?? [],
    prior_clarifications: dd.prior_clarifications ?? [],
  };
  const ctxParse = pipelineStageContextSchema.safeParse(candidate);
  if (!ctxParse.success) {
    await writeStage3Event(supabase, {
      decision: "stage_3_coordinator_failed",
      decision_details: {
        ...stepResults,
        reason: "stage2_context_invalid",
        zod_issues: ctxParse.error.issues.slice(0, 5),
      },
      duration_ms: Math.round(now().getTime() - startedAt.getTime()),
      automation_run_id: ticket.id,
      email_id: ticket.submission_id,
    });
    return {
      ok: false,
      reason: "stage2_context_invalid",
      decision: "stage_3_coordinator_failed",
    };
  }
  const pipelineStageContext: PipelineStageContext = ctxParse.data;

  // (3) Load swarm_intents registry (layer-B hallucination guard)
  const registryRes = await supabase
    .from("swarm_intents")
    .select("intent_key")
    .eq("swarm_type", "support-tickets");
  if ((registryRes as { error?: unknown } | null)?.error) {
    const err = (registryRes as { error?: { message?: string } }).error;
    throw new Error(
      `swarm_intents load failed: ${err?.message ?? "unknown"}`,
    );
  }
  const registryRows =
    ((registryRes as { data?: Array<{ intent_key: string }> }).data ?? []) as
      | Array<{ intent_key: string }>;
  const registrySet = new Set(registryRows.map((r) => r.intent_key));

  // (4) Invoke the coordinator agent
  let invokeResult: InvokeCoordinatorAgentResult;
  try {
    invokeResult = await invokeAgent({
      supportTicket: {
        transcript: ticket.transcript,
        submitter_locale: (ticket.submitter_locale ?? "en") as
          | "nl"
          | "en"
          | "fr",
        user_chosen_type: ticket.user_chosen_type ?? "other",
        proposed_system: ticket.proposed_system,
        proposed_system_status: ticket.proposed_system_status ?? "unknown",
      },
      pipelineStageContext,
      apiKey: orqApiKey ?? "",
    });
  } catch (cause) {
    const code =
      cause instanceof CoordinatorAgentError ? cause.code : "agent_unknown_error";
    const message = cause instanceof Error ? cause.message : String(cause);
    await writeStage3Event(supabase, {
      decision: "stage_3_coordinator_failed",
      decision_details: {
        ...stepResults,
        reason: code,
        message: message.slice(0, 300),
      },
      duration_ms: Math.round(now().getTime() - startedAt.getTime()),
      automation_run_id: ticket.id,
      email_id: ticket.submission_id,
    });
    return {
      ok: false,
      reason: code,
      decision: "stage_3_coordinator_failed",
    };
  }

  // (5) Apply guards
  const guards = applyStage3Guards(invokeResult.output, registrySet);

  // (6) Cost check
  const totalCostCents =
    (ticket.stage2_cost_cents ?? 0) + invokeResult.cost_cents;
  const costCeilingExceeded = totalCostCents > costCeilingCents;

  let finalDecision: Stage3Decision = guards.decision;
  if (costCeilingExceeded) {
    finalDecision = "stage_3_coordinator_cost_ceiling_exceeded";
  }

  // (7) Persist — UPDATE support_tickets
  const ticketUpdate: Record<string, unknown> = {
    proposed_intent: guards.effective_intent,
    proposed_intent_confidence: guards.effective_confidence,
    proposed_intent_reasoning: invokeResult.output.reasoning,
    completeness_verdict: guards.effective_verdict,
    stage3_completed_at: now().toISOString(),
    stage3_cost_cents: invokeResult.cost_cents,
  };
  if (guards.clarification_questions !== null) {
    ticketUpdate.clarification_questions = guards.clarification_questions;
  }
  if (costCeilingExceeded) {
    ticketUpdate.proposed_system_status = "cost_ceiling_exceeded";
  }
  const updRes = await supabase
    .from("support_tickets")
    .update(ticketUpdate)
    .eq("id", ticket.id);
  if ((updRes as { error?: unknown } | null)?.error) {
    const err = (updRes as { error?: { message?: string } }).error;
    throw new Error(
      `support_tickets UPDATE (proposed_intent) failed: ${err?.message ?? "unknown"}`,
    );
  }

  // (7b) Insert ONE aggregate pipeline_events row at stage=3
  const completedAt = now();
  const decisionDetails: Record<string, unknown> = {
    ...stepResults,
    pipeline_stage_context_version: pipelineStageContext.context_version,
    registry_size: registrySet.size,
    chosen_intent_raw: invokeResult.output.chosen_intent,
    chosen_intent: invokeResult.output.chosen_intent,
    effective_intent: guards.effective_intent,
    effective_verdict: guards.effective_verdict,
    effective_confidence: guards.effective_confidence,
    completeness_verdict_raw: invokeResult.output.completeness_verdict,
    confidence_raw: invokeResult.output.confidence,
    reasoning: invokeResult.output.reasoning,
    missing_information: invokeResult.output.missing_information,
    model_used: invokeResult.model_used,
    override_reason: guards.override_reason,
    cost_check: {
      stage2_cost_cents: ticket.stage2_cost_cents ?? 0,
      stage3_cost_cents: invokeResult.cost_cents,
      total_cost_cents: totalCostCents,
      ceiling_cents: costCeilingCents,
      exceeded: costCeilingExceeded,
    },
  };

  await writeStage3Event(supabase, {
    decision: finalDecision,
    decision_details: decisionDetails,
    duration_ms: Math.round(completedAt.getTime() - startedAt.getTime()),
    cost_cents: invokeResult.cost_cents,
    automation_run_id: ticket.id,
    email_id: ticket.submission_id,
  });

  // (8) Emit Stage 4 trigger — ONLY on happy decisions
  if (HAPPY_DECISIONS.has(finalDecision)) {
    try {
      await sendEvent({
        name: "support-tickets/stage-4.handler.requested",
        data: {
          support_ticket_id: ticket.id,
          submission_id: ticket.submission_id,
          chosen_intent: guards.effective_intent,
          completeness_verdict: guards.effective_verdict,
        },
      });
    } catch (cause) {
      // Non-fatal: aggregate row already durably written.
      const message = cause instanceof Error ? cause.message : String(cause);
      // eslint-disable-next-line no-console
      console.warn(
        `[stage-3-coordinator] Stage 4 trigger emit failed (non-fatal): ${message}`,
      );
    }
  }

  return {
    ok: true,
    decision: finalDecision,
    effective_intent: guards.effective_intent,
    effective_verdict: guards.effective_verdict,
    stage3_cost_cents: invokeResult.cost_cents,
  };
}

/**
 * Inngest wrapper. Function-id LOCKED — see Plan 03-03:
 * `stage-3-support-tickets-coordinator`. NEVER rename across runs (in-flight
 * runs would orphan). retries: 3 matches Phase 2 precedent.
 *
 * The runner is invoked inside a single step.run for replay safety — Inngest
 * memoizes its result if the function is retried.
 */
export const stage3SupportTicketsCoordinator = inngest.createFunction(
  { id: "stage-3-support-tickets-coordinator", retries: 3 },
  { event: "support-tickets/stage-3.coordinator.requested" },
  async ({ event, step }) => {
    const admin = createAdminClient();

    const baselineNowIso = await step.run("compute-now", async () =>
      new Date().toISOString(),
    );
    const fixedNow = new Date(baselineNowIso);

    return await step.run("run-stage-3", async () =>
      runStage3Coordinator(event.data as Stage3RequestedEvent, {
        supabase: admin,
        // CLAUDE.md: NEVER destructure inngest.send — bind it.
        sendEvent: inngest.send.bind(inngest) as Stage3Deps["sendEvent"],
        invokeAgent: defaultInvokeCoordinatorAgent,
        now: () => fixedNow,
        // W-1 fix (execution context): REUSE the Stage 2 env var name — it
        // is now the total per-submission ceiling, the name is a misnomer
        // we are not renaming in scope.
        costCeilingCents: Number(
          process.env.SUPPORT_STAGE2_COST_CEILING_CENTS ??
            DEFAULT_COST_CEILING_CENTS,
        ),
        orqApiKey: process.env.ORQ_API_KEY,
      }),
    );
  },
);
