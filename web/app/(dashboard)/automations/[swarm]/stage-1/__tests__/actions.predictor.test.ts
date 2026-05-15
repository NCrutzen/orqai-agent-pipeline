// Phase 999.8 Plan 01 — RED scaffold for D-08 + Pitfall 9: recordVerdict
// must write `predictor` to public.agent_runs.
//
// Contract (RESEARCH §7):
//   - Read pipeline_events (filtered by email_id, stage=1, swarm_type) for
//     the predicted email to recover decision_details.
//   - Derive predictor:
//       decision_details.llm_invoked === true → 'llm_2nd_pass'
//       else decision_details.regex?.invoked === true → 'regex'
//       else NULL (defensive edge case)
//   - NEVER infer predictor from regex.matchedRule === "no_match" — that
//     value marks regex abstain, NOT a regex prediction (Pitfall 2).
//   - The agent_runs.insert payload includes the derived `predictor` field.
//   - Pitfall 9: VerdictInput must carry a REAL email_id (today the
//     existing code aliases email_id := automation_run_id, which would
//     produce a wrong pipeline_events lookup).
//
// Hard-separation discipline: Stage 1 noise-filter mechanics only. The
// predictor is metadata about WHICH Stage 1 predictor decided this row;
// no swarm_intents / Stage 3 work.
//
// These tests are RED today: today's recordVerdict does NOT read
// pipeline_events, does NOT derive predictor, and does NOT pass it into
// the agent_runs.insert payload. They turn GREEN when Wave 1 lands.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Inngest mock --------------------------------------------------------
// vi.hoisted keeps the spy reachable from the (top-hoisted) vi.mock factory.
const { inngestSend } = vi.hoisted(() => ({
  inngestSend: vi.fn().mockResolvedValue({ ids: ["evt"] }),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: inngestSend },
}));

// ---- Outlook + emit stub -------------------------------------------------
vi.mock("@/lib/outlook", () => ({
  fetchMessageBody: vi.fn(),
}));
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: vi.fn(async () => {}),
}));

// ---- Server auth client stub --------------------------------------------
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { email: "test@x" } } }) },
  })),
}));

// ---- Registry mock (loadSwarmNoiseCategories) ----------------------------
const loadSwarmNoiseCategoriesMock = vi.fn(async () => [
  { category_key: "unknown" },
  { category_key: "payment_admittance" },
  { category_key: "auto_reply" },
]);
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmNoiseCategories: (...args: Parameters<typeof loadSwarmNoiseCategoriesMock>) =>
    loadSwarmNoiseCategoriesMock(...args),
}));

// ---- Admin mock — chainable query-builder --------------------------------

interface PipelineEventFixture {
  decision_details: Record<string, unknown> | null;
}

let pipelineEventFixture: PipelineEventFixture | null = null;
const agentRunsInserts: Array<Record<string, unknown>> = [];
const automationRunsUpdates: Array<Record<string, unknown>> = [];

function makeAdmin() {
  return {
    from: vi.fn((table: string) => {
      if (table === "automation_runs") {
        const b = {
          _selectCols: null as string | null,
          _eqCalls: [] as Array<{ col: string; val: unknown }>,
          select(cols: string) {
            this._selectCols = cols;
            return this;
          },
          eq(col: string, val: unknown) {
            this._eqCalls.push({ col, val });
            return this;
          },
          async single() {
            return {
              data: { result: { existing_key: "existing_value" } },
              error: null,
            };
          },
          update(row: Record<string, unknown>) {
            automationRunsUpdates.push(row);
            return {
              eq: () => Promise.resolve({ error: null }),
            };
          },
        };
        return b;
      }
      if (table === "pipeline_events") {
        const b = {
          _eqCalls: [] as Array<{ col: string; val: unknown }>,
          select(_cols: string) {
            return this;
          },
          eq(col: string, val: unknown) {
            this._eqCalls.push({ col, val });
            return this;
          },
          order(_col: string, _opts?: unknown) {
            return this;
          },
          limit(_n: number) {
            return this;
          },
          async maybeSingle() {
            return {
              data: pipelineEventFixture,
              error: null,
            };
          },
          async single() {
            return {
              data: pipelineEventFixture,
              error: null,
            };
          },
        };
        return b;
      }
      if (table === "agent_runs") {
        const b = {
          insert(row: Record<string, unknown>) {
            agentRunsInserts.push(row);
            return {
              select: () => ({
                async single() {
                  return { data: { id: "ar-new-uuid" }, error: null };
                },
              }),
            };
          },
        };
        return b;
      }
      return {
        select: () => ({ eq: () => ({ async single() { return { data: null, error: null }; } }) }),
      };
    }),
  };
}

let adminMock = makeAdmin();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock),
}));

