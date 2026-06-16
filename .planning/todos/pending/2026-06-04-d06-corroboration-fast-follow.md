---
captured: 2026-06-04
source: Phase 114-04 Task 3 checkpoint — D-06 corroboration deferral
status: pending
priority: H
target_milestone: v9.5
tags: [stage-2, resolution, corroboration, d-06, stage2-01, engine, cto-requirement]
---

# D-06 multi-match corroboration — fast-follow before the no-Engine-diff gate is final

> **Promoted to an explicit phase (2026-06-16):** this is now **Phase 120** in the
> **V9.5 "Stage-2 Corroboration + Attachment-Borne Identifiers"** milestone (see
> `ROADMAP.md` + `MILESTONES.md`). Its sibling Phase 121 supplies attachment-borne
> identifiers as corroboration signals. This todo stays as the design-rationale +
> tripwire record; the phase carries execution. (Was `target_milestone: v9.0` —
> rebanded to v9.5 to isolate from the archived V9.0 and the parallel debtor v8.2
> track.)

## The CTO requirement (D-06)

The CTO explicitly wants **multi-match corroboration** at Stage 2: multiple
independent signals (e.g. sender domain + offertenummer + Site postcode)
corroborate to RAISE confidence ("multi matchen om de zekerheid te verhogen").
This is a requirement, not an optimization afterthought (Phase 114 CONTEXT D-06).

## What iteration 1 (Phase 114-04) actually shipped

Phase 114-04 shipped the sales Stage 2 resolver **precedence-only + single-hit
short-circuit** (RESEARCH OQ-1 recommendation): the first precedence step that
yields a `customer_account_id` returns immediately. There is NO corroboration —
the generic engine (`web/lib/agentic-pipeline/resolve/engine.ts`) is
precedence-ordered + single-hit by construction, and `resolution_config` cannot
express corroboration today. A `corroborate` config field would be **silently
ignored** by the engine (Pitfall 3), so it was deliberately NOT added.

The sales `resolution_config` seeded by `20260604b_sales_resolution_config.sql`
sets `llm_tiebreaker: false` and a flat `precedence` array — single-hit only.

## The HARD constraint this todo exists to enforce

Multi-match corroboration is **ENGINE work** (the engine must gain a generic
corroboration capability — it cannot be expressed in config alone). Per D-06,
**any corroboration engine change MUST land BEFORE the no-Engine-diff
measurement is treated as the FINAL STAGE2-01 acceptance gate.**

