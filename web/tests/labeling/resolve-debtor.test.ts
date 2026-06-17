// Phase 56-00 → Phase 123 — resolveDebtor behaviour test, rewired to the single
// generic nxt.resolve_candidates substrate.
//
// Phase 123 (RESL-UNIFY-01/02): the debtor sender + invoice paths resolve over
// resolve_candidates (email_domain/email_address + invoice_no). The legacy
// per-kind contact_lookup / identifier_lookup / candidate_details wrappers are no
// longer called by production, so this test drives ONLY the lookupResolveCandidates
// mock (no legacy wrapper mock remains).
//
// debtorP0Config carries `corroboration` (Phase 120-03), so the engine COLLECTS a
// signal from every precedence step and scores deterministically via
// scoreCorroboration (NO LLM call on the agreeing/lone paths). These cases pin:
//   - thread_inheritance lone hit (kind "thread" not auto-safe-alone) → medium
//   - sender_match lone hit (email_domain not auto-safe-alone) → medium
//   - invoice_no lone hit (IS auto-safe-alone) → high
//   - sender + invoice AGREE on one customer (2 distinct kinds) → high (boost)
//   - sender + invoice DISAGREE → precedence winner at medium (demote)
//   - zero hits → unresolved
//
// The discriminated `inputs.kind === method` contract is asserted on each path.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock nxt-zap-client BEFORE importing resolve-debtor -----------------
// Only the generic resolve_candidates read remains. The mock branches on the
// `identifiers` it is called with so the sender step (address/domain) and the
// invoice step (invoice numbers) can resolve independently in one test.
const lookupResolveCandidatesMock = vi.fn();
vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupResolveCandidates: (...args: unknown[]) =>
    lookupResolveCandidatesMock(...args),
}));

// extractInvoiceCandidates returns deterministic candidates for a fixture body.
vi.mock("@/lib/automations/debtor-email/extract-invoices", () => ({
  extractInvoiceCandidates: (_subject: string, body: string) => {
    if (body.includes("INV-1111")) return { candidates: ["INV-1111"] };
    if (body.includes("INV-2222")) return { candidates: ["INV-2222", "INV-3333"] };
    return { candidates: [] };
  },
}));

// ---- Supabase admin mock (thread_inheritance reads debtor.email_labels) ---
type PriorRow = {
  id: string;
  customer_account_id: string | null;
  debtor_id: string | null;
  debtor_name: string | null;
} | null;

