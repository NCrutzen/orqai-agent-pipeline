# Phase 111: Stage 1 Noise Expansion + Calibration — Research

**Researched:** 2026-06-03
**Domain:** Stage 1 noise-filter calibration (sales-email swarm) — registry-data only, reusing the Wilson-CI promotion machinery and the corpus retro-run pattern
**Confidence:** HIGH (live DB verified, all key code paths read in full)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Calibration evidence = retro-run of Stage 1 classifier (regex Pass 1 + LLM 2nd-pass) over BOTH corpora: live `verkoop@smeba.nl` Outlook (827+, now **853** verified) AND the **34,725** historic `source='sugarcrm'` Smeba corpus. Phase-87-style: read from Supabase, idempotent, per-category hit-rate + false-archive estimates.
- **D-02:** Promote bar = Wilson CI lower-bound ≥ 0.92 with n ≥ 30 — debtor's exact gate (`PROMOTE_N_MIN`, `PROMOTE_CI_LO_MIN` in `web/lib/classifier/wilson.ts`). No new gate logic.
- **D-03:** Reuse debtor's Wilson-CI `classifier_rules` promotion lifecycle (candidate → promoted → demoted with asymmetric-hysteresis N floor) for sales, scoped by `classifier_rules.swarm_type` (composite PK `(swarm_type, rule_key)`). No one-time manual shadow window; the ongoing promotion cron self-corrects.
- **D-04:** LLM 2nd-pass verdicts mint synthetic rule keys `llm:{category_key}:{confidence}`. Stage 1 worker sets `matchedRule = "llm:" + categoryKey + ":" + confidence` for LLM-derived verdicts; regex verdicts unchanged.
- **D-05:** Seed `high`-confidence candidate rows only, with organic accumulation — no pre-promotion from the retro baseline. `medium`/`low` stay in review by design.
- **D-06:** Safe → flip to `categorize_archive`: `auto_reply`, `ooo_temporary`, `ooo_permanent`. Stay at `manual_review` with rationale: `payment_admittance`, `unknown`. Delivered as a migration with audit trail.
- **D-07:** New-rule discovery via cluster-mining script over the retro-run's `unknown`/non-noise bucket + operator approval (reuse spike-002 first-match-wins cluster classifier). Data-driven, inspectable, operator-gated.
- **D-08:** Keep the 7 inherited AP-noise rules as-is for sales (inherited trust): `coupa_invoice_approved_notification`, `coupa_invoice_paid_notification`, `frieslandcampina_portal_reject`, `iss_ptp_autoreply`, `m365_quarantine`, `sender_phishing_notice`, `supplier_bank_change_notification`. Remain at `categorize_archive`.
- **D-09:** `own_outbound_invoice_loopback` is the one exception — test-first against the sales corpus; enable/disable purely from measured false-archive rate. No preset default.

### Claude's Discretion

- **Rule form per discovered candidate (D-07):** deterministic regex rule (Pass 1) vs. LLM-category row (rides the promotion gate) is the planner/executor's call per-candidate, based on whether the pattern has a crisp deterministic signature. **(See Pitfall 1 / Open Q 4 — choosing "regex" for sales currently requires a code change because sales has no regex module.)**
- Audit-trail content/shape for the migration(s), retro-run scoping/sampling details, dashboard surfacing of `llm:*` rows — planner's discretion within the registry-data + reuse constraints.

### Deferred Ideas (OUT OF SCOPE)

- **Organic LLM noise-proposal discovery surface** — adapting the Phase 86 open-set discovery UI to emit/collect Stage 1 noise proposals over time. Revisit as a later ops-phase if one-time cluster-mining (D-07) proves insufficient.
- Wiring the Outlook-archive side-effect + backfill (Phase 112 / CLEANUP-01/02).
- Stage 3 sales intent agent + `swarm_intents` (Phase 113).
- SugarCRM dead-code/source disposition (Phase 115).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STAGE1-01 | Operator-justified calibration of the 5 core sales noise categories; safe categories flip `manual_review` → `categorize_archive` behind the shadow→promote gate; `payment_admittance` + `unknown` stay in review with rationale. Migration with audit trail. | The 5 core categories are confirmed at `manual_review` live (verified). The flip is a one-line `UPDATE swarm_noise_categories ... SET action='categorize_archive'` for 3 keys. **BUT** the verdict-worker fires Outlook side effects unconditionally on `categorize_archive` when `outlook_label` is set — see CRITICAL FINDING 1. The "shadow→promote gate" for sales LLM verdicts is the `gateClearsForAutoArchive` + `llm:*` Wilson path; that path's promotion check is **debtor-only today** (CRITICAL FINDING 2). |
| STAGE1-02 | New sales noise rules discovered from the corpus, added as `swarm_noise_categories` rows (data-driven, audit trail). 8 inherited AP rules re-validated; `own_outbound_invoice_loopback` gated/disabled unless it holds on sales. | spike-002 cluster classifier is reusable for discovery (D-07). Adding a new noise key is **pure registry data** if it lands as an LLM-category row (3-place invariant is effectively 2-place at runtime — see CRITICAL FINDING 3). Adding a regex rule needs code. The 8 AP keys + loopback are confirmed live at `categorize_archive` with seeded `candidate` classifier_rules. |
</phase_requirements>

## Summary

