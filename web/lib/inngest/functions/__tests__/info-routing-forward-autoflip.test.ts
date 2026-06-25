// Phase 132.2 (V9.7.x) — the per-bucket forward AUTO-FLIP cron.
//
// The cron CAPTURES staff forwards as forward_observed signals (daily-gated),
// GRADES each routing bucket over the accumulated ledger with Wilson + coverage
// (pure fns imported, tested in forward-wilson.test.ts), and RELEASES
// stage_4_forward_buckets[bucket]=true ONLY when the bucket clears
// (n≥MIN_OBSERVED_N AND wilson_lower≥0.70 AND coverage≥0.70). Release-only.
//
// These tests drive the handler's DB wiring through a mocked Supabase client:
// the daily capture gate, the ledger→release jsonb merge (sibling preservation,
// idempotency), the no-clear no-op, and the post-release regression alert.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { inngestSend } = vi.hoisted(() => ({
  inngestSend: vi.fn().mockResolvedValue({ ids: ["evt"] }),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: inngestSend,
    createFunction: vi.fn(
      (cfg: unknown, trigger: unknown, handler: unknown) => ({
        __config: cfg,
        __trigger: trigger,
        handler,
      }),
    ),
  },
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/swarms/registry", () => ({
  loadRoutingDestinations: vi.fn(async () => [
    { destination_key: "verkoop", brand: "smeba", outlook_category: "Verkoop", target_mailbox: "verkoop@smeba.nl", active: true },
    { destination_key: "storingen", brand: "smeba", outlook_category: "Storingen", target_mailbox: "storingen@smeba.nl", active: true },
    { destination_key: "unrouted", brand: "smeba", outlook_category: null, target_mailbox: null, active: true },
  ]),
}));
const { fetchForwards } = vi.hoisted(() => ({ fetchForwards: vi.fn() }));
vi.mock("@/lib/automations/info-routing/forward-observer", () => ({
  fetchForwardsByConversation: fetchForwards,
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { infoRoutingForwardAutoflip } from "@/lib/inngest/functions/info-routing-forward-autoflip";

// ── chainable Supabase mock ────────────────────────────────────────────────
// Every chain method returns the same thenable builder; the builder resolves
// based on (table, select columns). maybeSingle resolves the single swarms row.

interface Captured {
  update?: Record<string, unknown>;
  updateCalled: boolean;
  signalInserts: Record<string, unknown>[];
  eventInserts: Record<string, unknown>[];
}

interface MockOpts {
  swarmsRow: { dry_run_config: unknown; behavior_tracking_config?: unknown };
  gateRows: { id: string }[]; // daily-gate: non-empty = already captured today
  ledger: {
    category_key: string | null;
    mailbox: string;
    observed_meta: { observed_bucket: string | null };
  }[];
  dedupKeys?: { dedupe_key: string }[];
  emails?: { id: string; conversation_id: string }[];
  verdicts?: { email_id: string; decision_details: unknown }[];
  captured: Captured;
}

function makeAdminMock(opts: MockOpts) {
  const listFor = (table: string, cols: string) => {
    if (table === "swarm_review_signals") {
      if (cols.includes("observed_meta")) return { data: opts.ledger, error: null };
      if (cols.includes("dedupe_key")) return { data: opts.dedupKeys ?? [], error: null };
      return { data: opts.gateRows, error: null }; // "id" → gate
    }
    if (table === "emails") return { data: opts.emails ?? [], error: null };
    if (table === "coordinator_runs") return { data: opts.verdicts ?? [], error: null };
    return { data: [], error: null };
  };

  const builder = (table: string, cols: string): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ["eq", "in", "gte", "not", "order", "limit", "range"]) {
      b[m] = () => b;
    }
    b.maybeSingle = async () => ({ data: opts.swarmsRow, error: null });
    (b as { then: unknown }).then = (
      res: (v: unknown) => unknown,
      rej: (e: unknown) => unknown,
    ) => Promise.resolve(listFor(table, cols)).then(res, rej);
    return b;
  };

  const tableApi = (table: string) => ({
    select: (cols = "") => builder(table, cols),
    insert: async (row: Record<string, unknown>) => {
      if (table === "swarm_review_signals") opts.captured.signalInserts.push(row);
      if (table === "pipeline_events") opts.captured.eventInserts.push(row);
      return { error: null };
    },
    update: (payload: Record<string, unknown>) => {
      opts.captured.update = payload;
      opts.captured.updateCalled = true;
      return { eq: async () => ({ error: null }) };
    },
  });

  return {
    from: (table: string) => tableApi(table),
    schema: () => ({ from: (table: string) => tableApi(table) }),
  };
}

function mkLedger(predicted: string, observed: string | null, n: number) {
  return Array.from({ length: n }, () => ({
    category_key: predicted,
    mailbox: "info@smeba.nl",
    observed_meta: { observed_bucket: observed },
  }));
}

async function runHandler() {
  const fn = infoRoutingForwardAutoflip as unknown as {
    handler: (ctx: {
      step: { run: (id: string, f: () => Promise<unknown>) => Promise<unknown> };
    }) => Promise<unknown>;
  };
  return fn.handler({ step: { run: async (_id, f) => f() } });
}

function freshCaptured(): Captured {
  return { updateCalled: false, signalInserts: [], eventInserts: [] };
}

describe("infoRoutingForwardAutoflip — Inngest registration", () => {
  it("is a business-hours cron in Europe/Amsterdam, Mon-Fri", () => {
    const fn = infoRoutingForwardAutoflip as unknown as {
      __config: { id: string };
      __trigger: { cron?: string } | Array<{ cron?: string }>;
    };
    expect(fn.__config.id).toContain("info-routing");
    const triggers = Array.isArray(fn.__trigger) ? fn.__trigger : [fn.__trigger];
    const cron = triggers.find((t) => t.cron)?.cron ?? "";
    expect(cron).toContain("TZ=Europe/Amsterdam");
    expect(cron).toContain("6-19");
    expect(cron).toContain("1-5");
  });
});

describe("infoRoutingForwardAutoflip — handler DB wiring", () => {
  beforeEach(() => vi.clearAllMocks());

  it("releases a cleared bucket via a merge that PRESERVES dry_run siblings", async () => {
    const captured = freshCaptured();
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeAdminMock({
        swarmsRow: {
          dry_run_config: {
            stage_3_routing: true,
            stage_2_resolution: true,
            stage_4_forward_buckets: {},
          },
        },
        gateRows: [{ id: "recent" }], // already captured today → skip capture
        ledger: mkLedger("verkoop", "verkoop", 25), // n=25, agree=25, coverage=1
        captured,
      }) as never,
    );

    const result = (await runHandler()) as { flipped: number; buckets: string[] };
    expect(result.flipped).toBe(1);
    expect(result.buckets).toEqual(["verkoop"]);

    const updated = captured.update?.dry_run_config as {
      stage_3_routing?: boolean;
      stage_4_forward_buckets?: Record<string, boolean>;
    };
    expect(updated.stage_3_routing).toBe(true); // sibling preserved
    expect(updated.stage_4_forward_buckets).toEqual({ verkoop: true });
    // capture was gated off → no Graph read, no signal insert
    expect(fetchForwards).not.toHaveBeenCalled();
    expect(captured.signalInserts.length).toBe(0);
  });

  it("does NOT release a bucket below MIN_OBSERVED_N (no swarms UPDATE)", async () => {
    const captured = freshCaptured();
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeAdminMock({
        swarmsRow: { dry_run_config: { stage_4_forward_buckets: {} } },
        gateRows: [{ id: "recent" }],
        ledger: mkLedger("verkoop", "verkoop", 10), // n=10 < 20
        captured,
      }) as never,
    );
    const result = (await runHandler()) as { flipped: number };
    expect(result.flipped).toBe(0);
    expect(captured.updateCalled).toBe(false);
  });

  it("does NOT release when coverage is below the gate (many untracked forwards)", async () => {
    const captured = freshCaptured();
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeAdminMock({
        swarmsRow: { dry_run_config: { stage_4_forward_buckets: {} } },
        gateRows: [{ id: "recent" }],
        // 21 graded agree (Wilson passes) but 60 went untracked → coverage ≈ 0.26
        ledger: [...mkLedger("verkoop", "verkoop", 21), ...mkLedger("verkoop", null, 60)],
        captured,
      }) as never,
    );
    const result = (await runHandler()) as { flipped: number };
    expect(result.flipped).toBe(0);
    expect(captured.updateCalled).toBe(false);
  });

  it("is idempotent — an already-true bucket is not re-released", async () => {
    const captured = freshCaptured();
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeAdminMock({
        swarmsRow: { dry_run_config: { stage_4_forward_buckets: { verkoop: true } } },
        gateRows: [{ id: "recent" }],
        ledger: mkLedger("verkoop", "verkoop", 25), // clears, but already true
        captured,
      }) as never,
    );
    const result = (await runHandler()) as { flipped: number };
    expect(result.flipped).toBe(0);
    expect(captured.updateCalled).toBe(false); // no write needed
  });

  it("emits a regression alert when an already-released bucket now fails Wilson", async () => {
    const captured = freshCaptured();
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeAdminMock({
        swarmsRow: { dry_run_config: { stage_4_forward_buckets: { verkoop: true } } },
        gateRows: [{ id: "recent" }],
        // verkoop released; now 50% agreement at n=24 → pass=false → regression
        ledger: [...mkLedger("verkoop", "verkoop", 12), ...mkLedger("verkoop", "storingen", 12)],
        captured,
      }) as never,
    );
    await runHandler();
    const alert = captured.eventInserts.find(
      (r) => r.decision === "forward_autoflip_precision_regression",
    );
    expect(alert).toBeDefined();
    expect(captured.updateCalled).toBe(false); // release-only, no auto-revert
  });

  it("daily-gate OPEN → reads Graph forwards and persists a forward_observed signal", async () => {
    const captured = freshCaptured();
    fetchForwards.mockResolvedValue(
      new Map([["conv-1", { toAddress: "verkoop@smeba.nl", sentAt: "2026-06-20T09:00:00Z" }]]),
    );
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeAdminMock({
        swarmsRow: {
          dry_run_config: { stage_4_forward_buckets: {} },
          behavior_tracking_config: { mailboxes: ["info@smeba.nl"] },
        },
        gateRows: [], // gate OPEN → capture runs
        ledger: [], // nothing graded yet → no release
        emails: [{ id: "email-1", conversation_id: "conv-1" }],
        verdicts: [
          { email_id: "email-1", decision_details: { routing: { bucket: "storingen" } } },
        ],
        captured,
      }) as never,
    );
    await runHandler();
    expect(fetchForwards).toHaveBeenCalledWith("info@smeba.nl", expect.any(String));
    expect(captured.signalInserts.length).toBe(1);
    const row = captured.signalInserts[0];
    expect(row.verdict).toBe("forward_observed");
    expect(row.category_key).toBe("storingen"); // predicted
    expect((row.observed_meta as { observed_bucket: string }).observed_bucket).toBe("verkoop");
  });
});
