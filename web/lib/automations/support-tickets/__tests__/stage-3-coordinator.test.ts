// Plan 03-03 Task 1 — Stage 3 coordinator vertical slice tests (RED → GREEN).
//
// Tests the pure handler `runStage3Coordinator(event, deps)`. The Inngest
// wrapper `stage3SupportTicketsCoordinator` is a thin orchestrator that
// delegates to this handler through step.run boundaries.
//
// Mock strategy mirrors Phase 2 `stage-2-enrichment.test.ts`:
//   - hand-rolled SupabaseAdmin chain stub (from/select/update/insert)
//   - invokeCoordinatorAgent injected as a vi.fn() — fetch is exercised by
//     invoke-coordinator-agent.test.ts in isolation; here we don't care HOW
//     the agent call is made, only WHAT the runner does with its output.
//   - Inngest send is a vi.fn() captured for assertions.
//
// SEVEN end-to-end behaviors covered:
//   1. happy-path (complete + valid intent)
//   2. verdict-invariant: incomplete + non-clarification → override
//   3. verdict-invariant reverse: complete + clarification-needed → override
//   4. hallucinated intent: chosen_intent not in registry Set → override
//   5. cost ceiling exceeded → no Stage 4 trigger, still persist
//   6. quarantine defense-in-depth: pii_quarantine=true at start → block
//   7. stage 2 context invalid (PipelineStageContext v1 schema fails) → fail
//
// Function-id LOCKED: `stage-3-support-tickets-coordinator` (asserted by Plan
// 03-03 Task 3 grep, not here).

import { describe, it, expect, vi, beforeEach } from "vitest";

import { runStage3Coordinator } from "../stage-3-coordinator";
import { CONTEXT_VERSION } from "../pipeline-stage-context";
import type { CoordinatorOutput } from "../coordinator-types";

const EVENT = {
  support_ticket_id: "11111111-1111-1111-1111-111111111111",
  submission_id: "22222222-2222-2222-2222-222222222222",
} as const;

const TICKET_ROW_BASE = {
  id: EVENT.support_ticket_id,
  submission_id: EVENT.submission_id,
  submitter_id: "user-1",
  transcript: "My PDF export is broken in iController",
  submitter_locale: "en",
  proposed_system: "icontroller",
  proposed_system_status: "detected",
  user_chosen_type: "bug",
  stage2_cost_cents: 10,
  pii_quarantine: false,
  quarantine_state: null,
};

const VALID_CONTEXT = {
  context_version: CONTEXT_VERSION,
  prior_tickets_same_user: [],
  prior_tickets_same_system: [],
  similar_tickets: [],
  prior_clarifications: [],
};

const REGISTRY_ROWS = [
  { intent_key: "clarification-needed" },
  { intent_key: "duplicate" },
  { intent_key: "info-answer" },
  { intent_key: "clickup-escalate" },
  { intent_key: "vendor-draft" },
];

const VALID_STAGE2_ROW = {
  decision_details: { ...VALID_CONTEXT, attempt: 1 },
};

type Inserted = { args: Record<string, unknown> };
type Updated = { args: Record<string, unknown>; id: string };