Phase 111 is overwhelmingly a **data + calibration** phase, and most of the mechanism it depends on **already shipped in Phase 89** (the `llm:{category}:{confidence}` promotion track). The live DB confirms: sales `classifier_rules` already carries `llm:auto_reply:high`, `llm:ooo_temporary:high`, `llm:ooo_permanent:high`, `llm:payment_admittance:high` (all `candidate`, n=0) plus the 8 AP regex-named rules; the 5 core sales noise categories sit at `manual_review`; the 8 inherited AP keys + loopback sit at `categorize_archive`. So D-04/D-05's seeding is **done** — the phase verifies it, doesn't rebuild it.

The phase's real work is three-fold: (1) **build a Stage-1 retro-run harness** (none exists for Stage 1 — Phase 87 built one for Stage 3 only; the pattern is mirrorable but the harness is new), run it over both corpora, and produce per-category hit-rate + false-archive estimates; (2) **flip the 3 safe categories** to `categorize_archive` via an audited migration; (3) **mine the unknown bucket** with the spike-002 clusterer and surface operator-approvable candidates.

**Three critical architecture findings shift the plan substantially** (detailed below): (1) the CONTEXT.md "inertness" assumption is **partially wrong** — the verdict-worker fires live Outlook categorize+archive directly, not via the dry-run-gated side-effect workers; (2) the Wilson-CI *promotion-gating* of auto-archive is implemented **only in the debtor-only inline dispatch block** of the screen-worker — sales (regex_module=null) bypasses it entirely, so flipping `action` to `categorize_archive` auto-archives **every** high-confidence LLM verdict regardless of whether the `llm:*:high` rule is promoted; (3) adding a new noise key is pure registry data (the Orq agent reads the closed list at call-time, not from a baked-in enum), so D-07 LLM-category rules need **no Orq Studio step**.

**Primary recommendation:** Treat Phase 111 as "build the Stage-1 retro-run harness + cluster-miner + audited calibration migration", and **resolve the swarm-agnostic auto-archive gating gap** (CRITICAL FINDING 2) as the architectural centerpiece — because without it, the "behind the shadow→promote gate" requirement in STAGE1-01 is not actually enforced for sales. The flip migration is trivial; the gate generalization is the substance.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Retro-run corpus re-classification | Inngest worker (new, side-channel-isolated) | Supabase (`email_pipeline.emails` read, new retro table write) | Mirrors Phase 87's `debtor-email-stage-3-retro-classify.ts`: durable, idempotent, must not touch live pipeline state |
| Stage 1 noise dispatch (action switch) | Inngest `classifier-verdict-worker` | `swarm_noise_categories` registry | Already registry-driven on `category.action`; swarm-agnostic |
| Auto-archive promotion gate (`llm:*` Wilson) | Inngest `classifier-screen-worker` | `classifier_rules` + `classifier_rule_telemetry` | **Currently debtor-only** — the gate lives in the `stage1_regex_module === "@/lib/debtor-email/classify"` block. Generalizing this is the phase's architectural work. |
| New-rule discovery (cluster mining) | Standalone tsx script (operator-run) | Supabase read | One-shot, inspectable, operator-gated per D-07 — not a live worker |
| Calibration decision (flip action) | Supabase migration | audit trail (migration comment / audit table) | Pure registry data per D-06 |
| Closed noise-key list at classify time | Orq agent `stage-1-category-classifier` (call-time input) | `swarm_noise_categories` rows | Passed as `<categories>` input array at call-time — NOT a baked-in enum (CRITICAL FINDING 3) |

## Standard Stack

This phase introduces **no new external packages.** It reuses existing in-repo machinery.

### Core (existing, reused)
| Module | Path | Purpose | Why Standard |
|--------|------|---------|--------------|
| Wilson-CI gate | `web/lib/classifier/wilson.ts` | `wilsonCiLower`, `shouldPromote` (n≥30 ∧ ci_lo≥0.92), `shouldDemote` (n≥30 ∧ ci_lo<0.88) | The locked cross-swarm promote bar (D-02). Pure math, no deps. |
| Promotion cron | `web/lib/inngest/functions/classifier-promotion-cron.ts` | Reads `classifier_rule_telemetry`, mutates `classifier_rules.status` when `CLASSIFIER_CRON_MUTATE==='true'`. Already swarm-loops over ALL telemetry rows. | Self-correcting lifecycle (D-03). Already processes sales rows when they accrue telemetry — no code change needed for sales. |
| LLM rule seed | `web/lib/inngest/functions/classifier-llm-rules-seed.ts` | One-shot Inngest fn; seeds `llm:{cat}:high` candidates for every (enabled swarm × enabled noise category ≠ unknown). Idempotent upsert. | Already ran for sales (verified live). RE-FIRE after D-07 adds any new noise key. |
| Telemetry view | `public.classifier_rule_telemetry` (migration `20260428`) | Aggregates `agent_runs` by `(swarm_type, rule_key)` where `rule_key IS NOT NULL AND human_verdict IS NOT NULL`; `agree = human_verdict IN ('approved','edited_minor')`. | Swarm-agnostic by construction. Sales `llm:*` verdicts will aggregate here automatically once operators give feedback. |
| Whitelist cache | `web/lib/classifier/cache.ts` | `readWhitelist(admin, swarmType)` → Set of `status='promoted'` rule_keys. `FALLBACK_WHITELIST` is debtor-only. | The gate's "is this rule promoted?" lookup. Already swarm-scoped via the `.eq("swarm_type", swarmType)` query. |
| spike-002 clusterer | `.claude/skills/spike-findings-agent-workforce/sources/002-smeba-info-noise-patterns/spike-002-cluster.ts` | First-match-wins signature clustering over a mailbox corpus; reports cluster sizes + samples + top unknown senders/domains. | Reuse target for D-07. Read-only, ordered-by-specificity. |
| Phase 87 retro harness | `web/lib/inngest/functions/debtor-email-stage-3-retro-classify.ts` + `web/lib/automations/debtor-email/retro/{select-candidates,reconstruct-input,aggregate-baseline}.ts` | Idempotent corpus re-classification with side-channel isolation, replay-safe run_id, per-email step.run returning only token counts. | The **pattern** to mirror for the Stage-1 retro-run (D-01). Note: this is a Stage-3 harness; a Stage-1 analog does not exist and must be built. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Building a new Stage-1 retro harness | Reusing the Stage-3 retro harness directly | Rejected — Stage-3 harness invokes the *intent* agent and writes `stage_3_retro_runs`; Stage 1 needs the *noise* classifier (regex + `stage-1-category-classifier`) and a different output table. The pattern transfers; the code does not. |
| Wilson-CI promotion gate | "Trust LLM `high` confidence blindly" | Rejected in the folded todo (Option 2) — no operator feedback loop, same reliability as the pre-Phase 60 hardcoded whitelist. |

