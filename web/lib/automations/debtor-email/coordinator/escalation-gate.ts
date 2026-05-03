// Phase 65 (D-09) — pure tri-state escalation gate (CORD-02).
//
// Order of checks is load-bearing:
//   1. low_confidence  (ranked[0].confidence === 'low')
//   2. high_intent_count (ranked.length >= 3)
//   3. requires_orchestration_flag (any ranked[i].intent flagged in registry)
//   4. else → single_shot
//
// Pure function: no DB, no LLM, no I/O. Testable in isolation.

import type { IntentAgentOutputV2 } from "../triage/types";
import type { SwarmCategoryRow } from "@/lib/swarms/types";

export type EscalationDecision =
  | { kind: "single_shot" }
  | {
      kind: "orchestrator";
      reason:
        | "low_confidence"
        | "high_intent_count"
        | "requires_orchestration_flag";
    };

export function evaluateEscalationGate(
  output: IntentAgentOutputV2,
  categories: SwarmCategoryRow[],
): EscalationDecision {
  // 1. low_confidence checked FIRST — a low-confidence top-1 always escalates,
  //    even when ranked.length >= 3 (priority test in escalation-gate.test.ts).
  if (output.ranked[0].confidence === "low") {
    return { kind: "orchestrator", reason: "low_confidence" };
  }

  // 2. high_intent_count — coordinator returned 3+ candidate intents.
  if (output.ranked.length >= 3) {
    return { kind: "orchestrator", reason: "high_intent_count" };
  }

  // 3. requires_orchestration registry flag — any candidate intent whose
  //    swarm_categories row is flagged forces orchestrator path.
  const flagged = output.ranked.some(
    (r) =>
      categories.find((c) => c.category_key === r.intent)
        ?.requires_orchestration === true,
  );
  if (flagged) {
    return { kind: "orchestrator", reason: "requires_orchestration_flag" };
  }

  // 4. Fast path: single-shot dispatch via swarm_categories.swarm_dispatch.
  return { kind: "single_shot" };
}
