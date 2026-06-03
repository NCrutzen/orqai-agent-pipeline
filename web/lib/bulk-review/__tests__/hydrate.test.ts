// Phase 1 (milestone bulk-review-flow-ux) — Plan 01-02 Task 1.
// Tests for hydrateBulkReviewRow. Uses an in-memory SupabaseClient stub
// modeled on lib/inngest/functions/__tests__/classifier-label-resolver.test.ts
// — every `.from()` and `.schema().from()` call is captured so we can both
// assert behavior and count round-trips.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { hydrateBulkReviewRow } from "@/lib/bulk-review/hydrate";
import { __resetCacheForTests } from "@/lib/swarms/registry";

interface FixtureOpts {
  emailLabel?: Record<string, unknown> | null;
  pipelineEvents?: Array<Record<string, unknown>>;
  agentRuns?: Array<Record<string, unknown>>;
  noiseCategories?: Array<Record<string, unknown>>;
  swarmIntents?: Array<Record<string, unknown>>;
  swarmsRow?: Record<string, unknown> | null;
  // Plan 03-06 — coordinator_runs row the Stage 2 customer_name lookup
  // resolves (customer_account_id → customer_name). `undefined` ⇒ default
  // null row (no match). Set to an object to simulate a hit, or pass
  // `coordinatorRunError: true` to simulate a query error.
  coordinatorRunsRow?: Record<string, unknown> | null;
  coordinatorRunsError?: boolean;
}

interface Harness {
  admin: SupabaseClient;
  fromCalls: string[];
}

function makeAdmin(opts: FixtureOpts): Harness {
  const fromCalls: string[] = [];

  // Generic chainable builder. Holds an optional final-resolution shape.
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

  // public-schema dispatch
  const publicFrom = (table: string) => {
    fromCalls.push(`public.${table}`);
    if (table === "pipeline_events") {
      return makeBuilder({ data: opts.pipelineEvents ?? [], error: null });
    }
    if (table === "agent_runs") {
      return makeBuilder({ data: opts.agentRuns ?? [], error: null });
    }
    if (table === "swarms") {
      return makeBuilder({ data: opts.swarmsRow ?? null, error: null });
    }
    if (table === "swarm_noise_categories") {
      return makeBuilder({ data: opts.noiseCategories ?? [], error: null });
    }
    if (table === "swarm_intents") {
      return makeBuilder({ data: opts.swarmIntents ?? [], error: null });
    }
    if (table === "coordinator_runs") {
      // Plan 03-06 — Stage 2 customer_name lookup source (same table
      // searchCustomers uses). Default = null row (no match).
      return makeBuilder({
        data: opts.coordinatorRunsRow ?? null,
        error: opts.coordinatorRunsError ? { message: "boom" } : null,
      });
    }
    return makeBuilder({ data: null, error: null });
  };

  const debtorFrom = (table: string) => {
    fromCalls.push(`debtor.${table}`);
    if (table === "email_labels") {
      return makeBuilder({ data: opts.emailLabel ?? null, error: null });
    }
    return makeBuilder({ data: null, error: null });
  };

  const admin = {
    from: (t: string) => publicFrom(t),
    schema: (schemaName: string) => ({
      from: (t: string) =>
        schemaName === "debtor" ? debtorFrom(t) : publicFrom(t),
    }),
  } as unknown as SupabaseClient;

  return { admin, fromCalls };
}

const SWARM = "debtor-email";
const LABEL_ID = "11111111-1111-1111-1111-111111111111";
const EMAIL_ID = "22222222-2222-2222-2222-222222222222";

const BASE_LABEL = {
  id: LABEL_ID,
  swarm_type: SWARM,
  email_id: EMAIL_ID,
  corrected_customer_account_id: null,
  reviewed_by: null,
  reviewed_at: null,
  draft_quality: null,
  feedback_reason: null,
  customer_account_id: null,
  entity_brand: null,
  handler_key: null,
  handler_output_kind: null,
  // Plan 03-12 (gap-closure r3-1): customer_name is now sourced from this
  // column on the SAME label row (not a coordinator_runs lookup).
  debtor_name: null,
};