**Installation:** None. (No external packages added.)

## Package Legitimacy Audit

**Not applicable** — this phase installs zero external packages. All work is registry data, SQL migrations, and reuse of in-repo TypeScript modules. No `## Package Legitimacy Gate` run required.

## Architecture Patterns

### System Architecture Diagram — current Stage 1 dispatch (two divergent auto-archive paths)

```
inbound email (post Stage 0)
        │
        ▼
classifier/screen.requested  ──► classifier-screen-worker.ts
        │
        ├─ Step 2 regex (skipped for sales: stage1_regex_module=null → 'unknown')
        │
        ├─ Step 3 LLM 2nd-pass (stage-1-category-classifier)
        │     └─ writes agent_runs row with rule_key = llm:{cat}:{conf}
        │
        ├─ Step 4.5  ┌──────────────────────────────────────────────────┐
        │            │ DEBTOR-ONLY inline dispatch block                 │
        │            │ gate: stage1_regex_module === "@/lib/debtor-      │
        │            │       email/classify"                             │
        │            │ • effectiveMatchedRule = llm:{cat}:{conf}         │
        │            │ • isWhitelistMatch = promoted-set.has(rule)  ◄── WILSON GATE
        │            │ • auto-archive ONLY if rule promoted + enabled    │
        │            │ • else → bulk-review (status='predicted')         │
        │            └──────────────────────────────────────────────────┘
        │                   (SALES NEVER ENTERS THIS BLOCK)
        │
        └─ Step 5 gateClearsForAutoArchive = !llmInvoked || conf==='high' || cat==='unknown'
                 │
                 ├─ clears ──► classifier/verdict.recorded ──► classifier-verdict-worker.ts
                 │                                                    │
                 │                                       switch(category.action):
                 │                                         categorize_archive:
                 │                                           if (outlook_label) {
                 │                                             categorizeEmail() ◄── LIVE, NO DRY-RUN GATE
                 │                                             archiveEmail()    ◄── LIVE, NO DRY-RUN GATE
                 │                                           }
                 │                                           evaluateSideEffects(stage1_categorize_archive)
                 │                                             └─ sales side_effects=[] → no cleanup queued
                 │
                 └─ medium/low ──► classifier/screen.requires_review (no subscriber; stays 'predicted')
```

**The decisive structural fact:** the Wilson-CI *promotion* check (does a promoted `llm:*:high` rule exist?) is implemented **only inside the debtor-only Step 4.5 block**. Sales reaches Step 5, where `gateClearsForAutoArchive` gates on **confidence='high' alone** — not on rule promotion. Step 5 then emits the verdict, and the verdict-worker fires Outlook side effects directly.

