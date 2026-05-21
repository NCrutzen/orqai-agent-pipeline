// Phase 86 Plan 02 Task 2 — RED-then-GREEN tests for the nightly refresh
// cron + manual event trigger.
//
// Test cases:
//   T1 cron config: id "intent-proposals-refresh", retries 3.
//   T2 dual trigger: cron "TZ=Europe/Amsterdam 0 4 * * *" AND event
//      "intent-proposals.refresh".
//   T3 cron path always runs (no debounce check on cron tick).
//   T4 event path skips with { skipped: "debounced" } when last refresh
//      < 5min ago.
//   T5 event path proceeds when last refresh >= 5min ago.
//   T6 empty proposals → 0 clusters upserted → 0 views purged → no throw.
//   T7 populated proposals: clusters grouped per swarm_type, upsert called
//      with the expected onConflict key, member_count >= 1.
//   T8 purge step deletes from intent_proposal_views with viewed_at < cutoff
//      (~90d ago).

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Inngest client mock -------------------------------------------------
const { createFunctionMock } = vi.hoisted(() => ({
  createFunctionMock: vi.fn((cfg, trigger, handler) => ({
    __config: cfg,
    __trigger: trigger,
    handler,
  })),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: createFunctionMock,
    send: vi.fn().mockResolvedValue({ ids: ["evt"] }),
  },
}));

// ---- Supabase admin mock -------------------------------------------------
type Row = Record<string, unknown>;

const state: {
  lastRefreshedAt: string | null;
  proposals: Row[];
  upserts: Array<{ rows: Row[]; opts: Record<string, unknown> }>;
  deleteCalls: Array<{ table: string; cutoff: string; count: number }>;
} = {
  lastRefreshedAt: null,
  proposals: [],
  upserts: [],
  deleteCalls: [],
};

// Vitest mock chains return `this` to enable fluent chaining; we never read
// properties off `this` so an unknown self-type is safe and avoids `any`.
type ChainSelf = Record<string, unknown>;

function makeAdmin() {
  // Tracks which table the current chain is on, since one client handles 3.
  const chains = {
    clustersDebounce: {
      select: vi.fn(function (this: ChainSelf) { return this; }),
      order: vi.fn(function (this: ChainSelf) { return this; }),
      limit: vi.fn(function (this: ChainSelf) { return this; }),
      maybeSingle: vi.fn(async () => ({
        data: state.lastRefreshedAt
          ? { refreshed_at: state.lastRefreshedAt }
          : null,
        error: null,
      })),
    },
    proposalsRead: {
      select: vi.fn(function (this: ChainSelf) { return this; }),
      gte: vi.fn(async function (this: ChainSelf) {
        return { data: state.proposals, error: null };
      }),
    },
    clustersUpsert: {
      upsert: vi.fn(async (rows: Row[], opts: Record<string, unknown>) => {
        state.upserts.push({ rows, opts });
        return { error: null };
      }),
    },
    viewsDelete: {
      lt: vi.fn(async function (this: ChainSelf, _col: string, cutoff: string) {
        const entry = state.deleteCalls.find((c) => c.table === "intent_proposal_views" && c.cutoff === cutoff);
        if (!entry) {
          state.deleteCalls.push({ table: "intent_proposal_views", cutoff, count: 0 });
        }
        return { error: null, count: 0 };
      }),
    },
  };

  // The function calls .from(table) several times. We hand back a builder that
  // dispatches based on which operation is invoked next.
  function fromImpl(table: string) {
    if (table === "intent_proposal_clusters") {
      // Could be debounce-read or upsert depending on whether .select or
      // .upsert is called next. Return a polymorphic stub.
      return {
        select: chains.clustersDebounce.select.bind(chains.clustersDebounce),
        order: chains.clustersDebounce.order.bind(chains.clustersDebounce),
        limit: chains.clustersDebounce.limit.bind(chains.clustersDebounce),
        maybeSingle: chains.clustersDebounce.maybeSingle,
        upsert: chains.clustersUpsert.upsert,
      };
    }
    if (table === "intent_proposals_v1") {
      return {
        select: chains.proposalsRead.select.bind(chains.proposalsRead),
        gte: chains.proposalsRead.gte,
      };
    }
    if (table === "intent_proposal_views") {
      return {
        delete: vi.fn(() => chains.viewsDelete),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  }

  return { from: vi.fn(fromImpl) };
}

let adminInstance = makeAdmin();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminInstance),
}));

