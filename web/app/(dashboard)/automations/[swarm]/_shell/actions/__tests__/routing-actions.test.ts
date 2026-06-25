// Phase 132 Plan 03 Task 3 (FWD-09, D-08) — routing-actions.ts server-action tests.
//
// Three operator actions: rerouteBucket / forwardNow / dontForward. Each has an
// auth gate. forwardNow honors dedup + refuses algemeen/unrouted before any send.
//
// Guard reconciliation (PATTERNS.md flag): routing-actions.ts is a NEW file NOT
// covered by override-actions.test.ts's per-file no-destructure guard (that guard
// reads only override-actions.ts). This file adds an EQUIVALENT per-file guard so
// the inngest this-binding contract (learning dae6276) is preserved, not weakened.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Static grep guard — CLAUDE.md learning dae6276: never destructure
// inngest.send (would lose this-binding). routing-actions.ts inline-calls it.
// ---------------------------------------------------------------------------
const SRC_PATH = join(__dirname, "..", "routing-actions.ts");
const SRC = readFileSync(SRC_PATH, "utf8");

describe("routing-actions.ts source — Inngest this-binding lock (learning dae6276)", () => {
  it("does NOT destructure inngest.send (would lose this-binding)", () => {
    expect(SRC).not.toMatch(/const\s+send\s*=\s*inngest\.send/);
    expect(SRC).not.toMatch(/let\s+send\s*=\s*inngest\.send/);
  });
});

// ---------------------------------------------------------------------------
// Runtime mocks. Each module the actions import is mocked.
// ---------------------------------------------------------------------------

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: getUserMock } }),
}));

// Mutable admin-client mock — tests assign a `.from(...)` shape to drive the
// coordinator_runs read/write path.
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

const loadRoutingDestinationsMock = vi.fn();
const resolveRoutingDestinationMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadRoutingDestinations: (...a: unknown[]) => loadRoutingDestinationsMock(...a),
  resolveRoutingDestination: (...a: unknown[]) =>
    resolveRoutingDestinationMock(...a),
}));

const recordForwardStateMock = vi.fn();
const readForwardStateMock = vi.fn();
vi.mock("@/lib/automations/info-routing/forward-state", () => ({
  recordForwardState: (...a: unknown[]) => recordForwardStateMock(...a),
  readForwardState: (...a: unknown[]) => readForwardStateMock(...a),
}));

import {
  rerouteBucket,
  forwardNow,
  dontForward,
} from "../routing-actions";

const AUTHED = { data: { user: { id: "op-1" } } };
const ANON = { data: { user: null } };

beforeEach(() => {
  getUserMock.mockReset();
  inngestSendMock.mockReset();
  loadRoutingDestinationsMock.mockReset();
  resolveRoutingDestinationMock.mockReset();
  recordForwardStateMock.mockReset();
  readForwardStateMock.mockReset();
  adminClientMock = {};
});

describe("forwardNow — auth gate", () => {
  it("unauthenticated → 401", async () => {
    getUserMock.mockResolvedValue(ANON);
    const res = await forwardNow({
      email_id: "e1",
      swarm_type: "info-routing",
      run_id: "r1",
    });
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ code: "401" });
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});

// A coordinator_runs admin mock whose decision_details.routing returns `verdict`.
function adminWithVerdict(verdict: Record<string, unknown> | null): unknown {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => ({
    data: verdict === null ? null : { decision_details: { routing: verdict } },
    error: null,
  }));
  return { from: vi.fn(() => builder) };
}

const ROUTABLE_VERDICT = {
  bucket: "storingen",
  brand: "smeba",
  target_mailbox: "storingen@smeba.nl",
  confidence: "high",
  dedup: { status: "routable", matched_layer: null },
  unrouted: false,
  routing_version: "v1",
};

