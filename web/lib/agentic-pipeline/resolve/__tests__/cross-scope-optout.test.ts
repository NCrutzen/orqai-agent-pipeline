// Phase 122 (XSCOPE-02) — RED/no-engine-diff guard for cross-scope OPT-OUT.
//
// WAVE 0. Guards Pitfall 1 (no-engine-diff): when a swarm has NO `cross_scope`
// config (or sets `cross_scope.enabled: false`), the engine MUST behave EXACTLY
// as it does today on a cross-brand-only match — drop to SUGGEST/unresolved, with
// NO cross-brand AUTO and NO `cross_scope_misroute` field. The opt-in post-pass
// (Plan 03) must be fully gated behind the config, so non-opted swarms see zero
// behaviour change.
//
// RED dimension: this file references `result.cross_scope_misroute` (a field Plan
// 02 adds to ResolveResult). It asserts that field is ABSENT here — which is the
// contract Plan 03 must honour for the disabled path. The "suggestie" value is NOT
// asserted on this path (the drop stays at today's "none").

import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveCandidatesMock, candidateDetailsSpy } = vi.hoisted(() => ({
  resolveCandidatesMock: vi.fn(),
  candidateDetailsSpy: vi.fn(async () => ({ matches: [] })),
}));

vi.mock("@/lib/supabase/admin", () => {
  const empty = { data: null, error: null };
  const makeChain = (): unknown =>
    new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then")
          return (f?: (v: unknown) => unknown) => Promise.resolve(empty).then(f);
        if (prop === "single" || prop === "maybeSingle")
          return () => Promise.resolve(empty);
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

vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupResolveCandidates: (...a: unknown[]) => resolveCandidatesMock(...a),
  lookupCandidateDetails: candidateDetailsSpy,
}));

import { resolveEntity, type ResolveArgs } from "../engine";

const args: ResolveArgs = {
  nxt_database: "nxt",
  brand_id: "SB",
  conversation_id: null,
  from_email: "klant@acme.example",
  subject: "Betreft factuur 17008641",
  body_text: "Wij betwisten factuur 17008641.",
  brand_scope: ["SB"],
};

// Same cross-brand mock as the AUTO test — a unique cross-brand root under SF.
function invoiceMatch() {
  return {
    identifier_kind: "invoice_no",
    identifier_value_norm: "17008641",
    party_id: "BX593290",
    party_name: "ACME Bouw BV",
    scope_key: "SF",
    brand_id: "SF", // cross-brand: outside the SB mailbox scope
    parent_party_id: "BX100000",
    root_party_id: "BX100000",
    is_unique_in_scope: true,
    precedence: "1",
    status: "active",
  };
}

// NO cross_scope key at all — today's config shape exactly.
const configNoCrossScope = {
  scope: { environment_id: "BX", brand_scope: ["SB"] },
  precedence: ["thread_inheritance", "sender_match", "identifier_match"],
  auto_safe_kinds: [],
  llm_tiebreaker: false,
} as unknown as Parameters<typeof resolveEntity>[1];

describe("Phase 122 XSCOPE-02: cross-scope opt-out is byte-identical to today's drop", () => {
  beforeEach(() => {
    resolveCandidatesMock.mockReset();
    resolveCandidatesMock.mockResolvedValue({ matches: [] });
  });

  it("no cross_scope config → cross-brand match drops (no AUTO, no misroute field)", async () => {
    resolveCandidatesMock.mockResolvedValue({ matches: [invoiceMatch()] });

    const result = await resolveEntity(args, configNoCrossScope);

    // Today's behaviour: cross-brand winner is out-of-scope → SUGGEST drop →
    // unresolved at "none", no cross-brand AUTO.
    expect(result.method).toBe("unresolved");
    expect(result.confidence).toBe("none");
    expect(result.customer_account_id).toBeNull();
    // NO misroute signal on the opt-out path.
    expect(result.cross_scope_misroute).toBeUndefined();
  });

  it("cross_scope.enabled:false → same byte-identical drop (no AUTO, no misroute)", async () => {
    const configDisabled = {
      ...(configNoCrossScope as Record<string, unknown>),
      cross_scope: {
        enabled: false,
        auto_resolve_kinds: ["invoice_no", "customer_no", "site_no"],
        allow_corroboration_auto: true,
      },
    } as unknown as Parameters<typeof resolveEntity>[1];

    resolveCandidatesMock.mockResolvedValue({ matches: [invoiceMatch()] });

    const result = await resolveEntity(args, configDisabled);

    expect(result.method).toBe("unresolved");
    expect(result.confidence).toBe("none");
    expect(result.customer_account_id).toBeNull();
    expect(result.cross_scope_misroute).toBeUndefined();
  });
});
