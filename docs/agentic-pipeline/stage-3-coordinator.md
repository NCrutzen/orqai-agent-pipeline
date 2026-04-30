# Stage 3 -- Intent Coordinator (Ranked-Intent + Stage 3.5 Escalation Placeholder)

> **Status:** RFC (Phase 63). Stage 3 ships in Phase 65 (CORD-01..04). The Stage 3.5 orchestrator-worker escalation is **principle + placeholder** here; full design lands in Phase 65.

## Goal

Take a `PipelineStageContext` from Stage 2 and produce a **ranked intent list** (CORD-01) ordered descending by confidence. The single-shot default handles the common case (~80%): top intent dispatches to a Stage 4 handler. Multi-intent or low-confidence emails escalate to Stage 3.5, an orchestrator-worker that fans out across handlers and synthesises a single response.

## Anthropic Pattern Mapping

Stage 3 sits inside Anthropic's prompt-chaining pattern (`https://www.anthropic.com/engineering/building-effective-agents`): it receives Stage 2's structured output and gates the Stage 4 dispatch. The escalation path -- Stage 3.5 -- is Anthropic's orchestrator-worker pattern: a coordinator LLM decomposes the work, dispatches to workers, and merges their outputs when fan-out is genuinely needed. The Anthropic guidance is explicit that orchestrator-worker is for cases where single-shot cannot cleanly synthesise the answer; this is exactly the multi-intent case here.

## Architecture

```
PipelineStageContext (from Stage 2)
        ↓
┌──────────────────────────┐
│ ranked intent list (LLM) │  -> [{intent, confidence}, ...] desc
└────────┬─────────────────┘
         ↓
┌──────────────────────────────────┐
│ confidence + intent_count check  │
└────────┬─────────────────────────┘
         ↓
   ┌─────┴────────────────────────────────────────┐
   │                                              │
   ↓ (top intent, single-shot)                   ↓ (escalate)
Stage 4 handler                       Stage 3.5 orchestrator-worker
                                      (Phase 65 -- full design)
```

## Input Contract

Stage 3 consumes `PipelineStageContext` per [`./context-shape-contract.md`](./context-shape-contract.md). This document does not duplicate the TypeScript interface.

## Output: Ranked Intent List

Per CORD-01, Stage 3 emits a list of `{intent, confidence}` objects ordered by confidence descending. The top intent dispatches to Stage 4 by default. The full ranked list is persisted (forward-ref Phase 70 `pipeline_events`) so eval logic and the Phase 71 Bulk Review surface can score the ranking, not just the top pick.

Implementation pattern: Orq.ai LLM Router with `response_format: json_schema` enforcing the ranked-list shape; primary model `anthropic/claude-sonnet-4-6` plus fallbacks; XML-tagged prompts; 45s client timeout. See [`../orqai-patterns.md`](../orqai-patterns.md) -- this document does not duplicate those rules.

## Sales-Email Parallel Block

Sales-email is Phase 73; the actual intent vocabulary ships there. Illustrative-only intents the same ranked-list shape would carry: `qualify_lead`, `schedule_demo`, `route_to_account_owner`. The coordinator pattern is identical: rank, gate on confidence + count, single-shot or escalate. *(illustrative -- Phase 73 ships actuals)*

## Stage 3.5 Escalation (Principle + Placeholder)

### Escalation conditions

```
ranked intent list
        ↓
┌───────────────────────────────────────┐
│ confidence < threshold ?              │
│   OR  intent_count >= 3 ?             │
│   OR  requires_orchestration flag ?   │
└────────┬──────────────────────────────┘
         │ any true
         ↓
   spawn orchestrator-worker
   (Phase 65 -- full design)
```

The threshold itself is **TBD Phase 71** -- this RFC deliberately does not pin numbers (D-12). `requires_orchestration` is a per-intent flag that some intents will set unconditionally because they always need fan-out (e.g. an email that has to update both NXT and iController in one response).

### Spawn orchestrator-worker

When any escalation condition is true, Stage 3 hands off to a Stage 3.5 orchestrator-worker -- see Phase 65 (CORD-02..04) for the full design. This RFC does not specify the orchestrator-worker mechanics; doing so would front-run Phase 65.

## Override Capture

Axis 3 of the override model is the override surface for this stage. **Today-state: NOT YET CAPTURED** -- Phase 65 ships the ranked-intent surface, and Phase 71 ships the Bulk Review override control that lets operators correct or reorder the ranked list. Until both land, axis 3 is described, not measured. See [`./override-model.md#axis-3--wrong-intent-stage-3`](./override-model.md#axis-3----wrong-intent-stage-3).

## Graduated Automation

Axis 3 signals feed the prompt-tune trigger hook: clusters of intent corrections (same kind of email, same kind of mistake) queue a prompt revision proposal that goes through the Learning Inbox before any prompt update is applied. See [`./graduated-automation.md#hook-taxonomy`](./graduated-automation.md#hook-taxonomy).

## Implementation Patterns (link out)

- [`../orqai-patterns.md`](../orqai-patterns.md) -- `response_format: json_schema`, fallback model chain, 45s client timeout. Stage 3 uses these patterns; this doc does not duplicate them.

## Forward References

- Stage 3.5 orchestrator-worker full design -- Phase 65 (CORD-02..04).
- Concrete confidence threshold for escalation -- Phase 71 (LERN-01..05). This RFC names the principle, not the number.
- `swarm_intents` table -- Phase 68 (SWRM-02). Today there is no canonical intent registry; intents are per-swarm strings.

## See Also

- [`./README.md`](./README.md) -- RFC entry point.
- [`./stage-2-entity.md`](./stage-2-entity.md) -- the producer of the input contract.
- [`./stage-4-handler.md`](./stage-4-handler.md) -- the consumer of the dispatched intent.
- [`./context-shape-contract.md`](./context-shape-contract.md) -- the input shape.
- [`./override-model.md`](./override-model.md) -- axis 3 captures Stage 3 corrections.
- [`./graduated-automation.md`](./graduated-automation.md) -- the prompt-tune trigger hook consumes axis 3 signals.
