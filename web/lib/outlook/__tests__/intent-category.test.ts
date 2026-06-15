// Phase 117 Plan 01 Task 1 (D-1) — pure intent→category mapper.
//
// Pins the D-1 contract: the Stage-3 top-1 intent_key is turned into exactly one
// `AI:`-prefixed native Outlook category via a PURE derived function (no per-swarm
// table, no confidence suffix in v1). mergeIntentCategory produces the FULL desired
// category set: it strips every stale `AI:` entry, keeps all non-AI user categories
// in their original relative order, and appends the single new `AI:` label last.
//
// These cases are the strip-stale-AI replacement for categorizeEmail's additive
// dedup-merge — Plan 02's worker PATCHes the result of mergeIntentCategory directly.

import { describe, it, expect } from "vitest";
import {
  AI_CATEGORY_PREFIX,
  buildIntentCategory,
  mergeIntentCategory,
} from "../intent-category";

describe("intent-category — buildIntentCategory (D-1)", () => {
  it("prefixes the intent key with the exact `AI: ` marker (incl. trailing space)", () => {
    expect(buildIntentCategory("quote_request")).toBe("AI: quote_request");
  });

  it("exposes AI_CATEGORY_PREFIX as the single source of the marker", () => {
    expect(AI_CATEGORY_PREFIX).toBe("AI: ");
  });
});

describe("intent-category — mergeIntentCategory (strip-stale-AI, D-1/D-4)", () => {
  it("strips the stale AI: entry, keeps the user category, adds the new AI: label", () => {
    expect(
      mergeIntentCategory(["Red category", "AI: old_intent"], "quote_request"),
    ).toEqual(["Red category", "AI: quote_request"]);
  });

  it("adds the AI: label to an empty set", () => {
    expect(mergeIntentCategory([], "order_status")).toEqual(["AI: order_status"]);
  });

  it("is idempotent — re-merging the same intent yields no duplicate, order stable", () => {
    expect(mergeIntentCategory(["AI: quote_request"], "quote_request")).toEqual([
      "AI: quote_request",
    ]);
  });

  it("strips ALL AI:-prefixed entries (defensive against historic double-writes)", () => {
    expect(
      mergeIntentCategory(
        ["AI: old_a", "Keep me", "AI: old_b", "Keep me too"],
        "new_intent",
      ),
    ).toEqual(["Keep me", "Keep me too", "AI: new_intent"]);
  });

  it("preserves non-AI categories' original relative order; AI: label appended last", () => {
    expect(
      mergeIntentCategory(["Zeta", "Alpha", "AI: stale", "Mu"], "final_intent"),
    ).toEqual(["Zeta", "Alpha", "Mu", "AI: final_intent"]);
  });
});
