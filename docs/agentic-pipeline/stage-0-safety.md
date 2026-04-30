# Stage 0 -- Input Safety

> **Status:** RFC (Phase 63). Forward-references Phase 64 (SAFE-01..04).
> **Today-state:** NOT YET SHIPPED. This document defines the target shape; the implementation lands in Phase 64.

## Goal

Filter prompt-injection attempts and clearly malicious inputs before any downstream LLM stage runs. Stage 0 sits in front of the regex classifier and emits one of three verdicts: `safe` (proceed to Stage 1), `injection_suspected` (route to a human-only review surface; never reach a coordinator or handler), `over_budget` (reject under per-run token + cost ceilings). The point is to keep prompt-injection content out of any context that an LLM sees later in the funnel.

## Anthropic Pattern Mapping

Stage 0 is a Constitutional Classifier sitting in front of the chained workflow. Anthropic's *Building Effective Agents* recommends starting with the simplest viable pattern and adding agentic complexity only when measurable improvements justify it (`https://www.anthropic.com/engineering/building-effective-agents`). Safety classification is the simplest viable thing that has to happen first: a fast deterministic check, a lightweight LLM verdict only on the regex bucket that does not match a known-safe template, and no autonomous loops anywhere in this stage.

## Today-State

Stage 0 is **NOT YET SHIPPED**. Phase 64 implements the prompt-injection regex plus the lightweight LLM classifier under requirements `SAFE-01`..`SAFE-04` (see `.planning/REQUIREMENTS.md`). Per-run token + cost ceilings ship in the same phase under `BUDG-01`. Until then, inbound mail flows directly into Stage 1; this document defines the target shape so downstream phases (and Wave 2 stage docs) can cross-reference a stable contract.

## Architecture

```
┌──────────────┐      ┌─────────────────────┐      ┌──────────────────┐
│ inbound mail │ ───> │ Stage 0: safety     │ ───> │ Stage 1 (regex)  │
│   (raw)      │      │  - regex injection  │      └──────────────────┘
└──────────────┘      │  - LLM verdict (opt)│
                      └────────┬────────────┘
                               │ injection_suspected
                               v
                      ┌─────────────────────┐
                      │ human-only review   │
                      │ (no downstream LLM) │
                      └─────────────────────┘
```

Stage 0 runs both a regex pass and an LLM verdict pass on every inbound email. The two layers are independent — regex provides a deterministic, free audit trail and seeds graduated-automation telemetry, while the LLM verdict (Haiku-class via Orq.ai Router) provides the binding classification. They both always run, and both contribute to the per-email cost surfaced as override axis 4. Rationale (Phase 64 D-01): a uniform per-email cost signal is more valuable than the marginal cost saved by skipping Haiku on regex-clear emails (~€0.0003/email). `over_budget` short-circuits the whole pipeline when the per-run ceiling has already been spent on retries earlier in the same conversation.

> Updated 2026-04-30 in Phase 64 (D-02): the previous RFC paragraph gated the verdict on regex outcome; that wording has been superseded by uniform LLM-on-every-email.

## Decision Surface

- `safe` -> Stage 1 (regex classifier).
- `injection_suspected` -> human-only review surface; the message is flagged, persisted, and never enters the context of a Stage 3 coordinator or a Stage 4 handler. No LLM call downstream sees the body.
- `over_budget` -> reject. Forward-references Phase 64 `BUDG-01`: per-run token + cost ceilings stop the pipeline rather than spend without bound on a single conversation.

## Implementation Patterns (forward-ref)

The LLM verdict step follows the patterns already documented in [`../orqai-patterns.md`](../orqai-patterns.md): Orq.ai LLM Router with `response_format: json_schema` (prompt-only JSON returns are not acceptable), primary model `anthropic/claude-sonnet-4-6` plus 3-4 fallbacks, XML-tagged prompts (`<role>`, `<task>`, `<constraints>`, `<output_format>`), 45s client timeout. This document does not duplicate those rules; the implementation phase reads `orqai-patterns.md` directly.

## Forward References

- `SAFE-01`..`SAFE-04` implementation -- Phase 64. Ships the regex + lightweight LLM classifier and the `injection_suspected` review surface.
- `BUDG-01` per-run token + cost ceilings -- Phase 64. Powers the `over_budget` verdict.
- `pipeline_events` persistence target for Stage 0 verdicts -- Phase 70 (TELE-01).

## See Also

- [`./README.md`](./README.md) -- RFC entry point.
- [`./stage-1-regex.md`](./stage-1-regex.md) -- the next stage in the funnel.
- [`./override-model.md`](./override-model.md) -- axis 1 captures category overrides at Stage 1; Stage 0 has no override axis (a `safe`/`injection_suspected` decision is reviewed in the safety review surface itself, not the per-stage axes).
- [`./graduated-automation.md`](./graduated-automation.md) -- the promotion ladder Stage 0 verdicts feed in the long run (regex rules tightening over time).
