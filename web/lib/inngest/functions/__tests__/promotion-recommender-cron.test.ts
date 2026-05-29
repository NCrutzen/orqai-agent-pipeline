// Phase 4 Plan 01 — promotion-recommender cron tests.
//
// Mocks the inngest client so we can extract the handler + assert its dual
// trigger config (cron + event), and mocks the Supabase admin client with
// in-memory pipeline_events + a capturing promotion_candidates UPSERT.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---- Inngest mock -------------------------------------------------------
type CapturedFn = {
  __cfg?: unknown;
  __trigger?: unknown;
  handler?: (...args: unknown[]) => unknown;
};
const captured: CapturedFn = {};
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue({ ids: ["evt"] }),
    createFunction: vi.fn(
      (
        cfg: unknown,
        trigger: unknown,
        handler: (...args: unknown[]) => unknown,
      ) => {
        captured.__cfg = cfg;
        captured.__trigger = trigger;
        captured.handler = handler;
        return { __cfg: cfg, __trigger: trigger, handler };
      },
    ),
  },
}));

// ---- Supabase admin mock -------------------------------------------------
type Row = Record<string, unknown>;
let pipelineEventsRows: Row[] = [];
let knownIntents: Row[] = [];
let candidateUpserts: Row[] = [];
let candidateStore: Map<string, Row> = new Map();

function makeAdmin() {
  const from = vi.fn((table: string) => {
    if (table === "pipeline_events") {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.not = vi.fn(() => builder);
      builder.gte = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      // Awaiting the chain returns the rows.
      (builder as { then?: unknown }).then = (
        resolve: (v: unknown) => unknown,
      ) => resolve({ data: pipelineEventsRows, error: null });
      return builder;
    }
    if (table === "swarm_intents") {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => ({
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: knownIntents, error: null }),
      }));
      return builder;
    }
    if (table === "promotion_candidates") {
      const builder: Record<string, unknown> = {};
      builder.upsert = vi.fn((row: Row) => {
        candidateUpserts.push(row);
        const key = `${row.swarm_type}::${row.signature_key}`;
        const existing = candidateStore.get(key);
        const merged: Row = existing
          ? {
              ...existing,
              // Refresh non-decision fields only (mirrors cron's explicit list).
              kind: row.kind,
              stage: row.stage,
              proposed_change: row.proposed_change,
              evidence_event_ids: row.evidence_event_ids,
              evidence_email_ids: row.evidence_email_ids,
              matched_event_count_30d: row.matched_event_count_30d,
              confirm_rate: row.confirm_rate,
              expected_savings_cents_per_month:
                row.expected_savings_cents_per_month,
              savings_calculation_version: row.savings_calculation_version,
              updated_at: row.updated_at,
            }
          : {
              id: `cand-${candidateStore.size + 1}`,
              status: "open",
              approved_by: null,
              approved_at: null,
              dismissed_by: null,
              dismissed_at: null,
              created_at: new Date().toISOString(),
              ...row,
            };
        candidateStore.set(key, merged);
        return {
          select: () => ({
            single: async () => ({
              data: { id: merged.id, signature_key: row.signature_key },
              error: null,
            }),
          }),
        };
      });
      return builder;
    }
    return { select: vi.fn(), insert: vi.fn() };
  });
  return { from };
}

let admin = makeAdmin();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => admin),
}));

// ---- Module under test (imported AFTER mocks are set up) -----------------
async function loadCron() {
  // Reset module cache so captured handler binds to fresh mocks per import.
  vi.resetModules();
  // Re-apply Inngest mock (resetModules clears mock factories' state).
  // The vi.mock call above is hoisted globally so it still applies.
  await import("../promotion-recommender-cron");
}

// ---- Step stub ----------------------------------------------------------
function makeStep() {
  return {
    run: vi.fn(
      async (_name: string, fn: () => Promise<unknown>) => await fn(),
    ),
  };
}

// ---- Helpers -------------------------------------------------------------
function mkOverrideRow(i: number, overrides: Partial<Row> = {}): Row {
  return {
    id: `evt-${i}`,
    swarm_type: "debtor-email",
    email_id: `email-${i}`,
    stage: 1,
    eval_type: "category-correction",
    override: { subject: "Out of office reply auto-generated" },
    decision: "noise",
    decision_details: null,
    cost_cents: 20,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  pipelineEventsRows = [];
  knownIntents = [];
  candidateUpserts = [];
  candidateStore = new Map();
  admin = makeAdmin();
});