const NOISE_CATS = [
  { swarm_type: SWARM, category_key: "auto_reply", display_label: "Auto reply" },
  { swarm_type: SWARM, category_key: "spam", display_label: "Spam" },
];

const INTENTS = [
  { swarm_type: SWARM, intent_key: "invoice_copy_request", handler_event: "x", handler_status: "registered" },
  { swarm_type: SWARM, intent_key: "payment_dispute", handler_event: "y", handler_status: "registered" },
  { swarm_type: SWARM, intent_key: "general_inquiry", handler_event: "z", handler_status: "registered" },
];

describe("hydrateBulkReviewRow", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetCacheForTests();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("Test 1: empty pipeline_events → all six stage slots null, overrides null-populated (P1-D-07)", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row).not.toBeNull();
    expect(row!.stage_0).toBeNull();
    expect(row!.stage_1).toBeNull();
    expect(row!.stage_2).toBeNull();
    expect(row!.stage_3).toBeNull();
    expect(row!.stage_3p5).toBeNull();
    expect(row!.stage_4).toBeNull();
    expect(row!.overrides.axis_3_event_ids).toEqual([]);
    expect(row!.overrides.axis_1_corrected_category).toBeNull();
    expect(row!.overrides.axis_2_corrected_customer_account_id).toBeNull();
    expect(row!.overrides.axis_4_draft_quality).toBeNull();
  });

  it("Test 2: stages 1/2/3 only populated; stage_0/3p5/4 null", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-1",
          stage: 1,
          decision: "auto_reply",
          confidence: 0.9,
          decision_details: { category: "auto_reply" },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
        {
          id: "e-2",
          stage: 2,
          decision: "resolved",
          confidence: 0.8,
          decision_details: { method: "sender_match", customer_account_id: "cust-1" },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:01Z",
          cost_cents: 0,
        },
        {
          id: "e-3",
          stage: 3,
          decision: "invoice_copy_request",
          confidence: null,
          decision_details: { ranked: [{ intent_key: "invoice_copy_request", confidence: "high" }] },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:02Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_0).toBeNull();
    expect(row!.stage_3p5).toBeNull();
    expect(row!.stage_4).toBeNull();
    expect(row!.stage_1).not.toBeNull();
    expect(row!.stage_2).not.toBeNull();
    expect(row!.stage_3).not.toBeNull();
  });

  it("Test 3: stage_1 category_key is in swarm_noise_categories ∪ {'unknown'}; event id matches", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage1",
          stage: 1,
          decision: "auto_reply",
          confidence: 0.9,
          decision_details: { category: "auto_reply", regex: { matchedRule: "rule-7" } },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_1).not.toBeNull();
    expect(["auto_reply", "spam", "unknown"]).toContain(row!.stage_1!.category_key);
    expect(row!.stage_1!.pipeline_event_id).toBe("e-stage1");
    expect(row!.stage_1!.matched_rule_id).toBe("rule-7");
  });

  it("Test 4: stage_3 ranked_intents intent_keys are all in SWARM_INTENTS; poisoned 'auto_reply' filtered", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage3",
          stage: 3,
          decision: "invoice_copy_request",
          confidence: null,
          decision_details: {
            ranked: [
              // Legit intent key
              { intent_key: "invoice_copy_request", confidence: "high" },
              // POISONED: this is a swarm_noise_categories.category_key. The
              // hydrator MUST drop it and emit a console.warn referencing the
              // hard-separation rule.
              { intent_key: "auto_reply", confidence: "low" },
              // Another legit one
              { intent_key: "payment_dispute", confidence: 0.5 },
            ],
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_3).not.toBeNull();
    const keys = row!.stage_3!.ranked_intents.map((r) => r.intent_key);
    expect(keys).toEqual(["invoice_copy_request", "payment_dispute"]);
    // hard-separation warning observed
    const warnings = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const hit = warnings.some(
      (w: string) => w.includes("auto_reply") || w.includes("hard separation"),
    );
    expect(hit).toBe(true);
  });

  it("Test 5: stage_2 entity_brand is null or member of ENTITY_BRANDS", async () => {
    const { admin } = makeAdmin({
      emailLabel: { ...BASE_LABEL, entity_brand: "smeba" },
      pipelineEvents: [
        {
          id: "e-stage2",
          stage: 2,
          decision: "resolved",
          confidence: 0.7,
          decision_details: { method: "sender_match", customer_account_id: "cust-x" },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_2).not.toBeNull();
    // null OR a member of the codegen'd ENTITY_BRANDS literal-union.
    const brand = row!.stage_2!.entity_brand;
    expect(brand === null || typeof brand === "string").toBe(true);
    if (brand !== null) {
      expect(["berki", "fire-control", "sicli-noord", "sicli-sud", "smeba", "smeba-fire"]).toContain(brand);
    }
  });

  it("Test 6: overrides.axis_3_event_ids contains all stage=3 override events, oldest-first", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "ov-1",
          stage: 3,
          decision: "payment_dispute",
          confidence: null,
          decision_details: {},
          override: { axis: "stage_3_intent", original_decision: "invoice_copy_request" },
          triggered_by: "operator-override",
          created_at: "2026-05-20T11:00:00Z",
          cost_cents: 0,
        },
        {
          id: "ov-2",
          stage: 3,
          decision: "general_inquiry",
          confidence: null,
          decision_details: {},
          override: { axis: "stage_3_intent", original_decision: "payment_dispute" },
          triggered_by: "operator-override",
          created_at: "2026-05-20T12:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.overrides.axis_3_event_ids).toEqual(["ov-1", "ov-2"]);
  });

  // Phase 2 Plan 02-01 — LLM Pass 2 evidence projection tests.

  it("Plan 02-01 T1: all-null LLM fields when llm_invoked is absent (regex decisive)", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage1",
          stage: 1,
          decision: "auto_reply",
          confidence: 0.9,
          decision_details: {
            category: "auto_reply",
            regex: { category: "auto_reply", matchedRule: "rule-7" },
            final_category_key: "auto_reply",
            predictor: "regex",
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_1).not.toBeNull();
    expect(row!.stage_1!.llm_invoked).toBe(false);
    expect(row!.stage_1!.llm_category_key).toBeNull();
    expect(row!.stage_1!.llm_confidence).toBeNull();
    expect(row!.stage_1!.llm_reasoning).toBeNull();
    expect(row!.stage_1!.llm_error).toBeNull();
    expect(row!.stage_1!.predictor).toBe("regex");
  });

  it("Plan 02-01 T2: LLM Pass 2 fields projected when llm_invoked is true", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage1",
          stage: 1,
          decision: "other",
          confidence: null,
          decision_details: {
            regex: { category: "unknown", matchedRule: null },
            llm_invoked: true,
            llm_category_key: "other",
            llm_confidence: "medium",
            llm_reasoning: "looks like a generic acknowledgment",
            llm_error: null,
            predictor: "llm_2nd_pass",
            final_category_key: "other",
            category: "other",
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: [
        ...NOISE_CATS,
        { swarm_type: SWARM, category_key: "other", display_label: "Other" },
      ],
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_1!.llm_invoked).toBe(true);
    expect(row!.stage_1!.llm_category_key).toBe("other");
    expect(row!.stage_1!.llm_confidence).toBe("medium");
    expect(row!.stage_1!.llm_reasoning).toBe(
      "looks like a generic acknowledgment",
    );
    expect(row!.stage_1!.llm_error).toBeNull();
    expect(row!.stage_1!.predictor).toBe("llm_2nd_pass");
  });

  it("Plan 02-01 T3: llm_error projected when LLM call failed", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage1",
          stage: 1,
          decision: "unknown",
          confidence: null,
          decision_details: {
            regex: { category: "unknown", matchedRule: null },
            llm_invoked: true,
            llm_category_key: null,
            llm_confidence: null,
            llm_reasoning: null,
            llm_error: "orq timeout after 31s",
            predictor: "llm_2nd_pass",
            final_category_key: "unknown",
            category: "unknown",
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_1!.llm_invoked).toBe(true);
    expect(row!.stage_1!.llm_error).toBe("orq timeout after 31s");
    expect(row!.stage_1!.predictor).toBe("llm_2nd_pass");
  });

  it("Plan 02-01 T4: invalid llm_confidence / predictor strings coerce to null", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage1",
          stage: 1,
          decision: "auto_reply",
          confidence: null,
          decision_details: {
            regex: { category: "auto_reply", matchedRule: "rule-1" },
            llm_invoked: false,
            llm_confidence: "bogus", // not high/medium/low
            predictor: "wat", // not regex/llm_2nd_pass
            category: "auto_reply",
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_1!.llm_confidence).toBeNull();
    expect(row!.stage_1!.predictor).toBeNull();
    expect(row!.stage_1!.llm_invoked).toBe(false);
  });

  // Phase 2 Plan 02-03 — display-label projection from swarm_noise_categories.

  it("Plan 02-03 T1: stage_1.category_display_label + llm_category_display_label resolved from noiseCats registry (no second DB roundtrip)", async () => {
    const { admin, fromCalls } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage1",
          stage: 1,
          decision: "auto_reply",
          confidence: null,
          decision_details: {
            regex: { category: "unknown", matchedRule: null },
            llm_invoked: true,
            llm_category_key: "spam",
            llm_confidence: "high",
            llm_reasoning: "promo",
            llm_error: null,
            predictor: "llm_2nd_pass",
            category: "auto_reply",
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_1!.category_display_label).toBe("Auto reply");
    expect(row!.stage_1!.llm_category_display_label).toBe("Spam");
    // No second registry round-trip — the only swarm_noise_categories call
    // is the one already-loaded inside hydrate (registry cache resolves it).
    const noiseCatCalls = fromCalls.filter(
      (t) => t === "public.swarm_noise_categories",
    );
    expect(noiseCatCalls.length).toBeLessThanOrEqual(1);
  });

  it("Plan 02-03 T2: display labels are null when category key is not in registry (defensive — hydrator strips invalid keys, this is the historic-row case)", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage1",
          stage: 1,
          decision: "retired_key",
          confidence: null,
          decision_details: {
            regex: { category: "retired_key", matchedRule: "old-rule" },
            llm_invoked: true,
            llm_category_key: "also_retired",
            llm_confidence: "low",
            llm_reasoning: null,
            llm_error: null,
            predictor: "llm_2nd_pass",
            category: "retired_key",
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_1!.category_display_label).toBeNull();
    expect(row!.stage_1!.llm_category_display_label).toBeNull();
  });

  // Phase 2 Plan 02-05 — RankedIntent.display_label projection.

  it("Plan 02-05 T1: ranked_intents project display_label from intents registry (when registry exposes it)", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage3",
          stage: 3,
          decision: "invoice_copy_request",
          confidence: null,
          decision_details: {
            ranked: [
              { intent_key: "invoice_copy_request", confidence: "high" },
              { intent_key: "payment_dispute", confidence: 0.5 },
            ],
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      // Defensive: the SwarmIntentRow type has no display_label today, but
      // the hydrator uses an `unknown`-cast lookup so a future column add
      // wires automatically. Fixture exercises that auto-wire path.
      swarmIntents: [
        {
          swarm_type: SWARM,
          intent_key: "invoice_copy_request",
          handler_event: "x",
          handler_status: "registered",
          display_label: "Invoice copy request",
        },
        {
          swarm_type: SWARM,
          intent_key: "payment_dispute",
          handler_event: "y",
          handler_status: "registered",
          display_label: "Payment dispute",
        },
        {
          swarm_type: SWARM,
          intent_key: "general_inquiry",
          handler_event: "z",
          handler_status: "registered",
          display_label: "General inquiry",
        },
      ],
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_3).not.toBeNull();
    const ranked = row!.stage_3!.ranked_intents;
    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toMatchObject({
      intent_key: "invoice_copy_request",
      display_label: "Invoice copy request",
    });
    expect(ranked[1]).toMatchObject({
      intent_key: "payment_dispute",
      display_label: "Payment dispute",
    });
  });

  it("Plan 02-05 T2: hard-separation still filters poisoned intent_keys after display_label projection", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage3",
          stage: 3,
          decision: "invoice_copy_request",
          confidence: null,
          decision_details: {
            ranked: [
              { intent_key: "invoice_copy_request", confidence: "high" },
              // POISON: a noise category key leaked into ranked_intents. The
              // hydrator must drop it BEFORE the display_label lookup runs.
              { intent_key: "auto_reply", confidence: "low" },
            ],
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    const keys = row!.stage_3!.ranked_intents.map((r) => r.intent_key);
    // hard separation: auto_reply (a swarm_noise_categories key) is filtered
    expect(keys).toEqual(["invoice_copy_request"]);
    // display_label is null today because INTENTS fixture has no
    // display_label field (matches production reality — no column yet).
    expect(row!.stage_3!.ranked_intents[0].display_label).toBeNull();
  });

  it("Test 7: hydrator makes at most 4 distinct table queries (registry-cache warmed)", async () => {
    const { admin, fromCalls } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    // Anchor row + pipeline_events + agent_runs + registry warm-up. Registry
    // calls (swarms, swarm_noise_categories, swarm_intents) all live behind a
    // 60s TTL cache (lib/swarms/registry.ts) — so on subsequent calls within
    // the TTL window there are ZERO additional registry round-trips. The
    // ceiling we assert here is "first warm-up" — count unique table accesses
    // and require them to be the bounded set documented in the hydrator.
    const uniqueTables = new Set(fromCalls);
    // Must include the 3 data tables. Registry tables may also appear on
    // first warm-up; total unique table count is bounded.
    expect(uniqueTables.has("debtor.email_labels")).toBe(true);
    expect(uniqueTables.has("public.pipeline_events")).toBe(true);
    expect(uniqueTables.has("public.agent_runs")).toBe(true);
    // Total bounded — no per-row registry chatter.
    expect(uniqueTables.size).toBeLessThanOrEqual(7);

    // Second hydrate within TTL — registry must NOT hit the network again
    // for the same swarm_type.
    const before = fromCalls.length;
    await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });
    const second = fromCalls.slice(before);
    // Second call: anchor + pipeline_events + agent_runs (3 calls). No more
    // swarm_noise_categories / swarm_intents / swarms — cached.
    expect(second.filter((t) => t.startsWith("public.swarm")).length).toBe(0);
  });

  // ------------------------------------------------------------------
  // Plan 02-04 — agent_run_id projection on stage_1.
  // Required for the Decide-column rule-feedback widget to route the
  // human_verdict='edited_minor' UPDATE through the /feedback POST
  // handler (OQ-9).
  // ------------------------------------------------------------------

  it("Plan 02-04 T1: stage_1.agent_run_id is projected from agent_runs.id where stage=1", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage1",
          stage: 1,
          decision: "auto_reply",
          confidence: 0.9,
          decision_details: {
            category: "auto_reply",
            regex: { matchedRule: "rule-7" },
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          stage: 1,
          corrected_category: null,
          human_verdict: null,
          tool_outputs: {},
        },
      ],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_1).not.toBeNull();
    expect(row!.stage_1!.agent_run_id).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
  });

  it("Plan 02-04 T2: stage_1.agent_run_id is null when no stage=1 agent_runs row exists", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage1",
          stage: 1,
          decision: "auto_reply",
          confidence: 0.9,
          decision_details: { category: "auto_reply" },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      // Only a stage=3 run exists — hard-separation: the stage-1 lookup
      // MUST NOT pick this up.
      agentRuns: [
        {
          id: "99999999-9999-4999-8999-999999999999",
          stage: 3,
          corrected_category: null,
          human_verdict: null,
          tool_outputs: {},
        },
      ],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_1).not.toBeNull();
    expect(row!.stage_1!.agent_run_id).toBeNull();
  });

  // ------------------------------------------------------------------
  // Phase 04.1 — Plan 04: Stage 1 llm_model_key + Stage 2 resolver trace
  // ------------------------------------------------------------------

  it("Phase 04.1 T1: stage_1.llm_model_key projected from decision_details.model_key", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage1",
          stage: 1,
          decision: "auto_reply",
          confidence: 0.9,
          decision_details: {
            category: "auto_reply",
            llm_invoked: true,
            predictor: "llm_2nd_pass",
            model_key: "stage-1-category-classifier",
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_1).not.toBeNull();
    expect(row!.stage_1!.llm_model_key).toBe("stage-1-category-classifier");
  });

  it("Phase 04.1 T2: stage_1.llm_model_key is null when decision_details.model_key is missing", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage1",
          stage: 1,
          decision: "auto_reply",
          confidence: 0.9,
          decision_details: { category: "auto_reply" }, // no model_key
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_1).not.toBeNull();
    expect(row!.stage_1!.llm_model_key).toBeNull();
  });

  it("Phase 04.1 T3: stage_1.llm_model_key is null when decision_details.model_key is non-string", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage1",
          stage: 1,
          decision: "auto_reply",
          confidence: 0.9,
          decision_details: { category: "auto_reply", model_key: 42 },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_1).not.toBeNull();
    expect(row!.stage_1!.llm_model_key).toBeNull();
  });

  it("Phase 04.1 T4: stage_2.resolver_steps + winner_step projected when steps[] + winner present", async () => {
    const steps = [
      {
        step: "thread",
        idx: 1,
        status: "picked",
        confidence: 0.9,
        detail: { prior_email_label_id: "prev-lbl" },
      },
      { step: "sender_map", idx: 2, status: "not_run", confidence: null, detail: null },
      { step: "identifier", idx: 3, status: "not_run", confidence: null, detail: null },
      { step: "llm_tiebreaker", idx: 4, status: "not_run", confidence: null, detail: null },
    ];
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage2",
          stage: 2,
          decision: "resolved",
          confidence: 0.9,
          decision_details: {
            method: "thread_inheritance",
            customer_account_id: "cust-x",
            steps,
            winner: 1,
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_2).not.toBeNull();
    expect(row!.stage_2!.resolver_steps).not.toBeNull();
    expect(row!.stage_2!.resolver_steps!.length).toBe(4);
    expect(row!.stage_2!.winner_step).toBe(1);
  });

  it("Phase 04.1 T5 (SC #6 lock): stage_2.resolver_steps + winner_step are null when steps key absent (forward-only-emit)", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage2",
          stage: 2,
          decision: "resolved",
          confidence: 0.7,
          // Pre-Phase-04.1 row: no `steps` / no `winner`.
          decision_details: {
            method: "sender_match",
            customer_account_id: "cust-y",
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_2).not.toBeNull();
    expect(row!.stage_2!.resolver_steps).toBeNull();
    expect(row!.stage_2!.winner_step).toBeNull();
  });

  it("Phase 04.1 T6: stage_2.winner_step is null when winner is out-of-range (e.g. 5)", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage2",
          stage: 2,
          decision: "resolved",
          confidence: 0.7,
          decision_details: {
            method: "sender_match",
            customer_account_id: "cust-z",
            steps: [],
            winner: 5,
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_2).not.toBeNull();
    expect(row!.stage_2!.winner_step).toBeNull();
  });

  it("Phase 04.1 T7: stage_2.resolver_steps is null when steps is a non-array (e.g. object)", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage2",
          stage: 2,
          decision: "resolved",
          confidence: 0.7,
          decision_details: {
            method: "sender_match",
            customer_account_id: "cust-z",
            steps: { not: "an array" },
            winner: 2,
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_2).not.toBeNull();
    expect(row!.stage_2!.resolver_steps).toBeNull();
    // winner_step is still projected (validation per-field, projection-only).
    expect(row!.stage_2!.winner_step).toBe(2);
  });

  // ------------------------------------------------------------------
  // Phase 04.1 Plan 08 — stage_2.inputs (llm_tiebreaker candidate evidence).
  // Projected from decision_details.inputs (emitted since Phase 82.9). The
  // operator asked which candidate customers tied + which was picked.
  // ------------------------------------------------------------------

  it("Plan 08: stage_2.inputs projects llm_tiebreaker candidates + picked_account_id", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage2",
          stage: 2,
          decision: "resolved",
          confidence: 0.4,
          decision_details: {
            method: "llm_tiebreaker",
            customer_account_id: "587924",
            inputs: {
              kind: "llm_tiebreaker",
              sender_email: null,
              matched_identifiers: ["591155"],
              picked_account_id: "587924",
              llm_reason: "invoice number 591155 appears on Nooteboom statements",
              candidates: [
                {
                  id: "587924",
                  name: "Nooteboom Trailers B.V.",
                  contact_person: "Johan Smid",
                  recent_invoices: ["591155"],
                },
                {
                  id: "450002",
                  name: "IDHL (VIPP)",
                  contact_person: null,
                  recent_invoices: [],
                },
              ],
            },
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_2).not.toBeNull();
    const inputs = row!.stage_2!.inputs;
    expect(inputs).not.toBeNull();
    expect(inputs!.kind).toBe("llm_tiebreaker");
    if (inputs!.kind === "llm_tiebreaker") {
      expect(inputs!.candidates.length).toBe(2);
      expect(inputs!.picked_account_id).toBe("587924");
      expect(inputs!.candidates.map((c) => c.name)).toContain(
        "Nooteboom Trailers B.V.",
      );
    }
  });

  it("Plan 08 (forward-only gate): stage_2.inputs is null when decision_details has no inputs key", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage2",
          stage: 2,
          decision: "resolved",
          confidence: 0.9,
          // Pre-82.9 row: method/customer present, no inputs.
          decision_details: {
            method: "sender_match",
            customer_account_id: "450002",
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_2).not.toBeNull();
    expect(row!.stage_2!.inputs).toBeNull();
  });

  it("Plan 08 (error-branch): stage_2.inputs is null when steps present but inputs absent", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage2",
          stage: 2,
          decision: "resolved",
          confidence: 0.5,
          // Resolver-error branch writes steps/winner but not inputs.
          decision_details: {
            method: "llm_tiebreaker",
            customer_account_id: "587924",
            steps: [
              { step: "thread", idx: 1, status: "not_run", confidence: null, detail: null },
            ],
            winner: 4,
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_2).not.toBeNull();
    expect(row!.stage_2!.inputs).toBeNull();
  });

  it("Plan 08 (malformed): stage_2.inputs is null when inputs is a non-object", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage2",
          stage: 2,
          decision: "resolved",
          confidence: 0.5,
          decision_details: {
            method: "sender_match",
            customer_account_id: "450002",
            inputs: "foo",
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:00Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_2).not.toBeNull();
    expect(row!.stage_2!.inputs).toBeNull();
  });

  // ------------------------------------------------------------------
  // Plan 03-12 (gap-closure r3-1, supersedes Plan 03-06) — Stage 2
  // customer_name now sourced from debtor.email_labels.debtor_name (the SAME
  // row the hydrator loads), NOT a coordinator_runs lookup (that column does
  // not exist → 42703 → silent null). + sender_map_lineage (NOT-IN-CORPUS).
  // ------------------------------------------------------------------

  const STAGE2_EVENT = {
    id: "e-stage2",
    stage: 2,
    decision: "resolved",
    confidence: 0.8,
    decision_details: { method: "sender_match", customer_account_id: "0079" },
    override: null,
    triggered_by: "pipeline",
    created_at: "2026-05-20T10:00:00Z",
    cost_cents: 0,
  };

  it("Plan 03-12 T1: stage_2.customer_name resolves from email_labels.debtor_name", async () => {
    const { admin } = makeAdmin({
      emailLabel: { ...BASE_LABEL, debtor_name: "Van den Berg BV" },
      pipelineEvents: [STAGE2_EVENT],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_2).not.toBeNull();
    expect(row!.stage_2!.customer_name).toBe("Van den Berg BV");
  });

  it("Plan 03-12 T2: stage_2.customer_name is null when the label has no debtor_name", async () => {
    const { admin } = makeAdmin({
      emailLabel: { ...BASE_LABEL, debtor_name: null },
      pipelineEvents: [STAGE2_EVENT],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_2).not.toBeNull();
    expect(row!.stage_2!.customer_name).toBeNull();
  });

  it("Plan 03-12 T3: customer_name comes from the SAME label row — no coordinator_runs name lookup is issued", async () => {
    const { admin, fromCalls } = makeAdmin({
      emailLabel: { ...BASE_LABEL, debtor_name: "Vos Logistics B.V." },
      pipelineEvents: [STAGE2_EVENT],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_2!.customer_name).toBe("Vos Logistics B.V.");
    // The broken coordinator_runs.customer_name lookup must be gone.
    expect(fromCalls).not.toContain("public.coordinator_runs");
  });

  it("Plan 03-12 T4: stage_2.sender_map_lineage is always null (NOT-IN-CORPUS until a future migration)", async () => {
    const { admin } = makeAdmin({
      emailLabel: { ...BASE_LABEL, debtor_name: "Van den Berg BV" },
      pipelineEvents: [STAGE2_EVENT],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_2).not.toBeNull();
    expect(row!.stage_2!.sender_map_lineage).toBeNull();
  });

  it("Plan 03-12 T5: the customer_name source change does not disturb existing Stage 2 projections", async () => {
    const { admin } = makeAdmin({
      emailLabel: { ...BASE_LABEL, debtor_name: "Van den Berg BV" },
      pipelineEvents: [STAGE2_EVENT],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    expect(row!.stage_2!.resolver_source).toBe("sender_map");
    expect(row!.stage_2!.customer_account_id).toBe("0079");
    expect(row!.stage_2!.resolver_steps).toBeNull();
    expect(row!.stage_2!.winner_step).toBeNull();
  });

  // Plan 03-12 (gap-closure r3-2) — RankedIntent now carries the per-intent
  // classifier evidence (reasoning / sub_type / document_reference /
  // confidence_label) projected from coordinator_runs.ranked_intents[].
  // ------------------------------------------------------------------

  it("Plan 03-12 T6: ranked_intents carry reasoning/sub_type/document_reference/confidence_label from ranked_intents[]", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage3",
          stage: 3,
          decision: "invoice_copy_request",
          confidence: null,
          decision_details: {
            ranked: [
              {
                intent: "invoice_copy_request",
                sub_type: "duplicate",
                reasoning: "Customer asks for a copy of invoice 12345.",
                confidence: "high",
                document_reference: "INV-12345",
              },
            ],
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:02Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    const top = row!.stage_3!.ranked_intents[0];
    expect(top.intent_key).toBe("invoice_copy_request");
    expect(top.reasoning).toBe("Customer asks for a copy of invoice 12345.");
    expect(top.sub_type).toBe("duplicate");
    expect(top.document_reference).toBe("INV-12345");
    expect(top.confidence_label).toBe("high");
    // Numeric confidence still coerced for the bar.
    expect(top.confidence).toBe(0.9);
  });

  it("Plan 03-12 T7: ranked_intents evidence fields default null on historic rows that lacked them", async () => {
    const { admin } = makeAdmin({
      emailLabel: BASE_LABEL,
      pipelineEvents: [
        {
          id: "e-stage3",
          stage: 3,
          decision: "payment_dispute",
          confidence: null,
          decision_details: {
            ranked: [{ intent_key: "payment_dispute", confidence: "low" }],
          },
          override: null,
          triggered_by: "pipeline",
          created_at: "2026-05-20T10:00:02Z",
          cost_cents: 0,
        },
      ],
      agentRuns: [],
      noiseCategories: NOISE_CATS,
      swarmIntents: INTENTS,
    });

    const row = await hydrateBulkReviewRow(admin, {
      email_label_id: LABEL_ID,
      swarm_type: SWARM,
    });

    const top = row!.stage_3!.ranked_intents[0];
    expect(top.reasoning).toBeNull();
    expect(top.sub_type).toBeNull();
    expect(top.document_reference).toBeNull();
    expect(top.confidence_label).toBe("low");
  });
});
