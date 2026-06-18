// Phase 114-05 Task 1 — STAGE2-02 designed acceptance test (part 2): a customer-less
// prospect resolves to `unresolved` and would fall through to Stage 3 without blocking.
//
// Locked decision D-09 (STAGE2-02): prospects with no NXT match → `unresolved`,
// `customer_account_id: null`. That exact value is what lets the Stage 2 worker
// still emit `coordinator.requested` with a legal PipelineStageContext
// (`customer_id: null` is LEGAL — see docs/agentic-pipeline/context-shape-contract.md).
// This file pins the RESOLVER side of the fall-through (the worker emit itself is
// covered by Plan 04's worker tests).
//
// Mock discipline: same self-contained vi.hoisted admin mock as the donor no-op
// test (no module-top const closure). All NXT lookups return "no match" so the
// only possible outcome is `unresolved`.

import { describe, it, expect, vi } from "vitest";

const { adminMock, nxtRequestMock, lookupResolveCandidatesMock } =
  vi.hoisted(() => {
    const empty = { data: null, error: null };
    const makeChain = (): unknown =>
      new Proxy(function () {}, {
        get(_t, prop) {
          if (prop === "then")
            return (f?: (v: unknown) => unknown) =>
              Promise.resolve(empty).then(f);
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
    return {
      adminMock: admin,
      nxtRequestMock: vi.fn(),
      lookupResolveCandidatesMock: vi.fn(),
    };
  });

vi.mock("@/lib/supabase/admin", () => ({
  admin: adminMock,
  createAdminClient: () => adminMock,
}));
vi.mock("@/lib/automations/nxt-zapier/nxt-client", () => ({
  nxtRequest: nxtRequestMock,
}));
// Phase 123-02: sender + factuur resolve over resolve_candidates (no legacy
// per-kind wrappers). For these prospect cases the substrate yields no match.
vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupResolveCandidates: lookupResolveCandidatesMock,
}));

import { resolveEntity } from "../resolve-customer";

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

describe("Phase 114-05 STAGE2-02: customer-less prospect falls through to Stage 3", () => {
  it("no sender hit + no identifier hit → method:unresolved, customer_account_id:null", async () => {
    // No NXT lookup yields a match.
    nxtRequestMock.mockResolvedValue({ status: 200, ok: true, data: null });
    lookupResolveCandidatesMock.mockResolvedValue({ matches: [] });

    const result = await resolveEntity(
      {
        nxt_database: "nxt",
        brand_id: "SB",
        conversation_id: null,
        // A brand-new prospect: not an own-tenant forward, no NXT account.
        from_email: "prospect@brand-new.example",
        subject: "Algemene vraag over jullie diensten",
        body_text:
          "Hallo, wij overwegen een samenwerking. Kunnen jullie meer info sturen?",
      },
      salesConfig,
    );

    // The fall-through value D-09 / the context-shape contract depend on.
    expect(result.method).toBe("unresolved");
    expect(result.customer_account_id).toBeNull();
    expect(result.confidence).toBe("none");
    expect(result.inputs.kind).toBe("unresolved");
  });

  it("no resolvable identifier in subject/body → NXT REST proxy is never called", async () => {
    nxtRequestMock.mockResolvedValue({ status: 200, ok: true, data: null });
    lookupResolveCandidatesMock.mockResolvedValue({ matches: [] });

    const result = await resolveEntity(
      {
        nxt_database: "nxt",
        brand_id: "SB",
        conversation_id: null,
        from_email: "prospect@brand-new.example",
        subject: "Geen enkel nummer hier",
        body_text: "Puur tekst, geen offerte- order- of factuurnummer.",
      },
      salesConfig,
    );

    expect(result.method).toBe("unresolved");
    // No identifier extracted → the offerte/order/Sites REST proxy is untouched.
    expect(nxtRequestMock).not.toHaveBeenCalled();
  });
});
