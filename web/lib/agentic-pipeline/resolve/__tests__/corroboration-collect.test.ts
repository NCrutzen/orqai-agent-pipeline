// Phase 120 (D-06) → Phase 123 — engine collect-then-decide branch.
//
// Proves the config.corroboration PRESENT path runs ALL precedence steps and
// does NOT short-circuit on the first hit. Fixture: thread_inheritance produces
// a hit on customer C1 AND sender_match produces a hit on customer C2. A
// first-hit engine would return C1 at "high" immediately; the corroboration
// engine instead COLLECTS both, sees a 2-distinct-kind disagreement (D-06), and
// returns the precedence winner (C1) at "medium" (capBelowAuto) — observable
// proof that step 2 (sender_match) WAS visited. Also: zero hits → unresolved.
//
// Phase 123: the C2 sender signal is now driven through the generic
// lookupResolveCandidates mock (an email_domain row), not the retired
// per-kind contact_lookup wrapper.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { priorLabelRef, senderMatchesRef, candidateDetailsSpy } = vi.hoisted(
  () => ({
    priorLabelRef: { row: null as Record<string, unknown> | null },
    // Phase 123 — the sender signal now comes from resolve_candidates
    // (email_domain/email_address rows), not the legacy contact_lookup wrapper.
    senderMatchesRef: { matches: [] as Array<Record<string, unknown>> },
    // Phase 123 (CR-01) — spy on the LLM tiebreaker's only external call. The
    // PRESENT-corroboration collect path must NEVER invoke it (D-03 determinism).
    candidateDetailsSpy: vi.fn(async () => ({ matches: [] })),
  }),
);

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

// NXT mock (Phase 123): the only substrate is resolve_candidates. The sender step
// passes the email_address/email_domain seeds; the invoice step passes invoice
// numbers. Branch on the identifiers so the sender signal is driven by
// senderMatchesRef while the invoice path stays inert.
vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupResolveCandidates: vi.fn(
    async (input: { identifiers: string[] }) => {
      const isInvoice = input.identifiers.some((i) => i.startsWith("INV-"));
      if (isInvoice) return { matches: [] };
      return { matches: senderMatchesRef.matches };
    },
  ),
  // The real llmTiebreak (runLlmTiebreak) pre-fetches via lookupCandidateDetails.
  // On the collect path it must never be reached (CR-01).
  lookupCandidateDetails: candidateDetailsSpy,
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
    candidateDetailsSpy.mockClear();
  });

  it("visits >1 step: thread C1 + sender C2 → collected, disagreement winner C1 at medium", async () => {
    // Step 1 hit: thread_inheritance → C1 (would short-circuit at high today).
    priorLabelRef.row = {
      id: "lbl-1",
      customer_account_id: "C1",
      debtor_id: null,
      debtor_name: "Customer One",
    };
    // Step 2 hit: sender_match → C2 (only reached if NO short-circuit). Phase 123:
    // the signal is a resolve_candidates email_domain row resolving to C2.
    senderMatchesRef.matches = [
      {
        identifier_kind: "email_domain",
        identifier_value_norm: "acme.example",
        party_id: "C2",
        party_name: "Customer Two",
        brand_id: "SB",
        root_party_id: null,
        is_unique_in_scope: true,
        status: "active",
      },
    ];

    const r = await engine.resolveEntity(args, corrConfig);

    // Proof the collect path saw BOTH hits: a first-hit engine returns C1@high;
    // the corroboration engine demotes the precedence winner C1 to medium.
    expect(r.customer_account_id).toBe("C1");
    expect(r.confidence).toBe("medium");
    expect(r.reason).toMatch(/disagreement/);
  });

  it("CR-01: ambiguous sender in the collect loop does NOT fire the LLM tiebreaker (D-03 determinism)", async () => {
    // thread_inheritance → C1 (one deterministic signal).
    priorLabelRef.row = {
      id: "lbl-1",
      customer_account_id: "C1",
      debtor_id: null,
      debtor_name: "Customer One",
    };
    // sender_match → TWO distinct in-scope parties (C2, C3). In runSenderMatch
    // this is the ≥2-distinct → escalate-to-tiebreaker branch. On the no-corro
    // path the real llmTiebreak would call lookupCandidateDetails; on the collect
    // path the engine injects a NO-OP tiebreak, so that call must never happen.
    senderMatchesRef.matches = [
      {
        identifier_kind: "email_domain",
        identifier_value_norm: "acme.example",
        party_id: "C2",
        party_name: "Customer Two",
        brand_id: "SB",
        root_party_id: null,
        is_unique_in_scope: true,
        status: "active",
      },
      {
        identifier_kind: "email_domain",
        identifier_value_norm: "acme.example",
        party_id: "C3",
        party_name: "Customer Three",
        brand_id: "SB",
        root_party_id: null,
        is_unique_in_scope: true,
        status: "active",
      },
    ];

    const r = await engine.resolveEntity(args, corrConfig);

    // Core CR-01 assertion: the billable, non-deterministic tiebreaker's external
    // fetch was never invoked on the collect path.
    expect(candidateDetailsSpy).not.toHaveBeenCalled();
    // Fail-closed: the ambiguous sender produced no signal, so neither C2 nor C3
    // becomes a confident pick.
    expect(r.customer_account_id).not.toBe("C2");
    expect(r.customer_account_id).not.toBe("C3");
  });

  it("zero step hits with corroboration present → canonical unresolved", async () => {
    const r = await engine.resolveEntity(args, corrConfig);
    expect(r.method).toBe("unresolved");
    expect(r.customer_account_id).toBeNull();
    expect(r.confidence).toBe("none");
    expect(r.inputs.kind).toBe("unresolved");
  });
});
