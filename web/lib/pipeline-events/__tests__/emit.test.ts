// Phase 70 Plan 02 — helper-level tests for `emitPipelineEvent` and the
// `numericConfidence` mapping helper.
//
// Mock pattern modeled on
// `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts`
// (`supabaseInserts` array): each `.from(table).insert(payload)` call pushes
// `{ table, payload }` into a shared array we assert against.

import { describe, it, expect, beforeEach } from "vitest";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import { numericConfidence, Stage } from "@/lib/pipeline-events/types";
import type { PipelineEventInput } from "@/lib/pipeline-events/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type SupabaseInsert = { table: string; payload: unknown };

function makeAdmin(opts: { error?: { message: string } | null } = {}): {
  admin: SupabaseClient;
  inserts: SupabaseInsert[];
} {
  const inserts: SupabaseInsert[] = [];
  const admin = {
    from: (table: string) => ({
      insert: (payload: unknown) => {
        inserts.push({ table, payload });
        return Promise.resolve({ data: null, error: opts.error ?? null });
      },
    }),
  } as unknown as SupabaseClient;
  return { admin, inserts };
}

describe("emitPipelineEvent — pipeline_events helper", () => {
  let admin: SupabaseClient;
  let inserts: SupabaseInsert[];

  beforeEach(() => {
    ({ admin, inserts } = makeAdmin());
  });

  it("inserts a row into pipeline_events with the supplied payload", async () => {
    const payload: PipelineEventInput = {
      swarm_type: "debtor-email",
      stage: Stage.Stage1_Regex,
      email_id: "11111111-1111-1111-1111-111111111111",
      decision: "invoice_copy_request",
      confidence: 0.9,
      decision_details: { rule_id: "rule-1", evidence: ["INV-1"] },
      triggered_by: "pipeline",
    };

    await emitPipelineEvent(admin, payload);

    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("pipeline_events");
    expect(inserts[0].payload).toEqual(payload);
  });

  it("throws when admin.from('pipeline_events').insert returns an error", async () => {
    const { admin: errAdmin } = makeAdmin({ error: { message: "boom" } });
    const payload: PipelineEventInput = {
      swarm_type: "debtor-email",
      stage: Stage.Stage0_Safety,
      decision: "safe",
    };

    await expect(emitPipelineEvent(errAdmin, payload)).rejects.toThrow(
      /pipeline_events insert failed: boom/,
    );
  });

  it("passes nullable optional fields (override, eval_type, case_id) through unchanged", async () => {
    const payload: PipelineEventInput = {
      swarm_type: "debtor-email",
      stage: Stage.Stage2_Entity,
      email_id: "22222222-2222-2222-2222-222222222222",
      case_id: null,
      decision: "resolved",
      override: null,
      eval_type: null,
      confidence: 0.7,
    };

    await emitPipelineEvent(admin, payload);

    expect(inserts).toHaveLength(1);
    const inserted = inserts[0].payload as Record<string, unknown>;
    expect(inserted).toHaveProperty("override", null);
    expect(inserted).toHaveProperty("eval_type", null);
    expect(inserted).toHaveProperty("case_id", null);
  });
});

describe("numericConfidence — legacy text → numeric(4,3) mapping", () => {
  it("maps high to 0.9", () => {
    expect(numericConfidence("high")).toBe(0.9);
  });
  it("maps medium to 0.7", () => {
    expect(numericConfidence("medium")).toBe(0.7);
  });
  it("maps low to 0.4", () => {
    expect(numericConfidence("low")).toBe(0.4);
  });
  it("maps none to null", () => {
    expect(numericConfidence("none")).toBeNull();
  });
  it("maps null/undefined to null", () => {
    expect(numericConfidence(null)).toBeNull();
    expect(numericConfidence(undefined)).toBeNull();
  });
});