### Pattern 1: Stage-1 retro-run harness (mirror Phase 87)
**What:** A one-shot Inngest function `sales-email/stage-1-retro-classify` (or a standalone tsx script — planner's call; an Inngest fn gives durability + replay-safe idempotency) that pages `email_pipeline.emails`, runs the same Stage-1 logic the live worker runs (regex Pass 1 — none for sales — + `stage-1-category-classifier` LLM Pass 2), and writes per-email retro verdicts to a new dedicated table, then aggregates per-category hit-rate + false-archive estimate.
**When to use:** D-01 calibration evidence.
**Key locks to copy from Phase 87** (`debtor-email-stage-3-retro-classify.ts`):
- **Side-channel isolation:** MUST NOT write live-pipeline state (`automation_runs`, live `agent_runs`, `pipeline_events`). Allowed writes: the new retro table only. Enforce with a source-grep guard test.
- **Replay-safe run_id:** `crypto.randomUUID()` INSIDE `step.run("resolve-run-id", ...)` (CLAUDE.md Phase 65 learning).
- **Step-memo discipline:** each per-email `step.run` returns only a scalar (token count); full output persisted to Supabase inside the step.
- **Idempotent insert:** `.upsert({...}, { onConflict: "run_id,email_id", ignoreDuplicates: true })`. **Idempotency key = `(run_id, email_id)`.**
- **`inngest.send`:** never destructure; the retro fn emits no downstream events.

### Pattern 2: Cluster-mining for D-07 (reuse spike-002)
**What:** Adapt `spike-002-cluster.ts` to read the **retro-run's `unknown` bucket** (not the raw mailbox), apply ordered first-match-wins signature rules, report cluster sizes + sample subjects/senders + top unknown sender domains. Surface a ranked candidate list for operator approval.
**When to use:** D-07 new-rule discovery.
**Adaptation needed:** spike-002 reads `email_pipeline.emails` filtered `mailbox=info@smeba.nl, direction=incoming`. For Phase 111 it should read the retro `unknown` set across BOTH sources. **Watch the direction-value divergence (Pitfall 4).**

### Pattern 3: Calibration flip migration (D-06)
**What:** `UPDATE public.swarm_noise_categories SET action='categorize_archive', updated_at=now() WHERE swarm_type='sales-email' AND category_key IN ('auto_reply','ooo_temporary','ooo_permanent');` plus a recorded rationale for keeping `payment_admittance` + `unknown` at `manual_review`.
**Audit trail (D-06):** use the migration file comment for rationale, or an explicit audit-table row — planner's discretion. Follow the `_template.sql` pattern; no new table = no RLS work, but if an audit table is added it needs RLS + a service-role policy (CLAUDE.md).

### Anti-Patterns to Avoid
- **A1 — Flipping `action` without resolving the gating gap.** With sales `outlook_label` set on `auto_reply`/`ooo_*` and the verdict-worker firing Outlook calls directly, flipping `action` to `categorize_archive` makes every `high`-confidence LLM verdict auto-archive **immediately, without any promotion gate**. This silently defeats D-03/D-05's "shadow→promote, organic accumulation" intent. (See CRITICAL FINDING 1 + 2.)
- **A2 — Promoting `llm:unknown:high`.** Never seed/promote an `unknown` LLM rule — `unknown` is the Stage 2/3 fall-through. The seed fn already filters `category_key !== 'unknown'`; preserve that.
- **A3 — Adding a per-swarm branch.** `if (swarm === 'sales-email')` in any shared worker is a project-rule violation (SWARM-02). The gating-gap fix MUST be registry-driven, not a second hardcoded branch.
- **A4 — Hand-curating D-07 noise keys from a sample.** The locked principle (memory `feedback_intent_vocab_emerges_from_data`) — build the discovery mechanism + operator promotion, don't hand-pick. Applies to noise as well as intents.
- **A5 — Touching live pipeline state from the retro-run.** Phase 87's #1 lock.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Binomial confidence interval | Custom proportion test | `wilsonCiLower` in `wilson.ts` | Locked gate; cross-swarm consistency (D-02). |
| Promotion/demotion lifecycle | New sales promotion cron | `classifier-promotion-cron.ts` (already loops all swarms) | Self-correcting; sales rows process automatically once telemetry accrues. |
| LLM-rule candidate seeding | Manual INSERTs | `classifier/llm-rules-seed.run` Inngest event | Idempotent; already ran for sales; re-fire after new keys. |
| Telemetry aggregation | New view per swarm | `classifier_rule_telemetry` view | Already `(swarm_type, rule_key)`-keyed and swarm-agnostic. |
| Corpus re-classification scaffolding | Ad-hoc loop script | Mirror Phase 87 retro harness (side-channel isolation, replay-safe run_id, idempotent upsert) | The replay/idempotency/isolation locks are non-obvious and were learned the hard way. |
| Cluster signature mining | New clusterer | Adapt `spike-002-cluster.ts` | First-match-wins + domain/local-part heuristics already written and corpus-tested. |

**Key insight:** Nearly every mechanism this phase needs already exists. The genuinely *new* code is (a) a Stage-1 retro harness, (b) a cluster-miner adaptation, and (c) the swarm-agnostic auto-archive gating fix. Everything else is registry data + re-running existing workers.

## Runtime State Inventory

> This is a calibration/data phase, not a rename. Most categories are N/A, but two have real items.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `classifier_rules` already holds sales `llm:*:high` candidates (n=0) + 8 AP regex-named candidates (n=0) — verified live. New D-07 noise keys will need a `classifier/llm-rules-seed.run` re-fire to mint their `llm:*:high` candidate rows, else their LLM verdicts accrue telemetry under a rule_key with no candidate row and the cron UPDATE is a no-op. | Re-fire seed event after any new noise key lands. |
| Live service config | `swarm_noise_categories` rows for sales (13 rows verified). The Orq agent `stage-1-category-classifier` reads the enabled set **at call-time** as the `<categories>` input — it does NOT carry a baked-in enum, so a new key needs no Orq Studio edit. | Migration only. |
| OS-registered state | None — verified (no cron/task registration tied to this phase). | None |
| Secrets/env vars | `CLASSIFIER_CRON_MUTATE` env var gates whether the promotion cron mutates `classifier_rules.status` (vs. shadow-only). Must be `'true'` in production for sales rules to ever promote. **Verify its current value** — if shadow-only, no sales rule will ever auto-promote regardless of telemetry. | Verify env var value; not changed by this phase but a hard dependency on the gate working. |
| Build artifacts | `npm run codegen` covers `swarm_intents` (Stage 3) + entity + tenant-domains — it does **NOT** cover `swarm_noise_categories`. Adding a noise key does NOT require codegen. (Verified: `gen-intent-types.ts` queries `swarm_intents` only.) | None for noise keys. |

## Common Pitfalls

### CRITICAL FINDING 1 / Pitfall — "Inertness" is only partial; the verdict-worker fires Outlook live
**What goes wrong:** CONTEXT.md states flipping `action` to `categorize_archive` is inert because `side_effects=[]` and `dry_run_config` is all-blocked. **This is wrong for the verdict-worker's direct Outlook calls.** `classifier-verdict-worker.ts` (lines 104–124) fires `categorizeEmail()` + `archiveEmail()` **directly and unconditionally** whenever `category.action==='categorize_archive'` AND `category.outlook_label` is non-null. Sales `auto_reply`/`ooo_temporary`/`ooo_permanent` all have `outlook_label` set (verified: "Auto-Reply", "OoO - Temporary", "OoO - Permanent"). The `dry_run_config` gate (`isStageBlocked`) is **NOT called in the verdict-worker** — it's only wired into the four downstream side-effect workers (resolver, label-applier, invoice-copy, cleanup). `side_effects=[]` only suppresses the `evaluateSideEffects` cleanup-queue dispatch, not the inline categorize+archive.
**Why it happens:** The Outlook categorize+archive was inlined into the verdict-worker (Phase 68 SWRM-04) before the per-stage dry-run gate (Phase 110-04) existed; the gate retrofit covered the side-effect workers but not this inline path.
**How to avoid:** Either (a) gate the verdict-worker's inline Outlook calls behind `isStageBlocked(swarm, 'stage_1_archive')` so sales (all-blocked) stays truly inert; or (b) null out the `outlook_label` for the flipped sales categories until Phase 112 (but that loses the label intent). **Option (a) is the correct, swarm-agnostic fix** and dovetails with the gating-gap fix below. The planner MUST address this or the flip is NOT inert.
**Warning signs:** A flipped sales `auto_reply` email getting categorized + archived in `verkoop@smeba.nl` during Phase 111, before Phase 112's deliberate go-live.

### CRITICAL FINDING 2 / Pitfall — the Wilson promotion gate on auto-archive is debtor-only
**What goes wrong:** STAGE1-01 requires the safe categories flip "behind the shadow→promote gate." The actual promotion gate — "auto-archive only if the `llm:{cat}:high` rule has `status='promoted'`" — is implemented **only in the debtor-only inline block** of the screen-worker (gated on `stage1_regex_module === "@/lib/debtor-email/classify"`, lines 498–889). Sales (`stage1_regex_module=null`) skips that entire block and reaches Step 5, where `gateClearsForAutoArchive = !llmInvoked || llmConfidence==='high' || finalCategoryKey==='unknown'`. So for sales, **confidence='high' alone clears the gate** — there is no check that the `llm:auto_reply:high` rule is promoted. Flipping `action` to `categorize_archive` would auto-archive every high-confidence verdict from day one, defeating D-03/D-05's organic-accumulation intent.
**Why it happens:** Phase 89 wired the `llm:*` promotion check into the debtor dispatch block (the only swarm with auto-action at the time) rather than into the swarm-agnostic Step 5 / verdict-worker path.
**How to avoid:** Generalize the promotion gate into the swarm-agnostic path. Concretely: in Step 5 (or the verdict-worker), for an LLM-derived `categorize_archive` verdict, consult `readWhitelist(admin, swarm_type)` (the promoted-rule set) keyed on `llm:{cat}:{conf}`; if the rule is not promoted, route to bulk-review (`requires_review` / `status='predicted'`) instead of auto-archive. This is the architectural centerpiece of the phase and satisfies SWARM-02 (no per-swarm branch). **This is the true meaning of "behind the shadow→promote gate" for sales.**
**Warning signs:** Sales emails auto-archiving while their `llm:*:high` rule is still `candidate` (n<30).

### CRITICAL FINDING 3 / Open Q 1 RESOLVED — new noise key = pure registry data, no Orq step
**What goes wrong (avoided):** The CONTEXT.md "3-place invariant" implies adding a noise key needs an Orq agent json_schema enum update (manual Studio step). **It does not.** The `stage-1-category-classifier` agent's `category_key` output field is typed `{'type':'string'}` (verified in migration `20260506_phase74_stage1_classifier_agent.sql` line 33/45) — **not** an enum. The closed list is passed at call-time as the `<categories>` input array, built from the enabled `swarm_noise_categories` rows (screen-worker lines 319–322). And `npm run codegen` covers only `swarm_intents`, not `swarm_noise_categories`. So the runtime "invariant" is effectively two places (the TS `Stage1OutputSchema` is `z.string()`, also not enum-bound; the Postgres rows). **A D-07 LLM-category noise key lands as pure registry data: INSERT the `swarm_noise_categories` row + re-fire the seed event. No Orq Studio edit, no codegen.**
**Caveat:** If a future phase tightens the agent's `category_key` to a generated enum, this changes. Today it is open — verify the agent definition hasn't changed before relying on it.

### Pitfall 4 — Direction-value divergence across sources (affects retro-run + loopback test)
**What goes wrong:** `email_pipeline.emails.direction` uses **different vocabularies per source** (verified live): `source='outlook'` rows use `'sent'` / `'incoming'`; `source='sugarcrm'` rows use `'inbound'` / `'outbound'`. The `own_outbound_invoice_loopback` worker logic checks `effectiveDirection === 'inbound'` (defaulting missing to `'inbound'`), and spike-002 filters `direction=eq.incoming`. A naive retro-run that filters one vocabulary will silently drop half the corpus or misclassify direction for the D-09 loopback test.
**How to avoid:** Normalize direction in the retro candidate selector: treat `{'inbound','incoming'}` as inbound and `{'sent','outbound'}` as outbound. The D-09 loopback test must run only against normalized-inbound mail to mirror live behavior.
**Warning signs:** Retro-run hit-rate denominators that don't match the verified corpus counts (853 Outlook, 34,725 sugarcrm).

### Pitfall 5 — sugarcrm `mailbox` is a SugarCRM bean label, not an email address
**What goes wrong (verified):** `source='sugarcrm'` rows carry `mailbox` values like `"Smeba Brandbeveiliging BV"` and `"INFO@Smeba New Cases, Smeba Brandbeveiliging BV"` — not `verkoop@smeba.nl`. A retro-run that filters sugarcrm by `mailbox=verkoop@smeba.nl` returns zero rows.
**How to avoid:** Filter the sugarcrm corpus on `source='sugarcrm'` alone (per D-01: "just a valid Smeba email corpus to mine — provenance does not matter"). Do not mailbox-filter the historic set.

### Pitfall 6 — Telemetry is starved until operators give feedback (gate can't promote on its own)
**What goes wrong (verified):** `classifier_rule_telemetry` for sales is **empty** — no `llm:*` verdicts have an operator `human_verdict` yet. The view requires `human_verdict IS NOT NULL`. The Wilson gate promotes only on operator-agreement signal, NOT on the retro-run's predictions. So even after the flip + gate-fix, no sales rule promotes until operators approve/reject sales noise in Bulk Review (which is Phase 110 / REVIEW-01 territory). The retro-run informs `shadow_would_promote` predictions but does not feed `n`/`agree`.
**How to avoid:** Set expectations in the plan: Phase 111 establishes the *mechanism* and the *candidate rows*; actual promotion is operator-driven over time post-Phase-110. D-05's "organic accumulation" is exactly this. Do not expect the retro-run to promote anything.

### Pitfall 7 — D-07 regex rules require a code change for sales (no regex module)
**What goes wrong:** Claude's-discretion D-07 lets a discovered pattern land as a regex rule (Pass 1). But sales has `stage1_regex_module=null` and there is no sales regex module registered in `STAGE1_REGEX_MODULES` (screen-worker line 71 — only `@/lib/debtor-email/classify`). Adding a sales regex rule therefore requires: a new module file + a `STAGE1_REGEX_MODULES` map entry + a `swarms.stage1_regex_module` UPDATE. That is **code**, not pure registry data, and risks reintroducing per-swarm coupling.
**How to avoid:** For Phase 111, **prefer landing D-07 candidates as LLM-category rows** (pure registry data per Finding 3). Only introduce a sales regex module if a candidate has a crisp deterministic signature AND the planner accepts the code cost. If a regex module is needed, build it generically (the static-dispatch map is already the generic seam — extending it is acceptable, not a per-swarm branch). Flag this as a scope decision.

## Code Examples

### Verified Wilson gate (the locked promote/demote thresholds)
```typescript
// Source: web/lib/classifier/wilson.ts
export const PROMOTE_N_MIN = 30;
export const PROMOTE_CI_LO_MIN = 0.92;
export const DEMOTE_CI_LO_MAX = 0.88;
export const DEMOTE_N_MIN = 30;
export function shouldPromote(n: number, ciLo: number): boolean {
  return n >= PROMOTE_N_MIN && ciLo >= PROMOTE_CI_LO_MIN;
}
```

### Verified telemetry view (swarm-agnostic; sales rows aggregate automatically)
```sql
-- Source: supabase/migrations/20260428_classifier_rule_telemetry.sql
create or replace view public.classifier_rule_telemetry as
select ar.swarm_type, ar.rule_key,
  count(*)::int as n,
  count(*) filter (where ar.human_verdict in ('approved','edited_minor'))::int as agree
from public.agent_runs ar
where ar.rule_key is not null and ar.human_verdict is not null
group by ar.swarm_type, ar.rule_key;
```

### Verified LLM rule_key minting (already live in the screen-worker)
```typescript
// Source: web/lib/inngest/functions/classifier-screen-worker.ts (line 349)
rule_key: `llm:${parsed.category_key}:${parsed.confidence}`,
// and the debtor-only gate (line 595-601) that must be generalized for sales:
const effectiveMatchedRule =
  llmInvoked && llmCategoryKey && llmConfidence
    ? `llm:${llmCategoryKey}:${llmConfidence}`
    : (regexOutcome.matchedRule ?? "");
const isWhitelistMatch = whitelistSet.has(effectiveMatchedRule); // ◄ the promotion gate
```

### Verified sales calibration flip (D-06) — the trivial part
```sql
-- D-06: flip the 3 safe categories; keep payment_admittance + unknown in review.
update public.swarm_noise_categories
set action = 'categorize_archive', updated_at = now()
where swarm_type = 'sales-email'
  and category_key in ('auto_reply','ooo_temporary','ooo_permanent');
-- payment_admittance + unknown intentionally NOT flipped (D-06 rationale).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All LLM 2nd-pass verdicts → bulk-review (`matchedRule='no_match'`) | `llm:{cat}:{conf}` synthetic rule_keys + Wilson promotion | Phase 89 (already shipped) | Sales seed already exists; phase verifies, doesn't build. |
| Hardcoded whitelist in ingest route | `classifier_rules` table + `readWhitelist` cache | Phase 60 | Promotion is registry-driven + swarm-scoped. |
| Per-mailbox `labeling_settings.dry_run` | per-stage `swarms.dry_run_config` | Phase 110-04 | Uniform gate — BUT not wired into the verdict-worker (Finding 1). |

**Deprecated/outdated:**
- The CONTEXT.md "3-place noise-key invariant" is **stale** as a hard constraint — the Orq agent reads the closed list at call-time; codegen doesn't cover noise keys. Propose a doc clarification in `stage-1-regex.md` (it claims a 3-place enum invariant that the runtime does not actually enforce for the Orq agent).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `CLASSIFIER_CRON_MUTATE` must be `'true'` in prod for sales rules to promote; current value not verified this session. | Runtime State / Pitfall 6 | If shadow-only, no sales rule ever auto-promotes — the whole gate is inert. Verify before planning go-live expectations. |
| A2 | The `stage-1-category-classifier` Orq agent's `category_key` is still `{'type':'string'}` (not tightened to an enum since Phase 74). Verified in the migration, not against live Orq Studio this session. | CRITICAL FINDING 3 | If an enum was added later, D-07 LLM-category keys would need an Orq Studio step. Re-verify via `get_agent` / Studio. |
| A3 | Generalizing the promotion gate into Step 5 / verdict-worker is the intended fix (vs. registering a sales regex module to route it through the debtor block). | CRITICAL FINDING 2 | If the team prefers a different generalization shape, the plan's central task changes. Needs confirmation in discuss/plan. |
| A4 | The sugarcrm corpus is acceptable calibration data for the *Outlook* sales swarm despite never having flowed through the live Stage-1 worker. | D-01 (CONTEXT-locked) | Locked by user; noted as ASSUMED only because the historic mail's noise distribution may differ from live Outlook traffic, skewing hit-rate estimates. |

## Open Questions

1. **Where to put the generalized promotion gate — Step 5 of the screen-worker, or the verdict-worker?** (RESOLVED in approach, needs ratification.)
   - What we know: the gate must be swarm-agnostic and consult `readWhitelist(swarm_type)` for `llm:{cat}:{conf}` promotion status before auto-archiving an LLM-derived `categorize_archive` verdict.
   - What's unclear: cleanest insertion point. Step 5 already knows `llmInvoked`/`llmConfidence`/`finalCategoryKey`; the verdict-worker is where the actual Outlook side effect fires.
   - Recommendation: gate in **Step 5** (route non-promoted high-confidence LLM verdicts to `requires_review` instead of emitting the verdict) — keeps the verdict-worker a pure dispatcher. The verdict-worker's inline Outlook call additionally needs the `isStageBlocked` dry-run gate (Finding 1).

2. **Is there an existing Stage-1 retro harness?** (RESOLVED.)
   - No. Phase 87 built a **Stage-3** harness only (`debtor-email-stage-3-retro-classify.ts`). A Stage-1 analog must be built, mirroring the pattern. Idempotency key = `(run_id, email_id)`.

3. **How does a verdict's rule_key reach `classifier_rules` telemetry today?** (RESOLVED.)
   - The screen-worker writes `agent_runs.rule_key = llm:{cat}:{conf}` (and regex paths write the regex `matchedRule`). The `classifier_rule_telemetry` view aggregates `agent_runs` where `rule_key IS NOT NULL AND human_verdict IS NOT NULL`. The `llm:*` extension is already a drop-in — verified live (sales `llm:*` candidate rows exist; telemetry empty only because no operator feedback yet).

4. **Can regex rules be added cross-swarm in classify.ts without a per-swarm branch?** (RESOLVED — and it's a gap.)
   - `classify.ts` is **debtor-specific** (`web/lib/debtor-email/classify.ts`). Sales has no regex module (`stage1_regex_module=null`). The generic seam is `STAGE1_REGEX_MODULES` (a static map). Adding a sales regex rule = new module + map entry + registry UPDATE = code. **Recommendation: prefer LLM-category rows for D-07 (Pitfall 7); only build a sales regex module if a candidate truly warrants it.** Flag as a scope decision for the planner.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase REST (service role) | Retro-run reads, registry queries | ✓ | live | — |
| Orq agent `stage-1-category-classifier` | Retro-run LLM Pass 2 | ✓ (active per Phase 74) | — | Retro can read existing `agent_runs` predictions instead of re-invoking, to save cost (planner's call) |
| Inngest | Retro harness durability | ✓ | — | Standalone tsx script |
| `CLASSIFIER_CRON_MUTATE` env | Live promotion | ⚠ value unverified | — | Verify in Vercel env (Assumption A1) |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** Re-invoking the Orq agent in the retro-run is optional if existing `agent_runs` predictions cover the corpus.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing — see `web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts`, `.gate.test.ts`, `.phase89.test.ts`) |
| Config file | `web/vitest.config.*` (existing) |
| Quick run command | `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-screen-worker -x` |
| Full suite command | `cd web && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STAGE1-01 | Safe categories flip to `categorize_archive`; payment_admittance + unknown stay manual_review | unit (registry assertion) | `cd web && npx vitest run lib/swarms` | ❌ Wave 0 (new) |
| STAGE1-01 | High-confidence LLM verdict for sales does NOT auto-archive unless `llm:*:high` rule is promoted (the gate generalization) | unit | extend `classifier-screen-worker.gate.test.ts` for `stage1_regex_module=null` swarm | ⚠ exists, extend |
| STAGE1-01 | verdict-worker `categorize_archive` is dry-run-gated (Finding 1) | unit | extend `dry-run-gate-preservation.test.ts` | ⚠ exists, extend |
| STAGE1-02 | Retro-run is idempotent + side-channel isolated | unit (source-grep guard, mirror Phase 87) | new test for the Stage-1 retro fn | ❌ Wave 0 (new) |
| STAGE1-02 | D-09 loopback false-archive rate measured on sales corpus; direction normalized | unit | new retro aggregation test | ❌ Wave 0 (new) |
| STAGE1-02 | New noise key seeds an `llm:*:high` candidate after re-fire | unit | extend `classifier-llm-rules-seed` test | ⚠ exists, extend |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-screen-worker -x`
- **Per wave merge:** `cd web && npm test`
- **Phase gate:** full suite green + `npm run check:supabase` clean (RLS advisor) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] Stage-1 retro harness + its side-channel-isolation guard test (mirror Phase 87's `retro-classify-side-channel-isolation.test.ts`).
- [ ] New retro output table migration (RLS + service-role policy per CLAUDE.md; use `_template.sql`).
- [ ] Gate-generalization test fixture for a `stage1_regex_module=null` swarm (sales) — the existing gate tests assume the debtor regex module.
- [ ] Direction-normalization helper + test (`{inbound,incoming}` vs `{sent,outbound}`).

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | `Stage1OutputSchema` (zod) already validates LLM output; retro-run must validate the same. ReDoS guard on any new regex (bounded quantifiers `\d{1,12}`, anchored `^/$`) per the Phase 84 classify.ts precedent. |
| V6 Cryptography | no | — |
| RLS (project rule) | yes | Any new retro table needs `ENABLE ROW LEVEL SECURITY` + an explicit service-role policy; `npm run check:supabase` fails CI on ERROR-level advisor lints. Use `supabase/migrations/_template.sql`. |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Auto-archiving a real sales lead misclassified as noise | Tampering (data loss) | The promotion gate (Finding 2 fix) + keeping `unknown`/`payment_admittance` at manual_review; loopback disabled unless it holds (D-09, the ~40% debtor mis-archive precedent). |
| New regex rule catastrophic backtracking | DoS | Anchored, bounded-quantifier regexes only (classify.ts precedent). |

## Sources

### Primary (HIGH confidence)
- Live Supabase (verified 2026-06-03): `swarm_noise_categories`, `classifier_rules`, `swarms`, `classifier_rule_telemetry` for `sales-email`; `email_pipeline.emails` corpus counts (853 Outlook / 34,725 sugarcrm) + direction-value distributions + sugarcrm mailbox labels.
- `web/lib/classifier/wilson.ts`, `cache.ts` — read in full.
- `web/lib/inngest/functions/classifier-screen-worker.ts`, `classifier-verdict-worker.ts`, `classifier-promotion-cron.ts`, `classifier-llm-rules-seed.ts`, `debtor-email-stage-3-retro-classify.ts` — read in full.
- `web/lib/debtor-email/classify.ts`, `web/lib/swarms/side-effects.ts`, `web/lib/pipeline-gating/dry-run-gate/index.ts` — read.
- `supabase/migrations/20260428_classifier_rule{s,_telemetry}.sql`, `20260506_phase74_stage1_classifier_agent.sql`, `20260506_phase74_sales_email_{seed,manual_review_only}.sql` — read.
- `web/scripts/gen-intent-types.ts` + `web/package.json` codegen script — verified codegen covers swarm_intents only.
- `.claude/skills/spike-findings-agent-workforce/sources/002-smeba-info-noise-patterns/spike-002-cluster.ts` — read in full.
- `docs/agentic-pipeline/stage-1-regex.md` — RFC, read in full.
- `.planning/todos/pending/2026-05-20-stage-1-llm-promotion-track.md` (folded), `111-CONTEXT.md`, `REQUIREMENTS.md` — read.

### Secondary (MEDIUM confidence)
- None — all claims verified against code or live DB.

### Tertiary (LOW confidence)
- `CLASSIFIER_CRON_MUTATE` production value (Assumption A1) — not queryable this session; flagged.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all reused modules read in full; live registry state verified.
- Architecture (the two gating findings): HIGH — traced both auto-archive paths line-by-line and confirmed sales bypasses the debtor block via `stage1_regex_module=null`.
- Pitfalls: HIGH — direction divergence + sugarcrm mailbox labels + empty telemetry all verified against live DB.

**Research date:** 2026-06-03
**Valid until:** 2026-06-17 (14 days — fast-moving area; the screen-worker and registry are actively edited across phases).
