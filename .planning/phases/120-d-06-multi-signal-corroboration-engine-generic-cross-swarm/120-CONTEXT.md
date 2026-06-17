# Phase 120: D-06 multi-signal corroboration engine (generic, cross-swarm) - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Give the generic Stage-2 resolution engine (`web/lib/agentic-pipeline/resolve/engine.ts`) a **config-expressible corroboration capability**: instead of short-circuiting on the first precedence hit, the engine COLLECTS candidate signals across precedence steps and RAISES confidence deterministically (no LLM call) when ≥N **independent** identifiers agree on the same `customer_account_id` — and **catches confident false positives** by demoting when independent signals disagree.

Swarm-agnostic, zero `if swarm==='…'` branches (SWARM-02), opt-in per swarm via `resolution_config.corroboration`. Replaces the per-step LLM tiebreaker for the agreeing-signals case (tools-first / LLM-last-resort).

**In scope (decided during discussion):**
- Generic corroboration capability in `engine.ts` + `corroboration` field in `config.ts` `ResolutionConfig`.
- Re-seed **both** debtor and sales `resolution_config` to opt in.
- **Sales REST→SQL migration pulled into this phase** (consequence of "both opt in" — sales corroboration cannot fire over `nxt.rest_proxy`): migrate `offerte.ts` / `order.ts` / `sites.ts` auto-resolution lookups onto `resolver_index` via `resolve_candidates` (todo `2026-06-15-sales-offerte-lookup-false-positive.md`).
- Re-baseline the no-engine-diff donor to the post-120 commit; re-run → FINAL STAGE2-01 acceptance (supersedes PROVISIONAL V9.0 result).
- Correctness gate: re-run resolver over the frozen 100-email eval fixture.

**Out of scope (deferred):**
- Attachment-borne identifier extraction → **Phase 121** (its output is a corroboration *input*; 120 does not block on it).
- Cross-brand-scope resolution → **Phase 122**.
- The full sales postcode/order REST recall cleanup beyond what corroboration needs (NXT search-contract reverse-engineering) — only the transport switch to `resolver_index` is in scope; unresolved-recall items stay in the sales todo.

</domain>

<decisions>
## Implementation Decisions

### Engine model (CORR-04 — the core architectural fork)
- **D-01:** **Collect-then-decide, GATED on config.** When `corroboration` IS configured for a swarm: run ALL precedence steps, collect every candidate, then decide (vote → boost, or demote on conflict). When `corroboration` is NOT configured: byte-identical first-hit short-circuit exactly as today. Voting is an overlay on precedence, not a replacement — non-opted-in swarms are behavior-unchanged (protects no-engine-diff for them).
- **D-02:** Precedence ordering (incl. the §0.10-A5 inversion: thread_inheritance Layer-1/high, PRESERVED) coexists with flat voting as follows: precedence still orders the steps and is the source of the candidate set; corroboration is a deterministic scoring layer that runs ACROSS the collected candidates. Winner-selection in the no-agreement case is governed by the disagreement/lone-signal rules (D-06/D-07), not by a separate below-threshold rule.
- **D-03:** Collection is deterministic only — the LLM tiebreaker is NOT part of the collect path (tools-first / LLM-last-resort holds).

### Confidence math + independence (CORR-01/02)
- **D-04:** **`boost` = promote to `high` (SET, not additive).** On ≥N independent agreement, confidence is set to `high` deterministically, no LLM. `boost` is the target tier (default `high`); per-swarm configurable.
- **D-05:** **Independence = distinct `identifier_kind`.** Two agreeing signals must be different `identifier_kind` values (e.g. `invoice_no` + `customer_no`, or `quote_no` + sender-domain). Two invoice numbers both pointing at customer X = ONE signal. Maps directly to the `resolve_candidates` row's `identifier_kind`. `min_signals` default = **2** (per-swarm tunable).

### Disagreement / false-positive catch + lone-signal (CORR-02 — cardinal Stage-2 goal)
- **D-06:** **Conflict → demote to suggestie, deterministically, no LLM.** When ≥2 independent signals (distinct `identifier_kind`) resolve to DIFFERENT customers, return the precedence-winner customer but cap confidence below AUTO (medium/low). The disagreement itself is the falsification signal — this catches the 4 confident-wrong AUTO rows from the eval. (No LLM escalation on the disagreeing path; deterministic demote chosen over LLM-tiebreak.)
- **D-07:** **Lone-signal handling encodes eval bucket-B.** A lone STRONG signal (e.g. `invoice_no` / `customer_no`) keeps its native `high` → stays AUTO. A lone **sender/domain match** (21% accuracy in the eval) is **capped below AUTO unless corroborated by a second independent signal.** Which kinds are "auto-safe-alone" is config-driven — reuse/extend the existing `auto_safe_kinds` mechanism rather than hardcoding.