let priorRowFixture: PriorRow = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            or: () => ({
              in: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: priorRowFixture,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

// ---- Import after mocks --------------------------------------------------
import { resolveDebtor } from "@/lib/automations/debtor-email/resolve-debtor";
import type { ResolveCandidateMatch } from "@/lib/automations/debtor-email/nxt-zap-client";

// debtorP0Config.scope.environment_id is "BX"; composite ids strip to the numeric.
const BASE_ARGS = {
  nxt_database: "smeba_prod",
  brand_id: "BX",
  subject: "Test subject",
  body_text: "",
};

// A resolve_candidates row factory (only the fields the steps read).
function row(over: Partial<ResolveCandidateMatch>): ResolveCandidateMatch {
  return {
    identifier_kind: "email_domain",
    identifier_value_norm: "example.com",
    party_id: "BX000000",
    party_name: "Klant BV",
    scope_key: "BX",
    brand_id: "BX",
    parent_party_id: null,
    root_party_id: null,
    is_unique_in_scope: true,
    precedence: "1",
    status: "active",
    ...over,
  } as ResolveCandidateMatch;
}

/**
 * Drive the generic mock by inspecting the identifiers arg: invoice numbers route
 * to the invoice rows, everything else (address/domain) routes to the sender rows.
 */
function driveMock(opts: {
  sender?: ResolveCandidateMatch[];
  invoice?: ResolveCandidateMatch[];
}) {
  lookupResolveCandidatesMock.mockImplementation(
    async (input: { identifiers: string[] }) => {
      const isInvoice = input.identifiers.some((i) => i.startsWith("INV-"));
      if (isInvoice) return { matches: opts.invoice ?? [] };
      return { matches: opts.sender ?? [] };
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  priorRowFixture = null;
  lookupResolveCandidatesMock.mockResolvedValue({ matches: [] });
});

describe("resolveDebtor — Phase 123 resolve_candidates corroboration paths", () => {
  it("thread_inheritance lone hit → medium (kind not auto-safe-alone), discriminated inputs", async () => {
    priorRowFixture = {
      id: "label-abc-uuid",
      customer_account_id: "cust-99",
      debtor_id: null,
      debtor_name: "Klant Holding BV",
    };

    const result = await resolveDebtor({
      ...BASE_ARGS,
      conversation_id: "conv-xyz",
      from_email: "anyone@example.com",
    });

    // Corroboration: lone "thread" signal → capped below AUTO.
    expect(result.customer_account_id).toBe("cust-99");
    expect(result.confidence).toBe("medium");
  });

  it("sender_match lone hit (email_domain) → medium; resolves the domain back-search", async () => {
    priorRowFixture = null;
    driveMock({
      sender: [
        row({
          identifier_kind: "email_domain",
          identifier_value_norm: "klant.nl",
          party_id: "BX593290",
          party_name: "Klant BV",
        }),
      ],
    });

    const result = await resolveDebtor({
      ...BASE_ARGS,
      conversation_id: null,
      from_email: "jan@klant.nl",
    });

    expect(result.method).toBe("identifier_match"); // corroboration wraps method
    expect(result.customer_account_id).toBe("593290");
    expect(result.confidence).toBe("medium"); // email_domain not auto-safe-alone
  });

  it("sender_match email_address OUTRANKS email_domain (address-first precedence)", async () => {
    priorRowFixture = null;
    driveMock({
      sender: [
        row({
          identifier_kind: "email_address",
          identifier_value_norm: "jan@klant.nl",
          party_id: "BX111111",
          party_name: "Exacte Klant BV",
        }),
        row({
          identifier_kind: "email_domain",
          identifier_value_norm: "klant.nl",
          party_id: "BX999999",
          party_name: "Domein Klant BV",
        }),
      ],
    });

    const result = await resolveDebtor({
      ...BASE_ARGS,
      conversation_id: null,
      from_email: "jan@klant.nl",
    });

    // Address wins over the (different) domain party.
    expect(result.customer_account_id).toBe("111111");
  });

  it("invoice_no lone hit → high (auto-safe-alone kind), matched_identifiers carried", async () => {
    priorRowFixture = null;
    driveMock({
      invoice: [
        row({
          identifier_kind: "invoice_no",
          identifier_value_norm: "INV-1111",
          party_id: "BX777777",
          party_name: "Identifier Klant",
        }),
      ],
    });

    const result = await resolveDebtor({
      ...BASE_ARGS,
      conversation_id: null,
      from_email: "unknown@example.com",
      body_text: "Factuurnummer INV-1111 graag betalen",
    });

    expect(result.method).toBe("identifier_match");
    expect(result.customer_account_id).toBe("777777");
    expect(result.confidence).toBe("high"); // invoice_no IS auto-safe-alone
    expect(result.inputs.kind).toBe("identifier_match");
    if (result.inputs.kind !== "identifier_match") throw new Error("narrow");
    expect(result.inputs.matched_identifiers).toEqual(["INV-1111"]);
  });

  it("sender + invoice AGREE on one customer (2 distinct kinds) → high (boost)", async () => {
    priorRowFixture = null;
    driveMock({
      sender: [
        row({
          identifier_kind: "email_domain",
          identifier_value_norm: "klant.nl",
          party_id: "BX555555",
          party_name: "Agree Klant",
        }),
      ],
      invoice: [
        row({
          identifier_kind: "invoice_no",
          identifier_value_norm: "INV-1111",
          party_id: "BX555555",
          party_name: "Agree Klant",
        }),
      ],
    });

    const result = await resolveDebtor({
      ...BASE_ARGS,
      conversation_id: null,
      from_email: "jan@klant.nl",
      body_text: "Factuur INV-1111",
    });

    expect(result.customer_account_id).toBe("555555");
    expect(result.confidence).toBe("high");
    expect(result.reason).toMatch(/corroborated/);
  });

  it("sender + invoice DISAGREE → precedence winner (sender) at medium (demote)", async () => {
    priorRowFixture = null;
    driveMock({
      sender: [
        row({
          identifier_kind: "email_domain",
          identifier_value_norm: "klant.nl",
          party_id: "BX111111",
          party_name: "Sender Klant",
        }),
      ],
      invoice: [
        row({
          identifier_kind: "invoice_no",
          identifier_value_norm: "INV-1111",
          party_id: "BX222222",
          party_name: "Invoice Klant",
        }),
      ],
    });

    const result = await resolveDebtor({
      ...BASE_ARGS,
      conversation_id: null,
      from_email: "jan@klant.nl",
      body_text: "Factuur INV-1111",
    });

    // sender_match has the lower precedence_index (precedence: thread, sender,
    // identifier) → it wins on disagreement, capped to medium.
    expect(result.customer_account_id).toBe("111111");
    expect(result.confidence).toBe("medium");
    expect(result.reason).toMatch(/disagreement/);
  });

  it("unresolved — zero hits → sender_email + empty matched_identifiers", async () => {
    priorRowFixture = null;
    const result = await resolveDebtor({
      ...BASE_ARGS,
      conversation_id: null,
      from_email: "ghost@example.com",
      body_text: "no invoice mentioned",
    });

    expect(result.method).toBe("unresolved");
    expect(result.inputs.kind).toBe("unresolved");
    if (result.inputs.kind !== "unresolved") throw new Error("type narrow");
    expect(result.inputs.sender_email).toBe("ghost@example.com");
    expect(result.inputs.matched_identifiers).toEqual([]);
  });

  it("non-unique sender row (is_unique_in_scope=false) fails closed — never a confident wrong customer", async () => {
    priorRowFixture = null;
    // A cross-brand collision arrives is_unique_in_scope=false → excluded by the
    // sender step → no signal collected → unresolved (fail closed). This exercises
    // the cardinal "never a confident wrong customer" rule WITHOUT invoking the
    // LLM tiebreaker (which is the Plan 03 candidate_details surface).
    driveMock({
      sender: [
        row({
          identifier_kind: "email_domain",
          identifier_value_norm: "shared.nl",
          party_id: "BX111111",
          party_name: "Klant A",
          is_unique_in_scope: false,
        }),
      ],
    });

    const result = await resolveDebtor({
      ...BASE_ARGS,
      conversation_id: null,
      from_email: "info@shared.nl",
      body_text: "geen factuur",
    });

    expect(result.method).toBe("unresolved");
    expect(result.confidence).not.toBe("high");
  });
});
