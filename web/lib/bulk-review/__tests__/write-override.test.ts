// Phase 1 (milestone bulk-review-flow-ux) — Plan 01-02 Task 2.
// Per-axis behavior tests for writeOverride. Uses an in-memory Supabase
// client stub modeled on lib/inngest/functions/__tests__/classifier-
// label-resolver.test.ts. Captures every insert/update payload so we can
// assert the EXACT pipeline_events shape (override IS NOT NULL, eval_type,
// triggered_by) the Phase 70 partial index expects.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { writeOverride } from "@/lib/bulk-review/write-override";

interface CapturedInsert {
  schema?: string;
  table: string;
  payload: Record<string, unknown>;
  returnedId: string;
}
interface CapturedUpdate {
  schema?: string;
  table: string;
  payload: Record<string, unknown>;
  whereCol: string;
  whereVal: unknown;
}

interface Harness {
  admin: SupabaseClient;
  inserts: CapturedInsert[];
  updates: CapturedUpdate[];
}

function makeAdmin(): Harness {
  const inserts: CapturedInsert[] = [];
  const updates: CapturedUpdate[] = [];
  let insertCounter = 0;

  // Insert chain: .insert(payload).select('id').single() → {data:{id}, error:null}
  const insertChain = (schemaName: string | undefined, table: string) => ({
    insert: (payload: Record<string, unknown>) => {
      const returnedId = `pe-${++insertCounter}`;
      inserts.push({ schema: schemaName, table, payload, returnedId });
      const chain = {
        select: (_cols: string) => ({
          single: async () => ({ data: { id: returnedId }, error: null }),
        }),
      };
      return chain;
    },
  });

  // Update chain: .update(payload).eq(col, val) → Promise<{error:null}>
  const updateChain = (schemaName: string | undefined, table: string) => ({
    update: (payload: Record<string, unknown>) => ({
      eq: async (whereCol: string, whereVal: unknown) => {
        updates.push({ schema: schemaName, table, payload, whereCol, whereVal });
        return { error: null };
      },
    }),
  });

  const tableProxy = (schemaName: string | undefined, table: string) => ({
    ...insertChain(schemaName, table),
    ...updateChain(schemaName, table),
  });

  const admin = {
    from: (table: string) => tableProxy(undefined, table),
    schema: (schemaName: string) => ({
      from: (table: string) => tableProxy(schemaName, table),
    }),
  } as unknown as SupabaseClient;

  return { admin, inserts, updates };
}

const BASE_ARGS = {
  email_label_id: "11111111-1111-1111-1111-111111111111",
  email_id: "22222222-2222-2222-2222-222222222222",
  swarm_type: "debtor-email",
  operator_id: "00000000-0000-0000-0000-0000000000aa",
  original_event_id: "33333333-3333-3333-3333-333333333333",
  original_decision: "auto_reply",
  context_version: "1.0.0",
};

