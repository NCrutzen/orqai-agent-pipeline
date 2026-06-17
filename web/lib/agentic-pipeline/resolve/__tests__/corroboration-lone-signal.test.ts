// Phase 120 (D-07) — scoreCorroboration LONE-SIGNAL cap.
//
// RED until corroborate.ts exports scoreCorroboration. Proves: a single
// sender/domain signal (NOT in auto_safe_alone_kinds) caps to "medium" below
// AUTO (T-120-01); a single strong signal (invoice_no, auto_safe_alone) keeps
// its native "high". Empty signal array → canonical unresolved result.

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
  subject: "vraag",
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
    identifier_kind: "sender_domain",
    confidence: "high",
    method: "sender_match",
    precedence_index: 0,
    status: null,
    customer_name: "Acme BV",
    ...over,
  };
}

describe("Phase 120 D-07: scoreCorroboration lone-signal cap", () => {
  it("lone sender_domain (not auto_safe_alone) → medium (cap below AUTO)", () => {
    const r = scoreCorroboration(
      [sig({ identifier_kind: "sender_domain", confidence: "high" })],
      args,
      config,
      [],
    );
    expect(r.confidence).toBe("medium");
    expect(r.customer_account_id).toBe("C1");
    expect(r.reason).toMatch(/lone-signal/);
  });

  it("lone invoice_no (auto_safe_alone) → keeps native high", () => {
    const r = scoreCorroboration(
      [sig({ identifier_kind: "invoice_no", confidence: "high", method: "identifier_match" })],
      args,
      config,
      ["17008641"],
    );
    expect(r.confidence).toBe("high");
  });

  it("empty signal array → canonical unresolved (method unresolved, confidence none)", () => {
    const r = scoreCorroboration([], args, config, []);
    expect(r.method).toBe("unresolved");
    expect(r.customer_account_id).toBeNull();
    expect(r.confidence).toBe("none");
    expect(r.inputs.kind).toBe("unresolved");
  });
});
