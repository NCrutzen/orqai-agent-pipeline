// Phase 3 Plan 01 + Plan 02 — override-actions.ts server-action tests.
//
// Plan 01 behaviors (5-9 below). Plan 02 (Axis 2 LIVE) replaces the original
// Test 10 static-grep guard — Axis 2 explicitly imports inngest.send. The
// CLAUDE.md learning dae6276 (no destructured inngest.send) is now enforced
// by a NARROWER source-grep that whitelists the inline-call pattern and
// rejects the anti-pattern.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Static grep guard — CLAUDE.md learning dae6276: never destructure
// inngest.send. The Plan 02 acceptance criteria require an inline call.
// ---------------------------------------------------------------------------
const SRC_PATH = join(__dirname, "..", "override-actions.ts");
const SRC = readFileSync(SRC_PATH, "utf8");

describe("override-actions.ts source — Inngest this-binding lock (learning dae6276)", () => {
  it("does NOT destructure inngest.send (would lose this-binding)", () => {
    expect(SRC).not.toMatch(/const\s+send\s*=\s*inngest\.send/);
    expect(SRC).not.toMatch(/let\s+send\s*=\s*inngest\.send/);
    // The inline-call pattern (Plan 02) IS expected and asserted positively
    // by the Axis-2 describe block below — this guard only rejects the
    // anti-pattern.
  });
});

// ---------------------------------------------------------------------------
// Runtime mocks. Each module the actions import is mocked so we can drive
// the auth gate + writeOverride return path without a real Supabase or
// session.
// ---------------------------------------------------------------------------

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

// Mutable admin-client mock. Most tests treat it as opaque (writeOverride is
// mocked separately); the escalateStage3ToHuman tests assign a real shape
// with `from(...).insert/update` to drive the direct-DB code path.
let adminClientMock: unknown = {};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClientMock,
}));

const inngestSendMock = vi.fn();
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: (p: { name: string; data: Record<string, unknown> }) =>
      inngestSendMock(p),
  },
}));

const writeOverrideMock = vi.fn();
vi.mock("@/lib/bulk-review/write-override", () => ({
  writeOverride: (...a: unknown[]) => writeOverrideMock(...a),
}));

const loadNoiseCatsMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmNoiseCategories: (...a: unknown[]) => loadNoiseCatsMock(...a),
}));

import {
  overrideStage1Category,
  submitStage4Handler,
  overrideStage2Customer,
  reorderStage3Intents,
  escalateStage3ToHuman,
} from "../override-actions";

const BASE_STAGE_1: Parameters<typeof overrideStage1Category>[0] = {
  email_label_id: "11111111-1111-1111-1111-111111111111",
  email_id: "22222222-2222-2222-2222-222222222222",
  swarm_type: "debtor-email",
  original_event_id: "33333333-3333-3333-3333-333333333333",
  original_decision: "unknown",
  context_version: "1.0.0",
  new_category_key: "invoice_copy_request",
  audit_note: null,
};

const BASE_STAGE_4: Parameters<typeof submitStage4Handler>[0] = {
  email_label_id: "11111111-1111-1111-1111-111111111111",
  email_id: "22222222-2222-2222-2222-222222222222",
  swarm_type: "debtor-email",
  original_event_id: "33333333-3333-3333-3333-333333333333",
  original_decision: "correct",
  context_version: "1.0.0",
  new_draft_quality: "needed_edit",
  new_feedback_reason: "tone too curt",
  verdict: "edited_minor",
  audit_note: null,
};

beforeEach(() => {
  getUserMock.mockReset();
  writeOverrideMock.mockReset();
  loadNoiseCatsMock.mockReset();
  inngestSendMock.mockReset();
  inngestSendMock.mockResolvedValue({ ids: ["ev-1"] });
  // Default: registry returns the keys used in the BASE inputs.
  loadNoiseCatsMock.mockResolvedValue([
    { category_key: "invoice_copy_request", display_label: "Invoice copy" },
    { category_key: "spam", display_label: "Spam" },
  ]);
});

