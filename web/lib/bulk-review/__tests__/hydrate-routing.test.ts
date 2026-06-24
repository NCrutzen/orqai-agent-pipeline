// Phase 132 Plan 03 Task 1 (FWD-08) — hydrate the info-routing routing verdict +
// forward status into BulkReviewRow.routing.
//
// Proves all SIX forward_status derivations + the debtor-null gate:
//   routable forwarded row (info_routing_forwards.status='sent') → 'forwarded'
//   routable held row (no forward_state row)                     → 'held'
//   algemeen (matched, null target_mailbox)                      → 'stays'
//   unrouted verdict                                             → 'unrouted'
//   already_addressed dedup verdict                              → 'dedup-skipped'
//   a debtor row (no decision_details.routing key)               → routing === null
//
// Mirrors the in-memory SupabaseClient stub in hydrate.test.ts.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { hydrateBulkReviewRow } from "@/lib/bulk-review/hydrate";
import { __resetCacheForTests } from "@/lib/swarms/registry";

interface FixtureOpts {
  pipelineEvents?: Array<Record<string, unknown>>;
  forwardState?: Record<string, unknown> | null;
  coordinatorRun?: Record<string, unknown> | null;
}

function makeAdmin(opts: FixtureOpts): SupabaseClient {
  const makeBuilder = (resolution: { data: unknown; error: unknown }) => {
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.order = vi.fn(() => b);
    b.in = vi.fn(() => b);
    b.not = vi.fn(() => b);
    b.limit = vi.fn(() => b);
    b.maybeSingle = vi.fn(async () => resolution);
    b.then = (resolve: (v: unknown) => unknown) => resolve(resolution);
    return b;
  };

  const publicFrom = (table: string) => {
    if (table === "pipeline_events") {
      return makeBuilder({ data: opts.pipelineEvents ?? [], error: null });
    }
    if (table === "info_routing_forwards") {
      return makeBuilder({ data: opts.forwardState ?? null, error: null });
    }
    if (table === "coordinator_runs") {
      return makeBuilder({ data: opts.coordinatorRun ?? null, error: null });
    }
    // agent_runs / swarms / registries → empty.
    return makeBuilder({ data: [], error: null });
  };

  return {
    from: (t: string) => publicFrom(t),
    schema: (schemaName: string) => ({
      from: (t: string) =>
        schemaName === "email_pipeline"
          ? makeBuilder({ data: t === "emails" ? null : [], error: null })
          : publicFrom(t),
    }),
  } as unknown as SupabaseClient;
}

const SWARM = "info-routing";
const EMAIL_ID = "22222222-2222-2222-2222-222222222222";

// A stage-3 pipeline_events row whose decision_details carries the Phase-131
// persisted 6-field routing verdict.
function stage3Event(routing: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    stage: 3,
    decision: routing.bucket,
    confidence: null,
    decision_details: { routing },
    override: null,
    triggered_by: null,
    created_at: "2026-06-18T00:00:00Z",
    cost_cents: null,
  };
}

const ROUTABLE = {
  bucket: "storingen",
  brand: "smeba",
  target_mailbox: "storingen@smeba.nl",
  confidence: "high",
  dedup: { status: "routable", matched_layer: null },
  unrouted: false,
  routing_version: "2026-06-17.v1",
};