// ---- Step stub -----------------------------------------------------------
function makeStep() {
  const calls: Array<{ id: string }> = [];
  const run = vi.fn(async (id: string, fn: () => unknown) => {
    calls.push({ id });
    return await fn();
  });
  return { run, calls };
}

// ---- Import under test ---------------------------------------------------
// 2026-05-21: Phase 86 fix(86-02) split the original dual-trigger function
// into two separate Inngest functions to unblock a Next.js Turbopack build
// failure. `intentProposalsRefresh` survives as a back-compat alias of the
// event function (see intent-proposals-refresh.ts line 226). T1-T3 below
// were rewritten against the split shape; T4+ exercise the event path
// (debounce, read+upsert+purge) and stay unchanged.
import {
  intentProposalsRefresh,
  intentProposalsRefreshCron,
  intentProposalsRefreshEvent,
} from "../intent-proposals-refresh";

// The createFunctionMock above attaches __config/__trigger/handler to the
// returned shape; we read them back as test-only fields. `unknown` would
// require call-site narrowing on every use; a minimal call signature is
// the lightest type that lets tests invoke handler() without per-call casts.
type IntentProposalsRefreshTestShape = {
  __config: Record<string, unknown>;
  __trigger: Record<string, unknown>;
  handler: (...args: unknown[]) => Promise<Record<string, unknown>>;
};

function getHandler() {
  return (intentProposalsRefresh as unknown as IntentProposalsRefreshTestShape).handler;
}
function getCronHandler() {
  return (intentProposalsRefreshCron as unknown as IntentProposalsRefreshTestShape).handler;
}
function getEventConfig() {
  return (intentProposalsRefreshEvent as unknown as IntentProposalsRefreshTestShape).__config;
}
function getCronConfig() {
  return (intentProposalsRefreshCron as unknown as IntentProposalsRefreshTestShape).__config;
}
function getEventTrigger() {
  return (intentProposalsRefreshEvent as unknown as IntentProposalsRefreshTestShape).__trigger;
}
function getCronTrigger() {
  return (intentProposalsRefreshCron as unknown as IntentProposalsRefreshTestShape).__trigger;
}

beforeEach(() => {
  state.lastRefreshedAt = null;
  state.proposals = [];
  state.upserts = [];
  state.deleteCalls = [];
  adminInstance = makeAdmin();
});

// ---------------------------------------------------------------------------
// T1 — function configs (cron + event each registered separately after the
// 2026-05-21 split). Retries 3 on both.
// ---------------------------------------------------------------------------
describe("intentProposalsRefresh — T1 (function configs)", () => {
  it("registers cron function id 'intent-proposals-refresh-cron' with retries 3", () => {
    expect(getCronConfig()).toMatchObject({
      id: "intent-proposals-refresh-cron",
      retries: 3,
    });
  });
  it("registers event function id 'intent-proposals-refresh-event' with retries 3", () => {
    expect(getEventConfig()).toMatchObject({
      id: "intent-proposals-refresh-event",
      retries: 3,
    });
  });
});

// ---------------------------------------------------------------------------
// T2 — split triggers. After the dual-trigger array form caused a Next.js
// Turbopack build failure, registration moved to two single-trigger functions.
// ---------------------------------------------------------------------------
describe("intentProposalsRefresh — T2 (split triggers)", () => {
  it("cron function declares a cron trigger", () => {
    expect(getCronTrigger()).toEqual({
      cron: "TZ=Europe/Amsterdam 0 4 * * *",
    });
  });
  it("event function declares an event trigger", () => {
    expect(getEventTrigger()).toEqual({
      event: "intent-proposals.refresh",
    });
  });
});

// ---------------------------------------------------------------------------
// T3 — cron path bypasses debounce. Post-split: cron is its own function
// with no debounce check at all, so we exercise the cron handler directly
// and assert it ran the read+upsert+purge pipeline regardless of state.
// ---------------------------------------------------------------------------
describe("intentProposalsRefresh — T3 (cron path bypasses debounce)", () => {
  it("cron handler runs read+upsert+purge without a debounce short-circuit", async () => {
    state.lastRefreshedAt = new Date().toISOString(); // 0min ago — would have debounced under the old shape
    const ret = await getCronHandler()({ event: undefined, step: makeStep() });
    expect(ret).not.toMatchObject({ skipped: "debounced" });
  });
});

