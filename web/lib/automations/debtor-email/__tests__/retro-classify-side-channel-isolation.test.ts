/**
 * Phase 87 Plan 04 Task 1 — RED guard: Side-Channel Isolation.
 *
 * NEW hard rule for this phase: the retro function MUST NOT touch live
 * pipeline telemetry. Writing to agent_runs / coordinator_runs /
 * pipeline_events, or emitting `<swarm>/predicted`, would fire Stage 3.5
 * dispatch on historical email and generate real Outlook drafts /
 * iController taggings.
 *
 * Two-pronged guard:
 *  - Case 1 (source-grep): function file contains no forbidden strings.
 *  - Case 2 (runtime spy): handler never touches the forbidden tables.
 *  - Case 3 (runtime spy): handler never emits a `predicted`-suffixed event via inngest.send.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const FN_PATH = resolve(
  __dirname,
  "../../../inngest/functions/debtor-email-stage-3-retro-classify.ts",
);

describe("Phase 87 retro-classify — Side-Channel Isolation (source-grep)", () => {
  it("function file exists", () => {
    expect(existsSync(FN_PATH)).toBe(true);
  });

  it.each([
    "agent_runs",
    "coordinator_runs",
    "pipeline_events",
    "/predicted",
    "mergeToolOutputs",
    "updateRun",
    "emitPipelineEvent",
  ])("function file must NOT contain forbidden token: %s", (token) => {
    const src = readFileSync(FN_PATH, "utf8");
    expect(src).not.toContain(token);
  });
});

// ---------------------------------------------------------------------------
// Runtime guard — drive the handler with a spying admin and assert no
// forbidden table is touched and no `*/predicted` event is emitted.
// ---------------------------------------------------------------------------

const { createFunctionMock, sendMock } = vi.hoisted(() => ({
  createFunctionMock: vi.fn((cfg, trigger, handler) => ({
    __config: cfg,
    __trigger: trigger,
    handler,
  })),
  sendMock: vi.fn().mockResolvedValue({ ids: ["evt-retro"] }),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: createFunctionMock,
    send: sendMock,
  },
}));

// Plan 02 helpers — stub the work-doing layer; we're only checking what the
// orchestrator does to the admin client.
vi.mock("@/lib/automations/debtor-email/retro/select-candidates", () => ({
  selectCandidates: vi.fn(async () => [
    {
      email_id: "11111111-1111-1111-1111-111111111111",
      original_top_intent: "general_inquiry",
      original_confidence: 0.7,
      created_at: "2026-05-10T08:30:00Z",
    },
  ]),
  STAGE_3_RETRO_HARD_CAP: 5000,
}));

vi.mock("@/lib/automations/debtor-email/retro/reconstruct-input", () => ({
  reconstructInput: vi.fn(async () => ({
    email_id: "11111111-1111-1111-1111-111111111111",
    inngest_run_id: "run-1",
    subject: "x",
    body_text: "x",
    assembled_input: "<inbound_message><subject>x</subject><body>x</body></inbound_message>",
    sender_email: "a@b.nl",
    sender_domain: "b.nl",
    mailbox: "debiteuren@smeba.nl",
    entity: "smeba",
    received_at: "2026-05-10T08:30:00Z",
  })),
}));

vi.mock("@/lib/automations/debtor-email/retro/aggregate-baseline", () => ({
  aggregateBaseline: vi.fn(async () => ({
    closed_list_rows: 1,
    proposal_rows: 0,
  })),
}));

vi.mock("@/lib/automations/debtor-email/coordinator/invoke-intent", () => ({
  invokeIntentAgent: vi.fn(async () => ({
    output: {
      intent_version: "2026-05-19.v3",
      ranked: [
        {
          intent: "payment_dispute",
          confidence: "high",
          document_reference: null,
          sub_type: null,
          reasoning: "stub",
        },
      ],
      language: "nl",
      urgency: "normal",
      intent_proposal: null,
      proposal_reason: null,
    },
    raw: "{}",
    usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
  })),
}));

// Admin client mock — tracks every .from(table) call.
const { tableCalls } = vi.hoisted(() => ({
  tableCalls: [] as string[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn((table: string) => {
      tableCalls.push(table);
      // Chainable thenable resolving to the shape each query needs:
      const builder: Record<string, unknown> = {};
      // For precondition query: returns 5 clusters with refreshed_at = now.
      const cluster_data = Array.from({ length: 5 }, (_, i) => ({
        refreshed_at: new Date().toISOString(),
        cluster_id: `c${i}`,
      }));
      const select = () => builder;
      builder.select = select;
      builder.eq = () => builder;
      builder.gte = () => builder;
      builder.lt = () => builder;
      builder.lte = () => builder;
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.upsert = vi.fn(async () => ({ data: null, error: null }));
      builder.insert = vi.fn(async () => ({ data: null, error: null }));
      // Make awaitable: terminal resolution depends on the table being queried.
      builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => {
        if (table.endsWith("intent_proposal_clusters")) {
          return resolve({ data: cluster_data, error: null });
        }
        return resolve({ data: [], error: null });
      };
      return builder;
    }),
  }),
}));

// Import AFTER mocks.
import { debtorEmailStage3RetroClassify } from "../../../inngest/functions/debtor-email-stage-3-retro-classify";

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => unknown) => fn()),
  };
}

describe("Phase 87 retro-classify — Side-Channel Isolation (runtime)", () => {
  beforeEach(() => {
    tableCalls.length = 0;
    sendMock.mockClear();
  });

  it("handler never calls admin.from('agent_runs' | 'coordinator_runs' | 'pipeline_events')", async () => {
    const handler = (debtorEmailStage3RetroClassify as unknown as {
      handler: (ctx: { event: { data: unknown }; step: ReturnType<typeof makeStep> }) => Promise<unknown>;
    }).handler;

    await handler({
      event: {
        data: {
          swarm_type: "debtor-email",
          since: "2026-05-01",
          until: "2026-05-31",
        },
      },
      step: makeStep(),
    });

    expect(tableCalls).not.toContain("agent_runs");
    expect(tableCalls).not.toContain("coordinator_runs");
    expect(tableCalls).not.toContain("pipeline_events");
  });

  it("handler never inngest.sends a `*/predicted` event", async () => {
    const handler = (debtorEmailStage3RetroClassify as unknown as {
      handler: (ctx: { event: { data: unknown }; step: ReturnType<typeof makeStep> }) => Promise<unknown>;
    }).handler;

    await handler({
      event: {
        data: {
          swarm_type: "debtor-email",
          since: "2026-05-01",
          until: "2026-05-31",
        },
      },
      step: makeStep(),
    });

    const predictedSends = sendMock.mock.calls.filter((args) => {
      const ev = args[0] as { name?: string } | undefined;
      return typeof ev?.name === "string" && ev.name.endsWith("/predicted");
    });
    expect(predictedSends).toHaveLength(0);
  });
});
