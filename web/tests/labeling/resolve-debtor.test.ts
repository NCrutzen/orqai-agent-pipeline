// Phase 56-00 (D-00, D-01, D-02, D-03). resolveDebtor 4-layer pipeline.
// Wave 0 scaffold — module shape exists from Task 2 of this plan, but
// integration with NXT-Zap requires Wave 1 schema confirmation. RED until
// Wave 2.

import { describe, it } from "vitest";

describe("resolveDebtor — 4-layer pipeline", () => {
  it.todo("sender-first ordering — sender_match wins over identifier_match when both hit");
  it.todo("LLM skipped on single-hit — direct return when matches.length === 1 (D-03)");
  it.todo("LLM fires on multi-candidate — calls callTiebreaker when matches.length >= 2");
  it.todo("unresolved on zero-hit — no LLM call, returns method='unresolved' (D-03)");
});
