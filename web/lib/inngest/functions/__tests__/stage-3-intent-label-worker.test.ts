/**
 * Phase 117 Plan 02 Task 2 (OUTLOOK-CAT-01..05, D-2 / D-3 / D-4) — the shared
 * swarm-agnostic gated intent-label worker.
 *
 * Contract pinned here (PATCH call counts are the load-bearing assertions):
 *   GATED (isStageBlocked === true)       → 0 PATCH, 0 store write, decision="gated".
 *                                           Verified for debtor AND sales (both seeded true).
 *   never-clobber (operator category edit) → 0 PATCH, 0 store write, decision="clobber-skip".
 *   idempotency (same verdict written)     → 0 PATCH, decision="unchanged".
 *   verdict change (OPEN, no prior, no edit) → exactly 1 PATCH (merged array,
 *                                           stale AI: stripped), store updated, decision="written".
 *   missing source_id / mailbox (legacy)   → 0 PATCH, decision="unresolved" (fail-soft, no throw).
 *
 * Mock posture mirrors coordinator-stage3-routing-gate.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Inngest mock ---------------------------------------------------------
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue({ ids: ["evt"] }),
    createFunction: vi.fn((cfg, _trigger, handler) => ({
      __config: cfg,
      handler,
    })),
  },
}));

// ---- graphFetch mock — capture GET + PATCH calls --------------------------
const graphFetchMock = vi.fn();
vi.mock("@/lib/outlook/client", () => ({
  graphFetch: (...args: unknown[]) => graphFetchMock(...args),
}));
function patchCalls() {
  return graphFetchMock.mock.calls.filter(
    (c) => (c[1] as { method?: string } | undefined)?.method === "PATCH",
  );
}

// ---- loadSwarm mock -------------------------------------------------------
const loadSwarmMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
}));

// ---- written-category-store mock ------------------------------------------
const readWrittenMock = vi.fn();
const recordWrittenMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/outlook/written-category-store", () => ({
  readWrittenCategory: (...args: unknown[]) => readWrittenMock(...args),
  recordWrittenCategory: (...args: unknown[]) => recordWrittenMock(...args),
}));

vi.mock("@/lib/pipeline-events/emit", () => ({
  emitPipelineEvent: vi.fn().mockResolvedValue(undefined),
}));

// ---- Supabase mock --------------------------------------------------------
// emails resolve + never-clobber queries. Configurable per-table via closures.
let emailsRow: { source_id: string | null; mailbox: string | null } | null = {
  source_id: "graph-id-1",
  mailbox: "verkoop@smeba.nl",
};
let transitionRow: { id: string } | null = null;
let signalRow: { id: string } | null = null;

function makeSupabaseMock() {
  const publicBuilder = (table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => {
      if (table === "swarm_email_transitions") {
        return { data: transitionRow, error: null };
      }
      if (table === "swarm_review_signals") {
        return { data: signalRow, error: null };
      }
      return { data: null, error: null };
    });
    return builder;
  };
  const schemaBuilder = () => ({
    from: (_t: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(async () => ({ data: emailsRow, error: null }));
      return builder;
    },
  });
  return {
    from: vi.fn((t: string) => publicBuilder(t)),
    schema: vi.fn(() => schemaBuilder()),
  };
}
let supabaseMock = makeSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => supabaseMock),
}));

const stepStub = {
  run: async (_name: string, fn: () => Promise<unknown>) => fn(),
};

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    name: "pipeline/intent-label.requested",
    data: {
      swarm_type: "sales-email",
      email_id: "email-1",
      intent_key: "quote_request",
      source_mailbox: "verkoop@smeba.nl",
      run_id: "run-1",
      ...overrides,
    },
  };
}

function okGet(categories: string[]) {
  return { ok: true, json: async () => ({ categories }) };
}

describe("Phase 117 Plan 02 — stage-3-intent-label-worker", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    supabaseMock = makeSupabaseMock();
    emailsRow = { source_id: "graph-id-1", mailbox: "verkoop@smeba.nl" };
    transitionRow = null;
    signalRow = null;
    readWrittenMock.mockResolvedValue(null);
    graphFetchMock.mockImplementation(async (_path: string, opts?: { method?: string }) => {
      if (opts?.method === "PATCH") return { ok: true, text: async () => "" };
      return okGet([]);
    });
    vi.resetModules();
    const mod = await import("../stage-3-intent-label-worker");
    handler = (
      mod.stage3IntentLabelWorker as unknown as { handler: typeof handler }
    ).handler;
  });

  it("GATED (sales, stage_3_intent_label=true) → 0 PATCH, decision=gated", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      dry_run_config: { stage_3_intent_label: true },
    });
    const res = (await handler({ event: buildEvent(), step: stepStub })) as {
      decision: string;
    };
    expect(res.decision).toBe("gated");
    expect(patchCalls()).toHaveLength(0);
    expect(recordWrittenMock).not.toHaveBeenCalled();
  });

  it("GATED (debtor, stage_3_intent_label=true) → 0 PATCH, decision=gated", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "debtor-email",
      dry_run_config: { stage_3_intent_label: true },
    });
    const res = (await handler({
      event: buildEvent({ swarm_type: "debtor-email" }),
      step: stepStub,
    })) as { decision: string };
    expect(res.decision).toBe("gated");
    expect(patchCalls()).toHaveLength(0);
  });

  it("MISSING flag → fail-closed → gated, 0 PATCH", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      dry_run_config: {},
    });
    const res = (await handler({ event: buildEvent(), step: stepStub })) as {
      decision: string;
    };
    expect(res.decision).toBe("gated");
    expect(patchCalls()).toHaveLength(0);
  });

  it("OPEN + no prior + no edit → 1 PATCH (merged), store written, decision=written", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      dry_run_config: { stage_3_intent_label: false },
    });
    graphFetchMock.mockImplementation(async (_p: string, opts?: { method?: string }) => {
      if (opts?.method === "PATCH") return { ok: true, text: async () => "" };
      return okGet(["Belangrijk"]); // a user category present
    });
    const res = (await handler({ event: buildEvent(), step: stepStub })) as {
      decision: string;
    };
    expect(res.decision).toBe("written");
    const patches = patchCalls();
    expect(patches).toHaveLength(1);
    // The PATCH body is the FULL merged set: user category kept + new AI: label.
    const body = (patches[0][1] as { body: { categories: string[] } }).body;
    expect(body.categories).toEqual(["Belangrijk", "AI: quote_request"]);
    expect(recordWrittenMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        email_id: "email-1",
        swarm_type: "sales-email",
        ai_category: "AI: quote_request",
      }),
    );
  });

  it("strip-stale: existing AI: label replaced, not accumulated", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      dry_run_config: { stage_3_intent_label: false },
    });
    graphFetchMock.mockImplementation(async (_p: string, opts?: { method?: string }) => {
      if (opts?.method === "PATCH") return { ok: true, text: async () => "" };
      return okGet(["AI: order_status", "Belangrijk"]); // stale AI: present
    });
    await handler({ event: buildEvent(), step: stepStub });
    const body = (patchCalls()[0][1] as { body: { categories: string[] } }).body;
    expect(body.categories).toEqual(["Belangrijk", "AI: quote_request"]);
  });

  it("idempotency: same verdict already written → 0 PATCH, decision=unchanged", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      dry_run_config: { stage_3_intent_label: false },
    });
    readWrittenMock.mockResolvedValue({
      ai_category: "AI: quote_request",
      written_at: "2026-06-15T00:00:00Z",
    });
    const res = (await handler({ event: buildEvent(), step: stepStub })) as {
      decision: string;
    };
    expect(res.decision).toBe("unchanged");
    expect(patchCalls()).toHaveLength(0);
  });

  it("never-clobber (category_edited transition) → 0 PATCH, decision=clobber-skip", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      dry_run_config: { stage_3_intent_label: false },
    });
    transitionRow = { id: "trans-1" };
    const res = (await handler({ event: buildEvent(), step: stepStub })) as {
      decision: string;
    };
    expect(res.decision).toBe("clobber-skip");
    expect(patchCalls()).toHaveLength(0);
    expect(recordWrittenMock).not.toHaveBeenCalled();
  });

  it("never-clobber (review_signals correction) → 0 PATCH, decision=clobber-skip", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      dry_run_config: { stage_3_intent_label: false },
    });
    signalRow = { id: "sig-1" };
    const res = (await handler({ event: buildEvent(), step: stepStub })) as {
      decision: string;
    };
    expect(res.decision).toBe("clobber-skip");
    expect(patchCalls()).toHaveLength(0);
  });

  it("missing source_id → fail-soft, decision=unresolved, 0 PATCH", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      dry_run_config: { stage_3_intent_label: false },
    });
    emailsRow = { source_id: null, mailbox: null };
    const res = (await handler({
      event: buildEvent({ source_mailbox: null }),
      step: stepStub,
    })) as { decision: string };
    expect(res.decision).toBe("unresolved");
    expect(patchCalls()).toHaveLength(0);
  });

  it("second swarm (registry row only) flows the same path → written", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "info-routing",
      dry_run_config: { stage_3_intent_label: false },
    });
    const res = (await handler({
      event: buildEvent({ swarm_type: "info-routing" }),
      step: stepStub,
    })) as { decision: string };
    expect(res.decision).toBe("written");
    expect(patchCalls()).toHaveLength(1);
  });
});
