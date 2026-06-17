// Phase 91 (D-04) — the rollup-divergence guard.
//
// The two high-precision paths resolve to DIFFERENT customers on the ~12.2% of
// BX customers that are parented:
//   - self_auth (we stamped the exact id)        → the DIRECT customer (party_id)
//   - number back-search (invoice/po/order/job/quote/prev-cust) → the ROOT /
//     top-level billing customer (root_party_id, D-04)
//
// On a parented fixture (party_id != root_party_id) the two paths MUST diverge.
// On a root customer (root_party_id null) they converge on the same id.
//
// Both paths share the cardinal fail-closed rule: AUTO only on a single distinct
// resolving party; >=2 distinct → SUGGEST (null), no LLM tiebreaker at the AUTO
// tier.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveCandidatesMock } = vi.hoisted(() => ({
  resolveCandidatesMock: vi.fn(),
}));

// Phase 123 — the only substrate is resolve_candidates. lookupResolveCandidates is
// BOTH the high-precision AUTO pre-pass read AND (post-Phase-123) the non-AUTO
// invoice back-search read. The legacy identifier_lookup / candidate_details mocks
// are retired. Tests that isolate the AUTO pre-pass queue the AUTO rows on the
// FIRST call and let the default `{matches:[]}` cover the non-AUTO follow-up call.
vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupResolveCandidates: (...a: unknown[]) => resolveCandidatesMock(...a),
}));

import { runIdentifierMatch } from "../steps/identifier-match";
import { runSelfAuthMatch } from "../steps/self-auth-match";
import type { ResolveArgs } from "../engine";
import type { LlmTiebreak } from "../steps/sender-match";

const config = {
  scope: { environment_id: "BX", brand_scope: ["SB"] },
  // number-search kinds eligible for the AUTO pre-pass + self-auth kinds.
  auto_safe_kinds: ["invoice_no", "order_no", "po_no", "job_no", "quote_no", "previous_customer_id", "customer_no", "site_no"],
};

// A self-auth email AND an invoice email targeting the SAME parented customer:
// direct party BX593290, root BX100000.
const selfAuthArgs: ResolveArgs & { brand_scope?: string[] } = {
  nxt_database: "nxt",
  brand_id: "SB",
  conversation_id: null,
  from_email: "klant@example.com",
  subject: "593290 - ACME Bouw BV",
  body_text: "Klantnummer: 593290.",
  brand_scope: ["SB"],
};

const invoiceArgs: ResolveArgs & { brand_scope?: string[] } = {
  nxt_database: "nxt",
  brand_id: "SB",
  conversation_id: null,
  from_email: "klant@example.com",
  subject: "Betreft factuur 17008641",
  body_text: "Wij betwisten factuur 17008641.",
  brand_scope: ["SB"],
};

// llmTiebreak must NEVER be called at the AUTO tier — fail the test if it is.
const failTiebreak: LlmTiebreak = vi.fn(async () => {
  throw new Error("llmTiebreak must not run at the AUTO tier");
});

function selfAuthMatch() {
  return {
    identifier_kind: "customer_no",
    identifier_value_norm: "593290",
    party_id: "BX593290",
    party_name: "ACME Bouw BV (vestiging)",
    scope_key: "SB",
    brand_id: "SB",
    parent_party_id: "BX100000",
    root_party_id: "BX100000",
    is_unique_in_scope: true,
    precedence: "1",
    status: "active",
  };
}

function invoiceMatch() {
  return {
    identifier_kind: "invoice_no",
    identifier_value_norm: "17008641",
    party_id: "BX593290",
    party_name: "ACME Bouw BV (vestiging)",
    scope_key: "SB",
    brand_id: "SB",
    parent_party_id: "BX100000",
    // D-04: number back-search rolls up to the ROOT billing customer.
    root_party_id: "BX100000",
    is_unique_in_scope: true,
    precedence: "1",
    status: "active",
  };
}

