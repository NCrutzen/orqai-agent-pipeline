# Milestones

## v8.1 Validation + Visibility (Shipped: 2026-06-01)

**Phases:** 8 in-scope (83 body-ingestion · 84 Stage-1 noise rules · 85 Stage-3 prompt v3 · 86 open-set discovery · 87 retro baseline · 88 review-surface cleanup · 88.1 Inngest stage-naming · 88.2 Tier-2 CI cleanup).
**Audit:** `passed` (was tech_debt; all 4 operator-UAT items dispositioned 2026-06-01). **Archive:** `milestones/v8.1-ROADMAP.md` · `milestones/v8.1-MILESTONE-AUDIT.md`.

**Definition of done — achieved.** "Observe → understand → THEN automate": fixed the input/calibration/visibility layers so Stage 3 intent distribution reflects reality, not upstream parsing artifacts.

**Headline accomplishments:**

1. **Body ingestion fix** (83) — `body_full_text` / `body_unique_text` full-thread capture on forwards/replies + 30-day backfill; the source the Stage 1/2/3 readers depend on.
2. **Stage 1 noise rules for AP-automation FYI traffic** (84) — 8 noise categories × 2 swarms registered as `classifier_rules` candidates + `swarms.tenant_domains` column + codegen; Wilson-CI shadow→promote gate. (`own_outbound_invoice_loopback` disabled 2026-05-30 after Phase 87 found it mis-classified ~40% of actionable internal forwards — needs a true-system-loopback matcher before re-enable.)
3. **Stage 3 prompt v3 + open-set schema** (85) — V3 ranked-intent classifier with an `intent_proposal` open-set escape hatch + tolerant parser; operator-signed 2026-06-01 (regression GO, cost ~€2–7/mo, V2 retirement scheduled 2026-06-03).
4. **Open-set intent discovery surface** (86) — `intent_proposals_v1` + daily cluster cron (`intent_proposal_clusters`) + Bulk Review cluster tab; cron live (164 clusters).
5. **Retro classification baseline** (87) — replayed 105 emails through V3 with zero side-channel leakage; the baseline *refuted* SC-1 usefully (the catch-all is driven by upstream Stage-1 noise, not Stage-3 context) → directly scoped v8.2.
6. **Review-surface cleanup** (88, 88.1, 88.2) — 4-axis Bulk Review override + chip semantics (live UAT fixed F-01/02/03 + prod migration); stage-named Inngest functions + Stage-2 telemetry alignment; Tier-2 CI gate green (194→0 lint, 47→0 tests, `pr-checks` proven on two real PRs).

**Operator UAT closure (2026-06-01):** 85 signed off · 88 UAT performed + fixed · 86 accepted on live cron evidence · 84 D-05 promotion gate evaluated against live data → **0/16 rules eligible** (telemetry N=0; loopback disabled) → all deferred per PROMOTION-RUNBOOK §7. **Cross-cutting:** the graduated-automation Wilson-CI gate has empty telemetry (verdicts never accumulated) — the same gate v8.2's "auto-flip only after dry-run ≥99%" depends on, so v8.2 must ensure operator verdicts accumulate.

**Known deferred items (acknowledged at close; full audit in `milestones/v8.1-MILESTONE-AUDIT.md`):** 24 open artifacts catalogued in STATE.md `## Deferred Items` — mostly project-wide parking-lot (3 debug sessions, 11 quick-tasks, 5+ pending todos incl. granular-dry-run-gating → v8.2, 2 dormant seeds). The 15 held/extended Phase-84 noise rules + the loopback true-system matcher revisit in v8.2.

---

## v8.0 Agentic Platform (Shipped: 2026-05-20)

**Phases:** 31 in-scope phases closed (63-89 core + 56.7, 80.1, 81.1, 82.1-82.9, 089, 999.7, 999.8)
**Requirements:** 49/49 in-scope satisfied (8 deferred — 5 LERN→V9.0, 3 SALES→V10.0)
**Flows verified:** 7/7 cross-phase end-to-end
**Archive:** `milestones/v8.0-ROADMAP.md` · `milestones/v8.0-REQUIREMENTS.md` · `milestones/v8.0-MILESTONE-AUDIT.md`

**Headline accomplishments:**

