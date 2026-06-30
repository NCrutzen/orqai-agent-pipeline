// Phase 132.1 Plan 04 Task 2 (D-02) — the per-mailbox forward auto-flip cron.
//
// The cron reads the ROUTE-08 shadow harness pure fns (computeMatchRate /
// gradeVerdict — IMPORTED, never reimplemented), grades EACH info@ mailbox
// independently, and releases `stage_4_forward_buckets[bucket]=true` ONLY when a
// mailbox's grade is `graded` AND `pass===true` AND `graded_n>=MIN_GRADED_N`,
// brand-reachable (operator-confirmed A4). insufficient_sample / pass:null never
// flips (the false-success guard is load-bearing). Release-only: never writes
// `false` (revert is the Plan-03 one-flag migration).
//
// These tests drive the pure reconciliation planner (planForwardBucketFlips) and
// the cron handler's DB wiring (jsonb merge, sibling preservation, idempotency,
// alert emission) through a mocked Supabase client.

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

import {
  planForwardBucketFlips,
  releasableBucketsForBrand,
  computePerMailboxStats,
  MIN_GRADED_N,
  type ShadowRow,
  type RoutingDestinationLike,
} from "@/scripts/eval/info-routing-precision-shadow";

const DESTINATIONS: RoutingDestinationLike[] = [
  { destination_key: "verkoop", brand: "smeba", outlook_category: "Verkoop" },
  { destination_key: "storingen", brand: "smeba", outlook_category: "Storingen" },
  { destination_key: "inspecties", brand: "smeba", outlook_category: "Inspecties" },
  { destination_key: "opleidingen", brand: "fire-control", outlook_category: "Opleidingen" },
  { destination_key: "verkoop", brand: "fire-control", outlook_category: "Verkoop" },
  { destination_key: "order_entry", brand: "fire-control", outlook_category: "Order-entry" },
  { destination_key: "unrouted", brand: "smeba", outlook_category: null }, // sentinel
];

const BRAND_FOR_MAILBOX = (mailbox: string): string | null =>
  ({ "info@smeba.nl": "smeba", "info@fire-control.nl": "fire-control" })[mailbox] ??
  null;

/** Build N high-confidence graded rows for a mailbox at the given match rate. */
function gradedRows(
  mailbox: string,
  n: number,
  matchEvery: number, // a miss every `matchEvery`-th row (10 → 90% match)
): ShadowRow[] {
  return Array.from({ length: n }, (_, i) => ({
    verdict_bucket: "verkoop",
    human_category: i % matchEvery === 0 ? "storingen" : "verkoop",
    confidence: "high" as const,
    source_mailbox: mailbox,
  }));
}

describe("releasableBucketsForBrand — brand-reachable reconciliation (A4)", () => {
  it("returns only the cleared brand's buckets, excluding the unrouted sentinel", () => {
    expect(releasableBucketsForBrand(DESTINATIONS, "smeba")).toEqual([
      "inspecties",
      "storingen",
      "verkoop",
    ]);
    expect(releasableBucketsForBrand(DESTINATIONS, "fire-control")).toEqual([
      "opleidingen",
      "order_entry",
      "verkoop",
    ]);
  });
});

