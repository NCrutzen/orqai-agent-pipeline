# Phase 111: Stage 1 Noise Expansion + Calibration - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Calibrate and expand the **sales-email** Stage 1 noise filter so it stops over-routing sales noise into manual review — delivered entirely as audit-trailed registry data + reused promotion machinery, no swarm-specific code branches.

**In scope:**
- Flip the *safe* core sales noise categories (`auto_reply`, `ooo_temporary`, `ooo_permanent`) from `manual_review` → `categorize_archive`, behind the shadow→promote gate. Keep `payment_admittance` + `unknown` at `manual_review` with recorded rationale (STAGE1-01).
- Discover *new* sales-specific noise rules from the corpus and add them as registry data, data-driven (STAGE1-02).
- Re-validate the 8 inherited AP-noise rules for sales fit; specifically resolve `own_outbound_invoice_loopback`'s sales default from data (STAGE1-02).

**Out of scope (other phases):**
- Wiring the actual Outlook-archive side-effect + backfill (Phase 112 / CLEANUP-01).
- Stage 3 sales intent agent + `swarm_intents` (Phase 113).
- An ongoing organic LLM noise-proposal discovery surface (deferred — see `<deferred>`).
- SugarCRM dead-data/source disposition (Phase 115).

**Note on inertness:** sales `swarms.side_effects=[]` and `dry_run_config` all-blocked until Phase 112, so flipping a category's `action` to `categorize_archive` in this phase changes the *classification disposition* but fires **no live archive** — the registry decision and the production write are deliberately separated across 111→112.

</domain>

<decisions>
## Implementation Decisions

