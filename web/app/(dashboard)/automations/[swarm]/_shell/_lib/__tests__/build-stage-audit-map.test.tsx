// Phase 82.3 Plan 11 — RED tests for buildStageAuditMap.
// HARD-SEPARATION LOCK (docs/agentic-pipeline/README.md):
//   - Stage 1 mapper writes `rule_key` only (swarm_noise_categories ∪ "unknown").
//   - Stage 3 mapper writes `ranked_intents[].intent_key` only (swarm_intents).
//   - Tests assert these never cross-populate.

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { buildStageAuditMap } from "../build-stage-audit-map";

interface TimelineEvent {
  id: string;
  created_at: string;
  swarm_type: string;
  stage: number;
  email_id: string | null;
  decision: string;
  confidence: number | null;
  decision_details: Record<string, unknown> | null;
  override?: Record<string, unknown> | null;
  eval_type?: "capability" | "regression" | null;
  triggered_by?: string | null;
}

function mkEvent(stage: number, details: Record<string, unknown>): TimelineEvent {
  return {
    id: `evt-${stage}`,
    created_at: "2026-05-13T00:00:00Z",
    swarm_type: "debtor-email",
    stage,
    email_id: "email-1",
    decision: "auto",
    confidence: 0.9,
    decision_details: details,
    override: null,
    eval_type: null,
    triggered_by: "pipeline",
  };
}

