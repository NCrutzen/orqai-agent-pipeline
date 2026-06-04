// Phase 90 Wave 0 RED — fails until Plan 05 builds engine.ts (D-01/D-02/RESL-03).
//
// The ONLY generality assertion P0 makes (Claude's-Discretion item 4):
// the self-auth tier MUST degrade to a no-op when a swarm's config declares
// zero auto-safe self-auth kinds. A swarm with `auto_safe_kinds: []` (e.g. a
// future SugarCRM-shaped swarm that has no aanmaning/Klantnummer/werkbon stamps)
// must NOT crash and must NOT synthesize a false self-auth candidate; resolution
// proceeds through the remaining ported steps.
//
// RED reason: `../engine` does not exist yet (only ../types.ts exists in the
// agentic-pipeline tree). Import resolution fails → the suite is RED for the
// right reason. Plan 05 builds engine.ts and turns this GREEN.

import { describe, it, expect, vi } from "vitest";

// vi.mock is hoisted above module-top consts, so the factory cannot close over
// a `const adminMock = createSupabaseAdminMock()` (it would throw "Cannot access
// 'adminMock' before initialization"). The aliased @/test-utils import is also
// unavailable during the hoist phase. Since this no-op test never queues a
// response, build a minimal self-contained chainable admin mock inside the
// hoisted block — every chain method returns the proxy; maybeSingle resolves to
// an empty hit so Layer 1 (thread_inheritance) finds no prior label.
const { adminMock } = vi.hoisted(() => {
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
  return { adminMock: admin };
});
vi.mock("@/lib/supabase/admin", () => ({
  admin: adminMock,
  createAdminClient: () => adminMock,
}));

// Plan 05 built the generic engine (1:1 port of resolve-debtor.ts).
import * as engine from "../engine";

// A debtor-shaped P0 config with self-auth explicitly emptied. Plan 05 exports
// the real `debtorConfig`; here we inline the minimal shape the engine reads so
// the file is self-contained and RED only on the missing engine import.
const debtorConfig = {
  version: "2026-06-01.v1",
  source: { kind: "nxt", resolver_tool_id: "nxt.resolve_candidates" },
  scope: { environment_id: "BX", brand_mode: "tiebreaker", brand_scope: ["SB"] },
  precedence: ["thread_inheritance", "sender_match", "identifier_match"],
  auto_safe_kinds: [], // <-- the no-op trigger
  llm_tiebreaker: true,
};

// An email that WOULD carry a self-auth identifier in the debtor swarm.
const selfAuthEmailArgs = {
  nxt_database: "nxt",
  brand_id: "SB",
  conversation_id: null,
  from_email: "klant@example.com",
  subject: "Aanmaning 12345 / Klantnummer 67890",
  body_text: "Betreft werkbon 4242 en klantnummer 67890.",
};

describe("Phase 90 RESL-03: self-auth tier degrades to a no-op", () => {
  it("empty auto_safe_kinds → no self-auth candidate, no crash", async () => {
    const config = { ...debtorConfig, auto_safe_kinds: [] };

    // MUST NOT throw.
    const result = await engine.resolveEntity(selfAuthEmailArgs, config);

    // MUST NOT emit a self-auth candidate from the empty tier.
    expect(result.method).not.toBe("self_auth");

    // Resolution still proceeds — result is a valid ResolveResult whose
    // discriminated `inputs.kind` mirrors `method`.
    expect(result).toHaveProperty("method");
    expect(result).toHaveProperty("customer_account_id");
    expect(result).toHaveProperty("inputs");
    expect(result.inputs.kind).toBe(result.method);
  });
});
