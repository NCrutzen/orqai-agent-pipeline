// Phase 122-05 (XSCOPE-01 / XSCOPE-03 / D-08 / D-09) — GAP-CLOSURE RED test.
//
// Pins the confident-wrong defect surfaced by the Plan-04 airtight A/B against the
// live zapier.dbo.resolver_index: the cross-scope fallback AUTO-resolves to the
// winner's ROOT party (the parent company) instead of the matching LEAF party_id
// (the actually-invoiced debtor). Every reachable bucket-C confident-wrong (#98 →
// 524011, #12 → 499559, #38 → 522781) is the ROOT of the correct leaf party; #96 was
// correct only because its party has a null root.
//
// Secondary defect: the cross_scope_misroute annotation keys on winner.brand_id, but
// resolver_index has NO brand column — the scope/brand lives in scope_key. On this
// substrate brand_id is null so the annotation never fires; it must fall back to
// scope_key vs the mailbox scope.

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

// Mailbox is brand SB; the cross-brand matches carry scope_key "SF" (outside the SB
// in-scope set) and a NULL brand_id (resolver_index has no brand column), so the
// in-scope path misses and the cross-scope post-pass runs.
const args: ResolveArgs = {
  nxt_database: "nxt",
  brand_id: "SB",
  conversation_id: null,
  from_email: "klant@destudio.example",
  subject: "Betreft factuur 33050903",
  body_text: "Wij betwisten factuur 33050903.",
  brand_scope: ["SB"],
};

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

// #98 substrate shape (zapier.dbo.resolver_index, queried 2026-06-18): a single
// invoice_no leaf BX524156 ("De Studio") whose ROOT is BX524011. brand_id NULL.
function studioLeafMatch() {
  return {
    identifier_kind: "invoice_no",
    identifier_value_norm: "33050903",
    party_id: "BX524156", // leaf — the actually-invoiced debtor
    party_name: "De Studio",
    scope_key: "SF", // cross-brand: outside the SB mailbox scope
    brand_id: null, // resolver_index has NO brand column
    parent_party_id: "BX524011",
    root_party_id: "BX524011", // ROOT (parent company) — distinctness bar ONLY
    is_unique_in_scope: true,
    precedence: "1",
    status: "active",
  };
}

describe("Phase 122-05 XSCOPE-03: cross-scope returns the LEAF party, misroute via scope_key", () => {
  beforeEach(() => {
    resolveCandidatesMock.mockReset();
    resolveCandidatesMock.mockResolvedValue({ matches: [] });
  });

  it("(a) AUTO resolves to the LEAF party_id (524156), NOT the root (524011)", async () => {
    resolveCandidatesMock.mockResolvedValue({ matches: [studioLeafMatch()] });

    const result = await resolveEntity(args, config);

    expect(result.method).toBe("identifier_match");
    expect(result.confidence).toBe("high");
    // BUG TODAY: returns "524011" (env-stripped root). Must be the LEAF.
    expect(result.customer_account_id).toBe("524156");
    expect(result.customer_name).toBe("De Studio");
    // The resolved candidate surfaced for the audit panel is the LEAF too.
    expect(result.inputs.kind).toBe("identifier_match");
    if (result.inputs.kind === "identifier_match") {
      expect(result.inputs.candidates.map((c) => c.id)).toContain("524156");
      expect(result.inputs.candidates.map((c) => c.id)).not.toContain("524011");
    }
  });

  it("(b) misroute fires from scope_key (brand_id null): resolved SF, mailbox SB", async () => {
    resolveCandidatesMock.mockResolvedValue({ matches: [studioLeafMatch()] });

    const result = await resolveEntity(args, config);

    // BUG TODAY: brand_id null → misrouteAnnotation never fires.
    expect(result.cross_scope_misroute).not.toBeUndefined();
    expect(result.cross_scope_misroute).not.toBeNull();
    expect(result.cross_scope_misroute?.resolved_brand).toBe("SF");
    expect(result.cross_scope_misroute?.mailbox_brand).toBe("SB");
  });

  it("(c) degrade shortlist surfaces LEAF party_ids, not roots (>=2 distinct roots)", async () => {
    // #12 (leaf BX527773 / root BX499559) and #38 (leaf BX530964 / root BX522781):
    // two DISTINCT roots → suggestie degrade; the shortlist must list the LEAVES.
    resolveCandidatesMock.mockResolvedValue({
      matches: [
        {
          ...studioLeafMatch(),
          identifier_value_norm: "33050837",
          party_id: "BX527773",
          party_name: "Fedasil Koksijde",
          parent_party_id: "BX499559",
          root_party_id: "BX499559",
        },
        {
          ...studioLeafMatch(),
          identifier_value_norm: "33051109",
          party_id: "BX530964",
          party_name: "Jumbo Supermarkten BV",
          parent_party_id: "BX522781",
          root_party_id: "BX522781",
        },
      ],
    });

    const result = await resolveEntity(args, config);

    expect(result.confidence).toBe("suggestie");
    expect(result.confidence).not.toBe("high");
    expect(result.inputs.kind).toBe("identifier_match");
    if (result.inputs.kind === "identifier_match") {
      const ids = result.inputs.candidates.map((c) => c.id);
      // LEAVES present, ROOTS absent.
      expect(ids).toContain("527773");
      expect(ids).toContain("530964");
      expect(ids).not.toContain("499559");
      expect(ids).not.toContain("522781");
    }
  });
});
