// Phase 132 Plan 01 (Task 2, D-05). Pins the routing-category stamp-back vocabulary:
//   - buildRoutingCategory produces a stable, machine-parseable AI:-prefixed string
//     per (status, bucket). These EXACT strings are the V10 ambient-loop contract
//     (Phase 134 parses them) — they are pinned here.
//   - mergeRoutingCategory clones mergeIntentCategory's strip-stale-AI mechanics:
//     strip every AI:-prefixed entry, keep user categories in order, append one.
//   - Re-exports AI_CATEGORY_PREFIX from intent-category (single source).

import { describe, it, expect } from "vitest";
import {
  AI_CATEGORY_PREFIX,
  buildRoutingCategory,
  mergeRoutingCategory,
} from "../routing-category";

describe("routing-category — buildRoutingCategory (D-05 pinned vocabulary)", () => {
  it("maps each status to the exact pinned AI: string", () => {
    expect(buildRoutingCategory("forwarded", "storingen")).toBe(
      "AI: routed → storingen",
    );
    expect(buildRoutingCategory("held", "verkoop")).toBe("AI: held → verkoop");
    expect(buildRoutingCategory("triage")).toBe("AI: triage");
    expect(buildRoutingCategory("algemeen")).toBe("AI: algemeen");
    expect(buildRoutingCategory("dedup", "storingen")).toBe(
      "AI: routed → storingen (dup)",
    );
  });

  it("re-exports the single AI_CATEGORY_PREFIX source", () => {
    expect(AI_CATEGORY_PREFIX).toBe("AI: ");
    expect(buildRoutingCategory("triage").startsWith(AI_CATEGORY_PREFIX)).toBe(
      true,
    );
  });
});

describe("routing-category — mergeRoutingCategory (strip-stale-AI)", () => {
  it("strips a stale `AI: held → storingen` and replaces it with `AI: routed → storingen`", () => {
    expect(
      mergeRoutingCategory(
        ["Klant", "AI: held → storingen"],
        "forwarded",
        "storingen",
      ),
    ).toEqual(["Klant", "AI: routed → storingen"]);
  });

  it("preserves user categories in original order; AI: label appended last", () => {
    expect(
      mergeRoutingCategory(
        ["Zeta", "Alpha", "AI: stale", "Mu"],
        "held",
        "verkoop",
      ),
    ).toEqual(["Zeta", "Alpha", "Mu", "AI: held → verkoop"]);
  });

  it("is idempotent — re-merging the same routing yields no duplicate, order stable", () => {
    expect(
      mergeRoutingCategory(["AI: routed → storingen"], "forwarded", "storingen"),
    ).toEqual(["AI: routed → storingen"]);
  });

  it("strips ALL AI:-prefixed entries (defensive against historic double-writes)", () => {
    expect(
      mergeRoutingCategory(["AI: old_a", "Keep me", "AI: old_b"], "triage"),
    ).toEqual(["Keep me", "AI: triage"]);
  });
});
