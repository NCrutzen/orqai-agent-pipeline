# Phase 122: Cross-brand-scope customer resolution - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

When a Stage-2 customer resolver's identifier (factuur / klantnummer / name) does
**not** resolve within the mailbox's own brand `scope_key`, fall back to a
**cross-brand back-search over `resolver_index`** instead of returning nothing or a
wrong-scope guess. A cross-brand hit resolves **only** when it is unambiguous;
otherwise it degrades to a **suggestie** (a likely-but-unconfirmed candidate) — never
a confident wrong-scope guess.

**In scope:**
- The cross-brand fallback logic in the generic resolution engine, config-gated per
  swarm (opt-in via `swarms.resolution_config`), with **zero** `if (swarm === '…')`
  branches (SWARM-02 holds).
- A new **"suggestie"** outcome / confidence tier and its data (best candidate +
  candidate set) flowing into the **existing** review-queue surface.
- A **"possible wrong mailbox" annotation** on the resolution outcome when a customer
  resolves cross-brand (signal only — no re-routing).

**Out of scope (owned elsewhere):**
- Actual mailbox **re-routing** of mis-routed mail → Routing Swarm milestone (V9.7).
  Phase 122 owns the *resolution* half, not the ingest re-routing half.
- The **colored Outlook label** (green/orange/red/none) that would surface confidence
  in Outlook → deferred to its own follow-up phase (see Deferred Ideas). Phase 122
  produces the 4-tier confidence that makes that label trivial later.
- New SQL / a new `resolver_index` query path — the substrate already returns the
  cross-brand candidates (see Code Insights).

</domain>

<decisions>
## Implementation Decisions

### Search universe (which scopes are cross-brand-eligible)
- **D-01:** Cross-brand = **all `scope_key`s within the mailbox's own `environment_id`**.
  The `environment_id` hard filter (currently `'BX'` = Benelux) is the **only** boundary
  and is already enforced by the `resolve_candidates` proc. A mailbox never resolves a
  customer from another environment.
- **D-02:** **No per-mailbox sibling allowlist.** Rationale: future UK/IE regions will
  almost certainly be separate `environment_id` values (separate NXT databases), not new
  brands inside BX. Searching "all brands in the environment" therefore scales to UK/IE
  with **zero config change** — each region searches its own brands automatically. A
  static allowlist would be maintenance burden and would silently drop valid matches when
  stale. Safety against false positives comes from the uniqueness + strong-ID bar (D-03/
  D-04), not from shrinking the search space.

### Auto-resolve safety bar (when may cross-brand auto-resolve?)
- **D-03:** Cross-brand **auto-resolve** is allowed only when EITHER:
  (a) **one strong, unique** identifier kind matches — the existing
  `auto_safe_alone_kinds` (`invoice_no`, `customer_no`, `site_no`); OR
  (b) **≥2 independent signals corroborate** on the same customer — routed through the
  **existing Phase 120 `corroboration` mechanism** (no new scoring system).
- **D-04:** A **lone weak signal** (sender / `email_domain`, name, postcode) can produce
  at most a **suggestie** cross-brand — never an auto-resolve. Grounded in the eval:
  exact IDs ~95% accurate vs sender/domain ~21%; bucket-C rows #67/#69/#70 (CBRE) are
  exactly the sender-ambiguous-cross-brand false positives this bar prevents.
- **D-05:** Signals that **disagree** (point at different customers) → suggestie /
  unresolved, never an auto-resolve.

### Suggestie + confidence taxonomy
- **D-06:** Introduce a **"suggestie"** tier — today only `high / medium / low / none`
  exist; there is no in-between for "found a likely customer but not confident enough to
  auto-act." The resolution outcome carries a **4-tier confidence** scale:
  🟢 **zeker** (auto-resolved) · 🟠 **suggestie** (likely candidate, operator confirms) ·
  🔴 **heel onzeker** (candidates found but too ambiguous to trust) · ⚪ **geen match**.
- **D-07:** The suggestie + its candidate set land in the **existing review-queue
  (Bulk Review) surface**, which the operator confirms there. Phase 122 ensures the
  candidate data + confidence tier reach the output the queue already reads — **no new
  queue UI** in this phase. (Planner/research: verify the existing surface can render a
  suggestie + candidate list.)

