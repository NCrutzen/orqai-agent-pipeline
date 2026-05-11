// Phase 80.1 Plan 01 — RED tests for triage-helper disambiguation.
//
// Surfaced by Phase 80 UAT (Issue #2): three different workers write
// `agent_runs.status='predicted'` carrying distinct `tool_outputs`
// markers, but `triageAgentFromStatus`/`triageStageFromStatus`
// currently only see the status string. Result: every `predicted` row
// is attributed to "Stage 3 Dispatcher" on the v7 KanbanBoard, which
// is wrong for Stage 1 and Stage 2 rows.
//
// Goal of the disambiguation (per
// .planning/phases/80.1-v7-kanban-assigned-agent-disambiguation/
//  80.1-01-disambiguate-triage-helpers-PLAN.md):
//
//  | tool_outputs marker key | Stage   | agent label              | stage  |
//  | ----------------------- | ------- | ------------------------ | ------ |
//  | intent_first_pass       | Stage 3 | "Stage 3 Dispatcher"     | progress
//  | handler_output          | Stage 2 | "Copy-Document Agent"    | progress
//  | stage1_category         | Stage 1 | "Screen Worker"          | progress
//  | (none)                  | unknown | "Pipeline"               | progress
//
import { describe, it, expect } from "vitest";
import {
  triageAgentFromStatus,
  triageStageFromStatus,
} from "../sync";

// Helpers below currently accept `(status: string)`. Once Plan 80.1-01
// Task 2 lands, the signature is `(row: { status; tool_outputs })`.
// In RED phase the tests still compile (TS cast) but assertions fail.
type TriageRow = { status: string; tool_outputs: Record<string, unknown> | null };

const callAgent = (row: TriageRow): string =>
  (triageAgentFromStatus as unknown as (r: TriageRow) => string)(row);

const callStage = (row: TriageRow): string =>
  (triageStageFromStatus as unknown as (r: TriageRow) => string)(row);

describe("triageAgentFromStatus — predicted-row disambiguation", () => {
  it("Stage 3 marker (intent_first_pass) → 'Stage 3 Dispatcher'", () => {
    expect(
      callAgent({
        status: "predicted",
        tool_outputs: { intent_first_pass: { picked_intent: "x" } },
      }),
    ).toBe("Stage 3 Dispatcher");
  });

  it("Stage 2 marker (handler_output) → 'Copy-Document Agent'", () => {
    expect(
      callAgent({
        status: "predicted",
        tool_outputs: { handler_output: { drafted: true } },
      }),
    ).toBe("Copy-Document Agent");
  });

  it("Stage 1 marker (stage1_category) → 'Screen Worker'", () => {
    expect(
      callAgent({
        status: "predicted",
        tool_outputs: { stage1_category: "out_of_office" },
      }),
    ).toBe("Screen Worker");
  });

  it("predicted without recognized marker → 'Pipeline' catch-all", () => {
    expect(
      callAgent({
        status: "predicted",
        tool_outputs: null,
      }),
    ).toBe("Pipeline");
  });
});

describe("triageStageFromStatus — predicted maps to 'progress' for every Stage marker", () => {
  it("intent_first_pass marker → 'progress'", () => {
    expect(
      callStage({
        status: "predicted",
        tool_outputs: { intent_first_pass: {} },
      }),
    ).toBe("progress");
  });

  it("handler_output marker → 'progress'", () => {
    expect(
      callStage({
        status: "predicted",
        tool_outputs: { handler_output: {} },
      }),
    ).toBe("progress");
  });

  it("stage1_category marker → 'progress'", () => {
    expect(
      callStage({
        status: "predicted",
        tool_outputs: { stage1_category: "out_of_office" },
      }),
    ).toBe("progress");
  });
});
