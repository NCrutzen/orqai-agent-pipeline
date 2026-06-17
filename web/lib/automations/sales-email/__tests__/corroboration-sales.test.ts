// Phase 120-02 Task 2 (TDD) — sales adapter routes through the SHARED pure
// scoreCorroboration helper when config.corroboration is present (SWARM-02 /
// CORR-04). The gate is config DATA — there is NO swarm-name branch (asserted by
// the plan's acceptance grep). These cases pin the multi-signal behavior:
//   - two distinct-kind agreeing hits (sender_domain + quote_no) same customer → high
//   - two distinct-kind hits on DIFFERENT customers → precedence winner at medium
//   - lone sender_domain hit → medium (D-07 cap)
//
// The substrate (lookupResolveCandidates) + debtor lookups are mocked.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { lookupSenderMock, lookupIdentifierMock, lookupResolveCandidatesMock } =
  vi.hoisted(() => ({
    lookupSenderMock: vi.fn(),
    lookupIdentifierMock: vi.fn(),
    lookupResolveCandidatesMock: vi.fn(),
  }));

vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupSenderToAccount: lookupSenderMock,
  lookupIdentifierToAccount: lookupIdentifierMock,
  lookupResolveCandidates: lookupResolveCandidatesMock,
}));

import { resolveEntity } from "../resolve-customer";

// Sales config WITH corroboration opted in (mirrors the Plan 03 seed shape).
const corrConfig = {
  version: "2026-06-16.v1",
  source: { kind: "nxt", resolver_tool_id: "nxt.rest_proxy" },
  scope: { environment_id: "BX", brand_mode: "tiebreaker" as const },
  precedence: ["sender_match", "offerte_match", "order_match"],
  auto_safe_kinds: [],
  blocklist_ref: { swarm_type: "sales-email", include_shared: false },
  llm_tiebreaker: false,
  corroboration: { min_signals: 2, boost: "high" as const },
};

const baseArgs = {
  nxt_database: "nxt",
  brand_id: "SB",
  conversation_id: null,
  from_email: "inkoop@bever.nl",
  subject: "",
  body_text: "",
};

beforeEach(() => {
  lookupSenderMock.mockReset();
  lookupIdentifierMock.mockReset();
  lookupResolveCandidatesMock.mockReset();
  lookupSenderMock.mockResolvedValue({ matches: [] });
  lookupIdentifierMock.mockResolvedValue({ matches: [] });
  lookupResolveCandidatesMock.mockResolvedValue({ matches: [] });
});

describe("Phase 120-02 Task 2: sales corroboration via the shared helper", () => {
  it("two agreeing distinct-kind hits (sender_domain + quote_no) on the SAME customer → high (boost, D-04)", async () => {
    lookupSenderMock.mockResolvedValue({
      matches: [
        { top_level_customer_id: "BX228895", top_level_customer_name: "Bever B.V.", status: "active" },
      ],
    });
    lookupResolveCandidatesMock.mockResolvedValue({
      matches: [
        { identifier_kind: "quote_no", identifier_value_norm: "14098", party_id: "BX228895", party_name: "Bever B.V.", scope_key: "SB", is_unique_in_scope: true, status: "active" },
      ],
    });

    const r = await resolveEntity(
      { ...baseArgs, subject: "Offerte SB014098", body_text: "Graag update offerte SB014098." },
      corrConfig,
    );

    expect(r.customer_account_id).toBe("BX228895");
    expect(r.confidence).toBe("high");
  });

  it("two distinct-kind hits on DIFFERENT customers → precedence winner at medium (demote, D-06)", async () => {
    // sender (precedence index 0) → BX111; offerte (index 1) → BX228895.
    lookupSenderMock.mockResolvedValue({
      matches: [
        { top_level_customer_id: "BX111", top_level_customer_name: "Sender Klant", status: "active" },
      ],
    });
    lookupResolveCandidatesMock.mockResolvedValue({
      matches: [
        { identifier_kind: "quote_no", identifier_value_norm: "14098", party_id: "BX228895", party_name: "Bever B.V.", scope_key: "SB", is_unique_in_scope: true, status: "active" },
      ],
    });

    const r = await resolveEntity(
      { ...baseArgs, subject: "Offerte SB014098", body_text: "offerte SB014098" },
      corrConfig,
    );

    // Precedence still selects the winner (D-02): sender_match is index 0.
    expect(r.customer_account_id).toBe("BX111");
    expect(r.confidence).toBe("medium");
    expect(r.confidence).not.toBe("high");
  });

  it("lone sender_domain hit (no second signal) → medium (D-07 cap)", async () => {
    lookupSenderMock.mockResolvedValue({
      matches: [
        { top_level_customer_id: "BX111", top_level_customer_name: "Sender Klant", status: "active" },
      ],
    });
    // No offerte/order in the body → only the sender signal collected.
    const r = await resolveEntity(
      { ...baseArgs, subject: "Algemene vraag", body_text: "geen nummer hier" },
      corrConfig,
    );

    expect(r.customer_account_id).toBe("BX111");
    expect(r.confidence).toBe("medium");
  });

  it("no signals at all → unresolved (canonical)", async () => {
    const r = await resolveEntity(
      { ...baseArgs, from_email: "prospect@brand-new.example", subject: "Hallo", body_text: "geen nummer" },
      corrConfig,
    );
    expect(r.method).toBe("unresolved");
    expect(r.customer_account_id).toBeNull();
    expect(r.confidence).toBe("none");
  });
});
