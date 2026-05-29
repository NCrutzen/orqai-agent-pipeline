// Phase 56-00 (D-00, D-01, D-02, D-03). resolveDebtor 4-layer pipeline.
//
// Phase 82.9 Plan 02 — Per-method discriminated `inputs` assertions.
// Each test asserts result.inputs.kind === result.method for the path taken
// and verifies the layer-specific fields (prior_email_label_id, sender_email,
// candidates, matched_identifiers, llm_reason) flow through correctly.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock nxt-zap-client BEFORE importing resolve-debtor -----------------
const lookupSenderToAccountMock = vi.fn();
const lookupIdentifierToAccountMock = vi.fn();
const lookupCandidateDetailsMock = vi.fn();
vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupSenderToAccount: (...args: unknown[]) =>
    lookupSenderToAccountMock(...args),
  lookupIdentifierToAccount: (...args: unknown[]) =>
    lookupIdentifierToAccountMock(...args),
  lookupCandidateDetails: (...args: unknown[]) =>
    lookupCandidateDetailsMock(...args),
}));

const callTiebreakerMock = vi.fn();
vi.mock("@/lib/automations/debtor-email/llm-tiebreaker", () => ({
  callTiebreaker: (...args: unknown[]) => callTiebreakerMock(...args),
}));

// extractInvoiceCandidates returns deterministic candidates for a fixture body.
vi.mock("@/lib/automations/debtor-email/extract-invoices", () => ({
  extractInvoiceCandidates: (_subject: string, body: string) => {
    if (body.includes("INV-1111")) return { candidates: ["INV-1111"] };
    if (body.includes("INV-2222")) return { candidates: ["INV-2222", "INV-3333"] };
    return { candidates: [] };
  },
}));

// ---- Supabase admin mock -------------------------------------------------
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

const BASE_ARGS = {
  nxt_database: "smeba_prod",
  brand_id: "SM",
  subject: "Test subject",
  body_text: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  priorRowFixture = null;
});

