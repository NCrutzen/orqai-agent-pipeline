// Phase 71-02 Task 2 — debtor-email-override-handler unit tests.
//
// Coverage matrix: axis × {capability, regression} × {happy, edge} + replay
// idempotency. Mocks emitPipelineEvent + supabase admin + inngest.send +
// loadSwarmIntents per Plan §test scaffold.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { inngestSend } = vi.hoisted(() => ({
  inngestSend: vi.fn().mockResolvedValue({ ids: ["evt"] }),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: inngestSend,
    createFunction: vi.fn((cfg: unknown, _trigger: unknown, handler: unknown) => ({
      __config: cfg,
      handler,
    })),
  },
}));

const { insertedPipelineEvents, coordinatorUpdates } = vi.hoisted(() => ({
  insertedPipelineEvents: [] as Array<Record<string, unknown>>,
  coordinatorUpdates: [] as Array<{ payload: Record<string, unknown> }>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "coordinator_runs") {
        return {
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, _val: string) => {
              coordinatorUpdates.push({ payload });
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  }),
}));

vi.mock("@/lib/pipeline-events/emit", () => ({
  emitPipelineEvent: vi.fn(async (_admin: unknown, input: Record<string, unknown>) => {
    insertedPipelineEvents.push(input);
    return { id: "evt-id" };
  }),
}));

vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmIntents: vi.fn(async () => [
    {
      intent_key: "payment_dispute",
      handler_agent_key: "x",
      handler_event: "debtor-email/payment-dispute.requested",
      requires_orchestration: false,
    },
    {
      intent_key: "address_change",
      handler_agent_key: "x",
      handler_event: "debtor-email/address-change.requested",
      requires_orchestration: false,
    },
  ]),
}));

import { debtorEmailOverrideHandler } from "../debtor-email-override-handler";
import {
  FIXTURE_AXIS_1_REGRESSION,
  FIXTURE_AXIS_1_CAPABILITY,
  FIXTURE_AXIS_2_REGRESSION,
  FIXTURE_AXIS_2_CAPABILITY_RERUN,
  FIXTURE_AXIS_3_REGRESSION,
  FIXTURE_AXIS_3_CAPABILITY,
  FIXTURE_AXIS_4_REGRESSION,
  FIXTURE_AXIS_4_CAPABILITY,
} from "@/lib/pipeline-events/__tests__/fixtures/override-events";

const stepStub = {
  run: async (_name: string, fn: () => Promise<unknown>) => fn(),
};

beforeEach(() => {
  insertedPipelineEvents.length = 0;
  coordinatorUpdates.length = 0;
  inngestSend.mockClear();
});

const operator_id = "00000000-0000-4000-8000-0000000000aa";

async function invoke(payload: object): Promise<unknown> {
  return (debtorEmailOverrideHandler as unknown as {
    handler: (ctx: { event: { data: Record<string, unknown> }; step: typeof stepStub }) => Promise<unknown>;
  }).handler({
    event: { data: { ...(payload as Record<string, unknown>), operator_id } },
    step: stepStub,
  });
}