describe("overrideStage1Category (Axis 1)", () => {
  it("Test 5a: rejects unauthenticated sessions with code 401", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const r = await overrideStage1Category(BASE_STAGE_1);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("401");
    }
    expect(writeOverrideMock).not.toHaveBeenCalled();
  });

  it("Test 5b: happy path returns ok with pipeline_event_id", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid-aa" } },
    });
    writeOverrideMock.mockResolvedValueOnce({
      pipeline_event_ids: ["pe-1"],
      axis_column_updated: true,
    });
    const r = await overrideStage1Category(BASE_STAGE_1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.pipeline_event_id).toBe("pe-1");
    }
    // writeOverride called with axis-1 args + operator_id from session.
    const callArgs = writeOverrideMock.mock.calls[0][1] as {
      operator_id: string;
      input: { axis: string; new_category_key: string };
    };
    expect(callArgs.operator_id).toBe("operator-uuid-aa");
    expect(callArgs.input.axis).toBe("stage_1_category");
    expect(callArgs.input.new_category_key).toBe("invoice_copy_request");
  });

  it("rejects an unknown category_key with code invalid_category (hard separation)", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid-aa" } },
    });
    // Registry says only invoice_copy_request + spam exist; the input below
    // uses an intent key (Stage 3 vocabulary) — exactly the hard-separation
    // attack the validation guards against.
    const r = await overrideStage1Category({
      ...BASE_STAGE_1,
      new_category_key: "invoice_copy", // would be a swarm_intents key
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("invalid_category");
    }
    expect(writeOverrideMock).not.toHaveBeenCalled();
  });

  it("accepts the literal 'unknown' without consulting the registry", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid-aa" } },
    });
    writeOverrideMock.mockResolvedValueOnce({
      pipeline_event_ids: ["pe-1"],
      axis_column_updated: true,
    });
    const r = await overrideStage1Category({
      ...BASE_STAGE_1,
      new_category_key: "unknown",
    });
    expect(r.ok).toBe(true);
    expect(loadNoiseCatsMock).not.toHaveBeenCalled();
  });

  it("Test 6: propagates writeOverride errors as a structured ActionErr (does NOT throw)", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid-aa" } },
    });
    writeOverrideMock.mockRejectedValueOnce(new Error("boom from writeOverride"));
    const r = await overrideStage1Category(BASE_STAGE_1);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("boom from writeOverride");
    }
  });
});

