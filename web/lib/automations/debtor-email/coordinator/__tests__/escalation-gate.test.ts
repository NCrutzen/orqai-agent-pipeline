/**
 * Phase 65 Plan 03 — CORD-02 evaluateEscalationGate (pure function).
 * No mocks; pure input/output contract.
 */
import { describe, it, expect } from "vitest";
import { evaluateEscalationGate } from "../escalation-gate";
import type { IntentAgentOutputV2 } from "../types";
import type { SwarmIntentRow } from "@/lib/swarms/types";

const baseEntry = {
  document_reference: null,
  sub_type: null,
  reasoning: "r",
} as const;

function buildOutput(
  ranked: IntentAgentOutputV2["ranked"],
): IntentAgentOutputV2 {
  return {
    ranked,
    language: "nl",
    urgency: "normal",
    intent_version: "2026-05-01.v2",
  };
}

// Phase 80 Plan 02 — escalation gate now reads requires_orchestration from
// swarm_intents (Stage 3), not swarm_noise_categories (Stage 1).
function buildIntent(
  key: string,
  requires_orchestration: boolean,
): SwarmIntentRow {
  return {
    swarm_type: "debtor-email",
    intent_key: key,
    handler_agent_key: null,
    handler_event: `debtor-email/${key}.requested`,
    handler_status: "registered",
    requires_orchestration,
    created_at: "2026-05-08T00:00:00Z",
    updated_at: "2026-05-08T00:00:00Z",
  };
}

describe("CORD-02 evaluateEscalationGate", () => {
  it("ranked[0].confidence='low' → orchestrator/low_confidence", () => {
    const output = buildOutput([
      { intent: "copy_document_request", confidence: "low", ...baseEntry },
    ]);
    const decision = evaluateEscalationGate(output, []);
    expect(decision).toEqual({ kind: "orchestrator", reason: "low_confidence" });
  });

  it("ranked.length >= 3 (all high) → orchestrator/high_intent_count", () => {
    const output = buildOutput([
      { intent: "copy_document_request", confidence: "high", ...baseEntry },
      { intent: "address_change", confidence: "high", ...baseEntry },
      { intent: "general_inquiry", confidence: "high", ...baseEntry },
    ]);
    const decision = evaluateEscalationGate(output, []);
    expect(decision).toEqual({
      kind: "orchestrator",
      reason: "high_intent_count",
    });
  });

  it("requires_orchestration=true on top-1 intent → orchestrator/requires_orchestration_flag", () => {
    const output = buildOutput([
      { intent: "payment_dispute", confidence: "high", ...baseEntry },
    ]);
    const intents = [buildIntent("payment_dispute", true)];
    const decision = evaluateEscalationGate(output, intents);
    expect(decision).toEqual({
      kind: "orchestrator",
      reason: "requires_orchestration_flag",
    });
  });

  it("single high-confidence intent + requires_orchestration=false → single_shot", () => {
    const output = buildOutput([
      { intent: "copy_document_request", confidence: "high", ...baseEntry },
    ]);
    const intents = [buildIntent("copy_document_request", false)];
    const decision = evaluateEscalationGate(output, intents);
    expect(decision).toEqual({ kind: "single_shot" });
  });

  it("priority: ranked.length=3 with first confidence='low' → orchestrator/low_confidence (NOT high_intent_count)", () => {
    const output = buildOutput([
      { intent: "copy_document_request", confidence: "low", ...baseEntry },
      { intent: "address_change", confidence: "high", ...baseEntry },
      { intent: "general_inquiry", confidence: "high", ...baseEntry },
    ]);
    const decision = evaluateEscalationGate(output, []);
    expect(decision).toEqual({ kind: "orchestrator", reason: "low_confidence" });
  });
});
