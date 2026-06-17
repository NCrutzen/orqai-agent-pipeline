// Phase 120 (D-04 / D-05) — scoreCorroboration BOOST path.
//
// RED until corroborate.ts exports scoreCorroboration. Proves: ≥min_signals
// DISTINCT identifier_kind signals agreeing on ONE customer boost to "high"
// (D-04), with NO LLM call. Two signals of the SAME kind count as ONE signal
// (the D-05 independence axis) → NOT boosted. A boost-eligible group whose
// winner row carries a non-auto-eligible status is NOT promoted (T-120-05).

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
  from_email: "boekhouding@acme.example",
  subject: "factuur 17008641",
  body_text: "klantnummer 4242",
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
    confidence: "medium",
    method: "identifier_match",
    precedence_index: 0,
    status: null,
    customer_name: "Acme BV",
    ...over,
  };
}

describe("Phase 120 D-04: scoreCorroboration boost", () => {
  it("2 DISTINCT-kind signals on the SAME customer → high (boost), no LLM", () => {
    const signals = [
      sig({ identifier_kind: "invoice_no", precedence_index: 0 }),
      sig({ identifier_kind: "customer_no", precedence_index: 1 }),
    ];
    const r = scoreCorroboration(signals, args, config, ["17008641", "4242"]);
    expect(r.confidence).toBe("high");
    expect(r.customer_account_id).toBe("C1");
    expect(r.method).toBe("identifier_match");
    expect(r.inputs.kind).toBe("identifier_match");
  });

  it("2 SAME-kind signals on the same customer → counts as ONE signal → NOT boosted", () => {
    const signals = [
      sig({ identifier_kind: "invoice_no", precedence_index: 0 }),
      sig({ identifier_kind: "invoice_no", precedence_index: 1 }),
    ];
    // lone (single distinct kind) but invoice_no is auto_safe_alone → keeps high.
    const r = scoreCorroboration(signals, args, config, ["17008641"]);
    expect(r.reason).not.toMatch(/corroborated/);
  });

  it("boost honours config.boost = medium", () => {
    const signals = [
      sig({ identifier_kind: "invoice_no", precedence_index: 0 }),
      sig({ identifier_kind: "customer_no", precedence_index: 1 }),
    ];
    const r = scoreCorroboration(signals, args, { ...config, boost: "medium" }, [
      "17008641",
      "4242",
    ]);
    expect(r.confidence).toBe("medium");
  });

  it("T-120-05: boost-eligible group on a STOPPED status → NOT promoted to high", () => {
    const signals = [
      sig({ identifier_kind: "invoice_no", precedence_index: 0, status: "gestopt" }),
      sig({ identifier_kind: "customer_no", precedence_index: 1, status: "gestopt" }),
    ];
    const r = scoreCorroboration(signals, args, config, ["17008641", "4242"]);
    expect(r.confidence).not.toBe("high");
  });
});