describe("hydrateBulkReviewRow — routing slot (Phase 132 Plan 03)", () => {
  beforeEach(() => {
    __resetCacheForTests();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("routable + forward_state 'sent' → forward_status 'forwarded'", async () => {
    const admin = makeAdmin({
      pipelineEvents: [stage3Event(ROUTABLE)],
      forwardState: { email_id: EMAIL_ID, status: "sent" },
    });
    const row = await hydrateBulkReviewRow(admin, {
      email_id: EMAIL_ID,
      swarm_type: SWARM,
    });
    expect(row!.routing).not.toBeNull();
    expect(row!.routing?.bucket).toBe("storingen");
    expect(row!.routing?.brand).toBe("smeba");
    expect(row!.routing?.target_mailbox).toBe("storingen@smeba.nl");
    expect(row!.routing?.confidence).toBe("high");
    expect(row!.routing?.dedup_status).toBe("routable");
    expect(row!.routing?.unrouted).toBe(false);
    expect(row!.routing?.forward_status).toBe("forwarded");
  });

  it("routable + NO forward_state row → forward_status 'held'", async () => {
    const admin = makeAdmin({
      pipelineEvents: [stage3Event(ROUTABLE)],
      forwardState: null,
    });
    const row = await hydrateBulkReviewRow(admin, {
      email_id: EMAIL_ID,
      swarm_type: SWARM,
    });
    expect(row!.routing?.forward_status).toBe("held");
  });

  it("algemeen (matched, null target) → forward_status 'stays'", async () => {
    const ALGEMEEN_STAYS = {
      bucket: "algemeen",
      brand: null,
      target_mailbox: null,
      confidence: "medium",
      dedup: { status: "routable", matched_layer: null },
      unrouted: false,
      routing_version: "2026-06-17.v1",
    };
    const admin = makeAdmin({
      pipelineEvents: [stage3Event(ALGEMEEN_STAYS)],
      forwardState: null,
    });
    const row = await hydrateBulkReviewRow(admin, {
      email_id: EMAIL_ID,
      swarm_type: SWARM,
    });
    expect(row!.routing?.target_mailbox).toBeNull();
    expect(row!.routing?.forward_status).toBe("stays");
  });

  it("unrouted verdict → forward_status 'unrouted'", async () => {
    const UNROUTED = {
      bucket: "unrouted",
      brand: null,
      target_mailbox: null,
      confidence: "low",
      dedup: { status: "routable", matched_layer: null },
      unrouted: true,
      routing_version: "2026-06-17.v1",
    };
    const admin = makeAdmin({
      pipelineEvents: [stage3Event(UNROUTED)],
      forwardState: null,
    });
    const row = await hydrateBulkReviewRow(admin, {
      email_id: EMAIL_ID,
      swarm_type: SWARM,
    });
    expect(row!.routing?.unrouted).toBe(true);
    expect(row!.routing?.forward_status).toBe("unrouted");
  });

  it("already_addressed dedup → forward_status 'dedup-skipped'", async () => {
    const ALREADY_ADDRESSED = {
      bucket: "storingen",
      brand: "smeba",
      target_mailbox: "storingen@smeba.nl",
      confidence: "high",
      dedup: { status: "already_addressed", matched_layer: "conversation" },
      unrouted: false,
      routing_version: "2026-06-17.v1",
    };
    const admin = makeAdmin({
      pipelineEvents: [stage3Event(ALREADY_ADDRESSED)],
      forwardState: null,
    });
    const row = await hydrateBulkReviewRow(admin, {
      email_id: EMAIL_ID,
      swarm_type: SWARM,
    });
    expect(row!.routing?.dedup_status).toBe("already_addressed");
    expect(row!.routing?.dedup_layer).toBe("conversation");
    expect(row!.routing?.forward_status).toBe("dedup-skipped");
  });

  it("a row with NO decision_details.routing key → routing slot null", async () => {
    // A debtor-style stage-3 event: ranked_intents, no routing verdict.
    const debtorStage3 = {
      id: "44444444-4444-4444-4444-444444444444",
      stage: 3,
      decision: "invoice_copy_request",
      confidence: null,
      decision_details: { ranked: [] },
      override: null,
      triggered_by: null,
      created_at: "2026-06-18T00:00:00Z",
      cost_cents: null,
    };
    const admin = makeAdmin({
      pipelineEvents: [debtorStage3],
      forwardState: null,
    });
    const row = await hydrateBulkReviewRow(admin, {
      email_id: "55555555-5555-5555-5555-555555555555",
      swarm_type: "debtor-email",
    });
    expect(row!.routing ?? null).toBeNull();
  });

  it("hydrates routing.run_id from the coordinator_runs row for this email", async () => {
    const admin = makeAdmin({
      pipelineEvents: [stage3Event(ROUTABLE)],
      forwardState: null,
      coordinatorRun: { run_id: "run-abc-123" },
    });
    const row = await hydrateBulkReviewRow(admin, {
      email_id: EMAIL_ID,
      swarm_type: SWARM,
    });
    expect(row!.routing?.run_id).toBe("run-abc-123");
  });
});
