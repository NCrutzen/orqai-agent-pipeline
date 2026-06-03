// Phase 04.1 — Plan 02 (P4.1-D-01 / P4.1-D-02 / P4.1-D-03).
//
// Unit tests for buildResolverTrace — pure side-channel trace builder.
// One test per ResolveMethod variant (Phase 82.9 discriminated union).

import { describe, it, expect } from "vitest";
import {
  buildResolverTrace,
  type ResolverStep,
} from "@/lib/automations/debtor-email/resolver-trace";
import type { ResolveResult } from "@/lib/automations/debtor-email/resolve-debtor";

function findStep(steps: ResolverStep[], idx: 1 | 2 | 3 | 4): ResolverStep {
  const s = steps.find((x) => x.idx === idx);
  if (!s) throw new Error(`step idx ${idx} not found`);
  return s;
}

describe("buildResolverTrace — Phase 04.1 P4.1-D-01", () => {
  it("thread_inheritance → step 1 picked (winner=1), steps 2/3/4 not_run", () => {
    const result: ResolveResult = {
      method: "thread_inheritance",
      customer_account_id: "cust-99",
      customer_name: "Klant Holding BV",
      confidence: "high",
      inputs: {
        kind: "thread_inheritance",
        prior_email_label_id: "label-abc",
        conversation_id: "conv-xyz",
      },
    };

    const trace = buildResolverTrace(result);

    expect(trace.steps).toHaveLength(4);
    expect(trace.winner).toBe(1);

    const s1 = findStep(trace.steps, 1);
    expect(s1.status).toBe("picked");
    expect(s1.step).toBe("thread");
    expect(s1.confidence).toBe(0.9);
    expect(s1.detail).toMatchObject({ prior_email_label_id: "label-abc" });

    expect(findStep(trace.steps, 2).status).toBe("not_run");
    expect(findStep(trace.steps, 3).status).toBe("not_run");
    expect(findStep(trace.steps, 4).status).toBe("not_run");
  });

  it("sender_match → step 1 miss, step 2 matched (winner=2), steps 3/4 not_run", () => {
    const result: ResolveResult = {
      method: "sender_match",
      customer_account_id: "cust-123",
      customer_name: "Klant BV",
      confidence: "high",
      candidates_considered: 1,
      inputs: {
        kind: "sender_match",
        sender_email: "klant@example.com",
        candidates: [
          {
            id: "cust-123",
            name: "Klant BV",
            contact_person: "Jan",
            recent_invoices: [],
          },
        ],
      },
    };

    const trace = buildResolverTrace(result);

    expect(trace.winner).toBe(2);
    expect(findStep(trace.steps, 1).status).toBe("miss");
    const s2 = findStep(trace.steps, 2);
    expect(s2.status).toBe("matched");
    expect(s2.step).toBe("sender_map");
    expect(s2.confidence).toBe(0.9);
    expect(s2.detail).toMatchObject({ sender_email: "klant@example.com" });
    expect(findStep(trace.steps, 3).status).toBe("not_run");
    expect(findStep(trace.steps, 4).status).toBe("not_run");
  });

  it("identifier_match → step 3 matched (winner=3), step 4 not_run", () => {
    const result: ResolveResult = {
      method: "identifier_match",
      customer_account_id: "cust-777",
      customer_name: "ID Klant",
      confidence: "high",
      candidates_considered: 1,
      inputs: {
        kind: "identifier_match",
        matched_identifiers: ["INV-1111"],
        candidates: [
          {
            id: "cust-777",
            name: "ID Klant",
            contact_person: null,
            recent_invoices: ["INV-1111"],
          },
        ],
      },
    };

    const trace = buildResolverTrace(result);

    expect(trace.winner).toBe(3);
    expect(findStep(trace.steps, 1).status).toBe("miss");
    expect(findStep(trace.steps, 2).status).toBe("miss");
    const s3 = findStep(trace.steps, 3);
    expect(s3.status).toBe("matched");
    expect(s3.step).toBe("identifier");
    expect(s3.detail).toMatchObject({ matched_identifiers: ["INV-1111"] });
    expect(findStep(trace.steps, 4).status).toBe("not_run");
  });

  it("llm_tiebreaker with matched_identifiers → step 3 conflict, step 4 picked (winner=4)", () => {
    const result: ResolveResult = {
      method: "llm_tiebreaker",
      customer_account_id: "cust-A",
      customer_name: "Klant A",
      confidence: "medium",
      candidates_considered: 2,
      reason: "subject mentions Klant A",
      inputs: {
        kind: "llm_tiebreaker",
        sender_email: "klant@example.com",
        matched_identifiers: ["INV-2222", "INV-3333"],
        candidates: [
          { id: "cust-A", name: "Klant A", contact_person: null, recent_invoices: [] },
          { id: "cust-B", name: "Klant B", contact_person: null, recent_invoices: [] },
        ],
        llm_reason: "subject mentions Klant A",
        picked_account_id: "cust-A",
      },
    };

    const trace = buildResolverTrace(result);

    expect(trace.winner).toBe(4);
    expect(findStep(trace.steps, 1).status).toBe("miss");
    expect(findStep(trace.steps, 2).status).toBe("miss");
    expect(findStep(trace.steps, 3).status).toBe("conflict");
    const s4 = findStep(trace.steps, 4);
    expect(s4.status).toBe("picked");
    expect(s4.step).toBe("llm_tiebreaker");
    expect(s4.confidence).toBe(0.6);
    expect(s4.detail).toMatchObject({ llm_reason: "subject mentions Klant A" });
  });

  it("llm_tiebreaker with empty matched_identifiers (sender-driven) → step 2 conflict, step 4 picked", () => {
    const result: ResolveResult = {
      method: "llm_tiebreaker",
      customer_account_id: "cust-A",
      customer_name: "Klant A",
      confidence: "medium",
      candidates_considered: 2,
      inputs: {
        kind: "llm_tiebreaker",
        sender_email: "klant@example.com",
        matched_identifiers: [],
        candidates: [
          { id: "cust-A", name: "Klant A", contact_person: null, recent_invoices: [] },
          { id: "cust-B", name: "Klant B", contact_person: null, recent_invoices: [] },
        ],
        llm_reason: "subject mentions Klant A",
        picked_account_id: "cust-A",
      },
    };

    const trace = buildResolverTrace(result);

    expect(trace.winner).toBe(4);
    expect(findStep(trace.steps, 1).status).toBe("miss");
    expect(findStep(trace.steps, 2).status).toBe("conflict");
    expect(findStep(trace.steps, 3).status).toBe("not_run");
    expect(findStep(trace.steps, 4).status).toBe("picked");
  });

  it("unresolved with sender_email set → all 4 steps miss, winner=null", () => {
    const result: ResolveResult = {
      method: "unresolved",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
      inputs: {
        kind: "unresolved",
        sender_email: "ghost@example.com",
        matched_identifiers: [],
      },
    };

    const trace = buildResolverTrace(result);

    expect(trace.winner).toBeNull();
    expect(trace.steps.every((s) => s.status === "miss")).toBe(true);
  });

  it("unresolved with no sender_email and empty identifiers → all 4 steps not_run, winner=null", () => {
    const result: ResolveResult = {
      method: "unresolved",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
      inputs: {
        kind: "unresolved",
        sender_email: null,
        matched_identifiers: [],
      },
    };

    const trace = buildResolverTrace(result);

    expect(trace.winner).toBeNull();
    expect(trace.steps.every((s) => s.status === "not_run")).toBe(true);
  });

  it("is pure — calling twice with same input yields deep-equal output", () => {
    const result: ResolveResult = {
      method: "sender_match",
      customer_account_id: "cust-123",
      customer_name: "Klant BV",
      confidence: "high",
      candidates_considered: 1,
      inputs: {
        kind: "sender_match",
        sender_email: "klant@example.com",
        candidates: [
          {
            id: "cust-123",
            name: "Klant BV",
            contact_person: null,
            recent_invoices: [],
          },
        ],
      },
    };

    const a = buildResolverTrace(result);
    const b = buildResolverTrace(result);
    expect(a).toEqual(b);
  });
});