// Import AFTER mocks
import { recordVerdict } from "@/app/(dashboard)/automations/[swarm]/stage-1/actions";

function baseInput(
  overrides: Partial<Record<string, unknown>> = {},
): Parameters<typeof recordVerdict>[0] {
  return {
    swarm_type: "debtor-email",
    automation_run_id: "ar-uuid-1",
    rule_key: "no_match",
    decision: "approve",
    message_id: "msg-1",
    source_mailbox: "debiteuren@smeba.nl",
    entity: "smeba",
    predicted_category: "payment_admittance",
    // Phase 999.8 Pitfall 9: REAL email_id must flow through VerdictInput,
    // not be aliased from automation_run_id. The schema MUST require this.
    email_id: "email-real-uuid-1",
    ...overrides,
  } as Parameters<typeof recordVerdict>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  agentRunsInserts.length = 0;
  automationRunsUpdates.length = 0;
  pipelineEventFixture = null;
  adminMock = makeAdmin();
  inngestSend.mockReset();
  inngestSend.mockResolvedValue({ ids: ["evt"] });
});

describe("Phase 999.8 D-08 — recordVerdict writes predictor='llm_2nd_pass' when LLM invoked", () => {
  it("decision_details.llm_invoked === true → predictor='llm_2nd_pass'", async () => {
    pipelineEventFixture = {
      decision_details: {
        llm_invoked: true,
        llm_category_key: "payment_admittance",
        llm_confidence: "high",
        regex: { invoked: true, matchedRule: "no_match", category: "unknown" },
        final_category_key: "payment_admittance",
      },
    };

    await recordVerdict(baseInput());

    expect(agentRunsInserts.length).toBe(1);
    expect(agentRunsInserts[0]).toEqual(
      expect.objectContaining({ predictor: "llm_2nd_pass" }),
    );
  });

  it("decision_details.llm_invoked !== true AND regex.invoked === true → predictor='regex'", async () => {
    pipelineEventFixture = {
      decision_details: {
        llm_invoked: false,
        regex: {
          invoked: true,
          matchedRule: "payment_kw_v1",
          category: "payment_admittance",
        },
        final_category_key: "payment_admittance",
      },
    };

    await recordVerdict(baseInput());

    expect(agentRunsInserts.length).toBe(1);
    expect(agentRunsInserts[0]).toEqual(
      expect.objectContaining({ predictor: "regex" }),
    );
  });

  it("neither llm_invoked nor regex.invoked → predictor=null (defensive)", async () => {
    pipelineEventFixture = {
      decision_details: {
        llm_invoked: false,
        regex: { invoked: false, matchedRule: null, category: "unknown" },
        final_category_key: "unknown",
      },
    };

    await recordVerdict(baseInput());

    expect(agentRunsInserts.length).toBe(1);
    expect(agentRunsInserts[0]).toEqual(
      expect.objectContaining({ predictor: null }),
    );
  });

  it("Pitfall 2: regex.matchedRule==='no_match' WITH llm_invoked=true → predictor='llm_2nd_pass' (NOT 'regex')", async () => {
    // Critical: regex abstained (matchedRule='no_match'), LLM took over.
    // Treating matchedRule==='no_match' as a regex prediction would
    // mis-attribute every LLM-2nd-pass row as 'regex'.
    pipelineEventFixture = {
      decision_details: {
        llm_invoked: true,
        llm_category_key: "auto_reply",
        llm_confidence: "high",
        regex: { invoked: true, matchedRule: "no_match", category: "unknown" },
        final_category_key: "auto_reply",
      },
    };

    await recordVerdict(baseInput());

    expect(agentRunsInserts.length).toBe(1);
    expect(agentRunsInserts[0].predictor).toBe("llm_2nd_pass");
    expect(agentRunsInserts[0].predictor).not.toBe("regex");
  });

  it("Pitfall 9: VerdictInput schema requires a real email_id (rejects payload missing email_id)", async () => {
    pipelineEventFixture = {
      decision_details: { llm_invoked: true, final_category_key: "auto_reply" },
    };

    const badInput = baseInput();
    // Strip email_id to verify the schema rejects it.
    delete (badInput as { email_id?: string }).email_id;

    await expect(recordVerdict(badInput)).rejects.toThrow();
  });

  it("pipeline_events lookup filters by email_id (NOT automation_run_id aliasing)", async () => {
    pipelineEventFixture = {
      decision_details: { llm_invoked: true, final_category_key: "auto_reply" },
    };

    const fromSpy = vi.spyOn(adminMock, "from");
    await recordVerdict(baseInput({ email_id: "email-real-uuid-9" }));

    // Verify pipeline_events was queried (Wave 1 adds this lookup).
    const calls = fromSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContain("pipeline_events");
  });
});
