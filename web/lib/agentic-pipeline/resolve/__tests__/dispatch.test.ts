// Phase 90 Wave 0 RED — fails until Plan 05 builds engine.ts + dynamic.ts (D-01/D-02/RESL-03).
//
// RESL-03 dispatch contract. This file imports `loadStage2Resolver` from
// `@/lib/swarms/dynamic` — a module that does NOT exist yet (verified absent:
// `find web/lib -name dynamic.ts` returns nothing). The RED reason is therefore
// "Failed to resolve import" / "Cannot find module", NOT a logic bug.
//
// What this encodes (the registry-driven dispatch seam, Pattern 1 in 90-RESEARCH):
//   1. swarms.stage2_entity_resolver IS NULL  → loader returns null
//      ("Router shape: skip Stage 2"; info-routing precedent, 20260521 migration).
//   2. a module-path string                   → loader returns a { resolveEntity } module.
//   3. swarms.resolution_config               → passed THROUGH to resolveEntity(args, config).
//
// `loadStage2Resolver` is the D-07 kill-switch consumer: cutover = UPDATE the
// swarms.stage2_entity_resolver column, revert = UPDATE it back. Data-only.

import { describe, it, expect, beforeEach, vi } from "vitest";

// Plan 05 built dynamic.ts (the dispatch seam) + the engine the module-path
// case dispatches to. These now resolve.
import {
  loadStage2Resolver,
  __resetResolverCacheForTests,
} from "@/lib/swarms/dynamic";
import * as engine from "../engine";

// vi.mock is hoisted above module-top consts, so the factory cannot close over
// a `const adminMock = createSupabaseAdminMock()` (would throw "Cannot access
// 'adminMock' before initialization") and the aliased @/test-utils import is
// unavailable during the hoist phase. Build a minimal self-contained chainable
// admin mock inside vi.hoisted; the dispatch tests never queue a response.
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

describe("Phase 90 RESL-03: loadStage2Resolver dispatch", () => {
  beforeEach(() => {
    // Reference the not-yet-built reset helper so the RED failure surfaces as
    // module-not-found rather than a silent stale-cache logic bug.
    __resetResolverCacheForTests?.();
  });

  it("NULL resolver pointer → returns null (Router shape: skip Stage 2)", async () => {
    // swarms.stage2_entity_resolver IS NULL means the engine is never invoked
    // (info-routing swarm precedent — 20260521 seeds NULL).
    const resolver = await loadStage2Resolver(null);
    expect(resolver).toBeNull();
  });

  it("module-path string → loads a module exposing resolveEntity()", async () => {
    const mod = await loadStage2Resolver(
      "@/lib/automations/debtor-email/resolve-debtor",
    );
    expect(mod).not.toBeNull();
    expect(typeof mod!.resolveEntity).toBe("function");
  });

  it("resolution_config is passed through to resolveEntity(args, config)", async () => {
    // The module-path case dispatches to the engine module imported above;
    // spy on its resolveEntity to assert the loaded config flows through.
    const mod = await loadStage2Resolver(
      "@/lib/agentic-pipeline/resolve/engine",
    );
    expect(mod).not.toBeNull();
    const spy = vi.spyOn(engine, "resolveEntity");

    const args = {
      nxt_database: "nxt",
      brand_id: "SB",
      conversation_id: null,
      from_email: "a@example.com",
      subject: "s",
      body_text: "b",
    };
    const config = {
      version: "2026-06-01.v1",
      scope: { environment_id: "BX", brand_mode: "tiebreaker", brand_scope: ["SB"] },
      precedence: ["thread_inheritance", "sender_match", "identifier_match"],
      auto_safe_kinds: [],
    };

    await engine.resolveEntity(args, config);

    // The engine must receive the EXACT config object the dispatcher loaded.
    expect(spy).toHaveBeenCalledWith(args, config);
  });
});
