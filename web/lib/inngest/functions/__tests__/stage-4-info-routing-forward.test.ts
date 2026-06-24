// Phase 132 Plan 02 Task 1 — the swarm-agnostic Stage-4 forward worker.
//
// Replaces the Wave-0 RED `describe.todo` scaffold (Plan 01) with the real
// contract. Per the PLAN <behavior> + <acceptance_criteria> (authoritative over
// the earlier scaffold prose), the load-bearing assertion is the forwardMessage
// call count:
//
//   routable + released → forwardMessage called EXACTLY once, category stamped.
//   unrouted            → 0 forwardMessage, 0 Graph call, decision skip:unrouted.
//   target_mailbox null → 0 forwardMessage, decision skip:stays.
//   dedup already_addr  → 0 forwardMessage, decision skip:dedup:<layer>.
//   held bucket         → 0 forwardMessage, 0 Graph call, decision held.
//   forward_state 'sent'→ 0 forwardMessage (D-02 replay no double-forward).
//   missing source/box  → 0 forwardMessage, decision unresolved (fail-soft).
//
// NO replyTo behaviour is asserted (D-01: Exchange strips replyTo on send for the
// shared mailbox; the original sender is carried in the forward COMMENT).
//
// Mock posture mirrors stage-3-intent-label-worker.test.ts (handler-extraction
// via the mocked inngest.createFunction).

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

// ---- outlook client mock — forwardMessage + graphFetch --------------------
const forwardMessageMock = vi.fn();
const graphFetchMock = vi.fn();
vi.mock("@/lib/outlook/client", () => ({
  forwardMessage: (...args: unknown[]) => forwardMessageMock(...args),
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

// ---- forward-state store mock ---------------------------------------------
const readForwardStateMock = vi.fn();
const recordForwardStateMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/automations/info-routing/forward-state", () => ({
  readForwardState: (...args: unknown[]) => readForwardStateMock(...args),
  recordForwardState: (...args: unknown[]) => recordForwardStateMock(...args),
}));

vi.mock("@/lib/pipeline-events/emit", () => ({
  emitPipelineEvent: vi.fn().mockResolvedValue(undefined),
}));

// ---- Supabase mock --------------------------------------------------------
// coordinator_runs (public) carries the verdict in decision_details.routing.
// email_pipeline.emails carries source_id, mailbox, raw_json.
let coordinatorRow: { decision_details: { routing?: unknown } | null } | null = {
  decision_details: { routing: null },
};
let emailsRow: {
  source_id: string | null;
  mailbox: string | null;
  raw_json: Record<string, unknown> | null;
} | null = {
  source_id: "graph-id-1",
  mailbox: "info@smeba.nl",
  raw_json: { from: { emailAddress: { address: "klant@example.com" } } },
};

function makeSupabaseMock() {
  const publicBuilder = (_table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => ({ data: coordinatorRow, error: null }));
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

function routableVerdict(overrides: Record<string, unknown> = {}) {
  return {
    bucket: "storingen",
    brand: "smeba",
    target_mailbox: "storingen@smeba.nl",
    confidence: "high",
    dedup: { status: "routable", matched_layer: null },
    unrouted: false,
    routing_version: "2026-06-17.v1",
    ...overrides,
  };
}

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    name: "pipeline/forward.requested",
    data: {
      swarm_type: "info-routing",
      email_id: "email-1",
      run_id: "run-1",
      ...overrides,
    },
  };
}

function okGet(categories: string[]) {
  return { ok: true, json: async () => ({ categories }) };
}

