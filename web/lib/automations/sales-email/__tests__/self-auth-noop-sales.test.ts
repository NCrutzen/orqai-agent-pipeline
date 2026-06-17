// Phase 114-05 Task 1 — STAGE2-02 designed acceptance test (part 1): the debtor-only
// self-auth tier degrades to a NO-OP for sales.
//
// Ported from the donor self-auth-noop test
// (web/lib/agentic-pipeline/resolve/__tests__/self-auth-noop.test.ts) and re-aimed
// at the SALES resolveEntity adapter (web/lib/automations/sales-email/resolve-customer.ts).
//
// The generality assertion (STAGE2-02 part 1): a swarm whose resolution_config
// declares `auto_safe_kinds: []` (sales has no aanmaning/Klantnummer/werkbon
// self-auth stamps) must NOT crash and must NOT synthesize a false self-auth
// candidate. Resolution proceeds through the sales precedence steps and falls
// through to a valid ResolveResult.
//
// Mock discipline (donor pattern): vi.mock is hoisted ABOVE module-top consts, so
// the factory cannot close over a `const adminMock = createSupabaseAdminMock()`
// (it would throw "Cannot access 'adminMock' before initialization"). We build a
// minimal self-contained chainable admin mock inside the hoisted block — every
// chain method returns the proxy; maybeSingle resolves to an empty hit. The
// sales NXT lookups (nxtRequest + debtor sender/factuur lookups) are likewise
// mocked so this suite never touches NXT.

import { describe, it, expect, vi } from "vitest";

// Self-contained chainable admin mock (donor vi.hoisted pattern — no module-top
// const closure). Every chain method returns the proxy; single/maybeSingle/then
// resolve to an empty hit so any thread_inheritance / prior-label lookup misses.
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

// Sales NXT transport + reused debtor lookups — default to "no match" so the
// no-op assertion does not depend on a live NXT.
vi.mock("@/lib/automations/nxt-zapier/nxt-client", () => ({
  nxtRequest: nxtRequestMock,
}));
// Phase 123-02: sender + factuur resolve over resolve_candidates (no legacy
// per-kind wrappers). The self-auth no-op case yields no substrate match.
vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupResolveCandidates: lookupResolveCandidatesMock,
}));

import { resolveEntity } from "../resolve-customer";

// Sales resolution_config (mirrors the migration seed). The self-auth tier is
// explicitly emptied — `auto_safe_kinds: []` is the no-op trigger.
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
  auto_safe_kinds: [], // <-- the no-op trigger
  blocklist_ref: { swarm_type: "sales-email", include_shared: false },
  llm_tiebreaker: false,
};

// An email that WOULD carry a self-auth identifier in the DEBTOR swarm.
const selfAuthEmailArgs = {
  nxt_database: "nxt",
  brand_id: "SB",
  conversation_id: null,
  from_email: "prospect@brand-new.example",
  subject: "Aanmaning 12345 / Klantnummer 67890",
  body_text: "Betreft werkbon 4242 en klantnummer 67890.",
};

describe("Phase 114-05 STAGE2-02: sales self-auth tier degrades to a no-op", () => {
  it("auto_safe_kinds:[] → no self-auth candidate synthesized, no crash", async () => {
    nxtRequestMock.mockResolvedValue({ status: 200, ok: true, data: null });
    lookupResolveCandidatesMock.mockResolvedValue({ matches: [] });

    const config = { ...salesConfig, auto_safe_kinds: [] };

    // MUST NOT throw.
    const result = await resolveEntity(selfAuthEmailArgs, config);

    // MUST NOT emit a self-auth candidate from the empty tier.
    expect(result.method).not.toBe("self_auth");

    // Resolution still proceeds — a valid ResolveResult whose discriminated
    // `inputs.kind` mirrors `method`.
    expect(result).toHaveProperty("method");
    expect(result).toHaveProperty("customer_account_id");
    expect(result).toHaveProperty("inputs");
    expect(result.inputs.kind).toBe(result.method);
  });
});