function buildAdminMock(opts: {
  ticketRow: Record<string, unknown> | null;
  stage2Row?: Record<string, unknown> | null;
  registryRows?: Array<{ intent_key: string }>;
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const calls = {
    pipelineEventsInserts: [] as Inserted[],
    supportTicketsUpdates: [] as Updated[],
    pipelineEventsSelects: [] as { args: Record<string, unknown> }[],
  };

  let ticketState = opts.ticketRow ? { ...opts.ticketRow } : null;
  const stage2Row = opts.stage2Row === undefined ? VALID_STAGE2_ROW : opts.stage2Row;
  const registry = opts.registryRows ?? REGISTRY_ROWS;

  const admin = {
    from(table: string) {
      if (table === "support_tickets") {
        return {
          select: (_cols: string) => ({
            eq: (_c: string, _v: unknown) => ({
              maybeSingle: async () => ({ data: ticketState, error: null }),
            }),
          }),
          update(args: Record<string, unknown>) {
            return {
              eq: (col: string, val: unknown) => {
                if (col === "id" && ticketState) {
                  ticketState = { ...ticketState, ...args };
                }
                calls.supportTicketsUpdates.push({ args, id: String(val) });
                return Promise.resolve({ error: opts.updateError ?? null });
              },
            };
          },
        };
      }
      if (table === "pipeline_events") {
        return {
          // Stage 2 lookup: .select(...).eq(...).eq(...).eq(...).in(...).order(...).limit(...).maybeSingle()
          select: (_cols: string) => {
            const filters: Record<string, unknown> = {};
            calls.pipelineEventsSelects.push({ args: filters });
            const chain: {
              eq: (c: string, v: unknown) => typeof chain;
              in: (c: string, v: unknown[]) => typeof chain;
              order: (c: string, opts?: unknown) => typeof chain;
              limit: (n: number) => typeof chain;
              maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
            } = {
              eq(c, v) {
                filters[c] = v;
                return chain;
              },
              in(c, v) {
                filters[`${c}__in`] = v;
                return chain;
              },
              order() {
                return chain;
              },
              limit() {
                return chain;
              },
              maybeSingle: async () => ({ data: stage2Row, error: null }),
            };
            return chain;
          },
          insert(args: Record<string, unknown>) {
            calls.pipelineEventsInserts.push({ args });
            return Promise.resolve({ error: opts.insertError ?? null });
          },
        };
      }
      if (table === "swarm_intents") {
        return {
          select: (_cols: string) => ({
            eq: (_c: string, _v: unknown) =>
              Promise.resolve({ data: registry, error: null }),
          }),
        };
      }
      throw new Error(`Unexpected admin.from(${table}) in test`);
    },
  };

  return { admin, calls, getState: () => ticketState };
}

function happyAgentOutput(over: Partial<CoordinatorOutput> = {}): CoordinatorOutput {
  return {
    chosen_intent: "clickup-escalate",
    completeness_verdict: "complete",
    confidence: "high",
    reasoning: "Bug report with clear reproducer.",
    missing_information: null,
    ...over,
  };
}

function buildInvokeAgent(
  output: CoordinatorOutput,
  costCents = 2,
): ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    output,
    cost_cents: costCents,
    raw: JSON.stringify(output),
    model_used: "anthropic/claude-sonnet-4-5-20250929",
  }));
}

