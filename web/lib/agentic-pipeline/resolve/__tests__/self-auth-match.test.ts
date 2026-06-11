// Phase 91 (RESL-07) — the high-precision self_auth AUTO tier.
//
// THE CARDINAL CONSTRAINT (T-91-09): the AUTO tier must NEVER inject a confident
// wrong customer. AUTO is emitted ONLY when a SINGLE distinct in-scope party
// resolves AND its brand prefix-family matches the mailbox brand. Every
// ambiguity class — >=2 distinct parties, cross-brand collision
// (is_unique_in_scope=false), prefix-family mismatch, lookup error — fails
// CLOSED to SUGGEST (the step returns null; NO LLM tiebreaker at this tier, D-11).
//
// self_auth resolves to the DIRECT party_id (we stamped the exact id ourselves —
// no rollup, D-04), with the BX prefix stripped to the numeric customer_account_id
// (D-01) and config.scope.environment_id carried alongside on the result (D-02).

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mock handle for lookupResolveCandidates so each test can queue its own
// substrate response (or make it throw).
const { resolveCandidatesMock } = vi.hoisted(() => ({
  resolveCandidatesMock: vi.fn(),
}));

vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupResolveCandidates: (...args: unknown[]) => resolveCandidatesMock(...args),
}));

import { runSelfAuthMatch } from "../steps/self-auth-match";
import type { ResolveArgs } from "../engine";

// A debtor-shaped config slice the step reads (D-08: everything from config; no
// debtor literals in the step). auto_safe_kinds enables the three self-auth kinds.
const config = {
  version: "2026-06-10.v1",
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
};

// An email carrying a self-auth klantnummer in the subject (aanmaning shape).
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
    scope_key: "SB",
    brand_id: "SB",
    parent_party_id: null,
    root_party_id: null,
    is_unique_in_scope: true,
    precedence: "1",
    status: "active",
    ...over,
  };
}

describe("Phase 91 RESL-07: self_auth AUTO tier (fail-closed)", () => {
  beforeEach(() => {
    resolveCandidatesMock.mockReset();
  });

  it("single in-scope party with matching prefix-family → AUTO (numeric id + environment_id carried)", async () => {
    resolveCandidatesMock.mockResolvedValue({ matches: [match({})] });

    const result = await runSelfAuthMatch(args, config);

    expect(result).not.toBeNull();
    expect(result!.method).toBe("self_auth");
    expect(result!.confidence).toBe("high");
    // D-01: BX stripped to numeric.
    expect(result!.customer_account_id).toBe("593290");
    // D-02: environment_id carried alongside.
    expect(result!.environment_id).toBe("BX");
    expect(result!.inputs.kind).toBe("self_auth");
  });

  it(">=2 distinct parties → SUGGEST (null); no LLM tiebreaker", async () => {
    resolveCandidatesMock.mockResolvedValue({
      matches: [
        match({ party_id: "BX593290" }),
        match({ party_id: "BX111222", identifier_value_norm: "111222" }),
      ],
    });

    const result = await runSelfAuthMatch(args, config);
    expect(result).toBeNull();
  });

  it("cross-brand collision (is_unique_in_scope=false) → SUGGEST (null), never AUTO", async () => {
    resolveCandidatesMock.mockResolvedValue({
      matches: [match({ is_unique_in_scope: false })],
    });

    const result = await runSelfAuthMatch(args, config);
    expect(result).toBeNull();
  });

  it("prefix-family mismatch vs mailbox brand → SUGGEST (null)", async () => {
    // The single in-scope party belongs to a brand outside the mailbox scope.
    resolveCandidatesMock.mockResolvedValue({
      matches: [match({ brand_id: "ZZ", scope_key: "ZZ" })],
    });

    const result = await runSelfAuthMatch(args, config);
    expect(result).toBeNull();
  });

  it("lookupResolveCandidates throws → fall through to SUGGEST (null), no crash, no forced AUTO", async () => {
    resolveCandidatesMock.mockRejectedValue(new Error("substrate timeout"));

    const result = await runSelfAuthMatch(args, config);
    expect(result).toBeNull();
  });

  it("self_auth uses the DIRECT party_id (NOT root_party_id) for rollup (D-04)", async () => {
    // A parented customer: direct party BX593290, root BX100000. self_auth must
    // resolve to the DIRECT customer, NOT the root.
    resolveCandidatesMock.mockResolvedValue({
      matches: [match({ party_id: "BX593290", root_party_id: "BX100000" })],
    });

    const result = await runSelfAuthMatch(args, config);
    expect(result).not.toBeNull();
    expect(result!.customer_account_id).toBe("593290"); // direct, not 100000
  });

  it("empty auto_safe_kinds → zero self-auth candidates extracted, returns null, no crash (RESL-03 no-op preserved)", async () => {
    const result = await runSelfAuthMatch(args, { ...config, auto_safe_kinds: [] });
    expect(result).toBeNull();
    // Substrate is never consulted when nothing is in scope to extract.
    expect(resolveCandidatesMock).not.toHaveBeenCalled();
  });

  it("brand_id null (NXT disabled for mailbox) → null, no crash, no substrate call", async () => {
    const result = await runSelfAuthMatch(
      { ...args, brand_id: null as unknown as string },
      config,
    );
    expect(result).toBeNull();
    expect(resolveCandidatesMock).not.toHaveBeenCalled();
  });
});