describe("planForwardBucketFlips — the per-mailbox safety gate", () => {
  it("releases the cleared mailbox's brand buckets on graded+pass+graded_n≥MIN", () => {
    const perMailbox = computePerMailboxStats(
      gradedRows("info@smeba.nl", MIN_GRADED_N + 10, 10),
    );
    const flips = planForwardBucketFlips({
      perMailbox,
      destinations: DESTINATIONS,
      brandForMailbox: BRAND_FOR_MAILBOX,
      currentForwardBuckets: {},
    });
    expect(flips.map((f) => f.bucket).sort()).toEqual([
      "inspecties",
      "storingen",
      "verkoop",
    ]);
    expect(flips.every((f) => f.mailbox === "info@smeba.nl")).toBe(true);
  });

  it("does NOT flip on insufficient_sample (graded_n < MIN → pass:null)", () => {
    const perMailbox = computePerMailboxStats(
      gradedRows("info@smeba.nl", 3, 10), // tiny sample
    );
    const flips = planForwardBucketFlips({
      perMailbox,
      destinations: DESTINATIONS,
      brandForMailbox: BRAND_FOR_MAILBOX,
      currentForwardBuckets: {},
    });
    expect(flips).toEqual([]);
  });

  it("does NOT flip on pass=false (precision <0.85, graded_n≥MIN)", () => {
    const perMailbox = computePerMailboxStats(
      gradedRows("info@smeba.nl", MIN_GRADED_N, 2), // 50% match
    );
    const flips = planForwardBucketFlips({
      perMailbox,
      destinations: DESTINATIONS,
      brandForMailbox: BRAND_FOR_MAILBOX,
      currentForwardBuckets: {},
    });
    expect(flips).toEqual([]);
  });

  it("flips smeba and fire-control independently (one clears, one insufficient)", () => {
    const rows = [
      ...gradedRows("info@smeba.nl", MIN_GRADED_N + 5, 10), // smeba clears
      ...gradedRows("info@fire-control.nl", 4, 10), // fire-control insufficient
    ];
    const flips = planForwardBucketFlips({
      perMailbox: computePerMailboxStats(rows),
      destinations: DESTINATIONS,
      brandForMailbox: BRAND_FOR_MAILBOX,
      currentForwardBuckets: {},
    });
    // Only smeba's buckets — fire-control released nothing.
    expect(flips.every((f) => f.mailbox === "info@smeba.nl")).toBe(true);
    expect(flips.some((f) => f.bucket === "opleidingen")).toBe(false);
  });

  it("is idempotent — a bucket already true is NOT re-planned", () => {
    const perMailbox = computePerMailboxStats(
      gradedRows("info@smeba.nl", MIN_GRADED_N + 5, 10),
    );
    const flips = planForwardBucketFlips({
      perMailbox,
      destinations: DESTINATIONS,
      brandForMailbox: BRAND_FOR_MAILBOX,
      currentForwardBuckets: { verkoop: true }, // already released
    });
    expect(flips.map((f) => f.bucket)).not.toContain("verkoop");
    expect(flips.map((f) => f.bucket).sort()).toEqual(["inspecties", "storingen"]);
  });

  it("never plans a `false` value — release-only (revert is the migration)", () => {
    const perMailbox = computePerMailboxStats(
      gradedRows("info@smeba.nl", MIN_GRADED_N + 5, 10),
    );
    const flips = planForwardBucketFlips({
      perMailbox,
      destinations: DESTINATIONS,
      brandForMailbox: BRAND_FOR_MAILBOX,
      currentForwardBuckets: { storingen: false }, // explicitly held
    });
    // storingen is held (false) → still releasable (release-only sets it true).
    expect(flips.some((f) => f.bucket === "storingen")).toBe(true);
    // The planner only ever produces a release; there is no `value` field to be false.
    flips.forEach((f) => expect(typeof f.bucket).toBe("string"));
  });

  it("skips a mailbox with no brand mapping (cannot reconcile)", () => {
    const perMailbox = computePerMailboxStats(
      gradedRows("info@unknown.nl", MIN_GRADED_N + 5, 10),
    );
    const flips = planForwardBucketFlips({
      perMailbox,
      destinations: DESTINATIONS,
      brandForMailbox: BRAND_FOR_MAILBOX, // returns null for unknown
      currentForwardBuckets: {},
    });
    expect(flips).toEqual([]);
  });
});

// ─── Cron wiring: registration + DB merge + monitoring ──────────────────────

import { infoRoutingForwardAutoflip } from "@/lib/inngest/functions/info-routing-forward-autoflip";

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

// ─── Handler integration: jsonb merge (sibling preservation), idempotent no-op,
// regression alert — driven through a chainable Supabase mock. ──────────────

import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
// loadRoutingDestinations reads routing_destinations off the same admin client;
// stub it so the cron sees a deterministic registry without a live DB.
vi.mock("@/lib/swarms/registry", () => ({
  loadRoutingDestinations: vi.fn(async () => [
    { destination_key: "verkoop", brand: "smeba", outlook_category: "Verkoop", active: true },
    { destination_key: "storingen", brand: "smeba", outlook_category: "Storingen", active: true },
    { destination_key: "inspecties", brand: "smeba", outlook_category: "Inspecties", active: true },
    { destination_key: "unrouted", brand: "smeba", outlook_category: null, active: true },
  ]),
}));

/**
 * A minimal chainable Supabase mock. `swarmsRow` is what swarms.select returns;
 * `signals`/`verdicts` feed the shadow reads. Captures the swarms UPDATE payload
 * and any pipeline_events INSERT for assertions.
 */
