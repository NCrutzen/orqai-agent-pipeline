// Phase 65-05 Task 2 — TDD test for loadCoordinatorRunsForReview.
//
// Three locked behaviours:
//   1. Empty input array short-circuits (no DB call, returns empty Map).
//   2. Returns a Map keyed by automation_run_id with the three fields exposed
//      from coordinator_runs (escalation_decision, escalation_reason, partial_synthesis).
//      Ids that don't have a coordinator_runs row simply aren't in the Map.
//   3. Supabase error throws.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Chainable query-builder mock ----------------------------------------

interface MockBuilder {
  _selectCols: string | null;
  _inCalls: Array<{ col: string; val: unknown[] }>;
  select: (cols: string) => MockBuilder;
  in: (col: string, val: unknown[]) => Promise<{ data: unknown; error: unknown }>;
}

function makeBuilder(
  resolveValue: { data: unknown; error: unknown },
): MockBuilder {
  const b: Partial<MockBuilder> = {};
  b._selectCols = null;
  b._inCalls = [];
  b.select = (cols: string) => {
    b._selectCols = cols;
    return b as MockBuilder;
  };
  b.in = async (col: string, val: unknown[]) => {
    b._inCalls!.push({ col, val });
    return resolveValue;
  };
  return b as MockBuilder;
}

let builder: MockBuilder;
let fromCalls: string[];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      fromCalls.push(table);
      return builder;
    },
  }),
}));

beforeEach(() => {
  fromCalls = [];
  builder = makeBuilder({ data: [], error: null });
});

describe("loadCoordinatorRunsForReview", () => {
  it("returns empty Map and skips DB call when input is empty", async () => {
    const { loadCoordinatorRunsForReview } = await import(
      "../_lib/coordinator-runs-loader"
    );
    const result = await loadCoordinatorRunsForReview([]);
    expect(result.size).toBe(0);
    expect(fromCalls).toEqual([]);
  });

  it("returns Map keyed by automation_run_id with the three coordinator_runs fields", async () => {
    builder = makeBuilder({
      data: [
        {
          automation_run_id: "run-A",
          escalation_decision: "single_shot",
          escalation_reason: null,
          partial_synthesis: false,
        },
        {
          automation_run_id: "run-B",
          escalation_decision: "orchestrator",
          escalation_reason: "high_intent_count",
          partial_synthesis: true,
        },
      ],
      error: null,
    });

    const { loadCoordinatorRunsForReview } = await import(
      "../_lib/coordinator-runs-loader"
    );
    const result = await loadCoordinatorRunsForReview(["run-A", "run-B", "run-C"]);

    expect(fromCalls).toEqual(["coordinator_runs"]);
    expect(builder._inCalls).toEqual([
      { col: "automation_run_id", val: ["run-A", "run-B", "run-C"] },
    ]);
    expect(result.size).toBe(2);
    expect(result.get("run-A")).toEqual({
      escalation_decision: "single_shot",
      escalation_reason: null,
      partial_synthesis: false,
    });
    expect(result.get("run-B")).toEqual({
      escalation_decision: "orchestrator",
      escalation_reason: "high_intent_count",
      partial_synthesis: true,
    });
    // run-C had no coordinator_runs row — absent from Map (not undefined value).
    expect(result.has("run-C")).toBe(false);
  });

  it("throws when supabase returns an error", async () => {
    builder = makeBuilder({ data: null, error: { message: "boom" } });
    const { loadCoordinatorRunsForReview } = await import(
      "../_lib/coordinator-runs-loader"
    );
    await expect(
      loadCoordinatorRunsForReview(["run-A"]),
    ).rejects.toThrow(/boom/);
  });
});
