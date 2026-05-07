# Stage 1 -- Noise Filter (Regex + LLM 2nd-pass)

> **Status:** RFC (Phase 63), evolved Phase 74 (LLM 2nd-pass). Implements the routing pattern using the `swarm_noise_categories` registry (renamed from `swarm_categories` to make purpose explicit).
> **Today-state:** SHIPPED for the debtor-email swarm.

## Goal

Filter inbound messages into one of two paths:
- **Noise** (auto-replies, out-of-office, payment confirmations) → `categorize_archive` terminal. Outlook label + archive. No human, no LLM intent reasoning.
- **Non-noise** → `unknown` → falls through to Stage 2 (entity enrichment) → Stage 3 (LLM intent classifier) → Stage 4 (handler).

Stage 1's job is **noise filtering only**. It does NOT decide intent — that's Stage 3's job. The closed category list at Stage 1 is therefore exclusively the noise list plus the `unknown` fall-through.

## Two-Pass Classification

Stage 1 runs in two passes:

1. **Pass 1 — Regex.** Pure deterministic rules ordered by specificity, first match wins. Returns `{category, confidence, matchedRule}`. No LLM, no I/O. See `web/lib/debtor-email/classify.ts`.

2. **Pass 2 — LLM (only when Pass 1 returned `unknown`).** A cross-cutting Orq agent (`stage-1-category-classifier`) is invoked with the closed noise-category list and asked: "did the regex miss noise?" Output: one of the noise keys, or `unknown`. The LLM's job is **noise recovery only** — it cannot pick intents like `payment_dispute` or `credit_request` because those keys are not in `swarm_noise_categories`.

Pass 2 was added in Phase 74 to recover OoO / auto-reply messages with formats the regex didn't anticipate. It exists at Stage 1 (not Stage 3) because noise is a fast, narrow, closed-list problem; promoting it to Stage 3 would waste the entity-enrichment + ranked-intent machinery on an email that just needs archiving.

## Anthropic Pattern Mapping

This is Anthropic's "routing" pattern with a two-step refiner: classify input, then dispatch (`https://www.anthropic.com/engineering/building-effective-agents`). The dispatch switch is the `swarm_noise_categories.action` column -- `categorize_archive` for noise versus `swarm_dispatch` (only `unknown` uses this) to forward to Stage 2.

## Architecture

```
inbound (post Stage 0)
        ↓
┌──────────────────────────────┐
│ Pass 1: regex                │  -> {category, confidence, matchedRule}
└──────────┬───────────────────┘
           ↓
       category == 'unknown'?
           │
       no  ┴── (regex matched a noise key)
       yes ↓
┌──────────────────────────────┐
│ Pass 2: LLM noise-recovery   │  Orq agent: stage-1-category-classifier
│ (closed noise list + unknown)│  -> {category_key, confidence, reasoning}
└──────────┬───────────────────┘
           ↓
┌──────────────────────────────┐
│ swarm_noise_categories lookup│  (swarm_type, noise_key) -> action
└──────────┬───────────────────┘
           ↓
   ┌───────┴────────────────────────────────┐
   │                                        │
   ↓ (noise key)                            ↓ (unknown)
categorize_archive               swarm_dispatch -> Stage 2 -> Stage 3 -> Stage 4
   (auto label + archive +         (label-resolver / coordinator / handler)
    queue cleanup automation)
```

## Today-State (Debtor-Email Worked Example)

### Reference implementations

- **Pass 1 (regex):** [`web/lib/debtor-email/classify.ts`](../../web/lib/debtor-email/classify.ts) — pure regex rules ordered by specificity, first match wins, returns `{category, confidence, matchedRule}`. No LLM, no I/O.
- **Pass 2 (LLM):** [`web/lib/inngest/functions/classifier-screen-worker.ts`](../../web/lib/inngest/functions/classifier-screen-worker.ts) — invokes the Orq agent `stage-1-category-classifier` only when Pass 1 returned `unknown`. Closed-list output enforced by `response_format: json_schema`. Errors coerce to `unknown` (graceful degradation, never blocks the pipeline).

### Dispatch worker

[`web/lib/inngest/functions/classifier-verdict-worker.ts`](../../web/lib/inngest/functions/classifier-verdict-worker.ts) loads the matching `swarm_noise_categories` row for `(swarm_type='debtor-email', noise_key=<x>)` and switches on `swarm_noise_categories.action`: `categorize_archive` bundles three side effects (Outlook label + Outlook archive + queue iController cleanup `automation_run`); the only row with `action='swarm_dispatch'` is `unknown` itself, which fires `debtor-email/label-resolve.requested` to wake Stage 2.

### Noise-category registry

`public.swarm_noise_categories` is the noise-filter dispatch table: one row per `(swarm_type, noise_key)` carrying `action` (`categorize_archive` for noise, `swarm_dispatch` for the `unknown` fall-through only), `outlook_label`, and `swarm_dispatch` (the Inngest event name fired on dispatch). Real intents (payment_dispute, credit_request, …) live in `public.swarm_intents` and are decided at Stage 3 — they never appear in this table.

### Real noise keys (debtor-email)

- `auto_reply` -- system-sender + automated subject patterns.
- `ooo_temporary` -- temporary out-of-office indicators.
- `ooo_permanent` -- permanent out-of-office (mailbox retired, person left).
- `payment_admittance` -- bank / AP-system payment confirmations.
- `unknown` -- no rule matched and the LLM 2nd-pass also couldn't classify as noise; falls through to Stage 2 + Stage 3.

The first four route to `categorize_archive`. `unknown` is the only key that hands off to the LLM stages of the funnel via `debtor-email/label-resolve.requested`.

### Source-of-truth invariant — noise-key enum (Phase 78 codegen)

The closed list of noise keys exists in three places that must agree:

1. The TypeScript validator for the Stage 1 LLM 2nd-pass output.
2. The `swarm_noise_categories.category_key` rows in Postgres.
3. The `enum` field inside the Orq agent `stage-1-category-classifier`'s `response_format: json_schema`.

**Same rule as Stage 3** — see [`./stage-3-coordinator.md#source-of-truth-invariant--intent-enum-phase-78-codegen`](./stage-3-coordinator.md) for the full pattern. The registry is the single source of truth; the TS literal-union is build-time generated; the Orq JSON schema is regenerated from the same registry read; CI gate prevents drift. Phase 78's codegen pass covers both `swarm_noise_categories` and `swarm_intents` in one script.

Onboarding a new swarm = INSERT noise rows + run codegen + commit the regenerated file. Never hand-edit `*.generated.ts`.

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
