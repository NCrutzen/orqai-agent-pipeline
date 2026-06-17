// Phase 120 (D-06) — engine collect-then-decide branch.
//
// Proves the config.corroboration PRESENT path runs ALL precedence steps and
// does NOT short-circuit on the first hit. Fixture: thread_inheritance produces
// a hit on customer C1 AND sender_match produces a hit on customer C2. A
// first-hit engine would return C1 at "high" immediately; the corroboration
// engine instead COLLECTS both, sees a 2-distinct-kind disagreement (D-06), and
// returns the precedence winner (C1) at "medium" (capBelowAuto) — observable
// proof that step 2 (sender_match) WAS visited. Also: zero hits → unresolved.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { priorLabelRef, senderMatchesRef } = vi.hoisted(() => ({
  priorLabelRef: { row: null as Record<string, unknown> | null },
  senderMatchesRef: { matches: [] as Array<Record<string, unknown>> },
}));

// Admin mock: thread_inheritance reads debtor.email_labels via .maybeSingle().
vi.mock("@/lib/supabase/admin", () => {
  const makeChain = (): unknown =>
    new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then")
          return (f?: (v: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null }).then(f);
        if (prop === "single" || prop === "maybeSingle")
          return () => Promise.resolve({ data: priorLabelRef.row, error: null });
        return () => chain;
      },
      apply() {
        return chain;
      },
    });
  const chain = makeChain();
  const admin: Record<string, unknown> = {
    from: () => chain,
    schema: () => admin,
    rpc: () => chain,
  };
  return { admin, createAdminClient: () => admin };
});

// NXT mock: sender_match calls lookupSenderToAccount; candidate-details slim.
vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupSenderToAccount: vi.fn(async () => ({ matches: senderMatchesRef.matches })),
  lookupIdentifierToAccount: vi.fn(async () => ({ matches: [] })),
  lookupCandidateDetails: vi.fn(async () => ({ matches: [] })),
  lookupResolveCandidates: vi.fn(async () => ({ matches: [] })),
}));

import * as engine from "../engine";

const baseConfig = {
  version: "2026-06-01.v1",
  source: { kind: "nxt", resolver_tool_id: "nxt.resolve_candidates" },
  scope: { environment_id: "BX", brand_mode: "tiebreaker", brand_scope: ["SB"] },
  precedence: ["thread_inheritance", "sender_match", "identifier_match"],
  auto_safe_kinds: [],
  llm_tiebreaker: false,
};

const corrConfig = {
  ...baseConfig,
  corroboration: {
    min_signals: 2,
    boost: "high" as const,
    auto_safe_alone_kinds: ["invoice_no", "customer_no"],
  },
};

const args = {
  nxt_database: "nxt",
  brand_id: "SB",
  conversation_id: "conv-COLLECT-1",
  from_email: "boekhouding@acme.example",
  subject: "factuur",
  body_text: "",
};

describe("Phase 120 D-06: engine collect-then-decide (no first-hit short-circuit)", () => {
  beforeEach(() => {
    priorLabelRef.row = null;
    senderMatchesRef.matches = [];
  });

  it("visits >1 step: thread C1 + sender C2 → collected, disagreement winner C1 at medium", async () => {
    // Step 1 hit: thread_inheritance → C1 (would short-circuit at high today).
    priorLabelRef.row = {
      id: "lbl-1",
      customer_account_id: "C1",
      debtor_id: null,
      debtor_name: "Customer One",
    };
    // Step 2 hit: sender_match → C2 (only reached if NO short-circuit).
    senderMatchesRef.matches = [
      { top_level_customer_id: "C2", top_level_customer_name: "Customer Two" },
    ];

    const r = await engine.resolveEntity(args, corrConfig);

    // Proof the collect path saw BOTH hits: a first-hit engine returns C1@high;
    // the corroboration engine demotes the precedence winner C1 to medium.
    expect(r.customer_account_id).toBe("C1");
    expect(r.confidence).toBe("medium");
    expect(r.reason).toMatch(/disagreement/);
  });

  it("zero step hits with corroboration present → canonical unresolved", async () => {
    const r = await engine.resolveEntity(args, corrConfig);
    expect(r.method).toBe("unresolved");
    expect(r.customer_account_id).toBeNull();
    expect(r.confidence).toBe("none");
    expect(r.inputs.kind).toBe("unresolved");
  });
});
