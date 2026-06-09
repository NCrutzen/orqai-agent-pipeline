// Phase 90 Wave 0 RED — fails until Plan 05 builds engine.ts (D-01/D-02).
//
// The behaviour-neutrality gate (D-01 thin-seam + 1:1 port, D-02 P0 stays
// behaviour-neutral). The ported generic engine MUST return a ResolveResult
// byte-equal to the live `resolveDebtor` on every fixture — same `method`,
// `customer_account_id`, `customer_name`, `confidence`, and `inputs`. This is
// the first-line guard (threat T-90-03) that a confident wrong customer cannot
// slip in via a logic drift during the port.
//
// `resolveDebtor` is imported from its live home (exists). `engine` is imported
// from `../engine` (does NOT exist yet) → RED until Plan 05 builds it.
//
// NOTE: both resolvers reach Supabase (Layer 1 thread_inheritance) and the
// nxt-zap-client (Layers 2/3). The shared admin + nxt-client mocks below make
// the fixtures deterministic so the equality assertion is meaningful once the
// engine exists; in the RED state the suite never reaches them (import fails).

import { describe, it, expect, vi } from "vitest";
import {
  resolveDebtor,
  type ResolveArgs,
  type ResolveResult,
} from "@/lib/automations/debtor-email/resolve-debtor";

// vi.mock is hoisted above module-top consts, so the factory cannot close over
// a `const adminMock = createSupabaseAdminMock()` (would throw "Cannot access
// 'adminMock' before initialization") and the aliased @/test-utils import is
// unavailable during the hoist phase. Build a minimal self-contained chainable
// admin mock inside vi.hoisted; every chain method returns the proxy and
// maybeSingle/single/await resolves to an empty hit (data:null) so Layer 1
// finds no prior label — both resolvers see the same inert Supabase + the
// nxt-zap-client mock below, making the equality assertion meaningful.
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

// Keep the NXT lookups inert so Layers 2/3 return zero hits deterministically
// for the fixtures that exercise the unresolved / inheritance paths.
vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupSenderToAccount: vi.fn(async () => ({ matches: [] })),
  lookupIdentifierToAccount: vi.fn(async () => ({ matches: [] })),
  lookupCandidateDetails: vi.fn(async () => ({ matches: [] })),
}));

// Plan 05 built the ported generic engine (a 1:1 move of the 4 layers with
// step ordering driven by config.precedence).
import * as engine from "../engine";

// debtor's P0 resolution_config = TODAY's order (inheritance first/high). P1
// owns the precedence flip; P0 is byte-identical so this equality check is clean.
const debtorP0Config = {
  version: "2026-06-01.v1",
  source: { kind: "nxt", resolver_tool_id: "nxt.resolve_candidates" },
  scope: { environment_id: "BX", brand_mode: "tiebreaker", brand_scope: ["SB"] },
  precedence: ["thread_inheritance", "sender_match", "identifier_match"],
  auto_safe_kinds: [],
  llm_tiebreaker: true,
};

// Fixtures: one inheritance hit, one sender-match single-hit, one
// identifier-match, one unresolved/zero-hit.
const fixtures: { name: string; args: ResolveArgs }[] = [
  {
    name: "thread_inheritance hit (prior label on same conversation)",
    args: {
      nxt_database: "nxt",
      brand_id: "SB",
      conversation_id: "conv-INHERIT-1",
      from_email: "klant@acme.example",
      subject: "Re: factuur",
      body_text: "zie eerdere mail",
    },
  },
  {
    name: "sender_match single-hit (sender → one top-level customer)",
    args: {
      nxt_database: "nxt",
      brand_id: "SB",
      conversation_id: null,
      from_email: "boekhouding@acme.example",
      subject: "Vraag over openstaand bedrag",
      body_text: "Graag een overzicht.",
    },
  },
  {
    name: "identifier_match (invoice number → one paying customer)",
    args: {
      nxt_database: "nxt",
      brand_id: "SB",
      conversation_id: null,
      from_email: "info@acme.example",
      subject: "Betreft factuur 17008641",
      body_text: "Wij betwisten factuur 17008641.",
    },
  },
  {
    name: "unresolved zero-hit (no inheritance, no NXT match)",
    args: {
      nxt_database: "nxt",
      brand_id: "SB",
      conversation_id: null,
      from_email: "noone@nowhere.example",
      subject: "geen identifier",
      body_text: "leeg",
    },
  },
];

// Compare only the public-contract surface (field `customer_account_id` LOCKED).
function publicSurface(r: ResolveResult) {
  return {
    method: r.method,
    customer_account_id: r.customer_account_id,
    customer_name: r.customer_name,
    confidence: r.confidence,
    inputs: r.inputs,
  };
}

describe("Phase 90 D-01/D-02: ported engine === resolveDebtor (behaviour-neutral)", () => {
  for (const fx of fixtures) {
    it(`byte-equal on: ${fx.name}`, async () => {
      const legacy = await resolveDebtor(fx.args);
      const ported = await engine.resolveEntity(fx.args, debtorP0Config);
      expect(publicSurface(ported)).toEqual(publicSurface(legacy));
    });
  }
});
