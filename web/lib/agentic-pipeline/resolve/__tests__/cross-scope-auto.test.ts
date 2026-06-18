// Phase 122 (XSCOPE-01 + D-08 + D-09) — RED test for the cross-scope AUTO tier.
//
// WAVE 0 — INTENTIONALLY RED. This file pins the behaviour Plan 02 (type/config
// layer) + Plan 03 (cross-scope engine post-pass) must satisfy BEFORE any engine
// code is written (VALIDATION.md: no engine code until its behaviour is a
// runnable, failing assertion).
//
// RED for compile-time reasons:
//   (1) Confidence has no "suggestie" member yet (Plan 02 widens the union).
//   (2) ResolveResult has no `cross_scope_misroute` field yet (Plan 02 adds it).
//   (3) EngineConfig has no `cross_scope` sub-config yet (Plan 02 adds it).
// Any of these surfaces a TS compile error → the test FAILS to even build → RED.
//
// Behaviour pinned here (the GREEN target for 02+03):
//   - A unique cross-brand ROOT (invoice_no matches that all roll up to ONE root
//     under a brand OUTSIDE the mailbox in-scope set) resolves AUTO at "high"
//     with a populated `cross_scope_misroute` (resolved_brand = winner brand,
//     mailbox_brand = args.brand_id). This is the D-08/D-09 misroute signal.
//   - A LONE WEAK kind that is corroborated by a 2nd independent kind on the SAME
//     customer (allow_corroboration_auto, D-03b) also reaches "high".
//
// TODAY's identifier-match.ts cross-brand block returns { result: null } (a SUGGEST
// drop) when the winner's brand_id is outside the in-scope set — so without the
// Plan 03 post-pass these would resolve to "none"/unresolved, never "high". The
// cross-scope post-pass is what flips that drop into a scored AUTO + misroute.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveCandidatesMock, candidateDetailsSpy } = vi.hoisted(() => ({
  resolveCandidatesMock: vi.fn(),
  candidateDetailsSpy: vi.fn(async () => ({ matches: [] })),
}));

// Inert admin so thread_inheritance finds no prior label (data:null everywhere).
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

// The single resolution substrate: resolve_candidates. The cross-scope post-pass
// reads the SAME materialized rows the in-scope back-search reads, but the in-scope
// brand filter misses (rows are under a different brand_id), so the post-pass fires.
vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupResolveCandidates: (...a: unknown[]) => resolveCandidatesMock(...a),
  lookupCandidateDetails: candidateDetailsSpy,
}));

import { resolveEntity, type ResolveArgs } from "../engine";

// Mailbox is brand SB; the cross-brand matches live under brand "SF" (outside the
// SB in-scope set), so the in-scope path misses and the cross-scope post-pass runs.
const args: ResolveArgs = {
  nxt_database: "nxt",
  brand_id: "SB",
  conversation_id: null,
  from_email: "klant@acme.example",
  subject: "Betreft factuur 17008641",
  body_text: "Wij betwisten factuur 17008641.",
  brand_scope: ["SB"],
};

// EngineConfig with a cross_scope sub-config. `cross_scope` does NOT exist on
// EngineConfig yet → Plan 02 adds it → RED until then.
const config = {
  scope: { environment_id: "BX", brand_scope: ["SB"] },
  precedence: ["thread_inheritance", "sender_match", "identifier_match"],
  auto_safe_kinds: [],
  llm_tiebreaker: false,
  cross_scope: {
    enabled: true,
    auto_resolve_kinds: ["invoice_no", "customer_no", "site_no"],
    allow_corroboration_auto: true,
  },
} as unknown as Parameters<typeof resolveEntity>[1];

function invoiceMatch() {
  return {
    identifier_kind: "invoice_no",
    identifier_value_norm: "17008641",
    party_id: "BX593290",
    party_name: "ACME Bouw BV",
    scope_key: "SF",
    // Cross-brand: brand_id "SF" is OUTSIDE the mailbox in-scope set (SB).
    brand_id: "SF",
    parent_party_id: "BX100000",
    root_party_id: "BX100000",
    is_unique_in_scope: true,
    precedence: "1",
    status: "active",
  };
}

describe("Phase 122 XSCOPE-01 / D-08 / D-09: cross-scope AUTO + misroute", () => {
  beforeEach(() => {
    resolveCandidatesMock.mockReset();
    resolveCandidatesMock.mockResolvedValue({ matches: [] });
  });

  it("unique cross-brand root → AUTO high + cross_scope_misroute (D-08/D-09)", async () => {
    // Two invoice rows rolling up to ONE distinct cross-brand root (BX100000),
    // all under brand SF (outside the SB mailbox scope).
    resolveCandidatesMock.mockResolvedValue({
      matches: [
        invoiceMatch(),
        { ...invoiceMatch(), party_id: "BX593291", identifier_value_norm: "17008642" },
      ],
    });

    const result = await resolveEntity(args, config);

    expect(result.method).toBe("identifier_match");
    expect(result.confidence).toBe("high");
    // env-stripped root.
    expect(result.customer_account_id).toBe("100000");
    // The misroute signal: resolved under SF, mailbox is SB.
    expect(result.cross_scope_misroute).not.toBeUndefined();
    expect(result.cross_scope_misroute).not.toBeNull();
    expect(result.cross_scope_misroute?.resolved_brand).toBe("SF");
    expect(result.cross_scope_misroute?.mailbox_brand).toBe("SB");
  });

  it("D-03b: lone WEAK kind corroborated by a 2nd independent kind on the same customer → high", async () => {
    // A weak kind (email_domain) AND an independent invoice_no, BOTH pointing at the
    // SAME cross-brand customer root → the allow_corroboration_auto path boosts to
    // high even though the weak kind alone would only suggest.
    resolveCandidatesMock.mockResolvedValue({
      matches: [
        {
          ...invoiceMatch(),
          identifier_kind: "email_domain",
          identifier_value_norm: "acme.example",
        },
        invoiceMatch(),
      ],
    });

    const result = await resolveEntity(args, config);

    expect(result.confidence).toBe("high");
    expect(result.customer_account_id).toBe("100000");
    expect(result.cross_scope_misroute).not.toBeNull();
  });
});
