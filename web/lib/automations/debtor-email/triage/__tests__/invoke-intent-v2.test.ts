/**
 * Phase 65 Wave 0 scaffold — converted to real assertions in plans 03/04/05.
 * Owner plan: 65-03 rewrites invoke-intent.ts to parse V2 shape.
 */
import { describe, it, expect, vi } from "vitest";

// CORD-01 — invokeIntentAgent V2 transport. Real fetch mock + assertions land in Plan 65-03.
describe("CORD-01 invokeIntentAgent V2", () => {
  it.todo("invokeIntentAgent returns IntentAgentOutputV2 parsed from /responses body");
  it.todo("rejects v1 shape with informative zod error");
});
