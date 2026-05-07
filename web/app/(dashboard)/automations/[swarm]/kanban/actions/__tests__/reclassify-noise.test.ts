// Phase 76 Plan 05 — GREEN tests for reclassifyAsNoise.
//
// D-03 + CONTEXT.md deferred-ideas: 'unknown' rejected defensively.
// W3: validation uses c.category_key exclusively.
//
// Threats covered:
//   - T-76-05-02: noiseKey validated against swarm_noise_categories.
//   - T-76-05-03: swarmType validated against swarms registry.
//   - R-3: nullable originalEventId still emits.

import { describe, it, expect, vi, beforeEach } from "vitest";

const loadSwarmMock = vi.fn();
const loadSwarmNoiseCategoriesMock = vi.fn();
const sendMock = vi.fn();
const emitStaleMock = vi.fn();

vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
  loadSwarmNoiseCategories: (...args: unknown[]) => loadSwarmNoiseCategoriesMock(...args),
}));
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: (...args: unknown[]) => emitStaleMock(...args),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: (...args: unknown[]) => sendMock(...args),
  },
}));

interface UpdateTrace {
  payload: Record<string, unknown> | null;
  eqCalls: Array<{ col: string; val: unknown }>;
}

function makeAdminMock(updateResult: { data: unknown; error: unknown }): {
  admin: unknown;
  trace: UpdateTrace;
} {
  const trace: UpdateTrace = { payload: null, eqCalls: [] };
  const builder: Record<string, unknown> = {};
  builder.update = (payload: Record<string, unknown>) => {
    trace.payload = payload;
    return builder;
  };
  builder.eq = (col: string, val: unknown) => {
    trace.eqCalls.push({ col, val });
    return builder;
  };
  builder.select = (_cols: string) => Promise.resolve(updateResult);
  return { admin: { from: (_t: string) => builder }, trace };
}

let currentAdmin: unknown = null;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => currentAdmin,
}));

import { reclassifyAsNoise } from "../reclassify-noise";

const VALID_NOISE = [
  { swarm_type: "debtor-email", category_key: "auto_reply", display_label: "Auto-reply", action: "categorize_archive", display_order: 1, enabled: true },
  { swarm_type: "debtor-email", category_key: "ooo_permanent", display_label: "OOO permanent", action: "categorize_archive", display_order: 2, enabled: true },
  { swarm_type: "debtor-email", category_key: "ooo_temporary", display_label: "OOO temporary", action: "categorize_archive", display_order: 3, enabled: true },
  { swarm_type: "debtor-email", category_key: "payment_admittance", display_label: "Payment admittance", action: "categorize_archive", display_order: 4, enabled: true },
  { swarm_type: "debtor-email", category_key: "unknown", display_label: "Unknown", action: "manual_review", display_order: 5, enabled: true },
];