describe("submitStage4Handler (Axis 4)", () => {
  it("Test 7a: rejects unauthenticated sessions with code 401", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const r = await submitStage4Handler(BASE_STAGE_4);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("401");
  });

  it("Test 7b: happy path returns ok with pipeline_event_id", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid-aa" } },
    });
    writeOverrideMock.mockResolvedValueOnce({
      pipeline_event_ids: ["pe-4"],
      axis_column_updated: true,
    });
    const r = await submitStage4Handler(BASE_STAGE_4);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.pipeline_event_id).toBe("pe-4");
    const callArgs = writeOverrideMock.mock.calls[0][1] as {
      input: { axis: string; new_draft_quality: string };
    };
    expect(callArgs.input.axis).toBe("stage_4_handler_output");
    expect(callArgs.input.new_draft_quality).toBe("needed_edit");
  });

  it("rejects an invalid verdict with code invalid_verdict", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid-aa" } },
    });
    const r = await submitStage4Handler({
      ...BASE_STAGE_4,
      verdict: "not_a_real_verdict",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_verdict");
    expect(writeOverrideMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid draft_quality with code invalid_draft_quality", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid-aa" } },
    });
    const r = await submitStage4Handler({
      ...BASE_STAGE_4,
      new_draft_quality: "not_a_quality",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_draft_quality");
    expect(writeOverrideMock).not.toHaveBeenCalled();
  });

  it("Test 8: rejects empty audit_note when verdict starts with 'rejected_'", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid-aa" } },
    });
    const r = await submitStage4Handler({
      ...BASE_STAGE_4,
      verdict: "rejected_other",
      new_draft_quality: "rejected",
      audit_note: "  ", // whitespace-only must also fail.
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("audit_required");
    expect(writeOverrideMock).not.toHaveBeenCalled();
  });

  it("accepts a rejected_* verdict when audit_note is non-empty", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid-aa" } },
    });
    writeOverrideMock.mockResolvedValueOnce({
      pipeline_event_ids: ["pe-4"],
      axis_column_updated: true,
    });
    const r = await submitStage4Handler({
      ...BASE_STAGE_4,
      verdict: "rejected_wrong_tone",
      new_draft_quality: "rejected",
      audit_note: "tone was too sharp for an apology email",
    });
    expect(r.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Plan 02 — Axis 2 (LIVE: writeOverride + conditional Inngest re-emit).
// ---------------------------------------------------------------------------

const BASE_STAGE_2 = {
  email_label_id: "11111111-1111-1111-1111-111111111111",
  email_id: "22222222-2222-2222-2222-222222222222",
  swarm_type: "debtor-email",
  original_event_id: "33333333-3333-3333-3333-333333333333",
  original_decision: "0042",
  context_version: "1.0.0",
  new_customer_account_id: "0079",
  audit_note: "Found by invoice reference 2024-3142 in the body.",
  rerun: false,
} satisfies Parameters<typeof overrideStage2Customer>[0];

describe("overrideStage2Customer (Axis 2 — Plan 02 LIVE)", () => {
  it("Test 6: rejects unauthenticated sessions with code 401", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const r = await overrideStage2Customer(BASE_STAGE_2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("401");
    expect(writeOverrideMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("Test 7: rejects new_customer_account_id that does NOT match /^\\d{4}$/", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid" } },
    });
    const r = await overrideStage2Customer({
      ...BASE_STAGE_2,
      new_customer_account_id: "79", // not 4 digits
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_account");
    expect(writeOverrideMock).not.toHaveBeenCalled();

    // Also: non-digit chars rejected.
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid" } },
    });
    const r2 = await overrideStage2Customer({
      ...BASE_STAGE_2,
      new_customer_account_id: "abcd",
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe("invalid_account");
  });

  it("Test 8: rejects empty / whitespace-only audit_note", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid" } },
    });
    const r = await overrideStage2Customer({
      ...BASE_STAGE_2,
      audit_note: "   ",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("audit_required");
    expect(writeOverrideMock).not.toHaveBeenCalled();
  });

  it("Test 1: rerun=false → writeOverride called, no inngest.send", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid" } },
    });
    writeOverrideMock.mockResolvedValueOnce({
      pipeline_event_ids: ["pe-2"],
      axis_column_updated: true,
    });
    const r = await overrideStage2Customer({ ...BASE_STAGE_2, rerun: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.pipeline_event_id).toBe("pe-2");
      expect(r.data.rerun_emitted).toBe(false);
    }
    expect(writeOverrideMock).toHaveBeenCalledTimes(1);
    const call = writeOverrideMock.mock.calls[0][1] as {
      operator_id: string;
      input: { axis: string; new_customer_account_id: string; reason: string };
    };
    expect(call.operator_id).toBe("operator-uuid");
    expect(call.input.axis).toBe("stage_2_customer");
    expect(call.input.new_customer_account_id).toBe("0079");
    expect(call.input.reason).toBe(BASE_STAGE_2.audit_note);
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("Test 2: rerun=true → writeOverride + inngest.send for <swarm>/predicted with triggered_by", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid" } },
    });
    writeOverrideMock.mockResolvedValueOnce({
      pipeline_event_ids: ["pe-2"],
      axis_column_updated: true,
    });
    const r = await overrideStage2Customer({
      ...BASE_STAGE_2,
      rerun: true,
      ranked_intents: [{ intent: "invoice_copy_request", confidence: "high" }],
      agent_run_id: "agent-run-aa",
      run_id: "run-bb",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.rerun_emitted).toBe(true);
    }
    expect(inngestSendMock).toHaveBeenCalledTimes(1);
    const evt = inngestSendMock.mock.calls[0][0] as {
      name: string;
      data: Record<string, unknown>;
    };
    expect(evt.name).toBe("debtor-email/predicted");
    expect(evt.data.swarm_type).toBe("debtor-email");
    expect(evt.data.triggered_by).toBe("operator-override");
    expect(evt.data.email_id).toBe(BASE_STAGE_2.email_id);
    expect(evt.data.customer_account_id).toBe("0079");
    expect(evt.data.agent_run_id).toBe("agent-run-aa");
    expect(evt.data.run_id).toBe("run-bb");
    expect(Array.isArray(evt.data.ranked)).toBe(true);
  });

  it("Test 3: writeOverride throws → returns ActionErr without inngest.send", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid" } },
    });
    writeOverrideMock.mockRejectedValueOnce(new Error("supabase write failed"));
    const r = await overrideStage2Customer({ ...BASE_STAGE_2, rerun: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("supabase write failed");
    }
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("Test 4: writeOverride ok but inngest.send throws → code rerun_failed", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid" } },
    });
    writeOverrideMock.mockResolvedValueOnce({
      pipeline_event_ids: ["pe-2"],
      axis_column_updated: true,
    });
    inngestSendMock.mockRejectedValueOnce(new Error("inngest unreachable"));
    const r = await overrideStage2Customer({ ...BASE_STAGE_2, rerun: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("rerun_failed");
      expect(r.error).toContain("override saved but re-run kickoff failed");
      expect(r.error).toContain("inngest unreachable");
    }
  });
});

