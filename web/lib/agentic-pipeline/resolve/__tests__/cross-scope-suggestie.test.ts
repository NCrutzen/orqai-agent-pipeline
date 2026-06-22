// Phase 122 (XSCOPE-01 + D-04 + D-05 + D-08) — RED test for the cross-scope
// SUGGESTIE (never-high) tier.
//
// WAVE 0 — INTENTIONALLY RED. Pins the cardinal anti-confident-wrong guarantee
// (threat T-122-01): a cross-scope match that is ambiguous (≥2 distinct roots),
// weak-and-lone, or self-disagreeing MUST land at confidence "suggestie" and
// NEVER "high". The cross-scope post-pass (Plan 03) plus the widened Confidence
// union + cross_scope config (Plan 02) make these pass.
//
// RED because Confidence has no "suggestie" member yet (Plan 02 widens it) and
// EngineConfig has no `cross_scope` field yet (Plan 02 adds it). Until then the
// engine cannot emit "suggestie", so each assertion fails (the engine returns
// "none"/unresolved on the cross-brand drop today).

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
  body_text: "Wij betwisten factuur 17008641 en 17008642.",
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
    is_unique_in_scope: false,
    precedence: "1",
    status: "active",
  };
}

describe("Phase 122 XSCOPE-01 / D-04 / D-05 / D-08: cross-scope suggestie (never high)", () => {
  beforeEach(() => {
    resolveCandidatesMock.mockReset();
    resolveCandidatesMock.mockResolvedValue({ matches: [] });
  });

  it("(a) matches spanning >=2 distinct cross-brand roots → suggestie, never high (D-08)", async () => {
    resolveCandidatesMock.mockResolvedValue({
      matches: [
        invoiceMatch(),
        {
          ...invoiceMatch(),
          party_id: "BX777888",
          root_party_id: "BX900000",
          identifier_value_norm: "17008642",
        },
      ],
    });

    const result = await resolveEntity(args, config);

    expect(result.confidence).toBe("suggestie");
    expect(result.confidence).not.toBe("high");
    // The ambiguous candidate set is surfaced for the operator on inputs.
    expect(result.inputs.kind).toBe("identifier_match");
    if (result.inputs.kind === "identifier_match") {
      expect(result.inputs.candidates.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("(b) LONE weak kind (email_domain, not in auto_resolve_kinds, uncorroborated) cross-brand → suggestie not high (D-04)", async () => {
    // A single email_domain hit (weak, not in auto_resolve_kinds) on a cross-brand
    // customer with NO corroborating 2nd kind → cannot AUTO; caps to suggestie.
    resolveCandidatesMock.mockResolvedValue({
      matches: [
        {
          ...invoiceMatch(),
          identifier_kind: "email_domain",
          identifier_value_norm: "acme.example",
          is_unique_in_scope: true,
        },
      ],
    });

    const result = await resolveEntity(args, config);

    expect(result.confidence).toBe("suggestie");
    expect(result.confidence).not.toBe("high");
  });

  it("(c) two signals pointing at DIFFERENT customers → suggestie/unresolved, never high (D-05)", async () => {
    // An invoice_no AND an email_domain that resolve to DIFFERENT cross-brand
    // customers (disagreement) → must NOT reach high; lands at suggestie.
    resolveCandidatesMock.mockResolvedValue({
      matches: [
        invoiceMatch(),
        {
          ...invoiceMatch(),
          identifier_kind: "email_domain",
          identifier_value_norm: "acme.example",
          party_id: "BX777888",
          root_party_id: "BX900000",
        },
      ],
    });

    const result = await resolveEntity(args, config);

    expect(result.confidence).not.toBe("high");
    expect(["suggestie", "none"]).toContain(result.confidence);
  });
});
