/**
 * Phase 65 Wave 0 scaffold — converted to real assertions in plans 03/04/05.
 * Owner plan: 65-03 swaps the cache lookup version literal to V2.
 */
import { describe, it, expect, vi } from "vitest";

// CORD-04 — idempotency cache invalidation on intent_version flip.
describe("CORD-04 idempotency cache V2 invalidation", () => {
  it.todo(
    "findCachedOutput keyed on intent_version=2026-05-01.v2 returns cached IntentAgentOutputV2 when present",
  );
  it.todo("v1 row does NOT match v2 lookup — cache miss → second Orq call fires");
});
