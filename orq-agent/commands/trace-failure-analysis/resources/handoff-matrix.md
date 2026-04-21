# Handoff Matrix

This reference is consumed by `/orq-agent:trace-failure-analysis` Step 7. After Step 6 classifies every mode, the report renders one handoff row per mode using this matrix.

## Classification → next skill

| Classification | Recommended next skill | Rationale | Phase notes |
|----------------|------------------------|-----------|-------------|
| specification | `/orq-agent:prompt` | Prompt engineering fix — rewrite the system prompt to eliminate ambiguity or add the missing constraint. | Phase 41 `/orq-agent:optimize-prompt` will offer a structured 11-guideline rewrite when shipped. |
| generalization-code-checkable | `/orq-agent:harden` (evaluator + guardrail) | The failure is code-verifiable, so an automated evaluator can guard production against regression. Promote to runtime guardrail once TPR/TNR ≥ 90% (Phase 42 EVLD-08). | Pair with `/orq-agent:test` to build the test dataset first. |
| generalization-subjective | `/orq-agent:harden` (LLM-judge evaluator) + Annotation Queue | Requires LLM-as-judge evaluator + ≥100 human labels to validate TPR/TNR (Phase 42 EVLD-04..08). Cannot promote to runtime guardrail without validation. | Use Orq.ai Annotation Queue to collect balanced Pass/Fail labels. |
| trivial-bug | (none — developer fix) | Out of AI-platform scope. Log a bug ticket, fix the integration/config, move on. | Do NOT build an evaluator for plumbing bugs — it masks the real issue. |

## Multi-mode reports

When the final taxonomy mixes categories, the report lists handoffs in priority order:

1. `trivial-bug` first — infrastructure failures block everything downstream.
2. `specification` second — prompt fixes are cheap and eliminate the need for evaluators downstream.
3. `generalization-code-checkable` third — automated evaluators catch the rest.
4. `generalization-subjective` last — requires human labels, longest-lead fix.

## When no handoff applies

If a mode's classification is ambiguous after Step 6, the user should re-run axial coding with narrower category definitions. Do NOT emit a report with unclassified modes — the report's whole value is the handoff recommendation.