### Rollout scope + STAGE2-01 re-finalize (CORR-03/05)
- **D-08:** **Both debtor AND sales opt in** within Phase 120.
- **D-09:** **Sales REST→SQL migration is pulled into Phase 120.** Replace the `nxtRequest` REST calls in `web/lib/automations/sales-email/lookups/offerte.ts` / `order.ts` / `sites.ts` with a `resolver_index` back-search via `resolve_candidates` (normalize offerte to bare digits, `scope_key='SB'`, prefer `is_unique_in_scope=1`). DO NOT delete NXT REST infra (load-bearing for order-entry writes, order-entry UI lookups, and the operator's manual Stage-2 customer-search widget). The shipped fail-closed `_match.ts` guard stays harmless. Only the three auto-resolution identifier lookups switch transport.
- **D-10:** **STAGE2-01 re-finalized by re-baselining the no-engine-diff donor to the post-120 commit.** After corroboration lands, re-point `scripts/no-engine-diff-check.sh`'s donor baseline to the Phase 120 commit and re-run; the check then proves no FURTHER per-swarm engine drift on top of the corroboration-capable engine. Record as FINAL STAGE2-01, superseding the PROVISIONAL V9.0 result.

### Claude's Discretion
- Exact `corroboration` field sub-shape beyond `{ min_signals, boost }` (e.g. how `auto_safe_kinds` interplays, whether an explicit `boost` tier string is stored) — planner/researcher to finalize against `config.ts`.
- Candidate de-duplication strategy across steps (collapsing the same `party_id` arriving from multiple kinds vs counting distinct kinds) — must satisfy D-05's "distinct identifier_kind" independence rule.
- The correctness-gate harness mechanics (how the frozen 100-email re-run is executed and scored) — planner to design; fixture lives at `.planning/evals/2026-06-16-resolver-customer-eval/`.
- How sales candidates flow through the collect path given the sales adapter currently runs its own loop (not the engine steps) — reconcile during planning so SWARM-02 holds.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stage-2 architecture (LOCKED rules)
- `docs/agentic-pipeline/stage-2-entity.md` — Stage-2 contract; §Resolution Transport Rule (LOCKED 2026-06-15: resolve via SQL `resolver_index`/`resolve_candidates`, never REST; extend tables, don't add REST); §Anthropic Pattern Mapping (tools-first, LLM-last-resort).
- `docs/agentic-pipeline/README.md` — 5-stage funnel + Swarm Shapes + SWARM-02 generality principle.
- `docs/agentic-pipeline/context-shape-contract.md` — the `PipelineStageContext` output shape Stage 2 must emit.
- `.planning/spikes/010-comprehensive-backtest/DESIGN-GUIDE.md` §0.10-A5 — the precedence inversion (thread_inheritance Layer-1/high, preserved on purpose).

### Engine internals (the code this phase changes)
- `web/lib/agentic-pipeline/resolve/engine.ts` — `resolveEntity()` precedence loop + first-hit short-circuit (the short-circuit that becomes collect-then-decide); LLM tiebreaker at lines ~242-379.
- `web/lib/agentic-pipeline/resolve/config.ts` — `ResolutionConfig` interface (add `corroboration` here; `precedence`, `auto_safe_kinds`, `llm_tiebreaker`, `scope`).
- `web/lib/agentic-pipeline/resolve/steps/*` — `thread-inheritance.ts`, `sender-match.ts`, `identifier-match.ts` (Phase 91 `resolve_candidates` AUTO pre-pass), `self-auth-match.ts`, `auto-gate.ts`.
- `web/lib/automations/debtor-email/resolve-debtor.ts` — debtor adapter (`debtorP0Config` kill-switch revert target).
- `web/lib/automations/sales-email/resolve-customer.ts` — sales adapter (own loop over `config.precedence`; `llm_tiebreaker:false`).
- `web/lib/automations/debtor-email/nxt-zap-client.ts` — `ResolveCandidateMatchSchema` (candidate set shape: `identifier_kind`, `party_id`, `root_party_id`, `is_unique_in_scope`, `scope_key`, `precedence`).

### Migrations + guard + fixture
- `supabase/migrations/20260601a_resolution_config_column.sql` — debtor P0 config seed (`public.swarms.resolution_config` jsonb).
- `supabase/migrations/20260604b_sales_resolution_config.sql` — sales config seed (single-hit, `nxt.rest_proxy`).
- `scripts/no-engine-diff-check.sh` — STAGE2-01 byte-equality guard; donor `origin/workspace/v8.2-resolution-recall` (re-baseline target, D-10).
- `.planning/evals/2026-06-16-resolver-customer-eval/FINDINGS.md` (+ `resolver-eval.xlsx`) — frozen 100-email regression fixture, baseline 64% correct; the correctness-gate set.

### Sales transport migration (pulled into scope, D-09)
- `.planning/todos/pending/2026-06-15-sales-offerte-lookup-false-positive.md` — REST→SQL back-search migration + postcode schema gap; UPDATE 2026-06-15 "SQL back-search VERIFIED" has the corrected fix path.
- `web/lib/automations/sales-email/lookups/_match.ts` — shipped fail-closed `pickMatchingCustomer` guard.
- `.planning/spikes/011-sales-corroboration-opportunity/` — ~39.8% corroboration surface on sales; `512887` false-positive root cause.

### Design rationale
- `.planning/todos/pending/2026-06-04-d06-corroboration-fast-follow.md` — D-06 CTO requirement, the design tension, independent practitioner re-derivation, Pitfall 3 (silently-ignored config).
- `.planning/MILESTONES.md` §V9.5 — milestone charter, success criteria, eval-bucket→phase mapping.
- `.planning/ROADMAP.md` Phase 120 — CORR-01..05 draft requirements + dependency graph.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lookupResolveCandidates()` (called from `identifier-match.ts` and `self-auth-match.ts`) — the single-call substrate that returns the WHOLE candidate set; this is the corroboration data source. One call already returns multiple `identifier_kind` rows with `is_unique_in_scope` + `party_id` → corroboration-ready.
- `auto_safe_kinds` config mechanism — extend for D-07's "auto-safe-alone" kind gating instead of new machinery.
- `auto-gate.ts` `isAutoEligibleStatus()` — status filter already shared by self-auth + number-back-search; corroboration AUTO must keep respecting it.
- Sales `_match.ts` fail-closed guard — already shipped; stays harmless after SQL switch.

### Established Patterns
- Engine iterates `config.precedence` and returns on first non-null (`engine.ts`) — the exact site that becomes config-gated collect-then-decide. Unknown precedence names are silently skipped (forward-compat) — corroboration must not rely on that for behavior.
- Steps are PURE functions (no nested `step.run`, replay-safe per CLAUDE.md Inngest rule). New scoring logic must stay deterministic and replay-safe.
- Confidence is the enum `high | medium | low | none` (not numeric) — drove D-04 (boost = set-to-high) and D-06/D-07 (demote = cap below high).
- `customer_account_id` is the LOCKED output field; env-prefix stripped (D-01 legacy). `root_party_id ?? party_id` is the rollup target for number-back-search.

### Integration Points
- `public.swarms.resolution_config` (jsonb) — where the `corroboration` opt-in is seeded per swarm; debtor `debtorP0Config` constant mirrors the seed as kill-switch.
- Sales adapter runs its OWN loop (does not call engine steps) — reconciling sales into the generic collect path without a per-swarm branch is the trickiest SWARM-02 constraint of the phase.
- `public.zapier_tools` registry — where a sales `resolve_candidates`-style SQL Zap is registered for the REST→SQL switch.

</code_context>

<specifics>
## Specific Ideas

- Eval-grounded targets: the 100-row fixture is bimodal (factuur/klantnummer ~95%, sender/domein 21%). The catchable error classes are the **12 sender/name-ambiguity** rows (a 2nd agreeing signal resolves them) and the **4 confident-wrong AUTO** rows (a disagreeing 2nd signal demotes them). These are the concrete acceptance targets, not an abstract "improve accuracy."
- "4 hits all pointing to the same customer = certain" (practitioner framing) — but min_signals=2 chosen as the practical default because most catchable eval errors are 2-signal cases.
- Sales corroboration surface measured at ~39.8% of sales mail (spike 011) — well above the 25% first-class-consumer threshold, justifying pulling sales transport into scope.
- Verified example for the sales migration: offerte `SB014098` → `quote_no` `14098` → `BX228895` Bever B.V., `scope_key='SB'`, `is_unique_in_scope=true` (the bogus `512887` was purely a REST artifact).

</specifics>

<deferred>
## Deferred Ideas

- **Attachment-borne identifier extraction** — Phase 121 (PDF/letterhead PO/offerte/invoice numbers as first-class corroboration signals; bucket-A 7 errors + bucket-D factuur-in-subject). 120 consumes its output when present but does not block on it.
- **Cross-brand-scope resolution** — Phase 122 (bucket-C 9 errors; cross-brand back-search over `resolver_index`). Independent of 120.
- **Full sales NXT REST search-contract recovery** — the unresolved-recall half of the sales todo (capturing the SPA's real quote/order/site search XHR). Out of scope here; only the transport switch to `resolver_index` is in 120.
- **LLM-tiebreak on disagreement** — explicitly rejected in favor of deterministic demote (D-06); could be revisited if demote proves too blunt, but not now.

### Reviewed Todos (not folded)
- `2026-04-23-create-draft-idempotency-and-cleanup.md` — false match (draft idempotency, unrelated to Stage-2 resolution). Not folded.

</deferred>

---

*Phase: 120-d-06-multi-signal-corroboration-engine-generic-cross-swarm*
*Context gathered: 2026-06-16*