1. **Canonical 5-stage funnel architecture** locked across debtor-email and sales-email (`docs/agentic-pipeline/README.md`): Stage 0 input safety → Stage 1 regex+LLM noise filter → Stage 2 entity resolution → Stage 3 intent coordinator → Stage 4 handler. Registry-driven (`swarms`, `swarm_intents`, `swarm_noise_categories`) — adding a swarm is an INSERT, not a code change.
2. **Stage 0 safety + per-run budgets** (Phase 64) — prompt-injection regex + LLM classifier, `injection_suspected` lane, hard token/cost ceilings (16k after Phase 999.7 strip-quoted-history fix), intent-scoped tool allowlist.
3. **Stage 1 LLM 2nd-pass + confidence gate** (Phases 74, 999.8) — `stage-1-category-classifier` on `unknown` regex output; `high`-only auto-archive; predictor attribution (regex vs LLM) on every verdict; per-predictor Wilson-CI in promotion cron.
4. **Stage 1 LLM auto-action promotion track** (Phase 089) — `llm:{category}:{confidence}` synthetic rule_keys flow through the same Wilson-CI lifecycle as regex rules; 839 rows backfilled live.
5. **Stage 2 closure** (Phase 67) — non-blocking iController DOM tagging; per-row mailbox resolution; Stage 2 evidence panel (Phase 82.9) surfaces resolver+LLM-tiebreaker reasoning + before/after screenshots.
6. **Stage 3 ranked multi-intent coordinator** (Phase 65) — ordered intents + confidence scores; orchestrator-worker escalation on low confidence / high intent count / `requires_orchestration` flag.
7. **Pipeline consolidation** (Phase 66) — single canonical flow; `debtor-email-triage` retired.
8. **Telemetry consolidation** (Phase 70) — `pipeline_events` canonical table; Stage 0 coverage backfilled to ≥99% per debtor mailbox (Phase 82.2).
9. **Unified stage shell + 4-axis Bulk Review** (Phases 71, 82, 82.1-82.8) — Stage 0/1/2/3/4 converged on one row+detail+chip-strip+mailbox-filter UX. Per-stage audit popups (Phase 82.3), `email_feedback` capture form (Phase 82.4) — data substrate V9.0 reads from.
10. **Stage 3 → Kanban human-lane** (Phase 76) — zero silent dead-letters.
11. **Body ingestion fix** (Phase 83) — `body_full_text` + `body_unique_text` columns + conversation_context (2 priors per inbound); 30-day backfill (1344 priors); Stage 1+3 readers wired.
12. **Sales-email Stage 0+1 live** — partial cross-swarm proof; full V10.0 milestone defined to ship the canonical Stage 2/3 path.

**Reframes locked 2026-05-12:** Phase 72 (Promotion Recommender) → V9.0 full milestone (prose-feedback synthesis); Phase 73 (sales-email validation) → V10.0 full milestone (Phase 78 never executed); Phase 77 (Stage 2/3 e2e verification) → superseded by Phase 82.3.

**Operator UAT (Phase 999.8 + 82.9):** Stage 1 chip strip + URL round-trip + garbage-drop + `?sub=pending` guard verified live 2026-05-20. Therese regression smoke PASS (email 067428ad → predictor=llm_2nd_pass, no side-effect). Phase 82.9 prod migration applied + Zap published live with descendant-walking contact CTE.

**Known deferred items (acknowledged at close; counted in audit `tech_debt`):**

- 3 open debug sessions (icontroller-bulkdelete-failures, pipeline-health-2026-05-19 Cluster A, stage-2-customer-mapping-stuck) at `root_cause_identified` / `closed_partial` — investigations parked, not open bugs in shipped flows.
- 14 unresolved VERIFICATION.md stubs (`human_needed`) — formal retro-verification stubs absent for 10 phases that closed via SUMMARY chain (66, 67, 68, 69, 74, 80.1, 81.1, 82.2, 82.3, 089). Lightweight stubs scheduled for v8.1 grooming.
- 5 partial-UAT phases (61, 71, 80, 82.4, 82.5) — operator UAT scenarios documented; substantively-shipped per audit.
- 10 incomplete quick-tasks (orq-agent + project-housekeeping items) and 5 pending todos (granular dry-run gating, override+note flow consolidation, Stage 1 chip semantics, label-resolver rename, Stage 4 layout parity) — scoped into v8.1 phases 88/88.1 or V9.0.
- 1 dormant seed (SEED-001 info@smeba.nl routing swarm → Phase 999.9, blocked on v8.1 phases 84/85/86).
- Phase 89 operator runbook items: SC-89-03 retro-review of 839 backfilled rows + SC-89-04 mutate-flag flip — runbook documented, operator action pending.

See `milestones/v8.0-MILESTONE-AUDIT.md` for full audit detail.

---

---

## v8.2 Stage 2 Resolution Recall (Defined: 2026-05-30)