### Uniqueness rule (resolve vs degrade)
- **D-08:** Cross-brand resolve requires **exactly one** distinct customer
  (`root_party_id`) across the cross-brand candidate set (mirrors the existing number-tier
  `distinctRoots === 1` rule). Two or more distinct customers → suggestie / heel onzeker,
  never a confident pick.

### Misroute signalling
- **D-09:** When a customer resolves **cross-brand**, the outcome carries a
  **"possible wrong mailbox" annotation** ("resolved under brand X, mailbox is brand Y").
  Cheap to emit; re-routes nothing. Gives the future Routing Swarm (V9.7) and the operator
  the mis-route signal for free. The ROADMAP's "resolve vs re-route" split is honored:
  122 resolves + flags; V9.7 acts on the flag.

### Config-gating (SWARM-02)
- **D-10:** All cross-brand behavior is **opt-in per swarm via `swarms.resolution_config`**
  (mirrors the Phase 120 `corroboration` sub-config pattern). The engine reads the config;
  there is **no per-swarm-name branch**. Debtor opts in (it owns the acceptance fixture);
  sales is config-ready and can flip opt-in when validated (Claude's discretion below).
- **D-11:** Cross-brand runs **only after an in-scope miss** — it is a fallback, not the
  default path. In-scope precedence resolution is attempted first, unchanged.

### Claude's Discretion
- **Implementation shape** of the cross-brand fallback (new precedence step vs. a
  post-pass after in-scope steps miss) — planner/research decide, subject to D-10/D-11.
- **Exact JSON shape / field names** of the new `resolution_config` sub-config (mirror the
  `corroboration` block; e.g. a `cross_scope` object). Keep it config-expressible and
  swarm-agnostic.
- **Whether sales also opts in this phase** vs. a later config-only flip — the frozen
  acceptance fixture is **debtor** (100 emails), so debtor must opt in; sales opt-in is a
  config decision that can follow once re-validated.
- **Exact representation** of the "suggestie" tier in the existing
  confidence/audit types (new enum value vs. flag + candidate list) — planner decides,
  honoring D-06/D-07.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stage-2 resolution architecture (locked rules)
- `docs/agentic-pipeline/stage-2-entity.md` — Stage 2 RFC; **Resolution Transport Rule
  (LOCKED 2026-06-15)**: resolve via the SQL lookup tables (`resolver_index` +
  `nxt.resolve_candidates`), **never** NXT REST. `resolver_index` column list incl.
  `scope_key`, `is_unique_in_scope`, `precedence`, `root_party_id`.
- `docs/agentic-pipeline/README.md` — the v8.0 5-stage funnel; SWARM-02 / swarm-shapes
  context.
- `docs/agentic-pipeline/context-shape-contract.md` — `PipelineStageContext` output shape
  Stage 2 must emit (backend-agnostic).

### Engine, config, and SQL substrate (the code this phase touches)
- `web/lib/agentic-pipeline/resolve/engine.ts` — generic precedence + corroboration engine
  (iterates `config.precedence`; single-hit short-circuit).
- `web/lib/agentic-pipeline/resolve/config.ts` — `ResolutionConfig` / `ResolutionScope` /
  `CorroborationConfig` TypeScript shapes (the config the engine reads).
- `web/lib/agentic-pipeline/resolve/steps/identifier-match.ts` — in-scope prefix-family
  gate; today returns `null` (drops) on cross-brand / multi-root. §82–149, §243–270.
- `web/lib/automations/sales-email/resolve-customer.ts` — sales adapter; filters
  `scope_key === SALES_SCOPE_KEY` (the in-scope drop to relax). §150–388.
- `web/lib/inngest/functions/stage-2-customer-resolver.ts` — Stage 2 worker; registry
  discriminator reads `resolution_config` (SWARM-02-compliant dispatch). §199–212.
- `db/zapier-resolver/00-index-tables.sql` — `resolver_index` schema (env hard filter,
  scope_key tiebreaker, `is_unique_in_scope` per-tier).
- `db/zapier-resolver/03-resolve-candidates.sql` — the proc; **returns ALL candidates
  regardless of brand**, env-hard-filtered; computes `is_unique_in_scope` per
  `(kind, value_norm, brand_in_scope)` tier. §54–176.
- `supabase/migrations/20260616a_debtor_corroboration_optin.sql` — **the direct config
  precedent** to mirror: how Phase 120 added an opt-in sub-config (`corroboration`,
  `auto_safe_alone_kinds`) to `swarms.resolution_config`.
- `supabase/migrations/20260601a_resolution_config_column.sql` — `resolution_config`
  column + the `scope` block shape (`brand_mode`, `brand_scope`, `brand_scope_by_mailbox`).

### Acceptance fixture (frozen)
- `.planning/evals/2026-06-16-resolver-customer-eval/FINDINGS.md` — the 100-email operator
  eval; **bucket C = the 9 cross-brand rows** (smeba-fire↔smeba-BB, berki, CBRE under
  Smeba BB) Phase 122 must resolve or correctly demote to suggestie on the re-run.
- `web/scripts/eval/resolver-correctness-gate.ts` — the Phase-120 re-scoring harness for
  the frozen fixture (per the unify-on-resolve_candidates todo).

### Related todos (background, not folded)
- `.planning/todos/pending/2026-06-04-d06-corroboration-fast-follow.md` — D-06
  corroboration design + the entity-index / N-agreement framing reused by D-03.
- `.planning/todos/pending/2026-06-17-unify-stage2-on-resolve-candidates.md` — the generic
  `resolve_candidates`-only direction the engine is converging on.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`resolve_candidates` proc already returns cross-brand candidates.** It hard-filters
  only on `environment_id` and returns ALL brands (brand is a tiebreaker, not a filter).
  Every row already carries `scope_key`, `is_unique_in_scope`, and `root_party_id`. The
  cross-brand back-search is therefore mostly **engine/step + config logic, not new SQL** —
  today's steps simply *discard* the out-of-scope rows.
- **Phase 120 `corroboration` mechanism** (`engine.ts` + `corroboration` config block) is
  reused wholesale for D-03(b) — cross-brand candidates are fed through the existing
  ≥N-agreement scoring; no new scoring system.
- **`auto_safe_alone_kinds`** (`["customer_no","site_no","invoice_no"]`) already names the
  strong-unique kinds — reuse directly for D-03(a).
- **`resolution_config` registry pattern** — opt-in is a per-swarm jsonb sub-config (mirror
  `20260616a`); no codegen, no per-swarm branch.

### Established Patterns / Constraints
- **SWARM-02:** registry-driven dispatch, zero `if (swarm === '…')` literals. The Stage 2
  worker already discriminates on `resolution_config` data, not swarm name.
- **Resolution Transport Rule (LOCKED):** extend the SQL lookup tables, never add an NXT
  REST call to "fill a gap."
- **Degradation today:** a step returning `null` → falls through → `unresolved` /
  `confidence: "none"`. There is **no "suggestie" tier yet** — Phase 122 introduces it.
- **`is_unique_in_scope` granularity (CR-01):** computed per DIRECT `party_id`; the number
  tier gates on `distinctRoots === 1` directly. D-08 follows the root-based rule.

### Integration Points
- New cross-brand outcome + suggestie/candidate set → the output `PipelineStageContext` /
  `email_pipeline.resolution_audit` that the **existing review-queue** reads (D-07).
- Misroute annotation (D-09) → same outcome/audit payload, for the future V9.7 routing
  consumer.

</code_context>

<specifics>
## Specific Ideas

- The operator explicitly wants the eventual Outlook surface to be a **colored label**:
  🟢 zeker · 🟠 onzeker · 🔴 heel onzeker · ⚪ geen match. Phase 122's 4-tier confidence
  (D-06) is designed to map 1:1 onto that label later (tier → color).
- The operator framed the safety bar in terms of **"better matches by combining multiple
  clues"** — captured as the corroboration path D-03(b), aligning with the CTO's D-06
  requirement.

</specifics>

<deferred>
## Deferred Ideas

- **Colored Outlook label by confidence tier** (🟢/🟠/🔴/⚪) — a new Outlook-labeling
  surface; its own follow-up phase. Phase 122 produces the confidence taxonomy that
  enables it but does not build the label.
- **Actual mailbox re-routing** of mis-routed mail (the "wrong mailbox" half) — Routing
  Swarm milestone (V9.7). Phase 122 only emits the misroute annotation (D-09).
- **Sales opt-in to cross-brand** — config-only flip once re-validated against a sales
  baseline; debtor is the frozen acceptance fixture for this phase.

</deferred>

---

*Phase: 122-cross-brand-scope-customer-resolution*
*Context gathered: 2026-06-18*
