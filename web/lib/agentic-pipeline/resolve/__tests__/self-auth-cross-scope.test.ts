// Phase 122 (XSCOPE-01 / CR-01) — cross-scope at the self_auth DIRECT drop site.
//
// Mirrors self-auth-match.test.ts but exercises the cross_scope post-pass wired at
// the prefix-family gate. The CARDINAL assertion (CR-01): self_auth dedupes on the
// DIRECT party_id, NOT root_party_id — so two distinct cross-brand parties under the
// SAME root must STILL degrade to "suggestie", proving the number-tier ROOT rollup
// is NOT used here. A single forwarded cross-brand DIRECT party AUTOs at "high" with
// a cross_scope_misroute annotation.
//
// The post-pass is gated on config.cross_scope?.enabled; without it the step drops
// to null exactly as today (covered by self-auth-match.test.ts).

import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveCandidatesMock } = vi.hoisted(() => ({
  resolveCandidatesMock: vi.fn(),
}));

vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupResolveCandidates: (...args: unknown[]) => resolveCandidatesMock(...args),
}));

import { runSelfAuthMatch } from "../steps/self-auth-match";
import type { ResolveArgs } from "../engine";

// Mailbox brand SB; the resolved self-auth parties live under brand SF (outside the
// SB in-scope set) → the in-scope prefix-family gate misses → cross-scope post-pass.
const config = {
  version: "2026-06-18.v1",
  source: { kind: "nxt", resolver_tool_id: "nxt.resolve_candidates" },
  scope: {
    environment_id: "BX",
    brand_mode: "tiebreaker" as const,
    brand_scope: ["SB"],
  },
  precedence: ["self_auth", "identifier_match", "sender_match", "thread_inheritance"],
  auto_safe_kinds: ["customer_no", "site_no"],
  blocklist_ref: { swarm_type: "debtor-email", include_shared: true },
  llm_tiebreaker: true,
  cross_scope: {
    enabled: true,
    auto_resolve_kinds: ["customer_no", "site_no"],
    allow_corroboration_auto: true,
  },
};

const args: ResolveArgs & { brand_scope?: string[] } = {
  nxt_database: "nxt",
  brand_id: "SB",
  conversation_id: null,
  from_email: "klant@example.com",
  subject: "593290 - ACME Bouw BV",
  body_text: "Betreft uw aanmaning. Klantnummer: 593290.",
  brand_scope: ["SB"],
};

function match(over: Record<string, unknown>) {
  return {
    identifier_kind: "customer_no",
    identifier_value_norm: "593290",
    party_id: "BX593290",
    party_name: "ACME Bouw BV",
    scope_key: "SF",
    brand_id: "SF", // cross-brand: outside the SB mailbox scope
    parent_party_id: null,
    root_party_id: null,
    is_unique_in_scope: true,
    precedence: "1",
    status: "active",
    ...over,
  };
}

describe("Phase 122 XSCOPE-01 / CR-01: self_auth cross-scope (DIRECT granularity)", () => {
  beforeEach(() => {
    resolveCandidatesMock.mockReset();
  });

  it("single forwarded cross-brand DIRECT party → AUTO high + misroute", async () => {
    resolveCandidatesMock.mockResolvedValue({ matches: [match({})] });

    const result = await runSelfAuthMatch(args, config);

    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("high");
    // DIRECT party, env-stripped.
    expect(result!.customer_account_id).toBe("593290");
    expect(result!.cross_scope_misroute).not.toBeUndefined();
    expect(result!.cross_scope_misroute?.resolved_brand).toBe("SF");
    expect(result!.cross_scope_misroute?.mailbox_brand).toBe("SB");
  });

  it("CR-01: two distinct cross-brand parties under the SAME root → suggestie, never high", async () => {
    // Both parties roll up to the SAME root BX100000. The DIRECT granularity must
    // treat them as 2 distinct parties → suggestie (a root rollup would wrongly
    // collapse them to one and AUTO).
    resolveCandidatesMock.mockResolvedValue({
      matches: [
        match({ party_id: "BX593290", root_party_id: "BX100000" }),
        match({
          party_id: "BX593291",
          identifier_value_norm: "593291",
          root_party_id: "BX100000",
        }),
      ],
    });

    const result = await runSelfAuthMatch(args, config);

    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("suggestie");
    expect(result!.confidence).not.toBe("high");
    expect(result!.inputs.kind).toBe("identifier_match");
    if (result!.inputs.kind === "identifier_match") {
      // Two distinct DIRECT parties surfaced (proves DIRECT, not ROOT, dedupe).
      expect(result!.inputs.candidates.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("opt-out: no cross_scope config → cross-brand party drops to null (byte-identical)", async () => {
    const { cross_scope: _omit, ...configNoCrossScope } = config;
    resolveCandidatesMock.mockResolvedValue({ matches: [match({})] });

    const result = await runSelfAuthMatch(args, configNoCrossScope);
    expect(result).toBeNull();
  });
});