**Status:** Defined — design validated, not yet started. **Sequenced BEFORE V9.0** (V9.0's feedback-synthesis thesis is undermined while ~65% of Stage 2 lands unresolved; fixing recall first gives V9.0 a cleaner signal). Definition is non-destructive of the open v8.1 milestone.
**Phases:** P0–P5 below (real phase numbers assigned at `/gsd-plan-phase` after v8.1 closes).
**Validated by:** spike series 005–010b — see `.planning/spikes/010-comprehensive-backtest/DESIGN-GUIDE.md` (§0 authoritative), `GENERIC-RESOLUTION-DESIGN.md`, `FINDINGS.md`. 11-agent live backtest against the consolidated `nxt` DB; auto-resolve validated 10/10 (0 false positives) on fresh emails.

**Goal:** Lift Stage 2 customer-resolution recall (today ~35% resolved / ~65% unresolved) by building a **generic, cross-swarm entity-resolution substrate** — debtor-email is the first consumer; sales-email (V10.0 SugarCRM) plugs in by configuration as the generality proof. Output ranked suggestions to Bulk Review, with a narrow high-precision auto-resolve set; never silently inject a wrong customer.

**Architecture (the substrate):** SQL Resolver + Engine + Source Adapters, registry-configured per swarm. **Revised 2026-05-30 → SQL-native (no Supabase copy of NXT data; operator governance decision); see DESIGN-GUIDE §0.2.**

- **Resolver (SQL, not Supabase)** — **materialized brand-scoped indexed tables in `zapier.dbo`** (the default, built future-proof) populated from `nxt.dbo.*` by a `MERGE` proc and refreshed by a **scheduled Zap (Schedule trigger → SQL action calls the proc)**, `modified_on` watermark, every 2–4h (a Zap rather than a SQL Agent job — needs only `zapier.dbo` DDL + the whitelisted Zapier connection, no server role); a view/proc `zapier.dbo.resolve_candidates` over them returns the whole candidate set in ONE fast indexed call, one row per (identifier → party). Generalizes the CFO's unfinished `pa_entity_lookup` view + the columns the backtest proved missing (scope/brand, prev_customer, quote, email-domain, `is_unique_in_scope`, precedence). Called per email via the EXISTING `nxt-zap-client`; live-`nxt` cross-DB fallback for the long tail. **No copy of NXT data in Supabase** — everything stays inside the SQL estate, single-system, governance-clean.
- **Engine** — the validated precedence/blocklists/scoping as shared swarm-agnostic code, per-swarm `resolution_config`. `environment_id='BX'` is a MANDATORY hard filter; `brand_id` is a TIEBREAKER (cross-brand forwarding is bidirectional). Canonical stored key = `customer.id` composite (e.g. `BX594313`).
- **Source Adapters** — NXT adapter = the `zapier.dbo` resolver over `nxt`, called via the existing `nxt-zap-client`; SugarCRM adapter (V10.0) exposes the same projection shape from Sugar.

**Validation amendments (2026-06-01 — pre-build adversarial re-validation; authoritative, see `.planning/spikes/010-comprehensive-backtest/VALIDATION-FINDINGS-v8.2.md` + DESIGN-GUIDE §0.10):**

- **Write path CONFIRMED; seed is direct-SQL.** Zapier action can `MERGE` into `zapier.dbo`. The one-time projection seed runs **directly in SQL** (operator session; `nxt.dbo` read confirmed) — only the recurring delta-refresh + per-email reads use Zapier. No full-seed-through-Zapier gate.
- **RESL-05 collapses to a backfill.** The forward write-path already stamps `conversation_id` (`stage-2-customer-resolver.ts:182`); 377/383 labels are backfillable. Drop the "verify write-path stamps it" sub-task; keep a forward-rate check across all write paths.
- **RESL-08 (AUTO) needs an extraction gate + brand-safe gate + dry-run.** Lookup-layer precision is 17/17, but the *extraction* regexes are unguarded: add word-boundary id matching, run invoice-before-id, real `Ons klantnummer` exclusion, and **AUTO only on a single resolving candidate** (16/253 unresolved carry ≥2 subject IDs). Invoice: source = `nxt.dbo.invoice.exact_invoice_id` (env 91.7% / brand-scoped 99.84% / 0.16% flag-for-review); AUTO iff `(number, mailbox-brand)→1` AND prefix-family matches; cross-brand forward fails closed → SUGGEST by prefix-family. Ship behind a build-time full-population dry-run (Wilson-CI ≥99%) — n=16 ≠ ≥99% proof.
- **RESL-09 (domain):** union `customer.email` + `contact_person.email` (1.86×; marginal lever over today ≈ +18% via `customer.email`) — confirm the live `nxt.contact_lookup` SQL first. Platform-score = discovery aid only; curated List 3 stays authoritative. Prefer `status='active'`; mark postcode/VAT/KvK narrowing-only; drop `phone`.
- **RESL-14 (inheritance) → precedence fix + precision measurement (regraded NEEDS-MORE-VALIDATION).** The live resolver runs inheritance as Layer-1 AUTO-`high`, outranking the self-auth IDs and contradicting DESIGN-GUIDE §3 step-7. Pin precedence (self-auth/invoice **outrank** inheritance; demote inheritance to SUGGEST-high + cross-domain guard), measure inherited-sibling correctness, sequence after P1.
- **RESL-15 (noise) → narrow + carve-out.** werkbon-NOREPLY only; **remove the gov-AML/registration blanket** (minfin/fedasil/economie.fgov are real customers that auto-resolve via self-auth ID). Add a hard actionable-token carve-out: never noise-reclass if an email carries an invoice/Klantnummer/aanmaning/werkbon token.
- **New P0 config-drift items:** migrate all 6 `labeling_settings.nxt_database` off `nxt_benelux_prod`; reconcile `facturations@sicli-sud.be` vs the `debiteuren@sicli-sud.be` settings key (+ wire SS/SN to `zapier-debtor-ingest`); wire Berki `brand_id` BB+IN (currently BB only). Body extraction = per-source `COALESCE(body_full_text, body_text)`.
- **Generality is not a P0 deliverable.** Self-auth tier is debtor-specific (SugarCRM has no such stamps); build the debtor resolver behind a config seam and ship a "self-auth tier degrades to no-op" acceptance test as the only P0 generality claim.
- **Sizing:** 17% auto is a *floor* (self-auth IDs sit on ~47% of unresolved, none extracted today); the safe-auto % is a hypothesis until the dry-run measures it — plan on 17%.

**Requirements (RESL-xx):**

*P0 — Substrate + bugfixes*

- [ ] **RESL-01** Generic resolver projection in SQL — `zapier.dbo.resolve_candidates` (view/proc) over `nxt.dbo.*`, source-pluggable shape; registered as one `zapier_tools` row. **No Supabase copy of NXT data.**
- [ ] **RESL-02** NXT source adapter = **materialized indexed tables in `zapier.dbo`** (populated from `nxt`, env='BX', via a `MERGE` proc) + **scheduled-Zap 2–4h watermark refresh** (Schedule → SQL action; not a SQL Agent job) + the `pa_entity_lookup`-style `resolve_candidates` resolver over them; live-`nxt` cross-DB fallback for the long tail. Confirm the Zapier SQL action supports writes (`MERGE`), not just SELECT.
- [ ] **RESL-03** Stage 2 **dynamic dispatch** — `stage-2-customer-resolver.ts` reads `swarms.stage2_entity_resolver` + `resolution_config` (remove hardcoded `resolveDebtor`; the column has zero consumers today).
- [ ] **RESL-04** Blocklists + `resolution_config` as registry data (own-entity identifiers, freemail/ISP, platform/intermediary via platform-score; refreshable).
- [ ] **RESL-05** Lever-1 fix — backfill `debtor.email_labels.conversation_id` (prior backfill hit `emails` not `labels` → thread_inheritance fires 0×) + label write-path stamps it.
- [ ] **RESL-06** Brand/region scoping wired: `environment_id='BX'` hard filter everywhere; Berki mailbox scopes `brand_id IN ('BB','IN')` (7th brand `IN` = Inprevo, post-acquisition load of 1,756 customers, no own mailbox — dunning confirmed via `debiteuren@berki.nl`).

*P1 — Deterministic AUTO resolver (≥99% precision)*

- [ ] **RESL-07** Self-auth ID resolution — aanmaning subject `{id} - {name}`, body `Klantnummer: {id}`, werkbon `op locatie {site}` → `customer.id` (validated 47/47).
- [ ] **RESL-08** Number back-search — `exact_invoice_id` (env-scoped + brand tiebreaker), PO/order/job/quote, `previous_customer_id` fallback (73% have one) — via the Index, existence-checked (kills ~25% date false positives).

*P2 — Candidate generator*

- [ ] **RESL-09** Domain match over `customer.email` ∪ `contact_person.email` (2× addresses), blocklist + platform-score gated, env-scoped → candidate set.
- [ ] **RESL-10** Postcode narrowing over `customer.postcode` ∪ `site.postcode` ∩ candidates; strip own-brand + sender-HQ postcodes (extract ALL, not first).
- [ ] **RESL-11** Parent-id FM roll-up for multi-customer domains (cbre→59, vbtgroep→81).

*P3 — Suggestions + tiebreaker (HITL)*

- [ ] **RESL-12** On-behalf-of principal extraction ("namens / op verzoek van / uw klant X") for intermediary mail → name candidates; intermediary-domain guard.
- [ ] **RESL-13** LLM tiebreaker over the candidate set → ranked SUGGESTIONS in Bulk Review; operator choice captured (feeds V9.0).

*P4 — Thread inheritance*

- [ ] **RESL-14** Whole-thread inheritance via `conversation_id` (post RESL-05) + `conversation_context`; cross-domain guard (inherit across domains only when differing sender is own-brand-internal).

*P5 — Noise reclassification*

- [ ] **RESL-15** Reclassify automated noreply (werkbon-noreply ×21/mo) + government AML/registration notices to Stage 1 `swarm_noise_categories` — remove from the Stage-2 denominator.

**Sizing (live-measured):** ~17% safe auto-resolve (validated ~100% precision) · ~56% ranked suggestions (HITL) · ~27% genuinely hard · ~10% Stage-1 noise.

**Success criteria:**

- Auto-resolve **precision ≥ 99%** (cardinal constraint — a confident WRONG customer is the failure to avoid).
- Stage 2 unresolved rate **65% → ~35%** within N weeks of P1–P3 shipping.
- Operator-accepted-suggestion rate (top-1 / top-3) tracked on the suggestion bucket.
- Median time-to-resolve per row reduced (before/after).
- Zero own-customer / intermediary mis-resolutions in production sampling.

**Depends on / sequencing:** runs after v8.1 closes, before V9.0. Consumes the consolidated `nxt` DB (BX). First consumer = debtor-email; V10.0 sales-email reuses the Engine via a SugarCRM adapter (no engine rebuild).

**Evidence boundary:** Engine + Index validated on **NXT/debtor only**. Cross-backend generality (SugarCRM) is a designed seam, validated when the V10.0 adapter lands — no cross-swarm proof claimed.

**Operator open questions (gate P0; captured as risks, don't block definition):**

1. ~~Does `IN`-brand (Berki sister) dunning flow via `debiteuren@berki.nl`?~~ — **RESOLVED 2026-05-30 (operator): YES → Berki mailbox scopes `brand_id IN ('BB','IN')`.** `IN` = Inprevo, a post-acquisition load: all 1,756 BX/IN customers created 2026-05-01..28 (0 before May 1), confirming the fresh takeover. Dunning runs through `debiteuren@berki.nl`. (Recall impact is small short-term — invoices too new to dun yet — but grows as they age, so the scope must be set before then.)
2. ~~Production-safe path to read `nxt` for the sync~~ — **RESOLVED 2026-05-30:** no sync; the resolver lives in `zapier.dbo` and reads `nxt` cross-DB via the production Zapier SQL action. DDL in `zapier` + same-instance cross-DB to `nxt` confirmed (live-probed: 74,432 BX customers; multi-statement parametrized T-SQL runs through the action). Canonical store = SQL Server `nxt`.
3. ~~Acceptable sync latency (2–4h)~~ — **moot (no sync).** Residual: per-email resolver latency over the Zapier hop (async; existing client waits ≤20s) — accept, or add the `zapier.dbo` materialized index.

**Risks:** confident wrong-customer via BE invoice collision (mitigated: env hard-filter + brand tiebreaker + flag-for-review at 0.16% residual); intermediary-domain false positives (platform blocklist + on-behalf-of); own-footer self-match (own-identifier strip); `nxt` is un-indexable views (mitigated by the synced Index).

---

## V11.0 Intent-Prioritised Handlers (Defined: 2026-05-12)

**Phases:** TBD (numbered after V10.0 phases are finalized)
**Status:** Defined — depends on V10.0 producing intent-volume signal across two swarms

**Goal:** Convert Stage 3 intent volume into Stage 4 handler coverage in priority order. Today the Kanban human-lane (Phase 76) is the catch-all for intents without handlers — operators do them by hand. V11.0 builds the dashboard that ranks uncovered intents by frequency, plus a scaffolding template that turns "the top-3 uncovered intents" into 3 new handler phases per milestone cycle.

**Target capabilities:**

- Intent-coverage dashboard reading `swarm_intents` (handler-mapped) ∪ `pipeline_events` (Stage 3 verdicts) — surfaces the gap and ranks by 30-day frequency × business-value weight
- Handler-scaffolding template (`/gsd-add-phase` integration) — given a chosen intent, drafts a Stage 4 handler phase with CONTEXT.md pre-filled (intent definition from V9.0 + sample emails + suggested side-effects)
- Dispatch via `swarm_intents.handler_event` registry — new handlers register via INSERT, no code edits to `stage-3-dispatcher.ts`
- Per-intent volume telemetry in the existing `pipeline_events_email_summary_v2` view, exposed via the dashboard

**Architecture:** Reads from V9.0 (intent definitions from operator prose) and V10.0 (intent-frequency telemetry across both swarms). Does NOT introduce new auto-execution — handlers still ship via standard phases, but the *prioritisation* is data-driven instead of opinion-driven.

**Success criteria:** N most-frequent uncovered intents have shipped handlers within Y weeks of being identified. Concrete numbers TBD when V10.0 produces baseline volume data.

**Depends on:** V10.0 (multi-swarm intent volume signal; sales-email-specific Stage 3 intents shipping)

---

## V10.0 Sales-Email Canonical Pipeline (Defined: 2026-05-12)

**Phases:** TBD (Phase 78 directory exists but is empty — needs proper plan)
**Status:** Defined — depends on V9.0 Stream B (intent capture) being operator-usable

**Goal:** `verkoop@smeba.nl` runs the same canonical 5-stage funnel as debtor-email, end-to-end, with full Bulk Review trace. Today Phase 74 stops sales-email at `manual_review` for noise categories; Phase 78 was never executed; the `sales-email-analyzer/` module is the legacy direct-Orq.ai path. V10.0 is the actual "second swarm validation" that v8.0 promised.

**Target capabilities:**

- New sales-email Stage 2 entity resolver — Sugar-account lookup (SugarCRM SDK or Zapier bridge), NOT a copy of debtor-email's NXT resolver. Customer-less emails fall through to Stage 3.
- Sales-email-specific Stage 3 intent agent — separate from `debtor-intent-agent`; intents derived from V9.0 Stream B prose feedback by the sales-email operator
- Phase 78 properly planned and executed (currently `.gitkeep` only) — includes the Sugar archive resolve route (Phase 75 in ROADMAP) + flipping noise categories from `manual_review` back to `categorize_archive`
- Multi-operator handling — V9.0 added single-operator scaffolding; V10.0 forces `operator_id` columns, scope filtering in the Learning Inbox, and vocabulary-reconciliation in the synthesis layer (different operators describe the same intent differently)
- Stage 0 telemetry coverage for sales-email already at 91% (no Phase 82.2 follow-up needed)

**Architecture:** Sales-email is the second customer of V9.0's feedback infrastructure. Both swarms write to the same `pipeline_events`, the same `agent_runs`, the same `promotion_candidates` (V9.0 table). The sales-email operator and the debtor-person produce parallel feedback streams that the V9.0 synthesis layer aggregates into proposed system changes.

**Success criteria:**

- X% of inbound sales emails reach a Stage 3 verdict without `manual_review` (target TBD — current baseline ≈ 0% via the canonical path)
- Sales-email operator gives Stream B feedback for ≥ 80% of Stage 3 rows within first 14 days
- At least one V9.0-proposed system change is approved using cross-swarm feedback (i.e., the synthesis layer sees both operators' input)

**Depends on:** V9.0 (Stream B operator surface live; promotion_candidates table; synthesis layer ≥ T2)

---

## V9.0 Promotion Recommender + Learning Inbox (Defined: 2026-05-12)

**Phases:** TBD — Phase 72 from v8.0 reframed; old phase definition (telemetry-only "promotion candidates") deprecated
**Status:** Defined — depends on v8.0 closure (Phase 82.2 + Phase 82.4)

**Scope cut 2026-05-12:** Capture infrastructure (`email_feedback` table, Stage 2/3 prose form, history view) moved into v8.0 as **Phase 82.4** so the debtor-person has a place to put feedback from day 1 of their onboarding (2026-05-18). V9.0 is now **pure synthesis on top of pre-existing captured data** — smaller scope, cleaner thesis.

**Goal:** Turn captured operator prose feedback into proposed system changes via LLM synthesis (T2 draft-proposer tier). Read `email_feedback` (populated by 82.4), cluster by pattern, draft concrete changes, surface in a Learning Inbox tab on Bulk Review, apply on one-click for data-shaped changes.

**Target capabilities:**

- **Synthesis layer** (T2, weekly batch): LLM reads N days of `email_feedback`, clusters by pattern (e.g., "12 Stage 2 fails this week clustered into 3 patterns: (a) PO-number-in-body, (b) intra-company forwards, (c) supplier-on-behalf-of"), drafts a concrete change for each cluster (new resolver step / new noise rule / new intent definition), writes to a new `proposed_actions` table.
- **Learning Inbox UI** — new tab on Bulk Review (NOT a separate page): filtered view of `proposed_actions WHERE status='pending_review'`. Operator sees the cluster + the draft change + a one-click "Apply" that executes the data-shaped changes (INSERT into `swarm_intents` / `classifier_rules` / new resolver-step row).
- **Immediate-apply enablement on new intents** — flip the V9.0 switch so 82.4-captured new-intent labels enter the Stage 3 LLM's intent list automatically (with the fuzzy-match dedup already in 82.4). 82.4 captures; V9.0 wires it through.
- **Data-driven resolver steps** — refactor `resolveDebtor` from hardcoded 4-layer pipeline to data-driven `stage2_resolver_steps` table so LLM-proposed resolver changes land as INSERTs, not PR code review.
- **Eval gate for the clusterer** — held-out dataset of ≥ 100 captured Stage 2/3 corrections (from 82.4's accumulating corpus) with hand-labelled cluster IDs; LLM clusterer must hit X% accuracy before going live (Phase 1 deliverable, not side-quest).

**Inherited from Phase 82.4 (already shipped under v8.0):**

- `email_feedback` table + Stage 2 incorrect-mapping form + Stage 3 confirm-or-correct form + own-feedback-history view + fuzzy-match guardrail on new-intent typing.

**Seed (planted 2026-05-20):**

- **Granular dry-run gating — per stage, per handler, with review-pane labeling.** Replace the single `labeling_settings.dry_run` boolean (which only gates Stage 3 intent labeling today, while `debtor-email-icontroller-cleanup-worker` writes live regardless — 867 real iController deletes in the last ~4 weeks despite SMEBA being "dry-run") with per-stage / per-handler gates: `stage_1_archive_dry_run`, `stage_1_cleanup_dry_run`, `stage_3_labeling_dry_run`, `stage_4_handler_<name>_dry_run` (or a `dry_run_gates jsonb` map keyed by stage+side-effect). Stamp origin dry-run status on `pipeline_events.decision_details` at emit time so Bulk Review can render a `dry-run` chip per row (computed from event payload, not lookup time — survives flips). Pairs naturally with V9.0's promotion-criteria work (each gate can have its own Wilson-CI threshold instead of one global). **Source todo:** `2026-05-18-granular-dry-run-gating-per-stage-and-handler.md`. Open question: whether to also add kill-switch flags for the always-live classifier stages (Stage 0/2/3 classifier) for runaway-classifier scenarios — probably a separate feature-flag mechanism, not `labeling_settings`.

**Architectural decisions (locked):**

- **Synthesis tier: T2.** LLM drafts; operator clicks approve; system applies for data-shaped changes only. Code-shaped changes fall back to "LLM drafted, human implements" (T1).
- **Operator: single (debtor-person)** — multi-operator handling deferred to V10.0
- **Wilson-CI noise-rule promotion coexists**, not absorbed. `labeling-flip-cron` keeps running in the background. V9.0 only touches Stage 2/3.
- **Stage scope: 2 + 3 only** — Stages 0/1 already have 4-axis overrides in Bulk Review (Phase 71); no prose needed. Operator effort ≈ 50 events/day (15 with prose), not 250.
- **Form shape: structured-first, prose-optional** — operator confirms LLM verdict in 5 seconds when correct; types prose only when overriding or proposing new label.

**Success criteria:**

- ≥ 80% of repeat Stage 3 overrides get auto-suppressed within 7 days (the new intent is applied immediately, the next similar email is classified correctly without operator intervention)
- ≥ 1 V9.0-proposed Stage 2 system change shipped per week (drafted by LLM, applied via Learning Inbox)
- Operator time per Stage 3 row ≤ 15 seconds median (structured confirm path)
- Clusterer eval accuracy ≥ X% on held-out set before T2 goes live (X TBD)

**Depends on:** v8.0 closure (82.2 telemetry + 82.3 audit surface + 82.4 capture); debtor-person operator availability from 2026-05-18

**Risk register:**

- LLM clusterer over-generalises → mitigated by held-out eval gate
- New-intent fragmentation (operator types 3 variants of same intent) → mitigated by fuzzy-match UX guardrail at form level (V9.0 ships fuzzy-match; 82.4 captures variants without it)
- "Immediate apply" creates intent-list pollution → mitigated by weekly cleanup pass in synthesis layer (merges duplicate intents)
- Operator fatigue → mitigated by Option Z chip defaults OFF (audit-first is opt-in, not forced) + structured-first form; if fatigue still appears, V9.0 falls back to calibration sampling (below) instead of every-row review

**Future-state pinned 2026-05-12 — calibration sampling:**

Once the system is stable and the debtor-person is calibrated, V9.0+ introduces a sampling mode where the system surfaces ~10% of auto-handled green rows for forced re-review per week. Purpose: keep operator accuracy benchmarked over time and detect silent model drift. Operator scrolls the green rows only when they want to (Option Z chip default OFF) — calibration sampling pushes a configurable percentage to the top of stage tabs as "due for re-review" until the operator processes them. Out of scope for V9.0 v1; revisit when there's ≥4 weeks of `email_feedback` data to set the sampling rate against.

---

## v7.0 Agent OS (Shipped: 2026-04-30)

**Phases completed:** 18 phases, 50 plans, 15 tasks

**Key accomplishments:**

- 4 V7 foundation tables (agent_events, swarm_jobs, swarm_agents, swarm_briefings) with indexes, RLS, and Supabase Realtime publication
- Microsoft SSO button on /login, access-pending page for unauthorized users, and project_members gate on the dashboard layout with middleware exemption.
- V7 swarm sidebar + single-channel Realtime provider and hook.
- `/swarm/[swarmId]` route, layout shell, and 404.
- DB migration + shared MCP helper + pure trace mapper with 8 unit tests.
- Inngest cron function that syncs Orq.ai traces to agent_events, and its route registration.
- Orq.ai Briefing Agent + server action + client panel + 30-min cron.
- Slide-out drawer + shell wiring + test fixture.
- Live event stream with bounded ring buffer.
- 5-column Kanban board with dnd-kit + optimistic moveJob server action.
- 3 sidebar filter chips with shareable URL state.
- Cinematic SVG graph wired to live Realtime data: nodes from swarm_agents, edges from agent_events.parent_span_id traversal, animated particles on edges active in the last 60 seconds.
- Per-agent Gantt-style timeline of recent activity. One lane per swarm_agent (alphabetical, capped at 8), bars colored by event type with terminal-type promotion, hover/focus reveals a tooltip with span name, duration, agent, and timestamps. Reuses Phase 49's SwarmRealtimeProvider via useRealtimeTable.
- Two RLS-protected Supabase tables (`public.swarms` + `public.swarm_categories`) plus a 60s in-memory TTL loader (`web/lib/swarms/registry.ts`) that lets Wave 2 verdict-worker and Wave 3 generic queue UI pivot off DB rows instead of hardcoded constants.
- Rewrote `classifier-verdict-worker` to dispatch by `swarm_categories.action` (4-branch switch) instead of the hardcoded `CATEGORY_LABEL` map — adding a future swarm with a custom side-effect now requires only `INSERT swarms` + `INSERT swarm_categories(action='swarm_dispatch')` + a new Inngest worker, with zero edits to this file.
- One-liner:
- `web/lib/automations/swarm-bridge/sync.ts`
- Replaced unfiltered automation_runs postgres_changes with one broadcast per write on `automations:${automation}:stale` and a subscriber that opens one channel per explicit name (no LIKE, no ancestor fanout).
- 500ms emit-the-latest debounce inside `web/lib/supabase/broadcast.ts` keyed by (channel, event-key); chat tokens and chat messages bypass; zero caller-site edits.
- 1. [Rule 3 - Tooling] vitest 4.x dropped `--reporter=basic`
- 1. [Rule 3 — Plan vs live-DB] `mailbox_id: settings.id` replaced with `ICONTROLLER_MAILBOXES` lookup
- 1. [Rule 1 -- Bug in plan example] Test fixtures n=50, agree=49 do NOT clear the 0.95 promote gate
- 1. [Rule 3 - Blocking] Test DOM leakage between renders
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- 1. [Rule 3 - Blocker] Zod v4 strict UUID validator rejected test fixtures
- 1. [Rule 3 - Blocker] jsdom does not populate `isContentEditable` after `setAttribute`
- `web/app/(dashboard)/automations/debtor-email-review/detail-pane.tsx`

---

## V7.0 Agent OS (Defined: 2026-04-15)

**Phases:** 7 (phases 48-54)
**Requirements:** 45 (DS-01-04, AUTH-01-03, NAV-01-04, RT-01-04, DATA-01-03, BRIEF-01-03, FLEET-01-04, DRAW-01-04, GRAPH-01-04, KAN-01-04, OBS-01-05, POL-01-03)

**Planned deliverables:**

1. New design system (Satoshi + Cabinet Grotesk, glassmorphism, dark/light toggle with parallel --v7-* tokens)
2. Azure AD OAuth SSO with automatic account linking for existing email/password users
3. Sidebar with dynamic swarm navigation and live mini-stats
4. Single Supabase Realtime subscription per swarm view distributing events to all child components
5. Inngest orqai-trace-sync cron pipeline from Orq.ai traces to agent_events table
6. Subagent fleet cards with metrics, skills, and recursive agent detail drawer
7. AI narrative briefing via dedicated Orq.ai Briefing Agent on 30-minute schedule
8. Claude-style terminal event stream with ring buffer and virtualized rendering
9. 5-column Kanban board with dnd-kit drag-and-drop and optimistic persistence
10. Live delegation graph with CSS-animated particles at 60fps
11. Gantt-style observability swimlanes per agent
12. V7 design token migration for all existing pages

**Architecture:** Supabase Realtime postgres_changes pattern -- Inngest cron polls Orq.ai, writes to agent_events, Realtime propagates to all connected UIs. Single subscription per swarm view, ring buffers for unbounded streams.

**Design reference:** docs/designs/agent-dashboard-v2.html

**Research flags:**

- Phase 50: Orq.ai trace MCP tool names unverified (list_traces/list_spans) -- must validate before planning
- Phase 53: Custom SVG swimlane complexity -- flag for early prototype

---

## V6.0 Executive Dashboard & UI Revamp (Defined: 2026-03-27)

**Phases:** 4 (phases 44-47)
**Requirements:** 26 (UIDX-01-06, EDASH-01-06, DINT-01-06, PEXT-01-05, O365-01-03)

**Planned deliverables:**

1. Extended project model with status lifecycle (idea/building/testing/live) and automation type classification
2. Zapier analytics browser scraper (Browserless.io) and Orq.ai analytics collector (MCP API) with Inngest cron scheduling
3. Executive dashboard with KPI cards, trend charts, project status distribution, ROI estimates, and health indicators -- all from pre-computed snapshots
4. Automated project status monitoring (auto-apply forward, suggest-only backward)
5. O365 SSO via Azure AD OAuth alongside existing email/password auth
6. Full UI redesign with Moyne Roberts branding, dark mode, responsive layout

**Architecture:** Pre-computed snapshot pattern -- Inngest cron functions collect data from Zapier (browser scraper) and Orq.ai (MCP analytics API), write to intermediate Supabase tables; dashboard reads only from pre-computed snapshots for sub-100ms loads.

---

## V2.1 Experiment Pipeline Restructure (Shipped: 2026-03-13)

**Phases completed:** 8 phases, 9 plans
**Timeline:** 3 days (2026-03-11 → 2026-03-13)
**Deliverables:** 5 new subagents + 2 rewritten commands (2,421 lines)
**Requirements:** 24/24 satisfied (DATA-01-05, EXPR-01-06, ANLZ-01-05, TEST-01-03, ITPIPE-01-06, LOOP-01-03)

**Key accomplishments:**

1. Dataset-preparer subagent with MCP/REST upload, smoke test validation, stratified 60/20/20 splits, and JSON handoff contract
2. Experiment-runner subagent with REST-only execution, adaptive 10-30s polling, holdout re-test mode, and per-run per-evaluator raw scores
3. Results-analyzer subagent with Student's t 95% CI statistics, role-based pass/fail thresholds, category-sliced scoring, and backward-compatible hardener output
4. Rewritten test.md orchestrating 3 subagents with validation gates between each step
5. Failure-diagnoser + prompt-editor subagents for section-level diagnosis, HITL-approved diffs, re-deploy delegation, and before/after score comparison
6. Rewritten iterate.md with 2-subagent loop, 5 stop conditions, and holdout re-test verification

**Tech debt accepted:** 1 non-blocking item (evaluator_ids passthrough optimization — see V2.1-MILESTONE-AUDIT.md)
**Archive:** `milestones/V2.1-ROADMAP.md`, `milestones/V2.1-REQUIREMENTS.md`

---

## V2.0 Autonomous Orq.ai Pipeline (Shipped: 2026-03-02)

**Phases completed:** 7 phases, 11 plans
**Timeline:** 2 days (2026-03-01 → 2026-03-02)
**Codebase:** 10,628 lines (orq-agent/ — markdown + JSON)
**Requirements:** 23/23 satisfied (DEPLOY-01-08, TEST-01-05, ITER-01-07, GUARD-01-03)

**Key accomplishments:**

1. Deployer subagent with MCP-first/REST-fallback deployment pipeline, idempotent create-or-update, and read-back verification
2. Tester subagent with V1.0 dataset transformation, role-based evaluator auto-selection, and 3x median experiment execution via evaluatorq SDK
3. Iterator subagent with evaluator-to-section failure diagnosis, diff-style proposals, HITL approval, and 4 automatic stopping conditions
4. Hardener subagent with evaluator-to-guardrail promotion via native Orq.ai `settings.guardrails` API and threshold-based quality gates
5. Per-agent incremental operations (`--agent` flag) across all 4 pipeline commands with interactive deploy picker
6. Complete data contract alignment across deploy/test/iterate/harden pipeline (holdout dataset paths, flag conventions, step numbering)

**Tech debt accepted:** 5 non-blocking items (see V2.0-MILESTONE-AUDIT.md)
**Archive:** `milestones/V2.0-ROADMAP.md`, `milestones/V2.0-REQUIREMENTS.md`

---

## v0.3 Core Pipeline + V2.0 Foundation (Shipped: 2026-03-01)

**Phases completed:** 11 phases (V1.0: 8, V2.0: 3), 28 plans, 147 commits
**Timeline:** 6 days (2026-02-24 → 2026-03-01)
**Codebase:** 43 files, 7,162 lines (markdown + shell + JSON)
**Requirements:** 50/50 satisfied (40 V1.0 + 10 V2.0)

**Key accomplishments:**

1. End-to-end agent swarm generation from natural language use cases — architect → researcher → spec-gen → orchestration → tools → datasets → README
2. Adaptive pipeline with structured discussion — surfaces domain gray areas, skips research when input is detailed
3. KB-aware pipeline — end-to-end knowledge base support from discussion through orchestration output
4. XML-tagged prompt strategy with Anthropic context engineering patterns across all 7 subagents
5. Tool resolver with unified catalog — verified recommendations for built-in, function, HTTP, MCP, and agent-as-tool types
6. Modular install with capability tiers (core/deploy/test/full) — API key validation, MCP auto-registration for V2.0

**Tech debt accepted:** 8 non-blocking items (see v0.3-MILESTONE-AUDIT.md)
**Archive:** `milestones/v0.3-ROADMAP.md`, `milestones/v0.3-REQUIREMENTS.md`

---
