// Plan 02-02 Task 2 — Stage 2 baseline enrichment pure-handler tests.
//
// We test `runStage2BaselineEnrichment(event, { supabase, now })` — the pure
// (Inngest-free) handler. The Inngest wrapper `stage2SupportTicketsEnrichment`
// is a thin orchestrator over `step.run` that calls the same handler; its
// behavior is covered by the live smoke in Task 3.
//
// Mock strategy: a minimal SupabaseAdmin chain stub that records calls so we
// can assert (a) the support_tickets fetch shape, (b) the pipeline_events
// insert shape (per Phase 1 lessons: email_id=submission_id UUID, NOT PK;
// duration_ms is Math.round-ed integer), (c) the support_tickets UPDATE on
// stage2_completed_at.

import { describe, it, expect, vi } from "vitest";
import { runStage2BaselineEnrichment } from "../stage-2-enrichment";
import { CONTEXT_VERSION } from "../pipeline-stage-context";

type InsertCall = { args: unknown };
type UpdateCall = { args: unknown; eq: { col: string; val: unknown } };
type SelectChain = {
  eq: (col: string, val: unknown) => SelectChain;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
};

function buildAdminMock(opts: {
  ticketRow: Record<string, unknown> | null;
  pipelineEventsError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const calls = {
    pipelineEventsInserts: [] as InsertCall[],
    supportTicketsUpdates: [] as UpdateCall[],
    supportTicketsSelects: [] as { col: string; val: unknown }[],
  };

  const admin = {
    from(table: string) {
      if (table === "support_tickets") {
        return {
          select: (_cols: string) => {
            const chain: SelectChain = {
              eq(col, val) {
                calls.supportTicketsSelects.push({ col, val });
                return chain;
              },
              async maybeSingle() {
                return { data: opts.ticketRow, error: null };
              },
            };
            return chain;
          },
          update(args: unknown) {
            return {
              eq(col: string, val: unknown) {
                calls.supportTicketsUpdates.push({ args, eq: { col, val } });
                return Promise.resolve({ error: opts.updateError ?? null });
              },
            };
          },
        };
      }
      if (table === "pipeline_events") {
        return {
          insert(args: unknown) {
            calls.pipelineEventsInserts.push({ args });
            return Promise.resolve({ error: opts.pipelineEventsError ?? null });
          },
        };
      }
      throw new Error(`Unexpected admin.from(${table}) in test`);
    },
  };
  return { admin, calls };
}

const EVENT = {
  support_ticket_id: "11111111-1111-1111-1111-111111111111",
  submission_id: "22222222-2222-2222-2222-222222222222",
  external_task_id: "CU-TEST-001",
  attempt: 1,
} as const;

const TICKET_ROW = {
  id: EVENT.support_ticket_id,
  submission_id: EVENT.submission_id,
  external_task_id: EVENT.external_task_id,
  attempt: 1,
};

describe("runStage2BaselineEnrichment (pure handler)", () => {
  it("emits one pipeline_events stage=2 baseline row + sets stage2_completed_at", async () => {
    const { admin, calls } = buildAdminMock({ ticketRow: TICKET_ROW });
    const fixedNow = new Date("2026-05-27T12:00:00.000Z");

    const result = await runStage2BaselineEnrichment(EVENT, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      now: () => fixedNow,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return; // narrow

    expect(result.pipeline_event_decision).toBe("stage_2_baseline");
    expect(result.context.context_version).toBe(CONTEXT_VERSION);
    expect(result.context.prior_tickets_same_user).toEqual([]);
    expect(result.context.prior_tickets_same_system).toEqual([]);
    expect(result.context.similar_tickets).toEqual([]);
    expect(result.context.prior_clarifications).toEqual([]);

    // pipeline_events insert assertions
    expect(calls.pipelineEventsInserts.length).toBe(1);
    const pe = calls.pipelineEventsInserts[0].args as Record<string, unknown>;
    expect(pe.swarm_type).toBe("support-tickets");
    expect(pe.stage).toBe(2);
    expect(pe.decision).toBe("stage_2_baseline");
    expect(pe.email_id).toBe(EVENT.submission_id);
    expect(pe.automation_run_id).toBe(EVENT.support_ticket_id);
    expect(pe.triggered_by).toBe("support-tickets:stage-2-enrichment");
    // duration_ms must be an integer (Phase 1 bug-fix lesson)
    expect(Number.isInteger(pe.duration_ms)).toBe(true);

    const details = pe.decision_details as Record<string, unknown>;
    expect(details.context_version).toBe(CONTEXT_VERSION);
    expect(details.external_task_id).toBe(EVENT.external_task_id);
    expect(details.attempt).toBe(1);
    expect(details.prior_tickets_same_user).toEqual([]);
    expect(details.prior_tickets_same_system).toEqual([]);
    expect(details.similar_tickets).toEqual([]);
    expect(details.prior_clarifications).toEqual([]);

    // support_tickets UPDATE assertions
    expect(calls.supportTicketsUpdates.length).toBe(1);
    const upd = calls.supportTicketsUpdates[0];
    const updArgs = upd.args as Record<string, unknown>;
    expect(updArgs.stage2_completed_at).toBe(fixedNow.toISOString());
    expect(upd.eq).toEqual({ col: "id", val: EVENT.support_ticket_id });
  });

  it("returns ok:false when the support_tickets row is missing — NO pipeline_events row written", async () => {
    const { admin, calls } = buildAdminMock({ ticketRow: null });

    const result = await runStage2BaselineEnrichment(EVENT, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      now: () => new Date(),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("ticket_not_found");
    expect(calls.pipelineEventsInserts.length).toBe(0);
    expect(calls.supportTicketsUpdates.length).toBe(0);
  });

  it("throws when pipeline_events insert returns an .error (Phase 1 lesson b7266f21 — never swallow .error)", async () => {
    const { admin } = buildAdminMock({
      ticketRow: TICKET_ROW,
      pipelineEventsError: { message: "RLS denied" },
    });

    await expect(
      runStage2BaselineEnrichment(EVENT, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: admin as any,
        now: () => new Date(),
      }),
    ).rejects.toThrow(/RLS denied|telemetry_write_failed|pipeline_events/);
  });
});

describe("stage2SupportTicketsEnrichment Inngest function metadata", () => {
  it("registers function-id 'stage-2-support-tickets-enrichment' on event 'support-tickets/stage-2.requested'", async () => {
    // Mock the inngest client to capture createFunction args, like the
    // debtor-email Stage 2 customer-resolver test does.
    vi.resetModules();
    const createFunctionSpy = vi.fn((cfg, trigger, handler) => ({
      __config: cfg,
      __trigger: trigger,
      handler,
    }));
    vi.doMock("@/lib/inngest/client", () => ({
      inngest: {
        send: vi.fn(),
        createFunction: createFunctionSpy,
      },
    }));

    const mod = await import("../stage-2-enrichment");
    const fn = mod.stage2SupportTicketsEnrichment as unknown as {
      __config: { id: string };
      __trigger: { event: string };
    };
    expect(fn.__config.id).toBe("stage-2-support-tickets-enrichment");
    expect(fn.__trigger.event).toBe("support-tickets/stage-2.requested");
    vi.doUnmock("@/lib/inngest/client");
  });
});