describe("forwardNow — hard refusals (dedup honored, never algemeen/unrouted)", () => {
  it("unrouted verdict → refused, NO send", async () => {
    getUserMock.mockResolvedValue(AUTHED);
    adminClientMock = adminWithVerdict({
      ...ROUTABLE_VERDICT,
      unrouted: true,
      target_mailbox: null,
    });
    const res = await forwardNow({
      email_id: "e1",
      swarm_type: "info-routing",
      run_id: "r1",
    });
    expect(res).toMatchObject({ ok: false, code: "refused_unrouted" });
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("null-target (algemeen / stays) verdict → refused, NO send", async () => {
    getUserMock.mockResolvedValue(AUTHED);
    adminClientMock = adminWithVerdict({
      ...ROUTABLE_VERDICT,
      bucket: "algemeen",
      brand: null,
      target_mailbox: null,
    });
    const res = await forwardNow({
      email_id: "e1",
      swarm_type: "info-routing",
      run_id: "r1",
    });
    expect(res).toMatchObject({ ok: false, code: "refused_stays" });
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("already_addressed (dedup) verdict → refused, NO send", async () => {
    getUserMock.mockResolvedValue(AUTHED);
    adminClientMock = adminWithVerdict({
      ...ROUTABLE_VERDICT,
      dedup: { status: "already_addressed", matched_layer: "conversation" },
    });
    const res = await forwardNow({
      email_id: "e1",
      swarm_type: "info-routing",
      run_id: "r1",
    });
    expect(res).toMatchObject({ ok: false, code: "refused_dedup" });
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("routable verdict → emits pipeline/forward.requested exactly once (operator_forced)", async () => {
    getUserMock.mockResolvedValue(AUTHED);
    adminClientMock = adminWithVerdict(ROUTABLE_VERDICT);
    inngestSendMock.mockResolvedValue(undefined);
    const res = await forwardNow({
      email_id: "e1",
      swarm_type: "info-routing",
      run_id: "r1",
    });
    expect(res.ok).toBe(true);
    expect(inngestSendMock).toHaveBeenCalledTimes(1);
    expect(inngestSendMock).toHaveBeenCalledWith({
      name: "pipeline/forward.requested",
      data: {
        swarm_type: "info-routing",
        run_id: "r1",
        email_id: "e1",
        operator_forced: true,
      },
    });
  });
});

describe("rerouteBucket — re-resolves target + persists a new operator verdict", () => {
  it("resolves the new bucket via the registry and writes decision_details.routing", async () => {
    getUserMock.mockResolvedValue(AUTHED);
    loadRoutingDestinationsMock.mockResolvedValue([
      { destination_key: "verkoop", brand: "smeba", target_mailbox: "verkoop@smeba.nl", active: true },
    ]);
    resolveRoutingDestinationMock.mockReturnValue({
      matched: true,
      target_mailbox: "verkoop@smeba.nl",
    });

    // Admin mock: coordinator_runs.maybeSingle (prior verdict read) + update.
    const updateSpy = vi.fn((_payload: unknown) => ({
      eq: vi.fn(async () => ({ error: null })),
    }));
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => ({
      data: { decision_details: { routing: ROUTABLE_VERDICT } },
      error: null,
    }));
    builder.update = updateSpy;
    adminClientMock = { from: vi.fn(() => builder) };

    const res = await rerouteBucket({
      email_id: "e1",
      swarm_type: "info-routing",
      run_id: "r1",
      new_bucket: "verkoop",
      brand: "smeba",
      audit_note: "operator says this is a sales lead",
    });

    expect(res.ok).toBe(true);
    expect(resolveRoutingDestinationMock).toHaveBeenCalledWith(
      expect.any(Array),
      "verkoop",
      "smeba",
    );
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const written = updateSpy.mock.calls[0][0] as unknown as {
      decision_details: { routing: Record<string, unknown> };
    };
    expect(written.decision_details.routing.bucket).toBe("verkoop");
    expect(written.decision_details.routing.target_mailbox).toBe("verkoop@smeba.nl");
    expect(written.decision_details.routing.operator_sourced).toBe(true);
    expect(written.decision_details.routing.unrouted).toBe(false);
  });
});

describe("dontForward — suppresses via forward_state 'skipped'", () => {
  it("records forward_state status 'skipped'", async () => {
    getUserMock.mockResolvedValue(AUTHED);
    recordForwardStateMock.mockResolvedValue(undefined);
    const res = await dontForward({
      email_id: "e1",
      swarm_type: "info-routing",
      audit_note: "operator handles this one manually",
    });
    expect(res.ok).toBe(true);
    expect(recordForwardStateMock).toHaveBeenCalledTimes(1);
    const arg = recordForwardStateMock.mock.calls[0][1] as Record<string, unknown>;
    expect(arg).toMatchObject({
      email_id: "e1",
      swarm_type: "info-routing",
      status: "skipped",
    });
  });
});