describe("Phase 132 Plan 02 — stage-4-info-routing-forward worker", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    supabaseMock = makeSupabaseMock();
    coordinatorRow = { decision_details: { routing: routableVerdict() } };
    emailsRow = {
      source_id: "graph-id-1",
      mailbox: "info@smeba.nl",
      raw_json: { from: { emailAddress: { address: "klant@example.com" } } },
    };
    readForwardStateMock.mockResolvedValue(null);
    forwardMessageMock.mockResolvedValue({ success: true });
    graphFetchMock.mockImplementation(
      async (_path: string, opts?: { method?: string }) => {
        if (opts?.method === "PATCH") return { ok: true, text: async () => "" };
        return okGet([]);
      },
    );
    loadSwarmMock.mockResolvedValue({
      swarm_type: "info-routing",
      dry_run_config: { stage_4_forward_buckets: { storingen: true } },
    });
    vi.resetModules();
    const mod = await import("../stage-4-info-routing-forward");
    handler = (
      mod.stage4InfoRoutingForwardWorker as unknown as { handler: typeof handler }
    ).handler;
  });

  it("routable + released → forwardMessage called once (source info@, toMailbox=target, originalSender=inbound sender)", async () => {
    const res = (await handler({ event: buildEvent(), step: stepStub })) as {
      decision: string;
    };
    expect(res.decision).toBe("forwarded");
    expect(forwardMessageMock).toHaveBeenCalledTimes(1);
    const arg = forwardMessageMock.mock.calls[0][0] as {
      mailbox: string;
      toMailbox: string;
      originalSender: string;
    };
    expect(arg.mailbox).toBe("info@smeba.nl");
    expect(arg.toMailbox).toBe("storingen@smeba.nl");
    expect(arg.originalSender).toBe("klant@example.com");
  });

  it("successful forward stamps mergeRoutingCategory('forwarded', bucket) + records forward_state sent", async () => {
    graphFetchMock.mockImplementation(
      async (_p: string, opts?: { method?: string }) => {
        if (opts?.method === "PATCH") return { ok: true, text: async () => "" };
        return okGet(["Belangrijk"]); // a user category present
      },
    );
    await handler({ event: buildEvent(), step: stepStub });
    const patches = patchCalls();
    expect(patches).toHaveLength(1);
    const body = (patches[0][1] as { body: { categories: string[] } }).body;
    expect(body.categories).toEqual(["Belangrijk", "AI: routed → storingen"]);
    expect(recordForwardStateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        email_id: "email-1",
        swarm_type: "info-routing",
        status: "sent",
        target_mailbox: "storingen@smeba.nl",
      }),
    );
  });

  it("verdict.unrouted === true → NO forwardMessage, NO Graph call, decision skip:unrouted", async () => {
    coordinatorRow = {
      decision_details: { routing: routableVerdict({ unrouted: true, target_mailbox: null }) },
    };
    const res = (await handler({ event: buildEvent(), step: stepStub })) as {
      decision: string;
    };
    expect(res.decision).toBe("skip:unrouted");
    expect(forwardMessageMock).not.toHaveBeenCalled();
    expect(graphFetchMock).not.toHaveBeenCalled();
  });

  it("verdict.target_mailbox === null (algemeen / stays) → NO forwardMessage, decision skip:stays", async () => {
    coordinatorRow = {
      decision_details: {
        routing: routableVerdict({ bucket: "algemeen", target_mailbox: null }),
      },
    };
    const res = (await handler({ event: buildEvent(), step: stepStub })) as {
      decision: string;
    };
    expect(res.decision).toBe("skip:stays");
    expect(forwardMessageMock).not.toHaveBeenCalled();
    expect(graphFetchMock).not.toHaveBeenCalled();
  });

  it("verdict.dedup.status === 'already_addressed' → NO forwardMessage, decision skip:dedup:<layer>", async () => {
    coordinatorRow = {
      decision_details: {
        routing: routableVerdict({
          dedup: { status: "already_addressed", matched_layer: "to_cc" },
        }),
      },
    };
    const res = (await handler({ event: buildEvent(), step: stepStub })) as {
      decision: string;
    };
    expect(res.decision).toBe("skip:dedup:to_cc");
    expect(forwardMessageMock).not.toHaveBeenCalled();
    expect(graphFetchMock).not.toHaveBeenCalled();
  });

  it("held bucket (isForwardBucketReleased=false) → NO forwardMessage, NO Graph call, decision held", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "info-routing",
      dry_run_config: { stage_4_forward_buckets: { storingen: false } },
    });
    const res = (await handler({ event: buildEvent(), step: stepStub })) as {
      decision: string;
    };
    expect(res.decision).toBe("held");
    expect(forwardMessageMock).not.toHaveBeenCalled();
    expect(graphFetchMock).not.toHaveBeenCalled();
  });

  it("missing bucket entry (fail-closed) → decision held, NO forwardMessage", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "info-routing",
      dry_run_config: { stage_4_forward_buckets: {} },
    });
    const res = (await handler({ event: buildEvent(), step: stepStub })) as {
      decision: string;
    };
    expect(res.decision).toBe("held");
    expect(forwardMessageMock).not.toHaveBeenCalled();
  });

  it("D-02 replay: forward_state === 'sent' → NO 2nd forwardMessage (fires at most once)", async () => {
    readForwardStateMock.mockResolvedValue({
      email_id: "email-1",
      swarm_type: "info-routing",
      status: "sent",
      draft_id: null,
      target_mailbox: "storingen@smeba.nl",
      updated_at: "2026-06-18T00:00:00.000Z",
    });
    const res = (await handler({ event: buildEvent(), step: stepStub })) as {
      decision: string;
    };
    expect(res.decision).toBe("already-sent");
    expect(forwardMessageMock).not.toHaveBeenCalled();
  });

  it("legacy row missing source_id/mailbox → fail-soft decision unresolved, NO forwardMessage", async () => {
    emailsRow = { source_id: null, mailbox: null, raw_json: null };
    const res = (await handler({ event: buildEvent(), step: stepStub })) as {
      decision: string;
    };
    expect(res.decision).toBe("unresolved");
    expect(forwardMessageMock).not.toHaveBeenCalled();
  });

  it("originalSender falls back to raw_json.sender when raw_json.from is absent (Pitfall 2)", async () => {
    emailsRow = {
      source_id: "graph-id-1",
      mailbox: "info@smeba.nl",
      raw_json: { sender: { emailAddress: { address: "fallback@example.com" } } },
    };
    await handler({ event: buildEvent(), step: stepStub });
    const arg = forwardMessageMock.mock.calls[0][0] as { originalSender: string };
    expect(arg.originalSender).toBe("fallback@example.com");
  });
});
