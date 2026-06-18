// Phase 90 → Phase 123 — the engine-vs-adapter equivalence gate.
//
// The behaviour-neutrality gate: the generic engine (engine.resolveEntity) MUST
// return a ResolveResult byte-equal to the live `resolveDebtor` adapter on every
// fixture — same `method`, `customer_account_id`, `customer_name`, `confidence`,
// and `inputs`. This is the first-line guard (threat T-90-03) that a confident
// wrong customer cannot slip in via a logic drift.
//
// Phase 123: the legacy contact_lookup / identifier_lookup comparison TARGET is
// RETIRED — both `resolveDebtor` and the engine path now resolve over the single
// generic nxt.resolve_candidates substrate (email_domain/email_address +
// invoice_no). This suite drives the resolve_candidates mock only (no legacy
// wrapper mock remains) and asserts the adapter == the engine with the SAME
// debtorP0Config (corroboration included).

import { describe, it, expect, vi } from "vitest";
import {
  resolveDebtor,
  debtorP0Config,
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

// Keep the generic resolve_candidates read inert so the sender/invoice steps
// return zero hits deterministically; the fixtures exercise the inheritance and
// unresolved paths, where the engine and the adapter must agree byte-for-byte.
vi.mock("@/lib/automations/debtor-email/nxt-zap-client", () => ({
  lookupResolveCandidates: vi.fn(async () => ({ matches: [] })),
}));

import * as engine from "../engine";

// The engine path uses the SAME debtorP0Config the adapter uses (imported from
// resolve-debtor) so the equality check covers the real config — including the
// corroboration sub-object (Phase 120-03). Re-declaring a divergent local config
// would make the equality assertion meaningless.

// Fixtures: one inheritance hit, two NXT-inert paths (sender/invoice with no
// resolve_candidates rows), one unresolved/zero-hit.
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
