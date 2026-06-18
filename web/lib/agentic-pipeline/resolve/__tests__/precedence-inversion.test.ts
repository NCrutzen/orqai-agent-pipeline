// Phase 91 (D-10 / RESL-14) — the precedence inversion + un-stranding guard.
//
// Under the inverted precedence ["self_auth","identifier_match","sender_match",
// "thread_inheritance"] the high-precision tier OUTRANKS thread inheritance:
//   - an email WITH a self-auth signal resolves via self_auth (inversion takes
//     effect — it is NOT shadowed by an inherited label).
//   - an email with NO high-precision signal but a prior conversation label STILL
//     resolves via thread_inheritance (it is NOT stranded — the high-precision
//     steps fail CLOSED to null and the engine falls through).

import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveCandidatesMock, priorLabelRef } = vi.hoisted(() => ({
  resolveCandidatesMock: vi.fn(),
  priorLabelRef: { row: null as Record<string, unknown> | null },
}));

// Admin mock: thread_inheritance reads debtor.email_labels via
// .maybeSingle(); return priorLabelRef.row so each test controls whether a prior
// label exists.
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

// Phase 123 — the only substrate is resolve_candidates; the legacy
// contact_lookup / identifier_lookup / candidate_details mocks are retired.
vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupResolveCandidates: (...a: unknown[]) => resolveCandidatesMock(...a),
}));

import * as engine from "../engine";

// The D-10 INVERTED precedence (live-row data — RESL-14).
const invertedConfig = {
  version: "2026-06-10.v1",
  source: { kind: "nxt", resolver_tool_id: "nxt.resolve_candidates" },
  scope: { environment_id: "BX", brand_mode: "tiebreaker" as const, brand_scope: ["SB"] },
  precedence: ["self_auth", "identifier_match", "sender_match", "thread_inheritance"],
  auto_safe_kinds: ["customer_no", "site_no"],
  blocklist_ref: { swarm_type: "debtor-email", include_shared: true },
  llm_tiebreaker: true,
};

function selfAuthMatch() {
  return {
    identifier_kind: "customer_no",
    identifier_value_norm: "593290",
    party_id: "BX593290",
    party_name: "ACME Bouw BV",
    scope_key: "SB",
    brand_id: "SB",
    parent_party_id: null,
    root_party_id: null,
    is_unique_in_scope: true,
    precedence: "1",
    status: "active",
  };
}

describe("Phase 91 D-10: precedence inversion (self_auth outranks; inheritance not stranded)", () => {
  beforeEach(() => {
    resolveCandidatesMock.mockReset();
    priorLabelRef.row = null;
  });

  it("self-auth-bearing email on a thread WITH a prior label → resolves via self_auth (inversion effective)", async () => {
    // A prior label exists on the conversation — under the OLD order this would
    // win via thread_inheritance. Under the inversion, self_auth outranks it.
    priorLabelRef.row = {
      id: "prior-1",
      customer_account_id: "999999",
      debtor_id: null,
      debtor_name: "Stale Inherited Customer",
    };
    resolveCandidatesMock.mockResolvedValue({ matches: [selfAuthMatch()] });

    const result = await engine.resolveEntity(
      {
        nxt_database: "nxt",
        brand_id: "SB",
        conversation_id: "conv-INHERIT-1",
        from_email: "klant@example.com",
        subject: "593290 - ACME Bouw BV",
        body_text: "Klantnummer: 593290.",
        brand_scope: ["SB"],
      },
      invertedConfig,
    );

    expect(result.method).toBe("self_auth");
    expect(result.customer_account_id).toBe("593290"); // not the inherited 999999
  });

  it("no high-precision signal but a prior label → STILL resolves via thread_inheritance (not stranded)", async () => {
    priorLabelRef.row = {
      id: "prior-2",
      customer_account_id: "471214",
      debtor_id: null,
      debtor_name: "ACME Holding",
    };
    // No self-auth id and no invoice → high-precision steps return null.
    resolveCandidatesMock.mockResolvedValue({ matches: [] });

    const result = await engine.resolveEntity(
      {
        nxt_database: "nxt",
        brand_id: "SB",
        conversation_id: "conv-INHERIT-2",
        from_email: "klant@example.com",
        subject: "Re: uw vraag",
        body_text: "Dank voor uw reactie.",
        brand_scope: ["SB"],
      },
      invertedConfig,
    );

    expect(result.method).toBe("thread_inheritance");
    expect(result.customer_account_id).toBe("471214");
  });
});