### Calibration evidence & promote bar
- **D-01:** Calibration evidence comes from a **retro-run of the Stage 1 classifier (regex Pass 1 + LLM 2nd-pass) over BOTH corpora**: the live `verkoop@smeba.nl` Outlook traffic (827+, growing) **and** the 34k historic Smeba corpus (`email_pipeline.emails source='sugarcrm'`). Phase-87-style: read from Supabase, idempotent, produces per-category hit-rate + false-archive estimates. (Provenance of the historic set is genuine SugarCRM import, not Outlook — irrelevant for calibration; it's valid Smeba mail. See `<specifics>`.)
- **D-02:** The promote bar is **Wilson CI lower-bound ≥ 0.92 with n ≥ 30** — debtor's exact statistical gate (`PROMOTE_N_MIN` + `PROMOTE_CI_LO_MIN` in `web/lib/classifier/wilson.ts`). No new gate logic; cross-swarm consistent.

### Shadow→promote gate mechanism
- **D-03:** **Reuse debtor's Wilson-CI `classifier_rules` promotion lifecycle** (candidate → promoted → demoted, with the asymmetric-hysteresis N floor) for sales, scoped by `classifier_rules.swarm_type` (composite PK `(swarm_type, rule_key)`). No one-time manual shadow window; the ongoing promotion cron self-corrects (auto-demote on drift, `DEMOTE_N_MIN=30 ∧ ci_lo<0.88`).
- **D-04:** LLM 2nd-pass verdicts mint synthetic rule keys `llm:{category_key}:{confidence}` (per the `stage-1-llm-promotion-track` todo) so the existing whitelist/promotion path works untouched. Stage 1 worker sets `matchedRule = "llm:" + categoryKey + ":" + confidence` for LLM-derived verdicts; regex verdicts unchanged.
- **D-05:** **Seed `high`-confidence candidate rows only**, with **organic accumulation** — no pre-promotion from the retro baseline. `medium`/`low` confidence stay in review by design (gate-narrow first, expand later). The retro-run (D-01) informs *which* categories are worth seeding and predicts promotability via `shadow_would_promote`, but does not bypass the candidate phase.

### Safe-flip selection (STAGE1-01)
- **D-06:** Safe → flip to `categorize_archive`: `auto_reply`, `ooo_temporary`, `ooo_permanent`. Stay at `manual_review` with recorded rationale: `payment_admittance` (financial admittance — operator-visible), `unknown` (the Stage 2/3 fall-through — must never auto-archive). Delivered as a migration with audit trail.

### New-rule discovery (STAGE1-02)
- **D-07:** Discover new sales noise rules via a **cluster-mining script run once against the retro-run's `unknown`/non-noise bucket** — group leftovers by signature (sender domain, subject prefix, body boilerplate), rank clusters by size, surface a ranked candidate list for **operator approval** before any `swarm_noise_categories` row is added. Reuse the spike-002 first-match-wins cluster classifier tooling (`.claude/skills/spike-findings-agent-workforce/sources/002-smeba-info-noise-patterns/`). Data-driven, inspectable, operator-gated — satisfies "not hand-curated."

### Inherited AP-rules + loopback (STAGE1-02)
- **D-08:** Keep the **7 inherited AP-noise rules as-is** for sales (inherited trust from debtor calibration): `coupa_invoice_approved_notification`, `coupa_invoice_paid_notification`, `frieslandcampina_portal_reject`, `iss_ptp_autoreply`, `m365_quarantine`, `sender_phishing_notice`, `supplier_bank_change_notification`. They remain at `categorize_archive` (inert until Phase 112).
- **D-09:** **`own_outbound_invoice_loopback` is the one exception — test-first.** Run it against the sales corpus in the retro-run; decide enable/disable for sales purely from the measured false-archive rate (it mis-archived ~40% on debtor and is disabled there). No preset default.

### Claude's Discretion
- **Rule form per discovered candidate (D-07):** whether a newly-approved noise pattern lands as a deterministic **regex rule** (Pass 1, free) or an **LLM-category row** (rides the promotion gate) is the planner/executor's call per-candidate, based on whether the pattern has a crisp deterministic signature. (User explicitly delegated this.)
- Audit-trail content/shape for the migration(s), retro-run scoping/sampling details, and any dashboard surfacing of `llm:*` rows — planner's discretion within the registry-data + reuse constraints above.

### Folded Todos
- **`2026-05-20-stage-1-llm-promotion-track.md`** (originally scoped as Phase 89) — folded as the core gate mechanism for this phase (D-03/D-04/D-05). Problem it solved: LLM 2nd-pass verdicts always landed in bulk-review because `isWhitelistMatch===false` for every LLM verdict (`matchedRule==="no_match"`). The `llm:{category}:{confidence}` namespace + Wilson-CI extension fixes it and is cross-swarm reusable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stage 1 architecture (locked)
- `docs/agentic-pipeline/README.md` — v8.0 5-stage funnel; Swarm Shapes; no per-swarm branches.
- `docs/agentic-pipeline/stage-1-regex.md` — two-pass noise filter (regex Pass 1, LLM `stage-1-category-classifier` Pass 2 on `unknown`); closed list = noise keys + `unknown`; the 3-place noise-key source-of-truth invariant (TS validator, `swarm_noise_categories.category_key`, Orq agent json_schema enum).
- `docs/agentic-pipeline/stage-3-coordinator.md` — hard separation: a row is in `swarm_noise_categories` (Stage 1) XOR `swarm_intents` (Stage 3), never both.

### Promotion model + Stage 1 implementation
- `web/lib/classifier/wilson.ts` — Wilson-CI gate constants (`PROMOTE_N_MIN`, `PROMOTE_CI_LO_MIN=0.92`, `DEMOTE_N_MIN=30`, `DEMOTE_CI_LO_MAX=0.88`).
- `web/lib/debtor-email/classify.ts` — Pass 1 regex reference (rules ordered by specificity, first match wins).
- `web/lib/inngest/functions/classifier-screen-worker.ts` — LLM 2nd-pass invocation + the `autoActionAllowed` whitelist gate that D-04 extends.
- `web/lib/inngest/functions/classifier-verdict-worker.ts` — `swarm_noise_categories` dispatch switch on `action`.
- `.planning/todos/pending/2026-05-20-stage-1-llm-promotion-track.md` — full mechanism spec (folded; D-03/D-04/D-05).

### Discovery tooling + cross-swarm transfer
- `.claude/skills/spike-findings-agent-workforce/SKILL.md` — registry-driven Stage 1 noise rules; 56% of debtor regex transfers cross-swarm.
- `.claude/skills/spike-findings-agent-workforce/sources/002-smeba-info-noise-patterns/` — first-match-wins cluster classifier (reuse for D-07).
- `.claude/skills/spike-findings-agent-workforce/sources/004-smeba-non-noise-shape/` — deterministic seeded sample of post-noise unknown bucket (pattern for retro sampling).

### Project state / data
- `.planning/STATE.md` — Phase 110-04 closeout; sales registry now full-funnel + `dry_run_config` (all blocked).
- `.planning/phases/87-retro-classification-and-intent-volume-baseline/` — retro-run pattern (idempotent corpus re-classification, `stage_3_retro_runs` analog) to mirror for D-01.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Wilson-CI promotion lifecycle** (`classifier_rules` table + promotion cron + `web/lib/classifier/wilson.ts`): reused wholesale, swarm-scoped — the gate for D-03.
- **Spike-002 cluster classifier**: first-match-wins signature clustering — reused for the D-07 discovery script.
- **Phase 87 retro-run pattern**: idempotent re-classification over a Supabase corpus — mirrored for D-01.

### Established Patterns
- **Registry as source of truth** (Phase 68/69): noise dispatch lives in `swarm_noise_categories` rows; the closed noise-key list must agree across 3 places (TS validator / Postgres rows / Orq agent json_schema enum) — any new noise key added by D-07 must update all 3.
- **No per-swarm branches**: gate, discovery, and dispatch must work via `swarm_type`-scoped data, not `if (swarm === 'sales')` code. A need for new code in `classify.ts`/classifier workers is a cross-swarm architecture bug to fix generically.
- **Registry-decision vs production-write separation**: flipping `action` here is inert (side_effects=[] / dry_run blocked) until Phase 112 wires the Outlook-archive side-effect.

### Integration Points
- Live sales `swarm_noise_categories`: 5 core keys at `manual_review` (`auto_reply`, `ooo_temporary`, `ooo_permanent`, `payment_admittance`, `unknown`) + 8 inherited AP keys at `categorize_archive` (inert).
- `email_pipeline.emails`: live `source='outlook' mailbox='verkoop@smeba.nl'` (827+) + historic `source='sugarcrm'` (34,368 content-bearing) — the two retro-run corpora.
- Per-mailbox `pipeline_health_snapshots.source_mailbox` (Phase 110-04) — throughput visibility for `verkoop@smeba.nl`.

</code_context>

<specifics>
## Specific Ideas

- **The "sugarcrm" corpus is genuine SugarCRM-imported Smeba mail**, not an Outlook fetch (verified 2026-06-03: 34,368 rows carry SugarCRM Emails-module bean `raw_json`; only 0.4% overlap with the Outlook set). For Phase 111 this is **just a valid Smeba email corpus to mine** — provenance does not matter for noise-rule calibration. Disposition of the source stays with Phase 115.
- Target outcome echoing the promotion-track todo: lift Stage 1 auto-archive coverage from "~1 of 9 noise emails" toward "6–8 of 9" as high-confidence LLM/regex rules promote organically.

</specifics>

<deferred>
## Deferred Ideas

- **Organic LLM noise-proposal discovery surface** — adapting the Phase 86 open-set discovery UI (built for Stage 3 *intents*) to emit/collect Stage 1 *noise* proposals over time. Out of scope for a corpus-mining phase; revisit as a later ops-phase capability if the one-time cluster-mining (D-07) proves insufficient.

### Reviewed Todos (not folded)
- `2026-05-18-granular-dry-run-gating-per-stage-and-handler.md` — already shipped in Phase 110-04 (per-stage `dry_run_config`).
- Bulk-review UI todos (`2026-05-18-override-note-flow-unclear.md`, `2026-05-18-stage-1-needs-review-semantics.md`, `2026-05-19-stage-4-layout-parity...`) — frontend surface, not Stage 1 calibration; belong to review-surface work, not Phase 111.

</deferred>

---

*Phase: 111-stage-1-noise-expansion-calibration*
*Context gathered: 2026-06-03*
