# Stage 1 -- Regex Classifier (Routing)

> **Status:** RFC (Phase 63). Implements the routing pattern using the already-shipped `swarm_categories` registry.
> **Today-state:** SHIPPED for the debtor-email swarm. Worked example below uses real category keys.

## Goal

Deterministically classify an inbound message into a `category_key` (e.g. `auto_reply`, `payment_admittance`, `unknown`). Cheap, fast, auditable. The classifier returns `{category, confidence, matchedRule}`; no LLM, no I/O. Categories that match a known noise template (auto-replies, OoO, payment confirmations) are routed straight to `categorize_archive`. The `unknown` bucket falls through to Stage 2 + Stage 3 for entity enrichment and intent reasoning.

## Anthropic Pattern Mapping

This is Anthropic's "routing" pattern: classify input, then dispatch to a specialised follow-up (`https://www.anthropic.com/engineering/building-effective-agents`). The dispatch switch is the `swarm_categories.action` column -- `categorize_archive` versus `swarm_dispatch`. The classifier picks a category; the registry decides what happens next. No LLM is involved at the routing decision; the LLM only enters the picture when `swarm_dispatch` fans out to a Stage 2/3/4 chain.

## Architecture

```
inbound (post Stage 0)
        ↓
┌──────────────────────┐
│ Stage 1: regex match │  -> {category, confidence, matchedRule}
└──────────┬───────────┘
           ↓
┌──────────────────────────┐
│ swarm_categories lookup  │  (swarm_type, category_key) -> action
└──────────┬───────────────┘
           ↓
   ┌───────┴────────────────────────────────┐
   │                                        │
   ↓                                        ↓
categorize_archive               swarm_dispatch -> Stage 2 -> Stage 3 -> Stage 4
   (auto label + archive +
    queue cleanup automation)
                                            ↑
                                            │
                                  unknown ──┘ (fall-through)
```

## Today-State (Debtor-Email Worked Example)

### Reference implementation

[`web/lib/debtor-email/classify.ts`](../../web/lib/debtor-email/classify.ts) is the canonical Stage 1 implementation: pure regex rules ordered by specificity, first match wins, returns `{category, confidence, matchedRule}`. No LLM, no I/O.

### Dispatch worker

[`web/lib/inngest/functions/classifier-verdict-worker.ts`](../../web/lib/inngest/functions/classifier-verdict-worker.ts) loads the matching `swarm_categories` row for `(swarm_type='debtor-email', category_key=<x>)` and switches on `swarm_categories.action`: `categorize_archive` bundles three side effects (Outlook label + Outlook archive + queue iController cleanup `automation_run`); `swarm_dispatch` emits the Inngest event named in `swarm_categories.swarm_dispatch` to wake the per-category handler chain.

### Category registry

`public.swarm_categories` is the dispatch table: one row per `(swarm_type, category_key)` carrying `action` (`categorize_archive` | `swarm_dispatch`), `outlook_label`, and `swarm_dispatch` (the Inngest event name fired on dispatch). Adding a new category for a swarm is a registry insert; no code change.

### Real category keys

Verified at write-time from [`web/lib/debtor-email/classify.ts`](../../web/lib/debtor-email/classify.ts):

- `auto_reply` -- system-sender + automated subject patterns.
- `ooo_temporary` -- temporary out-of-office indicators.
- `ooo_permanent` -- permanent out-of-office (mailbox retired, person left).
- `payment_admittance` -- bank / AP-system payment confirmations.
- `unknown` -- no rule matched; falls through to Stage 2 + Stage 3.

The first four route to `categorize_archive`. `unknown` is the only key that hands off to the LLM stages of the funnel.

## Sales-Email Parallel Block

Sales-email is Phase 73; the actual category vocabulary ships there. Illustrative-only categories the same registry shape would carry: `new_lead`, `follow_up`, `unsubscribe`. Each row in `swarm_categories` would carry the same `(action, outlook_label, swarm_dispatch)` columns; the routing pattern is identical. *(illustrative -- Phase 73 ships actual sales-email categories)*

## Override Capture

Axis 1 of the override model is the override surface for this stage. Operators correct a wrong category in the Bulk Review UI; the dropdown writes `agent_runs.corrected_category` and the up/down vote on the matching rule writes `agent_runs.human_verdict`. See [`./override-model.md#axis-1--wrong-category-stage-1`](./override-model.md#axis-1----wrong-category-stage-1) for the full axis definition and forward-reference to the consolidated 4-axis Bulk Review surface (Phase 71).

## Graduated Automation

Axis 1 signals feed the regex-rule promotion hook: a candidate rule accumulates the per-rule binomial sample, and the Wilson-CI gate (thresholds in code, deliberately not in this RFC) flips the rule from candidate to live once the lower bound clears. See [`./graduated-automation.md#hook-taxonomy`](./graduated-automation.md#hook-taxonomy). Phase 56's sender-mapping promotion is the working precedent.

## Implementation Patterns (link out)

- [`../zapier-patterns.md`](../zapier-patterns.md) -- registry-driven routing, `zapier_tools` shape that the same one-row-per-thing pattern applies to elsewhere in the funnel.
- [`../inngest-patterns.md`](../inngest-patterns.md) -- the dispatch worker pattern: side effects in `step.run()`, durable replay semantics.

## Forward References

- Registry-driven `swarms.entity_brand` unification -- Phase 68 (SWRM-01). Today's per-mailbox brand identity (`debtor.labeling_settings.brand_id` + `nxt_database`) becomes a denormalised read-model.
- Concrete promotion thresholds for the regex-rule hook -- Phase 71 (LERN-01..05). This RFC documents the principle, not the numbers.
- `swarm_intents` table -- Phase 68 (SWRM-02), used by Stage 3 dispatch downstream of `unknown` fall-through.

## See Also

- [`./README.md`](./README.md) -- RFC entry point.
- [`./stage-0-safety.md`](./stage-0-safety.md) -- the previous stage in the funnel.
- [`./stage-2-entity.md`](./stage-2-entity.md) -- where the `unknown` bucket falls through to.
- [`./override-model.md`](./override-model.md) -- axis 1 captures Stage 1 corrections.
- [`./graduated-automation.md`](./graduated-automation.md) -- the regex-rule promotion hook consumes axis 1 signals.