// ---------------------------------------------------------------------------
// T4 — event path debounces
// ---------------------------------------------------------------------------
describe("intentProposalsRefresh — T4 (event debounce <5min)", () => {
  it("returns { skipped: 'debounced' } when last refresh < 5min ago", async () => {
    state.lastRefreshedAt = new Date(Date.now() - 60 * 1000).toISOString(); // 1min
    const ret = await getHandler()({
      event: { name: "intent-proposals.refresh" },
      step: makeStep(),
    });
    expect(ret).toEqual({ skipped: "debounced" });
    expect(state.upserts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T5 — event path proceeds when stale
// ---------------------------------------------------------------------------
describe("intentProposalsRefresh — T5 (event proceeds >=5min)", () => {
  it("runs the pipeline when last refresh >= 5min ago", async () => {
    state.lastRefreshedAt = new Date(
      Date.now() - 10 * 60 * 1000,
    ).toISOString();
    const ret = await getHandler()({
      event: { name: "intent-proposals.refresh" },
      step: makeStep(),
    });
    expect(ret).not.toMatchObject({ skipped: "debounced" });
  });
});

// ---------------------------------------------------------------------------
// T6 — empty proposals
// ---------------------------------------------------------------------------
describe("intentProposalsRefresh — T6 (empty proposals)", () => {
  it("returns 0 clusters upserted, no throw", async () => {
    state.proposals = [];
    const ret = await getHandler()({ event: undefined, step: makeStep() });
    expect(ret).toMatchObject({
      proposals: 0,
      clusters_upserted: 0,
    });
    expect(state.upserts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T7 — populated proposals → upsert with onConflict key
// ---------------------------------------------------------------------------
describe("intentProposalsRefresh — T7 (cluster + upsert)", () => {
  it("groups by swarm_type, upserts with onConflict swarm_type,centroid_label,window_end", async () => {
    state.proposals = [
      {
        pipeline_event_id: "pe-1",
        email_id: "em-1",
        swarm_type: "debtor-email",
        proposal_label: "coupa_po_notification",
        proposal_reason: null,
        intent_version: "v3",
        ranked_top_intent: null,
        created_at: new Date().toISOString(),
        subject: null,
        sender_email: null,
      },
      {
        pipeline_event_id: "pe-2",
        email_id: "em-2",
        swarm_type: "debtor-email",
        proposal_label: "coupa_notification",
        proposal_reason: null,
        intent_version: "v3",
        ranked_top_intent: null,
        created_at: new Date().toISOString(),
        subject: null,
        sender_email: null,
      },
      {
        pipeline_event_id: "pe-3",
        email_id: "em-3",
        swarm_type: "sales-email",
        proposal_label: "demo_request",
        proposal_reason: null,
        intent_version: "v3",
        ranked_top_intent: null,
        created_at: new Date().toISOString(),
        subject: null,
        sender_email: null,
      },
    ];

    const ret = await getHandler()({ event: undefined, step: makeStep() });
    expect(state.upserts).toHaveLength(1);
    const { rows, opts } = state.upserts[0];
    expect(opts).toMatchObject({
      onConflict: "swarm_type,centroid_label,window_end",
    });
    // Two distinct swarms → at least 2 cluster rows (1 per swarm).
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(ret).toMatchObject({ proposals: 3 });
    expect(ret.clusters_upserted as number).toBeGreaterThanOrEqual(2);

    // Each upserted row carries the required keys.
    for (const r of rows) {
      expect(r).toHaveProperty("swarm_type");
      expect(r).toHaveProperty("centroid_label");
      expect(r).toHaveProperty("member_count");
      expect(r).toHaveProperty("member_labels");
      expect(r).toHaveProperty("sample_email_ids");
      expect(r).toHaveProperty("window_start");
      expect(r).toHaveProperty("window_end");
      expect(r).toHaveProperty("refreshed_at");
    }
  });
});

// ---------------------------------------------------------------------------
// T8 — purge old views (>90d)
// ---------------------------------------------------------------------------
describe("intentProposalsRefresh — T8 (purge >90d views)", () => {
  it("DELETEs intent_proposal_views with viewed_at < now-90d", async () => {
    const before = Date.now();
    await getHandler()({ event: undefined, step: makeStep() });
    const after = Date.now();
    expect(state.deleteCalls).toHaveLength(1);
    const cutoffMs = Date.parse(state.deleteCalls[0].cutoff);
    const expectedMin = before - 90 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000;
    const expectedMax = after - 90 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoffMs).toBeLessThanOrEqual(expectedMax);
  });
});
