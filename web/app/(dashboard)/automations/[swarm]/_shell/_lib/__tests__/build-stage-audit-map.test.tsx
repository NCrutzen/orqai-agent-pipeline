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

  // Phase 82.9 — discriminated Stage 2 evidence payload (D-01) + legacy fallback (D-04).
  // Exercises the mapper's 5 method arms + tolerant legacy branch via the rich
  // `decision_details.inputs` shape introduced by Phase 82.9 Plan 02.
  describe("Stage 2 — Phase 82.9 discriminated inputs", () => {
    function stage2Payload(map: ReturnType<typeof buildStageAuditMap>) {
      const node = map[2];
      // Existing tests in this file render the node; we want the typed payload
      // off the React element to assert structure directly. createElement
      // returns a ReactElement whose `.props` carries `{ payload }`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (node as any).props.payload as Record<string, any>;
    }

    it("thread_inheritance — populates prior_email_label_id + conversation_id", () => {
      const map = buildStageAuditMap({
        timeline: [
          mkEvent(2, {
            method: "thread_inheritance",
            customer_account_id: "cust-1",
            customer_name: "Acme",
            inputs: {
              prior_email_label_id: "label-uuid-1",
              conversation_id: "conv-1",
            },
          }),
        ],
        agentRuns: [],
        automationRun: null,
      });
      const payload = stage2Payload(map);
      expect(payload.inputs?.kind).toBe("thread_inheritance");
      expect(payload.inputs?.prior_email_label_id).toBe("label-uuid-1");
      expect(payload.inputs?.conversation_id).toBe("conv-1");
      expect(payload.candidates).toBeUndefined();
      expect(payload.reasoning).toBeNull();
    });

    it("sender_match — populates sender_email + candidates with contact_person + recent_invoices", () => {
      const map = buildStageAuditMap({
        timeline: [
          mkEvent(2, {
            method: "sender_match",
            customer_account_id: "cust-2",
            customer_name: "Beta",
            inputs: {
              sender_email: "x@y.com",
              candidates: [
                {
                  id: "cust-2",
                  name: "Beta",
                  contact_person: "Jane",
                  recent_invoices: ["INV-1", "INV-2"],
                },
              ],
            },
          }),
        ],
        agentRuns: [],
        automationRun: null,
      });
      const payload = stage2Payload(map);
      expect(payload.inputs?.kind).toBe("sender_match");
      expect(payload.inputs?.sender_email).toBe("x@y.com");
      expect(payload.candidates?.[0].contact_person).toBe("Jane");
      expect(payload.candidates?.[0].recent_invoices.length).toBe(2);
      expect(payload.reasoning).toBeNull();
    });

    it("identifier_match — populates matched_identifiers + candidates", () => {
      const map = buildStageAuditMap({
        timeline: [
          mkEvent(2, {
            method: "identifier_match",
            customer_account_id: "cust-3",
            customer_name: "Gamma",
            inputs: {
              matched_identifiers: ["INV-7", "INV-8"],
              candidates: [
                {
                  id: "cust-3",
                  name: "Gamma",
                  contact_person: null,
                  recent_invoices: [],
                },
              ],
            },
          }),
        ],
        agentRuns: [],
        automationRun: null,
      });
      const payload = stage2Payload(map);
      expect(payload.inputs?.kind).toBe("identifier_match");
      expect(payload.inputs?.matched_identifiers).toEqual(["INV-7", "INV-8"]);
      expect(payload.candidates?.length).toBe(1);
      expect(payload.candidates?.[0].contact_person).toBeNull();
    });

    it("llm_tiebreaker — populates llm_reason + candidates + reasoning field", () => {
      const map = buildStageAuditMap({
        timeline: [
          mkEvent(2, {
            method: "llm_tiebreaker",
            customer_account_id: "c1",
            customer_name: "C1",
            inputs: {
              sender_email: null,
              matched_identifiers: ["INV-9"],
              candidates: [
                {
                  id: "c1",
                  name: "C1",
                  contact_person: null,
                  recent_invoices: ["A", "B", "C", "D", "E"],
                },
              ],
              llm_reason: "Best match because foo.",
            },
          }),
        ],
        agentRuns: [],
        automationRun: null,
      });
      const payload = stage2Payload(map);
      expect(payload.inputs?.kind).toBe("llm_tiebreaker");
      expect(payload.reasoning).toBe("Best match because foo.");
      expect(payload.inputs?.llm_reason).toBe("Best match because foo.");
      expect(payload.candidates?.[0].recent_invoices.length).toBe(5);
    });

    it("llm_tiebreaker — recent_invoices over 5 are sliced to 5 (Tier-3 bound)", () => {
      const map = buildStageAuditMap({
        timeline: [
          mkEvent(2, {
            method: "llm_tiebreaker",
            customer_account_id: "c1",
            customer_name: "C1",
            inputs: {
              sender_email: null,
              matched_identifiers: [],
              candidates: [
                {
                  id: "c1",
                  name: "C1",
                  contact_person: null,
                  recent_invoices: ["1", "2", "3", "4", "5", "6", "7"],
                },
              ],
              llm_reason: "overflow",
            },
          }),
        ],
        agentRuns: [],
        automationRun: null,
      });
      const payload = stage2Payload(map);
      expect(payload.candidates?.[0].recent_invoices.length).toBe(5);
      expect(payload.candidates?.[0].recent_invoices[4]).toBe("5");
    });

    it("unresolved — populates sender_email + matched_identifiers, no candidates", () => {
      const map = buildStageAuditMap({
        timeline: [
          mkEvent(2, {
            method: "unresolved",
            customer_account_id: null,
            customer_name: null,
            inputs: {
              sender_email: "z@q.com",
              matched_identifiers: [],
            },
          }),
        ],
        agentRuns: [],
        automationRun: null,
      });
      const payload = stage2Payload(map);
      expect(payload.inputs?.kind).toBe("unresolved");
      expect(payload.inputs?.sender_email).toBe("z@q.com");
      expect(payload.inputs?.matched_identifiers).toEqual([]);
      expect(payload.candidates).toBeUndefined();
    });

    it("legacy row — decision_details.inputs absent → payload.inputs is null, no throw", () => {
      expect(() => {
        const map = buildStageAuditMap({
          timeline: [
            mkEvent(2, {
              method: "sender_match",
              customer_account_id: "cust-legacy",
              customer_name: "Legacy Co",
              candidates_considered: 2,
              // NO `inputs` key — legacy row (D-04)
            }),
          ],
          agentRuns: [],
          automationRun: null,
        });
        const payload = stage2Payload(map);
        // Loose equal — null OR undefined both acceptable.
        expect(payload.inputs ?? null).toBeNull();
        // Back-compat (Pitfall 4): top-level fields still populated.
        expect(payload.identifier_source).toBe("sender");
        expect(payload.top_candidates.length).toBeGreaterThan(0);
      }).not.toThrow();
    });
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
