// Phase 114-04 Task 1 (TDD) — sales resolve-customer adapter behaviour cases.
//
// The sales adapter (web/lib/automations/sales-email/resolve-customer.ts) exposes
// resolveEntity(args, config) satisfying Stage2ResolverModule. It wires the NEW
// sales lookups (offerte/order/Sites via nxtRequest) + reuses the debtor
// factuur/sender lookups (D-11), runs them in config.precedence order, and
// short-circuits on the first hit — falling through to `unresolved` (STAGE2-02).
//
// These four cases pin the plan's <behavior> block:
//   1. offerte hit          → candidate with mapped customer_account_id
//   2. no resolvable id      → unresolved / customer_account_id:null (fall-through)
//   3. auto_safe_kinds:[]    → no self-auth candidate synthesized, no crash
//   4. crafted/garbage id    → never passed to nxtRequest (V5 input validation)
//
// nxtRequest + the debtor lookups are mocked so this suite never touches NXT.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ──────────────────────────────────────────────────────────
// nxtRequest is the D-10 transport for offerte/order/Sites. We spy on it to:
//  (a) drive resolution outcomes, and
//  (b) assert garbage identifiers never reach it (V5 input validation).
const { nxtRequestMock, lookupSenderMock, lookupIdentifierMock } = vi.hoisted(
  () => ({
    nxtRequestMock: vi.fn(),
    lookupSenderMock: vi.fn(),
    lookupIdentifierMock: vi.fn(),
  }),
);

vi.mock("@/lib/automations/nxt-zapier/nxt-client", () => ({
  nxtRequest: nxtRequestMock,
}));

vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupSenderToAccount: lookupSenderMock,
  lookupIdentifierToAccount: lookupIdentifierMock,
}));

import { resolveEntity } from "../resolve-customer";
import { extractOrderCandidates } from "../lookups/order";
import { extractPostcodeCandidates } from "../lookups/sites";

// Sales config (mirrors the migration seed). Precedence is data-driven from the
// Plan 03 mining report: highest-frequency / highest-confidence first.
const salesConfig = {
  version: "2026-06-04.v1",
  source: { kind: "nxt", resolver_tool_id: "nxt.rest_proxy" },
  scope: { environment_id: "BX", brand_mode: "tiebreaker" as const },
  precedence: [
    "sender_match",
    "offerte_match",
    "postcode_site_match",
    "factuur_match",
    "order_match",
  ],
  auto_safe_kinds: [],
  blocklist_ref: { swarm_type: "sales-email", include_shared: false },
  llm_tiebreaker: false,
};

const baseArgs = {
  nxt_database: "nxt",
  brand_id: "SB",
  conversation_id: null,
  from_email: "inkoop@klant-bv.nl",
  subject: "",
  body_text: "",
};

beforeEach(() => {
  nxtRequestMock.mockReset();
  lookupSenderMock.mockReset();
  lookupIdentifierMock.mockReset();
  // Default: no sender/identifier match unless a test opts in.
  lookupSenderMock.mockResolvedValue({ matches: [] });
  lookupIdentifierMock.mockResolvedValue({ matches: [] });
});