Why: Plan 05 measures STAGE2-01 ("zero Engine code changes for the sales
onboarding") via a no-Engine-diff check. If we declare STAGE2-01 satisfied
against the current engine, we are measuring against an engine that **still owes
corroboration work**. When corroboration later lands, it WILL touch
`engine.ts` — at which point the "no Engine diff" claim is retroactively false
unless the corroboration capability was already in the engine baseline the
measurement was taken against.

So: the no-Engine-diff gate is only legitimately FINAL once either
(a) corroboration has landed in the engine, OR (b) corroboration is formally
descoped from STAGE2-01's definition by the operator. Until one of those, the
Plan 05 no-Engine-diff result is **provisional**.

## What to build (the fast-follow)

1. Add a **generic corroboration capability** to the resolution engine — config-
   expressible (e.g. `resolution_config.corroboration: { min_signals, boost }`),
   swarm-agnostic, no per-swarm branch. The engine collects candidate signals
   across precedence steps instead of short-circuiting on the first, and raises
   confidence when ≥N independent signals agree on the same `customer_account_id`.
2. Re-seed the sales `resolution_config` to opt into corroboration once the
   engine supports it.
3. Re-run the no-Engine-diff measurement AFTER this lands — that result is the
   one that legitimately gates STAGE2-01 as final.

## Independent design input (collega, 2026-06-16)

A second practitioner independently arrived at exactly this corroboration design,
which reinforces D-06 and sharpens the *shape* the engine capability should take:

- **One entity index across all entity kinds.** Customer, invoices, tickets, jobs,
  sites — all as rows in a single back-search index keyed by identifier. This is
  precisely `zapier.dbo.resolver_index` (one row per
  `(identifier_kind, identifier_value_norm, scope_key) → party_id`); his
  entity kinds map onto our `identifier_kind` rows. Growing coverage = adding
  `identifier_kind` rows + the MERGE that fills them (the LOCKED "extend the
  tables, do NOT add REST" rule, `stage-2-entity.md#resolution-transport-rule`).
- **Parse ALL identifiers (incl. attachments) into ONE array; one lookup returns
  the whole candidate set.** This maps onto `nxt.resolve_candidates`, which
  already accepts an `identifiers[]` array and returns the full Layer-A candidate
  projection in one call — i.e. the substrate for the single-call corroboration
  shape already exists. NOTE: attachment **content** parsing for identifiers is
  broader than commit `4b6ac496` (which only folds attachment *filename* into the
  Stage 2 body); attachment-borne identifiers are a first-class corroboration
  source per his framing.
- **N-agreement scoring sets confidence.** "4 hits all pointing to the same
  customer = certain." Independent identifiers agreeing on the same `party_id`
  → deterministic high confidence, **without** an LLM call. This is the
  tools-first / LLM-last-resort discipline (`stage-2-entity.md` §Anthropic
  Pattern Mapping): corroboration-voting should be able to REPLACE the per-step
  LLM tiebreaker for the agreeing-signals case, not just augment it.

**Design tension to resolve in the engine work:** today's model is
precedence-ORDERED with short-circuit (thread > sender > identifier, incl. the
deliberate §0.10-A5 inversion). His model is FLAT (collect all, score by
agreement). These can coexist — corroboration as a scoring layer that runs across
collected candidates and sets confidence / pre-empts the LLM tiebreak — but the
interaction between precedence ordering and flat voting must be made explicit in
the `resolution_config.corroboration` design, not left implicit.

**Scoping note (corrects a common mis-frame):** this is NOT debtor-only. Sales is
LIVE (V9.0, Phase 114-04). The two swarms are NOT symmetric on transport: debtor
consumes `resolver_index` via `nxt.resolve_candidates` (Phase 91 AUTO tier), while
sales today uses the REST proxy (`nxt.rest_proxy`) with unmapped endpoint
contracts. Spike 011 measured the corroboration surface at **~39.8% of sales mail**
(B∪C: ≥2 identifier kinds co-occur, or corp-domain ∩ ≥1 identifier) — well above
the 25% first-class-consumer threshold — and recommends migrating the sales
offerte/order/postcode lookups off REST onto the `resolver_index` SQL back-search,
which is the same move that unlocks single-call corroboration for sales.

## Operator eval validation (debtor, 2026-06-16)

A debiteurenbeheer colleague manually validated the resolver's customer match on
**100 debtor emails** (`.planning/evals/2026-06-16-resolver-customer-eval/`).
This is independent, operator-grounded confirmation of the D-06 thesis on the
**debtor** swarm (spike 011 validated it on sales):

- **Sender / e-maildomein match = 21% accuracy (28 rows)** vs factuur/klantnummer
  ~95% — sender-match is the dominant error source and must NOT auto-resolve when
  the scope holds >1 candidate. 12 of the 36 errors are sender/name ambiguity
  (Fedasil 30+, CBRE 25, SPIE 18, postcode 3980 CA 18, 's Heeren Loo 10) — the
  validator himself could not disambiguate from the mail (Twijfel). These are
  exactly the rows a second agreeing signal would resolve.
- **4 confident-wrong AUTO rows** (`AUTO` + confidence `hoog`, still wrong) — the
  confident false positive D-06 corroboration exists to catch; a disagreeing
  second signal would have demoted them.
- **Acceptance hook:** these 100 rows are the frozen V9.5 regression fixture
  (baseline 64% correct). Phase 120 must measurably reduce the 12 ambiguity
  errors + the confident-wrong AUTO class against this set.

## Cross-references

- `.planning/spikes/011-sales-corroboration-opportunity/` (Phase A validated the
  ~40% corroboration surface on sales; Phase B caught the `pickCustomer`
  `content[0]` false-positive bug, fixed via `_match.ts` `pickMatchingCustomer`)
- `.planning/todos/pending/2026-06-15-sales-offerte-lookup-false-positive.md`
  (the REST→SQL back-search migration + postcode schema gap that gates sales
  corroboration)
- `web/lib/automations/sales-email/resolve-customer.ts` (the live sales adapter;
  iteration-1 comment names D-06 as the fast-follow at Plan 04 Task 3)

- Phase 114 CONTEXT D-06 (the CTO requirement + the engine-gap question)
- Phase 114-04 PLAN Task 3 checkpoint (this deferral decision)
- Phase 114-05 PLAN Task 3 (asserts THIS FILE exists when the defer path is taken)
- `web/lib/agentic-pipeline/resolve/engine.ts` (the precedence + single-hit
  short-circuit that must gain corroboration)
- `supabase/migrations/20260604b_sales_resolution_config.sql` (the single-hit
  sales config to revisit)