describe("debtor-email-override-handler", () => {
  describe("axis-1 stage_1_category", () => {
    it("capability: emits override row with eval_type=capability + triggered_by=operator-override", async () => {
      await invoke(FIXTURE_AXIS_1_CAPABILITY);
      expect(insertedPipelineEvents).toHaveLength(1);
      const evt = insertedPipelineEvents[0];
      expect(evt.stage).toBe(1);
      expect(evt.eval_type).toBe("capability");
      expect(evt.triggered_by).toBe("operator-override");
      const override = evt.override as Record<string, unknown>;
      expect(override.axis).toBe("stage_1_category");
      expect(override.operator_id).toBe(operator_id);
      expect(override.original_decision).toBe("unknown");
      expect(override.submitted_at as string).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("regression: emits override row with eval_type=regression", async () => {
      await invoke(FIXTURE_AXIS_1_REGRESSION);
      expect(insertedPipelineEvents[0].eval_type).toBe("regression");
    });

    it("audit: re-dispatches classifier/verdict.recorded so verdict-worker handles reroute", async () => {
      await invoke(FIXTURE_AXIS_1_REGRESSION);
      expect(inngestSend).toHaveBeenCalled();
      const sent = inngestSend.mock.calls.find(
        (c: unknown[]) => (c[0] as { name: string }).name === "classifier/verdict.recorded",
      );
      expect(sent).toBeDefined();
      expect((sent![0] as { data: { triggered_by: string } }).data.triggered_by).toBe(
        "operator-override",
      );
    });
  });

  describe("axis-2 stage_2_customer", () => {
    it("no-rerun: updates coordinator_runs but does NOT send coordinator-complete", async () => {
      await invoke(FIXTURE_AXIS_2_REGRESSION);
      expect(coordinatorUpdates).toHaveLength(1);
      expect(coordinatorUpdates[0].payload.customer_account_id).toBe("123.4567");
      const replay = inngestSend.mock.calls.find(
        (c: unknown[]) => (c[0] as { name: string }).name === "debtor-email/coordinator-complete",
      );
      expect(replay).toBeUndefined();
    });

    it("rerun: sends coordinator-complete with triggered_by=operator-override-replay", async () => {
      await invoke(FIXTURE_AXIS_2_CAPABILITY_RERUN);
      const replay = inngestSend.mock.calls.find(
        (c: unknown[]) => (c[0] as { name: string }).name === "debtor-email/coordinator-complete",
      );
      expect(replay).toBeDefined();
      expect((replay![0] as { data: { triggered_by: string } }).data.triggered_by).toBe(
        "operator-override-replay",
      );
    });

    it("emits override row with stage=2 + eval_type from payload (capability case)", async () => {
      await invoke(FIXTURE_AXIS_2_CAPABILITY_RERUN);
      const stage2 = insertedPipelineEvents.find((e) => e.stage === 2);
      expect(stage2).toBeDefined();
      expect(stage2!.eval_type).toBe("capability");
    });
  });

  describe("axis-3 stage_3_intent", () => {
    it("dispatch: sends handler_event resolved from swarm_intents registry", async () => {
      await invoke(FIXTURE_AXIS_3_REGRESSION);
      const dispatched = inngestSend.mock.calls.find(
        (c: unknown[]) =>
          (c[0] as { name: string }).name === "debtor-email/payment-dispute.requested",
      );
      expect(dispatched).toBeDefined();
      expect((dispatched![0] as { data: { triggered_by: string } }).data.triggered_by).toBe(
        "operator-override-replay",
      );
    });

    it("audit: emits override row at stage=3, no DELETE on pipeline_events", async () => {
      await invoke(FIXTURE_AXIS_3_REGRESSION);
      expect(insertedPipelineEvents.find((e) => e.stage === 3)).toBeDefined();
    });

    it("capability tag flows through into emit row", async () => {
      await invoke(FIXTURE_AXIS_3_CAPABILITY);
      expect(insertedPipelineEvents.find((e) => e.stage === 3)?.eval_type).toBe("capability");
    });
  });

  describe("axis-4 stage_4_handler_output", () => {
    it("emit-only: emits override row with decision=draft_quality_rated, NO inngest.send dispatch", async () => {
      await invoke(FIXTURE_AXIS_4_REGRESSION);
      expect(insertedPipelineEvents).toHaveLength(1);
      expect(insertedPipelineEvents[0].decision).toBe("draft_quality_rated");
      const dd = insertedPipelineEvents[0].decision_details as Record<string, unknown>;
      expect(dd.draft_quality).toBe(2);
      expect(inngestSend).not.toHaveBeenCalled();
    });

    it("no-icontroller-mutation: no Browserless / iController side effect", async () => {
      await invoke(FIXTURE_AXIS_4_CAPABILITY);
      expect(inngestSend).not.toHaveBeenCalled();
      expect(coordinatorUpdates).toHaveLength(0);
    });
  });

  describe("replay safety", () => {
    it("submitted_at generated inside step.run — both invocations produce timestamps", async () => {
      await invoke(FIXTURE_AXIS_1_REGRESSION);
      await invoke(FIXTURE_AXIS_1_REGRESSION);
      expect(insertedPipelineEvents).toHaveLength(2);
      expect((insertedPipelineEvents[0].override as Record<string, unknown>).submitted_at).toBeDefined();
      expect((insertedPipelineEvents[1].override as Record<string, unknown>).submitted_at).toBeDefined();
    });
  });
});