describe("Phase 114-04: sales resolve-customer adapter", () => {
  it("offerte hit → candidate with the mapped customer_account_id", async () => {
    // nxtRequest returns a customer for the offerte lookup (SB-format number).
    nxtRequestMock.mockResolvedValue({
      status: 200,
      ok: true,
      data: { customerId: 991234, customerName: "Klant BV" },
    });

    const result = await resolveEntity(
      {
        ...baseArgs,
        // sender lookup returns nothing → falls to offerte
        from_email: "unknown@nowhere.example",
        subject: "Vraag over Offerte SB014967",
        body_text: "Graag een update op offerte SB014967.",
      },
      salesConfig,
    );

    expect(result.customer_account_id).toBe("991234");
    expect(result.method).toBe("identifier_match");
    expect(result.inputs.kind).toBe(result.method);
    // The offerte number must have been the search term passed to NXT.
    expect(nxtRequestMock).toHaveBeenCalled();
    const calledWith = JSON.stringify(nxtRequestMock.mock.calls);
    expect(calledWith).toContain("SB014967");
  });

  it("no resolvable identifier + no sender match → unresolved, customer_account_id:null (STAGE2-02 fall-through)", async () => {
    const result = await resolveEntity(
      {
        ...baseArgs,
        from_email: "prospect@brand-new.example",
        subject: "Algemene vraag",
        body_text: "Kunnen jullie ons iets sturen over jullie diensten?",
      },
      salesConfig,
    );

    expect(result.method).toBe("unresolved");
    expect(result.customer_account_id).toBeNull();
    expect(result.confidence).toBe("none");
    expect(result.inputs.kind).toBe("unresolved");
    // No identifier in the body → nxtRequest never invoked.
    expect(nxtRequestMock).not.toHaveBeenCalled();
  });

  it("auto_safe_kinds:[] → no self-auth candidate synthesized, no crash (STAGE2-02 no-op)", async () => {
    const config = { ...salesConfig, auto_safe_kinds: [] };

    // An email that WOULD carry a self-auth identifier in a debtor swarm.
    const result = await resolveEntity(
      {
        ...baseArgs,
        from_email: "prospect@brand-new.example",
        subject: "Klantnummer 67890 / Werkbon 4242",
        body_text: "Betreft klantnummer 67890.",
      },
      config,
    );

    // MUST NOT synthesize a self-auth candidate.
    expect(result.method).not.toBe("self_auth");
    // Valid ResolveResult whose discriminated inputs.kind mirrors method.
    expect(result).toHaveProperty("method");
    expect(result).toHaveProperty("customer_account_id");
    expect(result.inputs.kind).toBe(result.method);
  });

  it("crafted/garbage identifier failing the regex format check → never passed to nxtRequest (V5 input validation)", async () => {
    await resolveEntity(
      {
        ...baseArgs,
        from_email: "prospect@brand-new.example",
        // 'SB' followed by a SQL-injection-ish blob that does NOT match the
        // SB\d{5,6} format. Must be rejected by the format gate, never sent.
        subject: "Offerte SB'; DROP TABLE customers;--",
        body_text: "zie ook order ABC and postcode XX99XX (all malformed)",
      },
      salesConfig,
    );

    // The format-validation gate must run BEFORE any nxtRequest call.
    expect(nxtRequestMock).not.toHaveBeenCalled();
  });
});

describe("Phase 114-07 Task 1: order regex word-boundary (WR-03)", () => {
  it("does NOT match a mid-word 'order' (herorder)", () => {
    expect(extractOrderCandidates("herorder 12345", "")).toEqual([]);
  });

  it("still matches a genuine leading 'order'", () => {
    expect(extractOrderCandidates("order 12345", "")).toEqual(["12345"]);
  });

  it("still matches 'ordernummer: 67890'", () => {
    expect(extractOrderCandidates("ordernummer: 67890", "")).toEqual(["67890"]);
  });

  it("still matches 'werkorder 1634448'", () => {
    expect(extractOrderCandidates("werkorder 1634448", "")).toEqual([
      "1634448",
    ]);
  });
});

describe("Phase 114-07 Task 1: postcode address-context gate (WR-02)", () => {
  it("rejects a bare SKU/reference token with no address context", () => {
    // '1234AB' shaped like a postcode but sitting alone (a part/reference) →
    // not an address → not a candidate.
    expect(extractPostcodeCandidates("Onderdeel 1234AB op voorraad?", "")).toEqual(
      [],
    );
  });

  it("still extracts a genuine postcode in an address line", () => {
    expect(
      extractPostcodeCandidates("Bezoekadres: Dorpsstraat 1, 1234 AB Smeba", ""),
    ).toEqual(["1234AB"]);
  });

  it("resolves a postcode match at confidence:medium (not high) — D-06 interim", async () => {
    nxtRequestMock.mockResolvedValue({
      status: 200,
      ok: true,
      data: { customerId: 778899, customerName: "Site BV" },
    });

    const result = await resolveEntity(
      {
        ...baseArgs,
        from_email: "unknown@nowhere.example",
        subject: "Onderhoud op locatie",
        // Address-context postcode so it survives the WR-02 gate.
        body_text: "Adres: Dorpsstraat 1, 1234 AB Smeba — graag inplannen.",
      },
      // sender/offerte miss → postcode hits first.
      { ...salesConfig, precedence: ["postcode_site_match"] },
    );

    expect(result.customer_account_id).toBe("778899");
    expect(result.method).toBe("identifier_match");
    expect(result.confidence).toBe("medium");
    expect(result.confidence).not.toBe("high");
  });
});