const DEFAULT_DEPS_FIXED_NOW = new Date("2026-06-01T10:00:00.000Z");

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("runStage3Coordinator — Plan 03-03 vertical slice", () => {
  it("Test 1 — happy-path: complete + valid intent → Stage 4 trigger + aggregate event + support_tickets updated", async () => {
    const { admin, calls, getState } = buildAdminMock({ ticketRow: TICKET_ROW_BASE });
    const sendEvent = vi.fn(async () => undefined);
    const invokeAgent = buildInvokeAgent(happyAgentOutput(), 3);

    const result = await runStage3Coordinator(EVENT, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      sendEvent,
      invokeAgent,
      now: () => DEFAULT_DEPS_FIXED_NOW,
      costCeilingCents: 50,
      orqApiKey: "test-key",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe("stage_3_coordinator");

    // exactly one pipeline_events insert
    expect(calls.pipelineEventsInserts.length).toBe(1);
    const pe = calls.pipelineEventsInserts[0].args;
    expect(pe.swarm_type).toBe("support-tickets");
    expect(pe.stage).toBe(3);
    expect(pe.decision).toBe("stage_3_coordinator");
    expect(pe.email_id).toBe(EVENT.submission_id);
    expect(pe.automation_run_id).toBe(EVENT.support_ticket_id);
    expect(Number.isInteger(pe.duration_ms)).toBe(true);
    expect(pe.cost_cents).toBe(3);

    // support_tickets UPDATE
    const updateArgs = calls.supportTicketsUpdates.find(
      (u) => (u.args as Record<string, unknown>).proposed_intent !== undefined,
    );
    expect(updateArgs).toBeDefined();
    expect(updateArgs!.args.proposed_intent).toBe("clickup-escalate");
    expect(updateArgs!.args.proposed_intent_confidence).toBe("high");
    expect(updateArgs!.args.completeness_verdict).toBe("complete");
    expect(updateArgs!.args.stage3_completed_at).toBe(
      DEFAULT_DEPS_FIXED_NOW.toISOString(),
    );
    expect(updateArgs!.args.stage3_cost_cents).toBe(3);

    // Stage 4 trigger fired
    expect(sendEvent).toHaveBeenCalledTimes(1);
    const sent = sendEvent.mock.calls[0][0] as {
      name: string;
      data: Record<string, unknown>;
    };
    expect(sent.name).toBe("support-tickets/stage-4.handler.requested");
    expect(sent.data).toEqual({
      support_ticket_id: EVENT.support_ticket_id,
      submission_id: EVENT.submission_id,
      chosen_intent: "clickup-escalate",
      completeness_verdict: "complete",
    });

    void getState;
  });

  it("Test 2 — verdict-invariant forward: incomplete + non-clarification → override to clarification-needed", async () => {
    const { admin, calls } = buildAdminMock({ ticketRow: TICKET_ROW_BASE });
    const sendEvent = vi.fn(async () => undefined);
    const invokeAgent = buildInvokeAgent(
      happyAgentOutput({
        chosen_intent: "clickup-escalate",
        completeness_verdict: "incomplete",
        confidence: "medium",
        missing_information: ["Which user account?"],
      }),
      3,
    );

    const result = await runStage3Coordinator(EVENT, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      sendEvent,
      invokeAgent,
      now: () => DEFAULT_DEPS_FIXED_NOW,
      costCeilingCents: 50,
      orqApiKey: "test-key",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe("stage_3_coordinator_invariant_violated");

    const pe = calls.pipelineEventsInserts[0].args;
    expect(pe.decision).toBe("stage_3_coordinator_invariant_violated");

    const upd = calls.supportTicketsUpdates.find(
      (u) => (u.args as Record<string, unknown>).proposed_intent !== undefined,
    )!;
    expect(upd.args.proposed_intent).toBe("clarification-needed");
    expect(upd.args.completeness_verdict).toBe("incomplete");
    expect(upd.args.clarification_questions).toEqual(["Which user account?"]);
    expect(upd.args.proposed_intent_confidence).toBe("low");

    // Stage 4 still fires with chosen_intent='clarification-needed'
    expect(sendEvent).toHaveBeenCalledTimes(1);
    const sent = sendEvent.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(sent.data.chosen_intent).toBe("clarification-needed");
    expect(sent.data.completeness_verdict).toBe("incomplete");
  });

  it("Test 3 — verdict-invariant reverse: complete + clarification-needed → override verdict to incomplete", async () => {
    const { admin, calls } = buildAdminMock({ ticketRow: TICKET_ROW_BASE });
    const sendEvent = vi.fn(async () => undefined);
    const invokeAgent = buildInvokeAgent(
      happyAgentOutput({
        chosen_intent: "clarification-needed",
        completeness_verdict: "complete",
        confidence: "medium",
        missing_information: null,
      }),
    );

    const result = await runStage3Coordinator(EVENT, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      sendEvent,
      invokeAgent,
      now: () => DEFAULT_DEPS_FIXED_NOW,
      costCeilingCents: 50,
      orqApiKey: "test-key",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe("stage_3_coordinator_invariant_violated");

    const upd = calls.supportTicketsUpdates.find(
      (u) => (u.args as Record<string, unknown>).proposed_intent !== undefined,
    )!;
    expect(upd.args.proposed_intent).toBe("clarification-needed");
    expect(upd.args.completeness_verdict).toBe("incomplete");
    expect(upd.args.proposed_intent_confidence).toBe("low");
    expect(sendEvent).toHaveBeenCalledTimes(1);
  });

  it("Test 4 — hallucinated intent: chosen_intent not in registry → override to clarification-needed", async () => {
    const { admin, calls } = buildAdminMock({ ticketRow: TICKET_ROW_BASE });
    const sendEvent = vi.fn(async () => undefined);
    // Bypass Zod by casting — simulate a future scenario where layer-A is
    // bypassed (e.g., Orq behavior change). The runner's layer-B Set lookup
    // must still catch it.
    const invokeAgent = vi.fn(async () => ({
      output: {
        chosen_intent: "banana",
        completeness_verdict: "complete",
        confidence: "high",
        reasoning: "I picked banana",
        missing_information: null,
      } as unknown as CoordinatorOutput,
      cost_cents: 2,
      raw: "{}",
      model_used: "anthropic/claude-sonnet-4-5-20250929",
    }));

    const result = await runStage3Coordinator(EVENT, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      sendEvent,
      invokeAgent,
      now: () => DEFAULT_DEPS_FIXED_NOW,
      costCeilingCents: 50,
      orqApiKey: "test-key",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe("stage_3_coordinator_hallucinated_intent");

    const upd = calls.supportTicketsUpdates.find(
      (u) => (u.args as Record<string, unknown>).proposed_intent !== undefined,
    )!;
    expect(upd.args.proposed_intent).toBe("clarification-needed");
    expect(upd.args.proposed_intent_confidence).toBe("low");
    expect(sendEvent).toHaveBeenCalledTimes(1);
    const sent = sendEvent.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(sent.data.chosen_intent).toBe("clarification-needed");

    // decision_details must capture the raw hallucinated key for audit
    const pe = calls.pipelineEventsInserts[0].args;
    const details = pe.decision_details as Record<string, unknown>;
    expect(details.chosen_intent_raw).toBe("banana");
    expect(details.effective_intent).toBe("clarification-needed");
  });

  it("Test 5 — cost ceiling exceeded: stage2+stage3 > ceiling → abort, no Stage 4 trigger, still persist proposed_intent", async () => {
    const { admin, calls } = buildAdminMock({
      ticketRow: { ...TICKET_ROW_BASE, stage2_cost_cents: 49.5 },
    });
    const sendEvent = vi.fn(async () => undefined);
    const invokeAgent = buildInvokeAgent(happyAgentOutput(), 5); // 49.5 + 5 = 54.5 > 50

    const result = await runStage3Coordinator(EVENT, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      sendEvent,
      invokeAgent,
      now: () => DEFAULT_DEPS_FIXED_NOW,
      costCeilingCents: 50,
      orqApiKey: "test-key",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe("stage_3_coordinator_cost_ceiling_exceeded");

    // Stage 4 NOT fired
    expect(sendEvent).not.toHaveBeenCalled();

    // proposed_intent still persisted (we already paid)
    const upd = calls.supportTicketsUpdates.find(
      (u) => (u.args as Record<string, unknown>).proposed_intent !== undefined,
    );
    expect(upd).toBeDefined();
    expect(upd!.args.proposed_intent).toBe("clickup-escalate");
    expect(upd!.args.proposed_system_status).toBe("cost_ceiling_exceeded");

    const pe = calls.pipelineEventsInserts[0].args;
    expect(pe.decision).toBe("stage_3_coordinator_cost_ceiling_exceeded");
  });

  it("Test 6 — quarantine defense-in-depth: pii_quarantine=true → abort, no agent call, no Stage 4", async () => {
    const { admin, calls } = buildAdminMock({
      ticketRow: { ...TICKET_ROW_BASE, pii_quarantine: true },
    });
    const sendEvent = vi.fn(async () => undefined);
    const invokeAgent = buildInvokeAgent(happyAgentOutput());

    const result = await runStage3Coordinator(EVENT, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      sendEvent,
      invokeAgent,
      now: () => DEFAULT_DEPS_FIXED_NOW,
      costCeilingCents: 50,
      orqApiKey: "test-key",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe("stage_3_coordinator_quarantine_blocked");

    // Agent NEVER called
    expect(invokeAgent).not.toHaveBeenCalled();
    // No Stage 4
    expect(sendEvent).not.toHaveBeenCalled();
    // Aggregate row still written for audit
    expect(calls.pipelineEventsInserts.length).toBe(1);
    expect(calls.pipelineEventsInserts[0].args.decision).toBe(
      "stage_3_coordinator_quarantine_blocked",
    );
  });

  it("Test 6b — quarantine via quarantine_state set (non-null) → blocked same way", async () => {
    const { admin } = buildAdminMock({
      ticketRow: { ...TICKET_ROW_BASE, quarantine_state: "rejected_safety_ssrf" },
    });
    const sendEvent = vi.fn(async () => undefined);
    const invokeAgent = buildInvokeAgent(happyAgentOutput());

    const result = await runStage3Coordinator(EVENT, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      sendEvent,
      invokeAgent,
      now: () => DEFAULT_DEPS_FIXED_NOW,
      costCeilingCents: 50,
      orqApiKey: "test-key",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe("stage_3_coordinator_quarantine_blocked");
    expect(invokeAgent).not.toHaveBeenCalled();
    expect(sendEvent).not.toHaveBeenCalled();
  });

  it("Test 7 — Stage 2 context invalid: decision_details fails PipelineStageContext v1 parse → fail-closed", async () => {
    const { admin, calls } = buildAdminMock({
      ticketRow: TICKET_ROW_BASE,
      stage2Row: { decision_details: { context_version: "bogus-version" } },
    });
    const sendEvent = vi.fn(async () => undefined);
    const invokeAgent = buildInvokeAgent(happyAgentOutput());

    const result = await runStage3Coordinator(EVENT, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      sendEvent,
      invokeAgent,
      now: () => DEFAULT_DEPS_FIXED_NOW,
      costCeilingCents: 50,
      orqApiKey: "test-key",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("stage2_context_invalid");
    expect(invokeAgent).not.toHaveBeenCalled();
    expect(sendEvent).not.toHaveBeenCalled();

    const pe = calls.pipelineEventsInserts[0].args;
    expect(pe.decision).toBe("stage_3_coordinator_failed");
    const details = pe.decision_details as Record<string, unknown>;
    expect(details.reason).toBe("stage2_context_invalid");
  });
});