describe("resolveDebtor — Phase 82.9 discriminated inputs", () => {
  it("Test 1: thread_inheritance — populates prior_email_label_id + conversation_id", async () => {
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

    expect(result.method).toBe("thread_inheritance");
    expect(result.customer_account_id).toBe("cust-99");
    expect(result.inputs.kind).toBe("thread_inheritance");
    if (result.inputs.kind !== "thread_inheritance") throw new Error("type narrow");
    expect(result.inputs.prior_email_label_id).toBe("label-abc-uuid");
    expect(result.inputs.conversation_id).toBe("conv-xyz");
  });

  it("Test 2: sender_match single-hit — fetches candidate detail + populates rich Candidate", async () => {
    priorRowFixture = null; // no prior label
    lookupSenderToAccountMock.mockResolvedValueOnce({
      matches: [
        {
          contact_id: "c1",
          top_level_customer_id: "cust-123",
          top_level_customer_name: "Klant BV",
          depth: 0,
        },
      ],
    });
    lookupCandidateDetailsMock.mockResolvedValueOnce({
      matches: [
        {
          id: "cust-123",
          name: "Klant BV",
          status: "active",
          modified_on: "2026-05-10",
          contact_person: "Jan Jansen",
          recent_invoices: ["INV-9001", "INV-9002"],
        },
      ],
    });

    const result = await resolveDebtor({
      ...BASE_ARGS,
      conversation_id: null,
      from_email: "klant@example.com",
    });

    expect(result.method).toBe("sender_match");
    expect(result.inputs.kind).toBe("sender_match");
    if (result.inputs.kind !== "sender_match") throw new Error("type narrow");
    expect(result.inputs.sender_email).toBe("klant@example.com");
    expect(result.inputs.candidates).toHaveLength(1);
    expect(result.inputs.candidates[0].contact_person).toBe("Jan Jansen");
    expect(result.inputs.candidates[0].recent_invoices).toEqual([
      "INV-9001",
      "INV-9002",
    ]);

    // Assert the candidate-details fetch was called with a single-element id array.
    expect(lookupCandidateDetailsMock).toHaveBeenCalledTimes(1);
    expect(lookupCandidateDetailsMock).toHaveBeenCalledWith(
      expect.objectContaining({ customer_ids: ["cust-123"] }),
      expect.any(String),
    );
  });

  it("Test 3: sender_match single-hit candidate-details fetch failure — slim fallback Candidate", async () => {
    priorRowFixture = null;
    lookupSenderToAccountMock.mockResolvedValueOnce({
      matches: [
        {
          contact_id: "c1",
          top_level_customer_id: "cust-fail",
          top_level_customer_name: "Klant Fallback",
          depth: 0,
        },
      ],
    });
    lookupCandidateDetailsMock.mockRejectedValueOnce(
      new Error("nxt timeout"),
    );

    const result = await resolveDebtor({
      ...BASE_ARGS,
      conversation_id: null,
      from_email: "klant@example.com",
    });

    expect(result.method).toBe("sender_match");
    expect(result.customer_account_id).toBe("cust-fail");
    expect(result.inputs.kind).toBe("sender_match");
    if (result.inputs.kind !== "sender_match") throw new Error("type narrow");
    expect(result.inputs.candidates[0]).toEqual({
      id: "cust-fail",
      name: "Klant Fallback",
      contact_person: null,
      recent_invoices: [],
    });
  });

  it("Test 4: identifier_match single-hit — matched_identifiers + rich Candidate", async () => {
    priorRowFixture = null;
    // No sender match — empty.
    lookupSenderToAccountMock.mockResolvedValueOnce({ matches: [] });
    lookupIdentifierToAccountMock.mockResolvedValueOnce({
      matches: [
        {
          invoice_id: "i1",
          invoice_number: "INV-1111",
          customer_id: "c1",
          top_level_customer_id: "cust-777",
          invoice_date: "2026-05-01",
          status: "paid",
        },
      ],
    });
    lookupCandidateDetailsMock.mockResolvedValueOnce({
      matches: [
        {
          id: "cust-777",
          name: "Identifier Klant",
          status: "active",
          modified_on: "2026-05-10",
          contact_person: "Piet de Vries",
          recent_invoices: ["INV-1111", "INV-1010"],
        },
      ],
    });

    const result = await resolveDebtor({
      ...BASE_ARGS,
      conversation_id: null,
      from_email: "unknown@example.com",
      body_text: "Factuurnummer INV-1111 graag betalen",
    });

    expect(result.method).toBe("identifier_match");
    expect(result.inputs.kind).toBe("identifier_match");
    if (result.inputs.kind !== "identifier_match") throw new Error("type narrow");
    expect(result.inputs.matched_identifiers).toEqual(["INV-1111"]);
    expect(result.inputs.candidates).toHaveLength(1);
    expect(result.inputs.candidates[0].recent_invoices).toEqual([
      "INV-1111",
      "INV-1010",
    ]);
  });

  it("Test 5: llm_tiebreaker — propagates llm_reason + maps candidates", async () => {
    priorRowFixture = null;
    lookupSenderToAccountMock.mockResolvedValueOnce({ matches: [] });
    lookupIdentifierToAccountMock.mockResolvedValueOnce({
      matches: [
        {
          invoice_id: "i1",
          invoice_number: "INV-2222",
          customer_id: "c1",
          top_level_customer_id: "cust-A",
          invoice_date: "2026-05-01",
          status: "paid",
        },
        {
          invoice_id: "i2",
          invoice_number: "INV-3333",
          customer_id: "c2",
          top_level_customer_id: "cust-B",
          invoice_date: "2026-05-01",
          status: "paid",
        },
      ],
    });
    lookupCandidateDetailsMock.mockResolvedValueOnce({
      matches: [
        {
          id: "cust-A",
          name: "Klant A",
          status: "active",
          modified_on: "2026-05-10",
          contact_person: "Aap",
          recent_invoices: ["INV-2222"],
        },
        {
          id: "cust-B",
          name: "Klant B",
          status: "active",
          modified_on: "2026-05-10",
          contact_person: "Beer",
          recent_invoices: ["INV-3333"],
        },
      ],
    });
    callTiebreakerMock.mockResolvedValueOnce({
      selected_account_id: "cust-A",
      confidence: "medium",
      reason: "subject mentions Klant A explicitly",
    });

    const result = await resolveDebtor({
      ...BASE_ARGS,
      conversation_id: null,
      from_email: "klant@example.com",
      body_text: "Factuur INV-2222 of INV-3333?",
    });

    expect(result.method).toBe("llm_tiebreaker");
    expect(result.customer_account_id).toBe("cust-A");
    expect(result.inputs.kind).toBe("llm_tiebreaker");
    if (result.inputs.kind !== "llm_tiebreaker") throw new Error("type narrow");
    expect(result.inputs.llm_reason).toBe(
      "subject mentions Klant A explicitly",
    );
    expect(result.inputs.matched_identifiers).toEqual(["INV-2222", "INV-3333"]);
    expect(result.inputs.candidates).toHaveLength(2);
    expect(result.inputs.candidates.map((c) => c.id)).toEqual([
      "cust-A",
      "cust-B",
    ]);
  });

  it("Test 6: unresolved — sender_email + empty matched_identifiers", async () => {
    priorRowFixture = null;
    lookupSenderToAccountMock.mockResolvedValueOnce({ matches: [] });
    // No invoices extracted from this body.
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
});

describe("resolveDebtor — Phase 04.1 — picks alternatives", () => {
  it("LLM tiebreaker success → result.inputs.picked_account_id === selected_account_id", async () => {
    priorRowFixture = null;
    lookupSenderToAccountMock.mockResolvedValueOnce({ matches: [] });
    lookupIdentifierToAccountMock.mockResolvedValueOnce({
      matches: [
        {
          invoice_id: "i1",
          invoice_number: "INV-2222",
          customer_id: "c1",
          top_level_customer_id: "cust-A",
          invoice_date: "2026-05-01",
          status: "paid",
        },
        {
          invoice_id: "i2",
          invoice_number: "INV-3333",
          customer_id: "c2",
          top_level_customer_id: "cust-B",
          invoice_date: "2026-05-01",
          status: "paid",
        },
      ],
    });
    lookupCandidateDetailsMock.mockResolvedValueOnce({
      matches: [
        {
          id: "cust-A",
          name: "Klant A",
          status: "active",
          modified_on: "2026-05-10",
          contact_person: "Aap",
          recent_invoices: ["INV-2222"],
        },
        {
          id: "cust-B",
          name: "Klant B",
          status: "active",
          modified_on: "2026-05-10",
          contact_person: "Beer",
          recent_invoices: ["INV-3333"],
        },
      ],
    });
    callTiebreakerMock.mockResolvedValueOnce({
      selected_account_id: "cust-A",
      confidence: "medium",
      reason: "subject mentions Klant A",
    });

    const result = await resolveDebtor({
      ...BASE_ARGS,
      conversation_id: null,
      from_email: "klant@example.com",
      body_text: "Factuur INV-2222 of INV-3333?",
    });

    expect(result.inputs.kind).toBe("llm_tiebreaker");
    if (result.inputs.kind !== "llm_tiebreaker") throw new Error("narrow");
    expect(result.inputs.picked_account_id).toBe("cust-A");
  });

  it("LLM tiebreaker failure (callTiebreaker rejects) → picked_account_id is null", async () => {
    priorRowFixture = null;
    lookupSenderToAccountMock.mockResolvedValueOnce({ matches: [] });
    lookupIdentifierToAccountMock.mockResolvedValueOnce({
      matches: [
        {
          invoice_id: "i1",
          invoice_number: "INV-2222",
          customer_id: "c1",
          top_level_customer_id: "cust-A",
          invoice_date: "2026-05-01",
          status: "paid",
        },
        {
          invoice_id: "i2",
          invoice_number: "INV-3333",
          customer_id: "c2",
          top_level_customer_id: "cust-B",
          invoice_date: "2026-05-01",
          status: "paid",
        },
      ],
    });
    lookupCandidateDetailsMock.mockResolvedValueOnce({
      matches: [
        {
          id: "cust-A",
          name: "Klant A",
          status: "active",
          modified_on: "2026-05-10",
          contact_person: null,
          recent_invoices: [],
        },
        {
          id: "cust-B",
          name: "Klant B",
          status: "active",
          modified_on: "2026-05-10",
          contact_person: null,
          recent_invoices: [],
        },
      ],
    });
    callTiebreakerMock.mockRejectedValueOnce(new Error("llm timeout"));

    const result = await resolveDebtor({
      ...BASE_ARGS,
      conversation_id: null,
      from_email: "klant@example.com",
      body_text: "Factuur INV-2222 of INV-3333?",
    });

    expect(result.inputs.kind).toBe("llm_tiebreaker");
    if (result.inputs.kind !== "llm_tiebreaker") throw new Error("narrow");
    expect(result.inputs.picked_account_id).toBeNull();
  });

  it("candidates length >= 2 and includes picked account id (alternatives derivable)", async () => {
    priorRowFixture = null;
    lookupSenderToAccountMock.mockResolvedValueOnce({ matches: [] });
    lookupIdentifierToAccountMock.mockResolvedValueOnce({
      matches: [
        {
          invoice_id: "i1",
          invoice_number: "INV-2222",
          customer_id: "c1",
          top_level_customer_id: "cust-A",
          invoice_date: "2026-05-01",
          status: "paid",
        },
        {
          invoice_id: "i2",
          invoice_number: "INV-3333",
          customer_id: "c2",
          top_level_customer_id: "cust-B",
          invoice_date: "2026-05-01",
          status: "paid",
        },
      ],
    });
    lookupCandidateDetailsMock.mockResolvedValueOnce({
      matches: [
        {
          id: "cust-A",
          name: "Klant A",
          status: "active",
          modified_on: "2026-05-10",
          contact_person: null,
          recent_invoices: [],
        },
        {
          id: "cust-B",
          name: "Klant B",
          status: "active",
          modified_on: "2026-05-10",
          contact_person: null,
          recent_invoices: [],
        },
      ],
    });
    callTiebreakerMock.mockResolvedValueOnce({
      selected_account_id: "cust-B",
      confidence: "medium",
      reason: "explicit",
    });

    const result = await resolveDebtor({
      ...BASE_ARGS,
      conversation_id: null,
      from_email: "klant@example.com",
      body_text: "Factuur INV-2222 of INV-3333?",
    });

    expect(result.inputs.kind).toBe("llm_tiebreaker");
    if (result.inputs.kind !== "llm_tiebreaker") throw new Error("narrow");
    expect(result.inputs.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.inputs.picked_account_id).toBe("cust-B");
    expect(
      result.inputs.candidates.some((c) => c.id === "cust-B"),
    ).toBe(true);
    // Alternatives derivable via filter:
    const picked = result.inputs.picked_account_id;
    const alternatives = result.inputs.candidates.filter(
      (c) => c.id !== picked,
    );
    expect(alternatives.map((c) => c.id)).toEqual(["cust-A"]);
  });
});

// Keep the original placeholder TODOs around as documentation hooks for the
// pre-Phase-82.9 behavior tests (they remain unimplemented per the original
// scaffold; Phase 82.9 introduces the discriminated-inputs coverage above).
describe("resolveDebtor — 4-layer pipeline (legacy placeholders)", () => {
  it.todo("sender-first ordering — sender_match wins over identifier_match when both hit");
  it.todo("LLM skipped on single-hit — direct return when matches.length === 1 (D-03)");
  it.todo("LLM fires on multi-candidate — calls callTiebreaker when matches.length >= 2");
  it.todo("unresolved on zero-hit — no LLM call, returns method='unresolved' (D-03)");
});