// ---------------------------------------------------------------------------
// Plan 03 — Axis 3 (LIVE: writeOverride N-emit + conditional Inngest re-emit).
// ---------------------------------------------------------------------------

const BASE_STAGE_3: Parameters<typeof reorderStage3Intents>[0] = {
  email_label_id: "11111111-1111-1111-1111-111111111111",
  email_id: "22222222-2222-2222-2222-222222222222",
  swarm_type: "debtor-email",
  original_event_id: "33333333-3333-3333-3333-333333333333",
  original_decision: "invoice_copy_request",
  context_version: "1.0.0",
  // Sub-position reorder — top-1 unchanged.
  new_ranked_intents: [
    { intent_key: "invoice_copy_request", confidence: 0.6 },
    { intent_key: "general_inquiry", confidence: 0.3 },
    { intent_key: "other", confidence: 0.1 },
  ],
  audit_note: null,
};

const BASE_STAGE_3_ESCALATE: Parameters<typeof escalateStage3ToHuman>[0] = {
  email_label_id: "11111111-1111-1111-1111-111111111111",
  email_id: "22222222-2222-2222-2222-222222222222",
  swarm_type: "debtor-email",
  original_event_id: "33333333-3333-3333-3333-333333333333",
  context_version: "1.0.0",
  audit_note: "Customer wants to schedule a phone call — no topic for that.",
};

