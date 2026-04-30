# Stage 2 -> Stage 3 Context-Shape Contract

> **Status:** RFC (Phase 63). Implements RFC-02. Locked decisions D-04, D-05, D-06.
> **Sibling, different concern:** [`../swarm-bridge-contract.md`](../swarm-bridge-contract.md) covers UI-plumbing (`automation_runs` -> kanban). This file covers the runtime data contract handed from Stage 2 to Stage 3.

## Purpose

This document defines the runtime data contract handed from Stage 2 (entity enrichment) to Stage 3 (intent coordinator) inside the cross-swarm agentic pipeline. The contract is **lookup-backend-agnostic**: a SugarCRM-backed sales swarm produces the exact same shape as an NXT-backed debtor swarm. Stage 2 populates the shape from whichever backend(s) it owns; Stage 3 consumes it without knowing or caring where the values came from. This is the seam that makes the funnel swarm-agnostic.

## TypeScript Interface (Canonical)

```typescript
// Source of truth for the cross-swarm Stage 2 -> Stage 3 contract.
// Codified in web/lib/agentic-pipeline/types.ts in a downstream phase (Phase 64 or 70).
export interface PipelineStageContext {
  customer_id: string | null;        // backend-stable identifier (NXT account id, SugarCRM contact id, ...)
  customer_name: string | null;      // human-readable display name
  language: 'nl' | 'fr' | 'en' | 'de'; // detected reply language
  entity_brand: string;              // data-driven from swarms.entity_brand registry (Phase 68)
                                     // today's set: smeba | smeba-fire | firecontrol | sicli-noord | sicli-sud | berki
                                     // NOT a TypeScript literal-union enum -- registry-driven
  recent_documents: DocumentRef[];   // last N documents touched by this customer (per-swarm N)
  context_version: 1;                // contract version, persisted on every pipeline_events row
}

export interface DocumentRef {
  id: string;
  kind: string;        // e.g. 'invoice', 'reminder', 'credit_note' -- vocabulary per swarm
  date: string;        // ISO 8601
  reference: string | null;
}
```

## Prose Table (Field Semantics)

| Field | Required | Nullable | Source backend (today) | Semantic notes |
|---|---|---|---|---|
| `customer_id` | yes | yes | Debtor swarm: NXT `account_id` resolved via Zapier SQL on the per-brand NXT database (sender lookup -> identifier lookup -> LLM tiebreaker). Sales swarm (forward-ref Phase 73): SugarCRM `contact_id` via SugarCRM REST. | `null` is legal and meaningful: Stage 2 ran but could not resolve. Stage 3 must handle the unresolved case explicitly (typically by routing to a human-review intent). Backend-stable means: stable across rerun of the same email. |
| `customer_name` | yes | yes | Same backend as `customer_id`; populated when resolution succeeds. | Display-only string for prompts and review UIs. Never used as a join key. May be empty string in pathological data; treat empty same as `null`. |
| `language` | yes | no | Detected from the email body by Stage 1 / Stage 2; persisted with the email. | Restricted to the four operational reply languages today (`nl`, `fr`, `en`, `de`). Adding a new value is an additive change under contract major 1; removing one is breaking. |
| `entity_brand` | yes | no | Today: derived from `debtor.labeling_settings.brand_id` + `debtor.labeling_settings.nxt_database` per source mailbox. Phase 68 unifies these into the `swarms.entity_brand` registry as the single source of truth; today's per-mailbox columns become a denormalised read-model. | Drives all downstream routing: prompts, categories, tool allowlists. The TypeScript type is `string` on purpose -- the registry, not the type system, is the source of truth. See [Forward References](#forward-references). |
| `recent_documents` | yes | no (always an array; may be empty `[]`) | Debtor swarm: last N invoices / reminders / credit-notes for this `customer_id` from NXT via Zapier SQL. Sales swarm: most recent SugarCRM activities. N is per-swarm (debtor today fetches a small window; sales swarm sets its own). | Empty array is normal (new customer, or swarm without document history). Each `DocumentRef.kind` vocabulary is per-swarm; Stage 3 prompts must not assume a global enum. |
| `context_version` | yes | no | Set by the Stage 2 emitter; literal `1` today. | Persisted on every `pipeline_events` row that records a Stage 2 -> Stage 3 handoff (forward-ref Phase 70). Used by promotion math and replay tools to know which contract version a row was produced under. |

`DocumentRef` sub-shape: `id` is the backend-stable document identifier; `kind` is a per-swarm string (no global enum); `date` is ISO 8601 (`YYYY-MM-DD` or full timestamp); `reference` is the human-facing reference number (invoice number, credit-note number) when available, `null` otherwise.

## Versioning Policy

- **`context_version: 1` from day one.** Every Stage 2 emitter stamps this literal on every handoff. Every `pipeline_events` row persists the version it was produced under (forward-ref Phase 70 for the table itself).
- **Additive optional fields stay at major 1.** Adding a new optional field (e.g. `customer_segment?: string`) is non-breaking; existing Stage 3 consumers ignore it.
- **Breaking changes bump the major.** Renaming a field, changing a field's type, removing a field, or adding a new required field bumps the version to `2`. Both producers and consumers must be migrated together; replay tools use the persisted `context_version` to dispatch to the correct decoder.
- **Brand-list growth is NOT a contract change.** `entity_brand` is data-driven from the registry; adding a new brand (UK/IE expansion is on the Phase 999.1 backlog with names TBD) is a registry insert, not a contract version bump. This is the whole point of D-06.

## Forward References

- `web/lib/agentic-pipeline/types.ts` codification -- Phase 64 or 70 (whichever first needs the type at runtime).
- `swarms.entity_brand` unified registry -- Phase 68 (SWRM-01).
- `pipeline_events` persistence target (the table itself, including the `context_version` column) -- Phase 70 (TELE-01).

## See Also

- [`./README.md`](./README.md) -- RFC entry point, tenancy section, headline funnel diagram.
- [`./stage-2-entity.md`](./stage-2-entity.md) -- the producer of this shape.
- [`./stage-3-coordinator.md`](./stage-3-coordinator.md) -- the consumer of this shape.
- [`../swarm-bridge-contract.md`](../swarm-bridge-contract.md) -- sibling, different concern: how Stage 4 results render in the V7 Agent OS shell.
