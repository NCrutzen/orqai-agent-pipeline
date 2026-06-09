/**
 * Phase 113 Plan 05 Task 2 — fixture tests for the sales Stage 3 dead-letter
 * reconciliation (AI-SPEC §5 D1 / STAGE3-03 / T-113-08). Drives the PURE
 * reconcileDeadLetters() with fixtures so the zero-dead-letter contract is CI-
 * provable without a live DB.
 */

import { describe, it, expect } from "vitest";
import {
  reconcileDeadLetters,
  type EnteredEmail,
  type TerminalSets,
} from "../sales-stage3-deadletter-check";

const entered = (...ids: string[]): EnteredEmail[] =>
  ids.map((email_id) => ({ email_id }));

const empty: TerminalSets = {
  stage3VerdictEmailIds: [],
  routingHeldEmailIds: [],
  terminalAgentRunEmailIds: [],
};

describe("reconcileDeadLetters — zero silent dead-letters (D1)", () => {
  it("gap=0 when every entered email has a terminal Stage-3 state (verdict)", () => {
    const r = reconcileDeadLetters(entered("a", "b", "c"), {
      ...empty,
      stage3VerdictEmailIds: ["a", "b", "c"],
    });
    expect(r.gap).toBe(0);
    expect(r.entered).toBe(3);
    expect(r.terminal).toBe(3);
    expect(r.orphanEmailIds).toEqual([]);
  });

  it("counts a ROUTING-HELD verdict as terminal-visible (NOT a dead-letter)", () => {
    // Held verdicts (Plan 05 gate) are visible in Bulk Review → terminal.
    const r = reconcileDeadLetters(entered("h1", "h2"), {
      ...empty,
      routingHeldEmailIds: ["h1", "h2"],
    });
    expect(r.gap).toBe(0);
    expect(r.terminal).toBe(2);
  });

  it("counts a Kanban human-lane (terminal agent_run) as terminal-visible", () => {
    const r = reconcileDeadLetters(entered("k1"), {
      ...empty,
      terminalAgentRunEmailIds: ["k1"],
    });
    expect(r.gap).toBe(0);
  });

  it("gap=1 + names the orphan when one entered email has NO terminal state", () => {
    const r = reconcileDeadLetters(entered("a", "orphan", "b"), {
      ...empty,
      stage3VerdictEmailIds: ["a", "b"],
    });
    expect(r.gap).toBe(1);
    expect(r.terminal).toBe(2);
    expect(r.orphanEmailIds).toEqual(["orphan"]);
  });

  it("union across all three terminal sources resolves the gap", () => {
    const r = reconcileDeadLetters(entered("v", "h", "k"), {
      stage3VerdictEmailIds: ["v"],
      routingHeldEmailIds: ["h"],
      terminalAgentRunEmailIds: ["k"],
    });
    expect(r.gap).toBe(0);
    expect(r.orphanEmailIds).toEqual([]);
  });

  it("de-dups a re-dispatched entered email (counts once)", () => {
    const r = reconcileDeadLetters(entered("dup", "dup", "x"), {
      ...empty,
      stage3VerdictEmailIds: ["dup", "x"],
    });
    expect(r.entered).toBe(2);
    expect(r.gap).toBe(0);
  });

  it("multiple orphans are sorted + fully enumerated", () => {
    const r = reconcileDeadLetters(entered("z", "m", "a"), empty);
    expect(r.gap).toBe(3);
    expect(r.orphanEmailIds).toEqual(["a", "m", "z"]);
  });
});
