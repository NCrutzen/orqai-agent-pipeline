# Stage 2 -- Entity Enrichment

> **Status:** RFC (Phase 63). Today's debtor swarm implementation is a worked example; the contract that Stage 2 emits is locked in [`./context-shape-contract.md`](./context-shape-contract.md).

## Goal

Take the inbound message that fell through Stage 1's `unknown` bucket and enrich it with structured customer / entity data. **Deterministic-first:** thread lookup, sender map, identifier extraction. LLM tiebreaker only when deterministic methods conflict. The output is `PipelineStageContext` per [`./context-shape-contract.md`](./context-shape-contract.md) -- a backend-agnostic data shape that any downstream Stage 3 coordinator consumes without knowing whether the values came from NXT, SugarCRM, or another backend.

## Anthropic Pattern Mapping

Stage 2 is not a pattern from Anthropic's *Building Effective Agents*; it is pre-LLM enrichment that feeds the chained workflow. The discipline is "tools-first, LLM only when tools are insufficient" -- the LLM tiebreaker step is the last resort, not the first move. Cheap deterministic lookups handle the bulk of the resolution work; the LLM only adjudicates genuine ambiguity.

## Architecture

```
email (post Stage 1, category=unknown)
        ↓
┌──────────────────┐
│ thread lookup    │  -> existing customer_id from prior conversation?
└────────┬─────────┘
         ↓ (miss)
┌──────────────────┐
│ sender map       │  -> deterministic sender->customer mapping?
└────────┬─────────┘
         ↓ (miss / ambiguous)
┌──────────────────────────┐
│ identifier extraction    │  -> invoice / reference / VAT in body?
└────────┬─────────────────┘
         ↓ (conflict)
┌──────────────────────┐
│ LLM tiebreaker       │  -> only when deterministic methods conflict
└────────┬─────────────┘
         ↓
PipelineStageContext  (see context-shape-contract.md)
```

## Today-State (Debtor-Email Worked Example)

### Resolver pipeline

[`web/lib/automations/debtor-email/resolve-debtor.ts`](../../web/lib/automations/debtor-email/resolve-debtor.ts) is the canonical Stage 2 implementation for the debtor swarm. It runs the four-step pipeline above and emits the resolved `customer_id` plus the metadata used to populate `PipelineStageContext` in the downstream emitter.

### Per-brand routing

Today's source-of-truth for brand identity is split across two columns on `debtor.labeling_settings`:
- `labeling_settings.brand_id` -- 2-letter NXT brand code (e.g. `SB` for Smeba). One row per Outlook source mailbox; CHECK constraint enforces `^[A-Z]{2}$`.
- `labeling_settings.nxt_database` -- the NXT database name the resolver Zap should query for that brand.

The combination drives which NXT database the SQL lookups hit. Phase 68 (SWRM-01) unifies these into the `swarms.entity_brand` registry; today's per-mailbox columns become a denormalised read-model.

### Backend lookup

NXT SQL only flows through the Zapier SDK on a whitelisted IP -- never direct AWS / direct DB. NXT-S3 document fetches go through the same SDK path for the same reason: one credential boundary, one auth path. See [`../zapier-patterns.md`](../zapier-patterns.md). This document does not duplicate that content; the implementation reads the patterns doc directly.

## Cross-Swarm Pluggability

A SugarCRM-backed sales swarm (Phase 73) plugs in by implementing the same `PipelineStageContext` output shape with a different backend resolver: thread lookup hits SugarCRM activities, sender map points at SugarCRM contacts, identifier extraction parses sales references rather than NXT invoice numbers, the tiebreaker LLM is the same pattern with a different prompt. The contract is backend-agnostic by design (D-04, D-06) so Stage 3 cannot tell which backend produced the row.

## Output Contract

Stage 2 emits `PipelineStageContext` per [`./context-shape-contract.md`](./context-shape-contract.md). This document does not duplicate the TypeScript interface; the contract doc is the single source of truth.

## Override Capture

Axis 2 of the override model is the override surface for this stage. **Today-state: PARTIAL.** Per-mailbox approve/reject flows write `agent_runs.human_verdict` plus `email_labels.reviewed_by` / `reviewed_at`; the dedicated correction column `email_labels.corrected_customer_account_id` exists in the schema today but the consolidated 4-axis Bulk Review surface that uses it ships in Phase 71. See [`./override-model.md#axis-2--wrong-customer-stage-2`](./override-model.md#axis-2----wrong-customer-stage-2).

## Graduated Automation

Axis 2 signals feed the sender-mapping promotion hook: an LLM-aided sender-to-customer lookup accumulates approve/reject signal, and once the Wilson-CI gate clears the lookup graduates to a deterministic sender->customer map. See [`./graduated-automation.md#hook-taxonomy`](./graduated-automation.md#hook-taxonomy). Phase 56's mailbox-flip promotion is the working precedent.

## Forward References

- `swarms.entity_brand` unified registry -- Phase 68 (SWRM-01).
- SugarCRM resolver implementation -- Phase 73 (SALES-01..03).
- Consolidated `email_labels.corrected_customer_account_id` capture surface -- Phase 71 (REVW-01..06).
- `web/lib/agentic-pipeline/types.ts` codification of the output contract -- Phase 64 or 70.

## See Also

- [`./README.md`](./README.md) -- RFC entry point.
- [`./stage-1-regex.md`](./stage-1-regex.md) -- the previous stage; `unknown` falls through here.
- [`./stage-3-coordinator.md`](./stage-3-coordinator.md) -- the consumer of this stage's output.
- [`./context-shape-contract.md`](./context-shape-contract.md) -- the canonical output shape (Wave 1 doc).
- [`./override-model.md`](./override-model.md) -- axis 2 captures Stage 2 corrections.
- [`./graduated-automation.md`](./graduated-automation.md) -- the sender-mapping promotion hook consumes axis 2 signals.
