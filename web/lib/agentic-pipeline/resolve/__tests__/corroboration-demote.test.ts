// Phase 120 (D-06) — scoreCorroboration DEMOTE path + the agreement-first edge case (W3).
//
// RED until corroborate.ts exports scoreCorroboration. Proves: ≥2 distinct-kind
// signals DISAGREEING (different customers) return the lowest-precedence-index
// winner at confidence "medium" (capBelowAuto). T-120-02: demote can only LOWER
// confidence, never raise it. W3 (LOCKED): when one customer has ≥min_signals
// agreeing distinct kinds AND a separate customer carries an independent signal,
// the agreeing customer IS boosted (agreement evaluated BEFORE disagreement).

import { describe, it, expect } from "vitest";
import {
  scoreCorroboration,
  type CorroborationSignal,
} from "../corroborate";
import type { ResolveArgs } from "../engine";
import type { CorroborationConfig } from "../config";

const args: ResolveArgs = {
  nxt_database: "nxt",
  brand_id: "SB",
  conversation_id: null,
  from_email: "info@acme.example",
  subject: "factuur",
  body_text: "",
};

const config: CorroborationConfig = {
  min_signals: 2,
  boost: "high",
  auto_safe_alone_kinds: ["invoice_no", "customer_no"],
};

function sig(over: Partial<CorroborationSignal>): CorroborationSignal {
  return {
    customer_account_id: "C1",
    identifier_kind: "invoice_no",
    confidence: "high",
    method: "identifier_match",
    precedence_index: 0,
    status: null,
    customer_name: "Acme BV",
    ...over,
  };
}

describe("Phase 120 D-06: scoreCorroboration demote on disagreement", () => {
  it("2 distinct-kind signals on DIFFERENT customers → precedence winner at medium", () => {
    const signals = [
      // winner: lowest precedence_index.
      sig({ customer_account_id: "C1", identifier_kind: "invoice_no", precedence_index: 0, confidence: "high" }),
      sig({ customer_account_id: "C2", identifier_kind: "customer_no", precedence_index: 1, confidence: "high" }),
    ];
    const r = scoreCorroboration(signals, args, config, ["A", "B"]);
    expect(r.customer_account_id).toBe("C1"); // precedence still selects winner (D-02)
    expect(r.confidence).toBe("medium"); // capBelowAuto(high) → medium
    expect(r.reason).toMatch(/disagreement/);
  });

  it("T-120-02: demote NEVER raises confidence above the winner's native tier", () => {
    const signals = [
      sig({ customer_account_id: "C1", identifier_kind: "invoice_no", precedence_index: 0, confidence: "medium" }),
      sig({ customer_account_id: "C2", identifier_kind: "customer_no", precedence_index: 1, confidence: "high" }),
    ];
    const r = scoreCorroboration(signals, args, config, ["A", "B"]);
    // winner is C1 (precedence 0), native medium; capBelowAuto(medium)=medium.
    expect(r.confidence).toBe("medium");
  });

  it("W3 (LOCKED): agreement-first — agreeing customer boosts even when another carries an independent signal", () => {
    const signals = [
      // Customer A: 2 agreeing distinct kinds.
      sig({ customer_account_id: "A", identifier_kind: "invoice_no", precedence_index: 0 }),
      sig({ customer_account_id: "A", identifier_kind: "customer_no", precedence_index: 1 }),
      // Customer B: 1 independent signal.
      sig({ customer_account_id: "B", identifier_kind: "order_no", precedence_index: 2 }),
    ];
    const r = scoreCorroboration(signals, args, config, ["A1", "A2", "B1"]);
    expect(r.customer_account_id).toBe("A"); // agreement wins
    expect(r.confidence).toBe("high"); // boosted (agreement evaluated before disagreement)
  });
});