describe("writeOverride", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makeAdmin();
  });

  it("Test 1: Axis 1 emits stage=1 pipeline_events row + UPDATEs agent_runs.corrected_category", async () => {
    const result = await writeOverride(harness.admin, {
      ...BASE_ARGS,
      input: {
        axis: "stage_1_category",
        new_category_key: "invoice_copy_request",
      },
    });

    expect(result.pipeline_event_ids).toHaveLength(1);
    expect(result.axis_column_updated).toBe(true);

    const ev = harness.inserts.find((i) => i.table === "pipeline_events");
    expect(ev).toBeDefined();
    const p = ev!.payload;
    expect(p.stage).toBe(1);
    expect(p.decision).toBe("invoice_copy_request");
    // Phase 3 Plan 01 Task 0a — axis-specific eval_type per override-model.md.
    expect(p.eval_type).toBe("category-correction");
    expect(p.triggered_by).toBe("operator-override");
    expect(p.override).toBeTruthy();
    const ov = p.override as Record<string, unknown>;
    expect(ov.axis).toBe("stage_1_category");
    expect(ov.original_decision).toBe("auto_reply");

    const up = harness.updates.find((u) => u.table === "agent_runs");
    expect(up).toBeDefined();
    expect(up!.payload.corrected_category).toBe("invoice_copy_request");
    expect(up!.whereCol).toBe("email_id");
    expect(up!.whereVal).toBe(BASE_ARGS.email_id);
  });

  it("Test 2: Axis 2 emits stage=2 row + UPDATEs email_labels with corrected_customer + reviewed_*", async () => {
    const result = await writeOverride(harness.admin, {
      ...BASE_ARGS,
      input: {
        axis: "stage_2_customer",
        new_customer_account_id: "cust-uuid-77",
      },
    });

    expect(result.pipeline_event_ids).toHaveLength(1);
    expect(result.axis_column_updated).toBe(true);

    const ev = harness.inserts[0];
    expect(ev.payload.stage).toBe(2);
    expect(ev.payload.decision).toBe("cust-uuid-77");
    expect(ev.payload.eval_type).toBe("entity-correction");
    expect(ev.payload.triggered_by).toBe("operator-override");

    const up = harness.updates.find(
      (u) => u.schema === "debtor" && u.table === "email_labels",
    );
    expect(up).toBeDefined();
    expect(up!.payload.corrected_customer_account_id).toBe("cust-uuid-77");
    expect(up!.payload.reviewed_by).toBe(BASE_ARGS.operator_id);
    expect(up!.payload.reviewed_at).toBeTypeOf("string");
    expect(up!.whereCol).toBe("id");
    expect(up!.whereVal).toBe(BASE_ARGS.email_label_id);
  });

  it("Test 3: Axis 3 emits N stage=3 rows in order, NO email_labels/agent_runs UPDATE", async () => {
    const result = await writeOverride(harness.admin, {
      ...BASE_ARGS,
      input: {
        axis: "stage_3_intent",
        new_ranked_intents: [
          { intent_key: "invoice_copy_request", confidence: 0.9, display_label: null },
          { intent_key: "payment_dispute", confidence: 0.7, display_label: null },
        ],
      },
    });

    expect(result.pipeline_event_ids).toHaveLength(2);
    expect(result.axis_column_updated).toBe(false);

    const stage3Inserts = harness.inserts.filter(
      (i) => i.table === "pipeline_events" && i.payload.stage === 3,
    );
    expect(stage3Inserts).toHaveLength(2);
    expect(stage3Inserts[0].payload.decision).toBe("invoice_copy_request");
    expect(stage3Inserts[1].payload.decision).toBe("payment_dispute");
    for (const ins of stage3Inserts) {
      expect(ins.payload.eval_type).toBe("intent-correction");
      expect(ins.payload.triggered_by).toBe("operator-override");
      const ov = ins.payload.override as Record<string, unknown>;
      expect(ov.axis).toBe("stage_3_intent");
    }
    // No email_labels or agent_runs UPDATE.
    expect(
      harness.updates.filter(
        (u) => u.table === "email_labels" || u.table === "agent_runs",
      ),
    ).toHaveLength(0);
  });

  it("Test 4: Axis 4 emits stage=4 row + UPDATEs email_labels.draft_quality+feedback_reason", async () => {
    const result = await writeOverride(harness.admin, {
      ...BASE_ARGS,
      input: {
        axis: "stage_4_handler_output",
        new_draft_quality: "needed_edit",
        new_feedback_reason: "tone too curt",
      },
    });

    expect(result.pipeline_event_ids).toHaveLength(1);
    expect(result.axis_column_updated).toBe(true);

    const ev = harness.inserts[0];
    expect(ev.payload.stage).toBe(4);
    expect(ev.payload.decision).toBe("needed_edit");
    expect(ev.payload.eval_type).toBe("handler-quality");
    const dd = ev.payload.decision_details as Record<string, unknown>;
    expect(dd.feedback_reason).toBe("tone too curt");

    const up = harness.updates.find(
      (u) => u.schema === "debtor" && u.table === "email_labels",
    );
    expect(up).toBeDefined();
    expect(up!.payload.draft_quality).toBe("needed_edit");
    expect(up!.payload.feedback_reason).toBe("tone too curt");
    expect(up!.whereCol).toBe("id");
  });

  it("Test 5: every emitted pipeline_events row has override IS NOT NULL with the full OverrideJson shape", async () => {
    await writeOverride(harness.admin, {
      ...BASE_ARGS,
      input: {
        axis: "stage_3_intent",
        new_ranked_intents: [
          { intent_key: "invoice_copy_request", confidence: 0.9, display_label: null },
          { intent_key: "payment_dispute", confidence: 0.7, display_label: null },
          { intent_key: "general_inquiry", confidence: 0.5, display_label: null },
        ],
      },
    });

    expect(harness.inserts.length).toBeGreaterThan(0);
    for (const ins of harness.inserts) {
      const ov = ins.payload.override as Record<string, unknown> | null;
      expect(ov).not.toBeNull();
      expect(ov).toMatchObject({
        axis: expect.any(String),
        original_decision: expect.any(String),
        original_event_id: expect.any(String),
        operator_id: expect.any(String),
        submitted_at: expect.any(String),
      });
      // reason may be null but the key MUST be present.
      expect(ov!).toHaveProperty("reason");
    }
  });

  it("Test 6: reason defaults to null; submitted_at is generated internally as an ISO string", async () => {
    const before = Date.now();
    await writeOverride(harness.admin, {
      ...BASE_ARGS,
      input: {
        axis: "stage_1_category",
        new_category_key: "spam",
      },
    });
    const after = Date.now();

    const ev = harness.inserts.find((i) => i.table === "pipeline_events")!;
    const ov = ev.payload.override as Record<string, unknown>;
    expect(ov.reason).toBeNull();
    expect(typeof ov.submitted_at).toBe("string");
    const t = Date.parse(ov.submitted_at as string);
    expect(t).toBeGreaterThanOrEqual(before - 1000);
    expect(t).toBeLessThanOrEqual(after + 1000);
  });

  it("Axis 3 multi-emit: 3 ranked entries produce exactly 3 pipeline_events inserts", async () => {
    await writeOverride(harness.admin, {
      ...BASE_ARGS,
      input: {
        axis: "stage_3_intent",
        new_ranked_intents: [
          { intent_key: "invoice_copy_request", confidence: 0.9, display_label: null },
          { intent_key: "payment_dispute", confidence: 0.7, display_label: null },
          { intent_key: "general_inquiry", confidence: 0.5, display_label: null },
        ],
      },
    });
    const stage3 = harness.inserts.filter(
      (i) => i.table === "pipeline_events" && i.payload.stage === 3,
    );
    expect(stage3).toHaveLength(3);
    // Each row carries rank index in decision_details.
    expect((stage3[0].payload.decision_details as Record<string, unknown>).rank).toBe(0);
    expect((stage3[1].payload.decision_details as Record<string, unknown>).rank).toBe(1);
    expect((stage3[2].payload.decision_details as Record<string, unknown>).rank).toBe(2);
  });
});