describe("Phase 76: reclassifyAsNoise Server Action", () => {
  beforeEach(() => {
    loadSwarmMock.mockReset();
    loadSwarmNoiseCategoriesMock.mockReset();
    sendMock.mockReset();
    emitStaleMock.mockReset();
    sendMock.mockResolvedValue({ ids: ["evt-1"] });
    emitStaleMock.mockResolvedValue(undefined);
  });

  it("rejects when args missing", async () => {
    const res = await reclassifyAsNoise({
      kanbanRowId: "",
      swarmType: "debtor-email",
      emailId: "email-1",
      noiseKey: "auto_reply",
      originalStage1Decision: "unknown",
      originalEventId: null,
      operatorId: "op-1",
    });
    expect(res).toEqual({ ok: false, error: "missing args" });
  });

  it("D-03 deferred-ideas: rejects 'unknown' defensively (before any DB call)", async () => {
    const res = await reclassifyAsNoise({
      kanbanRowId: "row-1",
      swarmType: "debtor-email",
      emailId: "email-1",
      noiseKey: "unknown",
      originalStage1Decision: "unknown",
      originalEventId: null,
      operatorId: "op-1",
    });
    expect(res).toEqual({ ok: false, error: "unknown not allowed" });
    expect(loadSwarmMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("T-76-05-03: rejects unknown swarm", async () => {
    loadSwarmMock.mockResolvedValueOnce(null);
    currentAdmin = makeAdminMock({ data: [], error: null }).admin;
    const res = await reclassifyAsNoise({
      kanbanRowId: "row-1",
      swarmType: "bogus",
      emailId: "email-1",
      noiseKey: "auto_reply",
      originalStage1Decision: "unknown",
      originalEventId: null,
      operatorId: "op-1",
    });
    expect(res).toEqual({ ok: false, error: "unknown swarm" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("T-76-05-02: rejects noiseKey not in swarm_noise_categories (typo + injection-shaped)", async () => {
    loadSwarmMock.mockResolvedValue({ swarm_type: "debtor-email" });
    loadSwarmNoiseCategoriesMock.mockResolvedValue(VALID_NOISE);
    currentAdmin = makeAdminMock({ data: [], error: null }).admin;

    const res1 = await reclassifyAsNoise({
      kanbanRowId: "row-1",
      swarmType: "debtor-email",
      emailId: "email-1",
      noiseKey: "not_in_registry",
      originalStage1Decision: "unknown",
      originalEventId: null,
      operatorId: "op-1",
    });
    expect(res1).toEqual({ ok: false, error: "unknown noise key" });

    const res2 = await reclassifyAsNoise({
      kanbanRowId: "row-1",
      swarmType: "debtor-email",
      emailId: "email-1",
      noiseKey: "'; DROP TABLE swarm_noise_categories--",
      originalStage1Decision: "unknown",
      originalEventId: null,
      operatorId: "op-1",
    });
    expect(res2).toEqual({ ok: false, error: "unknown noise key" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("happy path: emits axis-1 override (eval_type='regression') and closes Kanban row", async () => {
    loadSwarmMock.mockResolvedValue({ swarm_type: "debtor-email" });
    loadSwarmNoiseCategoriesMock.mockResolvedValue(VALID_NOISE);
    const { admin, trace } = makeAdminMock({ data: [{ id: "row-1" }], error: null });
    currentAdmin = admin;

    const res = await reclassifyAsNoise({
      kanbanRowId: "row-1",
      swarmType: "debtor-email",
      emailId: "email-1",
      noiseKey: "auto_reply",
      originalStage1Decision: "unknown",
      originalEventId: "ev-1",
      operatorId: "op-1",
    });
    expect(res).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "debtor-email/override.submitted",
        data: expect.objectContaining({
          axis: "stage_1_category",
          email_id: "email-1",
          original_event_id: "ev-1",
          original_decision: "unknown",
          decision: "auto_reply",
          eval_type: "regression",
          operator_id: "op-1",
        }),
      }),
    );
    expect(trace.eqCalls).toEqual(
      expect.arrayContaining([
        { col: "id", val: "row-1" },
        { col: "swarm_type", val: "debtor-email" },
        { col: "status", val: "pending" },
      ]),
    );
    expect(emitStaleMock).toHaveBeenCalledWith(admin, "debtor-email-kanban");
  });

  it("R-3: nullable originalEventId still emits (downstream handler accepts null)", async () => {
    loadSwarmMock.mockResolvedValue({ swarm_type: "debtor-email" });
    loadSwarmNoiseCategoriesMock.mockResolvedValue(VALID_NOISE);
    currentAdmin = makeAdminMock({ data: [{ id: "row-1" }], error: null }).admin;

    const res = await reclassifyAsNoise({
      kanbanRowId: "row-1",
      swarmType: "debtor-email",
      emailId: "email-1",
      noiseKey: "ooo_temporary",
      originalStage1Decision: "unknown",
      originalEventId: null,
      operatorId: "op-1",
    });
    expect(res).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ original_event_id: null }),
      }),
    );
  });
});