describe("buildStageAuditMap", () => {
  it("complete fixture: all four stages → map has keys 0,1,2,3", () => {
    const map = buildStageAuditMap({
      timeline: [
        mkEvent(0, {
          regex_patterns_fired: ["pat-a"],
          llm_injection_verdict: "clean",
          llm_reasoning: "ok",
          budget_headroom_cents: 1234,
        }),
        mkEvent(1, { rule_key: "unknown", confidence: 0.8 }),
        mkEvent(2, {}),
        mkEvent(3, {}),
      ],
      agentRuns: [
        {
          stage: 1,
          context: null,
          tool_outputs: { reasoning: "llm pass-2 reasoning" },
        },
        {
          stage: 2,
          context: {
            identifier_source: "thread",
            confidence: "high",
            top_candidates: [
              { account_id: "acc-1", name: "Acme NV", score: 0.91 },
            ],
          },
          tool_outputs: null,
        },
        {
          stage: 3,
          context: null,
          tool_outputs: {
            ranked_intents: [
              { intent_key: "payment_admittance", confidence: 0.88 },
              { intent_key: "dispute", confidence: 0.42 },
            ],
            selected_intent_key: "payment_admittance",
            coordinator_reasoning: "payment cues dominate",
          },
        },
      ],
      automationRun: {
        result: {
          screenshots: {
            before: "screenshots/before_before.png",
            after: "screenshots/after_after.png",
          },
        },
      },
    });

    expect(Object.keys(map).sort()).toEqual(["0", "1", "2", "3"]);
    expect(map[0]).toBeTruthy();
    expect(map[1]).toBeTruthy();
    expect(map[2]).toBeTruthy();
    expect(map[3]).toBeTruthy();
  });

  it("Stage 0 only: omits keys 1, 2, 3", () => {
    const map = buildStageAuditMap({
      timeline: [
        mkEvent(0, {
          regex_patterns_fired: [],
          llm_injection_verdict: "clean",
        }),
      ],
      agentRuns: [],
      automationRun: null,
    });
    expect(Object.keys(map)).toEqual(["0"]);
  });

  it("Stage 1 Pass-1 regex (no agent_run for stage=1) → predictor_source='regex', no LLM reasoning", () => {
    const map = buildStageAuditMap({
      timeline: [mkEvent(1, { rule_key: "out_of_office", confidence: 0.95 })],
      agentRuns: [],
      automationRun: null,
    });
    const { container } = render(<>{map[1]}</>);
    // degraded copy renders when predictor=regex, reasoning=null
    expect(container.textContent).toContain(
      "Regex Pass-1 matched — no LLM reasoning produced.",
    );
    // predictor chip
    const predictorChip = container.querySelector(
      '[data-testid="stage1-predictor-chip"]',
    );
    expect(predictorChip?.textContent).toBe("regex");
  });

  it("Stage 1 Pass-2 LLM (agent_run for stage=1 with reasoning) → predictor_source='llm'", () => {
    const map = buildStageAuditMap({
      timeline: [mkEvent(1, { rule_key: "unknown", confidence: 0.65 })],
      agentRuns: [
        {
          stage: 1,
          context: null,
          tool_outputs: { reasoning: "LLM said this is unknown" },
        },
      ],
      automationRun: null,
    });
    const { container } = render(<>{map[1]}</>);
    const predictorChip = container.querySelector(
      '[data-testid="stage1-predictor-chip"]',
    );
    expect(predictorChip?.textContent).toBe("llm");
    expect(container.textContent).toContain("LLM said this is unknown");
  });

  it("Stage 2 unresolved → locked unresolved copy", () => {
    const map = buildStageAuditMap({
      timeline: [mkEvent(2, {})],
      agentRuns: [
        {
          stage: 2,
          context: {
            identifier_source: "unresolved",
            top_candidates: [],
          },
          tool_outputs: null,
        },
      ],
      automationRun: null,
    });
    const { container } = render(<>{map[2]}</>);
    expect(container.textContent).toContain(
      "Customer could not be resolved. No candidates returned.",
    );
  });

  it("Stage 2 missing screenshots → locked no-capture copy", () => {
    const map = buildStageAuditMap({
      timeline: [mkEvent(2, {})],
      agentRuns: [
        {
          stage: 2,
          context: {
            identifier_source: "thread",
            confidence: "high",
            top_candidates: [
              { account_id: "a", name: "x", score: 0.5 },
            ],
          },
          tool_outputs: null,
        },
      ],
      automationRun: { result: {} },
    });
    const { container } = render(<>{map[2]}</>);
    expect(container.textContent).toContain(
      "No iController capture for this run.",
    );
  });

  it("Stage 3 with 5 ranked_intents → all 5 in payload", () => {
    const map = buildStageAuditMap({
      timeline: [mkEvent(3, {})],
      agentRuns: [
        {
          stage: 3,
          context: null,
          tool_outputs: {
            ranked_intents: [
              { intent_key: "a", confidence: 0.9 },
              { intent_key: "b", confidence: 0.8 },
              { intent_key: "c", confidence: 0.7 },
              { intent_key: "d", confidence: 0.6 },
              { intent_key: "e", confidence: 0.5 },
            ],
            selected_intent_key: "a",
            coordinator_reasoning: "five",
          },
        },
      ],
      automationRun: null,
    });
    const { container } = render(<>{map[3]}</>);
    // 5 intent_key strings should be present in DOM
    for (const k of ["a", "b", "c", "d", "e"]) {
      expect(container.textContent).toContain(k);
    }
  });

  it("malformed JSONB → defaults applied, no throw", () => {
    expect(() => {
      const map = buildStageAuditMap({
        timeline: [
          {
            id: "evt",
            created_at: "2026-05-13T00:00:00Z",
            swarm_type: "debtor-email",
            stage: 0,
            email_id: "e",
            decision: "auto",
            confidence: null,
            decision_details: { random: "garbage" } as Record<string, unknown>,
          },
        ],
        agentRuns: [
          {
            stage: 1,
            context: null,
            tool_outputs: { reasoning: 42 as unknown as string },
          },
          {
            stage: 2,
            context: { identifier_source: "weird-source", top_candidates: "not-an-array" } as unknown as Record<string, unknown>,
            tool_outputs: null,
          },
          {
            stage: 3,
            context: null,
            tool_outputs: { ranked_intents: "not-an-array" } as unknown as Record<string, unknown>,
          },
        ],
        automationRun: { result: { screenshots: "not-an-object" } as unknown as Record<string, unknown> },
      });
      // Should not throw on any access
      expect(map).toBeDefined();
    }).not.toThrow();
  });

  it("hard-separation guardrail: Stage 1 panel DOM never contains 'intent_key'; Stage 3 never contains 'rule_key'", () => {
    const map = buildStageAuditMap({
      timeline: [
        mkEvent(1, { rule_key: "out_of_office", confidence: 0.9 }),
        mkEvent(3, {}),
      ],
      agentRuns: [
        {
          stage: 1,
          context: null,
          tool_outputs: { reasoning: "noise-filter said OoO" },
        },
        {
          stage: 3,
          context: null,
          tool_outputs: {
            ranked_intents: [{ intent_key: "payment_admittance", confidence: 0.9 }],
            selected_intent_key: "payment_admittance",
            coordinator_reasoning: "ok",
          },
        },
      ],
      automationRun: null,
    });

    const stage1Render = render(<>{map[1]}</>);
    expect(stage1Render.container.textContent ?? "").not.toContain("intent_key");
    stage1Render.unmount();

    const stage3Render = render(<>{map[3]}</>);
    expect(stage3Render.container.textContent ?? "").not.toContain("rule_key");
    stage3Render.unmount();
  });
});
