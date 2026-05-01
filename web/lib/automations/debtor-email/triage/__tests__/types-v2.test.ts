/**
 * Phase 65 Wave 0 scaffold — converted to real assertions in plans 03/04/05.
 * Owner plan: see file path under web/lib/.../__tests__/.
 */
import { describe, it, expect, vi } from "vitest";

// CORD-01: ranked-intent V2 schema accept/reject. Real assertions land in Task 2
// of Plan 65-01 (this plan). The four it() blocks below are filled in there.
describe("CORD-01 intentAgentOutputSchemaV2", () => {
  it.todo("rejects v1 single-label shape against intentAgentOutputSchemaV2");
  it.todo("accepts ranked array with 1..5 entries; rejects empty array; rejects 6 entries");
  it.todo("requires intent_version === '2026-05-01.v2' literal");
});
