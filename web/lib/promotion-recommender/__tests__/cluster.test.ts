import { describe, it, expect } from "vitest";
import {
  clusterOverrideEvents,
  CLUSTER_MIN_EVIDENCE,
  type PipelineEventOverrideRow,
} from "../cluster";

function mkRow(
  i: number,
  overrides: Partial<PipelineEventOverrideRow> = {},
): PipelineEventOverrideRow {
  return {
    id: overrides.id ?? `evt-${i}`,
    swarm_type: overrides.swarm_type ?? "debtor-email",
    email_id: overrides.email_id ?? `email-${i}`,
    stage: overrides.stage ?? 1,
    eval_type: overrides.eval_type ?? "category-correction",
    override: overrides.override ?? {},
    decision: overrides.decision ?? "noise",
    decision_details: overrides.decision_details ?? null,
    cost_cents: overrides.cost_cents ?? 20,
    created_at: overrides.created_at ?? new Date().toISOString(),
  };
}

describe("clusterOverrideEvents", () => {
  it("CLUSTER_MIN_EVIDENCE is 3", () => {
    expect(CLUSTER_MIN_EVIDENCE).toBe(3);
  });

  it("Filter rule: 5 category-correction rows with shared subject → 1 cluster of 5", () => {
    const sharedSubject = "Out of office until next monday";
    const rows = Array.from({ length: 5 }, (_, i) =>
      mkRow(i, {
        eval_type: "category-correction",
        override: { subject: sharedSubject, sender_email: `u${i}@x.example` },
      }),
    );
    const drafts = clusterOverrideEvents(rows);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].kind).toBe("regex_rule");
    expect(drafts[0].matched_event_count_30d).toBe(5);
    expect(drafts[0].stage).toBe("1-noise");
  });

  it("returns 0 clusters when group is below CLUSTER_MIN_EVIDENCE", () => {
    const rows = Array.from({ length: 2 }, (_, i) =>
      mkRow(i, {
        eval_type: "entity-correction",
        override: {
          sender_email: `c${i}@vendor.example`,
          new_customer_account_id: "C-1",
        },
      }),
    );
    const drafts = clusterOverrideEvents(rows);
    expect(drafts).toHaveLength(0);
  });

  it("Known sender: 4 entity-correction rows from same domain → same customer → 1 cluster", () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      mkRow(i, {
        eval_type: "entity-correction",
        stage: 2,
        override: {
          sender_email: `person${i}@vendor.example`,
          new_customer_account_id: "C-9001",
        },
      }),
    );
    const drafts = clusterOverrideEvents(rows);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].kind).toBe("sender_mapping");
    expect(drafts[0].stage).toBe("2-customer");
    expect(drafts[0].structured_payload).toMatchObject({
      kind: "sender_mapping",
      sender_pattern: "vendor.example",
      customer_account_id: "C-9001",
    });
  });

  it("intent-correction + handler-quality → AI tuning + Draft style with savings null upstream", () => {
    const intentRows = Array.from({ length: 4 }, (_, i) =>
      mkRow(100 + i, {
        eval_type: "intent-correction",
        stage: 3,
        override: {
          intent_key: "credit_request",
          sender_email: `a${i}@vendor.example`,
        },
      }),
    );
    const handlerRows = Array.from({ length: 3 }, (_, i) =>
      mkRow(200 + i, {
        eval_type: "handler-quality",
        stage: 4,
        override: {
          verdict_category: "tone_mismatch",
          sender_email: `b${i}@customer.example`,
        },
      }),
    );
    const drafts = clusterOverrideEvents([...intentRows, ...handlerRows], {
      known_intent_keys: new Set(["credit_request"]),
    });
    const aitune = drafts.find((d) => d.kind === "prompt_tune_stage_3");
    const drafttune = drafts.find((d) => d.kind === "prompt_tune_stage_4");
    expect(aitune).toBeDefined();
    expect(drafttune).toBeDefined();
    expect(aitune!.stage).toBe("3-coordinator");
    expect(drafttune!.stage).toBe("4-handler");
  });

  it("signature_key is deterministic regardless of input row order", () => {
    const make = (ids: number[]) =>
      ids.map((i) =>
        mkRow(i, {
          eval_type: "entity-correction",
          override: {
            sender_email: `p${i}@brand.example`,
            new_customer_account_id: "C-42",
          },
        }),
      );
    const a = clusterOverrideEvents(make([1, 2, 3, 4]));
    const b = clusterOverrideEvents(make([4, 3, 2, 1]));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].signature_key).toBe(b[0].signature_key);
  });

  it("new_intent: unknown intent_key + ≥3 evidence → new_intent kind", () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      mkRow(300 + i, {
        eval_type: "intent-correction",
        stage: 3,
        override: {
          intent_key: "freight_dispute",
          sender_email: `f${i}@vendor.example`,
        },
      }),
    );
    const drafts = clusterOverrideEvents(rows, {
      known_intent_keys: new Set(["credit_request", "general_inquiry"]),
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].kind).toBe("new_intent");
  });
});