describe("patternsRecommenderCron", () => {
  it("Test 6: registers BOTH cron + event triggers (TZ=Europe/Amsterdam 0 2 * * *)", async () => {
    await loadCron();
    const trig = captured.__trigger as Array<Record<string, string>>;
    expect(Array.isArray(trig)).toBe(true);
    expect(trig.length).toBe(2);
    const cronEntry = trig.find((t) => "cron" in t);
    const eventEntry = trig.find((t) => "event" in t);
    expect(cronEntry?.cron).toBe("TZ=Europe/Amsterdam 0 2 * * *");
    expect(eventEntry?.event).toBe("patterns.cron.run");
  });

  it("Test 1+2: fetches override rows, clusters, UPSERTs with display_signature + expected_savings + savings_calculation_version=1", async () => {
    pipelineEventsRows = Array.from({ length: 5 }, (_, i) => mkOverrideRow(i));
    await loadCron();
    const step = makeStep();
    const result = await captured.handler!({ step, event: { data: {} } });
    expect(result).toMatchObject({
      fetched: 5,
      clusters_above_threshold: 1,
    });
    expect(candidateUpserts).toHaveLength(1);
    const c = candidateUpserts[0];
    expect(c.kind).toBe("regex_rule");
    expect(c.stage).toBe("1-noise");
    expect(c.savings_calculation_version).toBe(1);
    expect(c.expected_savings_cents_per_month).toBeTypeOf("number");
    const proposed = c.proposed_change as Record<string, unknown>;
    expect(typeof proposed.display_signature).toBe("string");
    expect(proposed.structured_payload).toBeDefined();
  });

  it("Test 3: idempotent — second run does NOT clobber operator decision columns (status/approved_by/dismissed_by)", async () => {
    pipelineEventsRows = Array.from({ length: 4 }, (_, i) =>
      mkOverrideRow(i, {
        eval_type: "entity-correction",
        stage: 2,
        override: {
          sender_email: `p${i}@brand.example`,
          new_customer_account_id: "C-77",
        },
      }),
    );
    await loadCron();
    const step = makeStep();
    await captured.handler!({ step, event: { data: {} } });
    expect(candidateStore.size).toBe(1);
    // Operator approves between runs.
    const key = [...candidateStore.keys()][0];
    candidateStore.set(key, {
      ...candidateStore.get(key)!,
      status: "approved",
      approved_by: "operator-uuid",
      approved_at: "2026-05-25T09:00:00Z",
    });
    // Second run with same inputs.
    candidateUpserts.length = 0;
    await captured.handler!({ step, event: { data: {} } });
    expect(candidateStore.size).toBe(1);
    const after = candidateStore.get(key)!;
    expect(after.status).toBe("approved");
    expect(after.approved_by).toBe("operator-uuid");
    expect(after.approved_at).toBe("2026-05-25T09:00:00Z");
    // And the UPSERT row this cycle did NOT include those columns (cron honors the lock).
    expect(candidateUpserts[0].status).toBeUndefined();
    expect(candidateUpserts[0].approved_by).toBeUndefined();
    expect(candidateUpserts[0].dismissed_by).toBeUndefined();
  });

  it("Test 4 (replay-safety grep): cron source generates no UUIDs outside step.run AND uses no crypto.randomUUID at module scope", () => {
    const src = readFileSync(
      resolve(__dirname, "../promotion-recommender-cron.ts"),
      "utf8",
    );
    // No client-side UUID generation anywhere in the cron — UUIDs come
    // from the Postgres DEFAULT gen_random_uuid() on the column, which
    // replays converge on safely. (The comment in the source explains this
    // — we assert no actual call site.)
    expect(/crypto\.randomUUID\s*\(/.test(src)).toBe(false);
    expect(/uuidv4\s*\(/.test(src)).toBe(false);
  });

  it("Test 5 (inngest.send invariant): cron source never destructures inngest.send", () => {
    const src = readFileSync(
      resolve(__dirname, "../promotion-recommender-cron.ts"),
      "utf8",
    );
    expect(/const\s+send\s*=\s*inngest\.send/.test(src)).toBe(false);
    expect(/\{\s*send\s*\}\s*=\s*inngest/.test(src)).toBe(false);
  });

  it("Test 7: cron is registered in the inngest serve route", () => {
    const src = readFileSync(
      resolve(__dirname, "../../../../app/api/inngest/route.ts"),
      "utf8",
    );
    expect(src.includes("patternsRecommenderCron")).toBe(true);
    expect(src.includes("promotion-recommender-cron")).toBe(true);
  });

  it("swarm_filter param scopes the fetch to a single swarm_type", async () => {
    pipelineEventsRows = Array.from({ length: 3 }, (_, i) =>
      mkOverrideRow(i, { swarm_type: "sales-email" }),
    );
    await loadCron();
    const step = makeStep();
    const result = await captured.handler!({
      step,
      event: { data: { swarm_type: "sales-email" } },
    });
    expect((result as { fetched: number }).fetched).toBe(3);
  });

  it("all side effects live inside step.run (handler calls step.run for fetch + upsert)", async () => {
    pipelineEventsRows = Array.from({ length: 3 }, (_, i) => mkOverrideRow(i));
    await loadCron();
    const step = makeStep();
    await captured.handler!({ step, event: { data: {} } });
    const stepNames = step.run.mock.calls.map((c) => c[0]);
    expect(stepNames).toContain("fetch-override-events");
    expect(stepNames).toContain("upsert-candidates");
  });
});
