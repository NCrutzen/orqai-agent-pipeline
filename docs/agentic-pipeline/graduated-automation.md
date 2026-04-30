# Graduated Automation: Promotion-Ladder Principles

> **Status:** RFC (Phase 63). Implements RFC-04. Locked decision D-12 -- principles + signal types only, NO concrete thresholds.
> **Cross-link:** every hook consumes a signal documented in [`./override-model.md`](./override-model.md).

## Purpose

As patterns become deterministic, narrow the LLM's responsibility surface. Promotion direction is one-way: an LLM-handled decision is graduated **down** to a deterministic rule; deterministic rules never graduate up to LLM handling. This is the agentic-pipeline equivalent of Anthropic's evaluator-optimizer pattern (paraphrased): operator overrides act as the evaluator signal, and the promotion machinery acts as the optimizer that proposes deterministic rules from clusters of evaluator signal. See `https://www.anthropic.com/engineering/building-effective-agents` for the canonical workflow-vs-agent distinction this approach rests on.

## Hook Taxonomy

| Hook name | Stage | Telemetry signal consumed | Promotion direction |
|---|---|---|---|
| regex-rule promotion | Stage 1 | Axis 1 overrides over a sample window | LLM-handled `unknown` bucket -> new regex rule |
| sender-mapping promotion | Stage 2 | Axis 2 approve/reject signals | LLM-aided sender lookup -> deterministic sender->customer map |
| prompt-tune trigger | Stage 3 | Axis 3 intent corrections clustered by pattern | prompt revision proposal queued for human review |
| handler-replacement / prompt-tune | Stage 4 | Axis 4 `draft_quality` + `feedback_reason` clusters | prompt revision OR handler-agent swap proposal |

## Working Precedent -- Wilson-CI Sender-Mapping (Phase 56)

Phase 56's sender-mapping promotion is the working precedent for graduated automation in this codebase. A binomial confidence interval over operator approve/reject signals gates promotion from candidate to live: a `sender -> customer` mapping starts as an LLM-aided lookup, accumulates operator signal as emails flow through, and once the lower bound of the interval clears the configured gate the mapping flips to deterministic. Demotion uses hysteresis (a different, lower bound) so a mapping that was good and went stale flips back to candidate without flapping.

Concrete thresholds live in code at `web/lib/classifier/wilson.ts` and tune with phase as we learn what the right gate is for each kind of signal. **This RFC deliberately does not pin numbers.** Phase 71 (Learning Inbox / promotion recommender) catalogues thresholds across all hooks once cross-stage telemetry from `pipeline_events` exists to compare them against ground truth.

## Anthropic Mapping

The workflow-vs-agent distinction is the conceptual basis: workflows give predictability and low cost on well-scoped tasks; agentic flexibility is paid for in cost and unpredictability. The graduated-automation ladder is how we move work in the cheap direction as soon as the data justifies it. The evaluator-optimizer pattern maps cleanly: operator overrides are the evaluator signal, and the promotion recommender (Phase 72) is the optimizer that proposes deterministic rules from clustered evaluator signal. The recommender does not auto-apply -- a human accepts each promotion via the Learning Inbox -- which keeps the loop bounded the way Anthropic's guidance recommends for evaluator-optimizer setups that touch production behavior.

## Forward References

- Concrete thresholds for every hook -- Phase 71 (LERN-01..05).
- Promotion recommender (clusters operator signal into deterministic-rule proposals; routes through Learning Inbox) -- Phase 72.
- `pipeline_events` as the single source of truth for promotion math -- Phase 70 (TELE-01).

## See Also

- [`./README.md`](./README.md) -- RFC entry point.
- [`./override-model.md`](./override-model.md) -- the four override axes whose signals feed these hooks.
- [`./stage-1-regex.md`](./stage-1-regex.md)
- [`./stage-2-entity.md`](./stage-2-entity.md)
- [`./stage-3-coordinator.md`](./stage-3-coordinator.md)
- [`./stage-4-handler.md`](./stage-4-handler.md)