describe("reorderStage3Intents (Axis 3 — Plan 03 LIVE)", () => {
  it("rejects unauthenticated sessions with code 401", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const r = await reorderStage3Intents(BASE_STAGE_3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("401");
    expect(writeOverrideMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("rejects unknown intent_key with code invalid_intent (hard separation)", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid" } },
    });
    const r = await reorderStage3Intents({
      ...BASE_STAGE_3,
      new_ranked_intents: [
        { intent_key: "invoice_copy_request", confidence: 0.5 },
        // Stage 1 vocabulary — hard-separation violation.
        { intent_key: "spam", confidence: 0.3 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_intent");
    expect(writeOverrideMock).not.toHaveBeenCalled();
  });

  it("rejects empty new_ranked_intents with code invalid_intent", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid" } },
    });
    const r = await reorderStage3Intents({
      ...BASE_STAGE_3,
      new_ranked_intents: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_intent");
  });

  it("sub-position reorder (top-1 unchanged) → writeOverride called, NO inngest.send", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid" } },
    });
    writeOverrideMock.mockResolvedValueOnce({
      pipeline_event_ids: ["pe-a", "pe-b", "pe-c"],
      axis_column_updated: false,
    });
    const r = await reorderStage3Intents(BASE_STAGE_3);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.pipeline_event_ids).toEqual(["pe-a", "pe-b", "pe-c"]);
      expect(r.data.rerun_emitted).toBe(false);
    }
    expect(writeOverrideMock).toHaveBeenCalledTimes(1);
    const callArgs = writeOverrideMock.mock.calls[0][1] as {
      operator_id: string;
      input: { axis: string; new_ranked_intents: Array<{ intent_key: string }> };
    };
    expect(callArgs.operator_id).toBe("operator-uuid");
    expect(callArgs.input.axis).toBe("stage_3_intent");
    expect(callArgs.input.new_ranked_intents).toHaveLength(3);
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("top-1 change → writeOverride + inngest.send for <swarm>/predicted (operator-override)", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid" } },
    });
    writeOverrideMock.mockResolvedValueOnce({
      pipeline_event_ids: ["pe-a", "pe-b"],
      axis_column_updated: false,
    });
    const r = await reorderStage3Intents({
      ...BASE_STAGE_3,
      // Top-1 flipped from invoice_copy_request to general_inquiry.
      new_ranked_intents: [
        { intent_key: "general_inquiry", confidence: 0.55 },
        { intent_key: "invoice_copy_request", confidence: 0.45 },
      ],
      agent_run_id: "agent-run-cc",
      run_id: "run-dd",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.rerun_emitted).toBe(true);
    expect(inngestSendMock).toHaveBeenCalledTimes(1);
    const evt = inngestSendMock.mock.calls[0][0] as {
      name: string;
      data: Record<string, unknown>;
    };
    expect(evt.name).toBe("debtor-email/predicted");
    expect(evt.data.swarm_type).toBe("debtor-email");
    expect(evt.data.triggered_by).toBe("operator-override");
    expect(evt.data.email_id).toBe(BASE_STAGE_3.email_id);
    expect(evt.data.agent_run_id).toBe("agent-run-cc");
    expect(evt.data.run_id).toBe("run-dd");
    expect(Array.isArray(evt.data.ranked)).toBe(true);
  });

  it("writeOverride throws → returns ActionErr without inngest.send", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid" } },
    });
    writeOverrideMock.mockRejectedValueOnce(new Error("supabase write failed"));
    const r = await reorderStage3Intents({
      ...BASE_STAGE_3,
      new_ranked_intents: [
        { intent_key: "general_inquiry", confidence: 0.55 },
        { intent_key: "invoice_copy_request", confidence: 0.45 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("supabase write failed");
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("writeOverride ok + inngest.send throws (top-1 change) → code rerun_failed", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid" } },
    });
    writeOverrideMock.mockResolvedValueOnce({
      pipeline_event_ids: ["pe-a", "pe-b"],
      axis_column_updated: false,
    });
    inngestSendMock.mockRejectedValueOnce(new Error("inngest unreachable"));
    const r = await reorderStage3Intents({
      ...BASE_STAGE_3,
      new_ranked_intents: [
        { intent_key: "general_inquiry", confidence: 0.55 },
        { intent_key: "invoice_copy_request", confidence: 0.45 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("rerun_failed");
      expect(r.error).toContain("reorder saved but re-run kickoff failed");
      expect(r.error).toContain("inngest unreachable");
    }
  });
});

describe("escalateStage3ToHuman (Axis 3 escalate — Plan 03 LIVE)", () => {
  // The escalate action talks to Supabase directly (not via writeOverride), so
  // swap the shared adminClientMock to a real shape with from().insert/update.
  const insertMock = vi.fn();
  const updateMock = vi.fn();

  beforeEach(() => {
    insertMock.mockReset();
    updateMock.mockReset();
    // Default success returns.
    insertMock.mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: "pe-escalate-1" }, error: null }),
      }),
    });
    updateMock.mockReturnValue({
      eq: async () => ({ error: null }),
    });
    adminClientMock = {
      from: (table: string) =>
        table === "agent_runs"
          ? { update: updateMock }
          : { insert: insertMock },
    };
  });

  it("rejects unauthenticated sessions with code 401", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const r = await escalateStage3ToHuman(BASE_STAGE_3_ESCALATE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("401");
  });

  it("rejects empty / whitespace-only audit_note with code audit_required", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid" } },
    });
    const r = await escalateStage3ToHuman({
      ...BASE_STAGE_3_ESCALATE,
      audit_note: "   ",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("audit_required");
  });

  it("happy path: emits pipeline_events row + flips agent_runs.status to routed_human_queue", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "operator-uuid" } },
    });
    const r = await escalateStage3ToHuman(BASE_STAGE_3_ESCALATE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.pipeline_event_id).toBe("pe-escalate-1");
    // pipeline_events insert called with the expected shape (stage=3, eval_type='intent-escalation').
    expect(insertMock).toHaveBeenCalledTimes(1);
    const inserted = insertMock.mock.calls[0][0] as {
      stage: number;
      eval_type: string;
      decision_details: { escalation_reason: string };
      triggered_by: string;
    };
    expect(inserted.stage).toBe(3);
    expect(inserted.eval_type).toBe("intent-escalation");
    expect(inserted.triggered_by).toBe("operator-override");
    expect(inserted.decision_details.escalation_reason).toBe(
      BASE_STAGE_3_ESCALATE.audit_note,
    );
    // agent_runs.status flip — canonical route-to-human-queue signal.
    expect(updateMock).toHaveBeenCalledTimes(1);
    const updated = updateMock.mock.calls[0][0] as { status: string };
    expect(updated.status).toBe("routed_human_queue");
  });

  it("source-grep: override-actions imports SWARM_INTENTS (codegen literal-union)", () => {
    expect(SRC).toContain("SWARM_INTENTS");
    expect(SRC).toContain("intent.generated");
  });

  it("source-grep: override-actions emits 'intent-escalation' eval_type", () => {
    expect(SRC).toContain("intent-escalation");
  });

  it("source-grep: stub error string is gone (Plan 03 replaced it)", () => {
    expect(SRC).not.toMatch(/reorderStage3Intents.*not yet wired/);
    expect(SRC).not.toMatch(/escalateStage3ToHuman.*not yet wired/);
  });
});