describe("Phase 91 D-04: self_auth → direct, number back-search → root (divergence)", () => {
  beforeEach(() => {
    resolveCandidatesMock.mockReset();
    // Default: empty. Tests queue AUTO-pre-pass rows via mockResolvedValueOnce;
    // the non-AUTO invoice follow-up call falls back to this empty default so the
    // AUTO-tier assertions stay isolated (Phase 123).
    resolveCandidatesMock.mockResolvedValue({ matches: [] });
  });

  it("parented customer: self_auth resolves DIRECT, number back-search resolves ROOT", async () => {
    // self_auth path
    resolveCandidatesMock.mockResolvedValueOnce({ matches: [selfAuthMatch()] });
    const selfAuth = await runSelfAuthMatch(selfAuthArgs, config);

    // number back-search path
    resolveCandidatesMock.mockResolvedValueOnce({ matches: [invoiceMatch()] });
    const number = await runIdentifierMatch(invoiceArgs, failTiebreak, config);

    expect(selfAuth).not.toBeNull();
    expect(number.result).not.toBeNull();

    // DIVERGENCE: self_auth → direct (593290), number back-search → root (100000).
    expect(selfAuth!.customer_account_id).toBe("593290");
    expect(number.result!.customer_account_id).toBe("100000");
    expect(selfAuth!.customer_account_id).not.toBe(
      number.result!.customer_account_id,
    );

    // Both carry the environment_id (D-02).
    expect(selfAuth!.environment_id).toBe("BX");
    expect(number.result!.environment_id).toBe("BX");
  });

  it("root customer (root_party_id null): number back-search uses the direct party (no rollup divergence)", async () => {
    const rootInvoice = { ...invoiceMatch(), party_id: "BX471214", parent_party_id: null, root_party_id: null };
    resolveCandidatesMock.mockResolvedValueOnce({ matches: [rootInvoice] });

    const number = await runIdentifierMatch(invoiceArgs, failTiebreak, config);
    expect(number.result).not.toBeNull();
    // No parent → root falls back to the direct party.
    expect(number.result!.customer_account_id).toBe("471214");
  });

  it("number back-search: >=2 distinct root customers → SUGGEST (null), no LLM tiebreaker", async () => {
    resolveCandidatesMock.mockResolvedValueOnce({
      matches: [
        invoiceMatch(),
        { ...invoiceMatch(), party_id: "BX222333", root_party_id: "BX900000", identifier_value_norm: "17008642" },
      ],
    });

    const number = await runIdentifierMatch(invoiceArgs, failTiebreak, config);
    expect(number.result).toBeNull();
    expect(failTiebreak).not.toHaveBeenCalled();
  });

  it("number back-search AUTO on a SINGLE root even when 2 invoice rows roll up to the same root", async () => {
    resolveCandidatesMock.mockResolvedValueOnce({
      matches: [
        invoiceMatch(),
        { ...invoiceMatch(), party_id: "BX593291", identifier_value_norm: "17008642", root_party_id: "BX100000" },
      ],
    });

    const number = await runIdentifierMatch(invoiceArgs, failTiebreak, config);
    expect(number.result).not.toBeNull();
    expect(number.result!.customer_account_id).toBe("100000"); // single distinct root
  });

  // CR-01 (Phase 91 review) — REAL gate semantics. The proc computes
  // is_unique_in_scope per DIRECT party, so two DISTINCT direct parties under the
  // SAME root within one kind+value partition both arrive is_unique_in_scope=FALSE
  // (parties_in_tier=2). The OLD engine pre-filtered on is_unique_in_scope and
  // dropped both rows → null (recall loss) even though the ROOT is unambiguous.
  // The number tier now decides on distinctRoots ONLY, so this single-root case
  // AUTO-resolves regardless of the per-party flag. This exercises the proc↔engine
  // contract at the granularity the engine actually decides on (not a mocked true).
  it("number back-search AUTO on a SINGLE root even when both rows carry is_unique_in_scope=false (per-party proc gate)", async () => {
    resolveCandidatesMock.mockResolvedValueOnce({
      matches: [
        { ...invoiceMatch(), party_id: "BX593290", is_unique_in_scope: false },
        { ...invoiceMatch(), party_id: "BX593291", is_unique_in_scope: false, root_party_id: "BX100000" },
      ],
    });

    const number = await runIdentifierMatch(invoiceArgs, failTiebreak, config);
    expect(number.result).not.toBeNull();
    expect(number.result!.customer_account_id).toBe("100000"); // single distinct root
    expect(failTiebreak).not.toHaveBeenCalled();
  });

  // CR-01 corollary — TWO distinct roots still fail closed even if the proc happens
  // to stamp is_unique_in_scope=true on each (the per-party flag is NOT what gates
  // precision at the root tier; distinctRoots does).
  it("number back-search: 2 distinct roots fail closed even with is_unique_in_scope=true on each", async () => {
    resolveCandidatesMock.mockResolvedValueOnce({
      matches: [
        { ...invoiceMatch(), party_id: "BX111111", root_party_id: "BX100000", is_unique_in_scope: true },
        { ...invoiceMatch(), party_id: "BX222222", root_party_id: "BX900000", is_unique_in_scope: true, identifier_value_norm: "17008642" },
      ],
    });

    const number = await runIdentifierMatch(invoiceArgs, failTiebreak, config);
    expect(number.result).toBeNull();
    expect(failTiebreak).not.toHaveBeenCalled();
  });

  // WR-03 (Phase 91 review) — STOPPED/inactive customers are excluded from AUTO.
  it("number back-search: a stopped customer is excluded → SUGGEST (null)", async () => {
    resolveCandidatesMock.mockResolvedValueOnce({
      matches: [{ ...invoiceMatch(), status: "stopped" }],
    });
    const number = await runIdentifierMatch(invoiceArgs, failTiebreak, config);
    expect(number.result).toBeNull();
    expect(failTiebreak).not.toHaveBeenCalled();
  });

  it("number back-search: only the ACTIVE candidate survives the status gate → AUTO to it", async () => {
    // The stopped row points at a DIFFERENT root; if it were not excluded, the two
    // roots would make this SUGGEST. The status gate drops it → single active root.
    resolveCandidatesMock.mockResolvedValueOnce({
      matches: [
        { ...invoiceMatch(), root_party_id: "BX100000", status: "active" },
        { ...invoiceMatch(), party_id: "BX222222", root_party_id: "BX900000", identifier_value_norm: "17008642", status: "stopped" },
      ],
    });
    const number = await runIdentifierMatch(invoiceArgs, failTiebreak, config);
    expect(number.result).not.toBeNull();
    expect(number.result!.customer_account_id).toBe("100000");
  });

  it("self_auth: a stopped customer is excluded → SUGGEST (null)", async () => {
    resolveCandidatesMock.mockResolvedValueOnce({
      matches: [{ ...selfAuthMatch(), status: "stopped" }],
    });
    const selfAuth = await runSelfAuthMatch(selfAuthArgs, config);
    expect(selfAuth).toBeNull();
  });
});