function makeAdminMock(opts: {
  swarmsRow: { gating_config: unknown; resolution_config: unknown };
  signals: { email_id: string; category_key: string }[];
  verdicts: {
    email_id: string;
    source_mailbox: string;
    decision_details: unknown;
  }[];
  captured: {
    update?: Record<string, unknown>;
    inserts: Record<string, unknown>[];
    updateCalled: boolean;
  };
}) {
  // Re-readable swarms row (the write step re-reads gating_config).
  const swarmsSelect = () => {
    const builder: Record<string, unknown> = {};
    builder.eq = () => builder;
    builder.maybeSingle = async () => ({ data: opts.swarmsRow, error: null });
    return builder;
  };
  const reviewSignalsSelect = () => {
    const builder: Record<string, unknown> = {};
    builder.eq = () => builder;
    builder.not = () => builder;
    builder.order = async () => ({ data: opts.signals, error: null });
    return builder;
  };
  const coordinatorSelect = () => {
    const builder: Record<string, unknown> = {};
    builder.eq = () => builder;
    builder.not = async () => ({ data: opts.verdicts, error: null });
    return builder;
  };

  return {
    from(table: string) {
      if (table === "swarms") {
        return {
          select: () => swarmsSelect(),
          update: (payload: Record<string, unknown>) => {
            opts.captured.update = payload;
            opts.captured.updateCalled = true;
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "swarm_review_signals") {
        return { select: () => reviewSignalsSelect() };
      }
      if (table === "coordinator_runs") {
        return { select: () => coordinatorSelect() };
      }
      if (table === "pipeline_events") {
        return {
          insert: async (row: Record<string, unknown>) => {
            opts.captured.inserts.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function highConfVerdicts(
  mailbox: string,
  n: number,
  matchEvery: number,
): {
  email_id: string;
  source_mailbox: string;
  decision_details: unknown;
}[] {
  return Array.from({ length: n }, (_, i) => ({
    email_id: `${mailbox}-${i}`,
    source_mailbox: mailbox,
    decision_details: { routing: { bucket: "verkoop", confidence: "high" } },
  }));
}

// A captured correction per verdict: a miss every `matchEvery`-th row.
function correctionsFor(
  mailbox: string,
  n: number,
  matchEvery: number,
): { email_id: string; category_key: string }[] {
  return Array.from({ length: n }, (_, i) => ({
    email_id: `${mailbox}-${i}`,
    category_key: i % matchEvery === 0 ? "Storingen" : "Verkoop",
  }));
}

async function runHandler() {
  const fn = infoRoutingForwardAutoflip as unknown as {
    handler: (ctx: {
      step: { run: (id: string, f: () => Promise<unknown>) => Promise<unknown> };
    }) => Promise<unknown>;
  };
  // step.run executes the fn inline (no Inngest runtime in unit tests).
  return fn.handler({ step: { run: async (_id, f) => f() } });
}

describe("infoRoutingForwardAutoflip — handler DB wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("releases brand buckets via a merge that PRESERVES dry_run siblings", async () => {
    const captured: {
      update?: Record<string, unknown>;
      inserts: Record<string, unknown>[];
      updateCalled: boolean;
    } = { inserts: [], updateCalled: false };
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeAdminMock({
        swarmsRow: {
          gating_config: {
            stage_3_routing: true,
            stage_2_resolution: true,
            stage_4_forward_buckets: {},
          },
          resolution_config: { scope: { entity_by_mailbox: { "info@smeba.nl": "smeba" } } },
        },
        signals: correctionsFor("info@smeba.nl", MIN_GRADED_N + 10, 10), // 90% match
        verdicts: highConfVerdicts("info@smeba.nl", MIN_GRADED_N + 10, 10),
        captured,
      }) as never,
    );

    const result = (await runHandler()) as { flipped: number; buckets: string[] };
    expect(result.flipped).toBeGreaterThan(0);
    expect(result.buckets.sort()).toEqual(["inspecties", "storingen", "verkoop"]);

    const updated = captured.update?.gating_config as {
      stage_3_routing?: boolean;
      stage_2_resolution?: boolean;
      stage_4_forward_buckets?: Record<string, boolean>;
    };
    // siblings preserved
    expect(updated.stage_3_routing).toBe(true);
    expect(updated.stage_2_resolution).toBe(true);
    // target buckets released to true
    expect(updated.stage_4_forward_buckets).toEqual({
      verkoop: true,
      storingen: true,
      inspecties: true,
    });
  });

  it("insufficient_sample → NO swarms UPDATE (the guard holds)", async () => {
    const captured: {
      update?: Record<string, unknown>;
      inserts: Record<string, unknown>[];
      updateCalled: boolean;
    } = { inserts: [], updateCalled: false };
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeAdminMock({
        swarmsRow: {
          gating_config: { stage_4_forward_buckets: {} },
          resolution_config: { scope: { entity_by_mailbox: { "info@smeba.nl": "smeba" } } },
        },
        signals: correctionsFor("info@smeba.nl", 3, 10), // tiny graded sample
        verdicts: highConfVerdicts("info@smeba.nl", 3, 10),
        captured,
      }) as never,
    );

    const result = (await runHandler()) as { flipped: number };
    expect(result.flipped).toBe(0);
    expect(captured.updateCalled).toBe(false);
  });

  it("emits a precision-regression alert when a released bucket's mailbox drops <0.85", async () => {
    const captured: {
      update?: Record<string, unknown>;
      inserts: Record<string, unknown>[];
      updateCalled: boolean;
    } = { inserts: [], updateCalled: false };
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeAdminMock({
        swarmsRow: {
          // verkoop ALREADY released; now smeba grades pass=false → regression.
          gating_config: { stage_4_forward_buckets: { verkoop: true } },
          resolution_config: { scope: { entity_by_mailbox: { "info@smeba.nl": "smeba" } } },
        },
        signals: correctionsFor("info@smeba.nl", MIN_GRADED_N, 2), // 50% match → fail
        verdicts: highConfVerdicts("info@smeba.nl", MIN_GRADED_N, 2),
        captured,
      }) as never,
    );

    await runHandler();
    const alert = captured.inserts.find(
      (r) => r.decision === "forward_autoflip_precision_regression",
    );
    expect(alert).toBeDefined();
    expect(captured.updateCalled).toBe(false); // release-only, no auto-revert
  });
});
