# Phase 130: info@ Stage-1 noise-recalibration (V9.7 P0) — Research

**Researched:** 2026-06-16
**Domain:** Agentic email pipeline — Stage-1 noise filter recalibration (registry-data + telemetry plumbing)
**Confidence:** HIGH (live DB queried; exact CHECK violation reproduced; all schema/file paths verified)

## Summary

Phase 130 closes a ~50% latent-noise leak in the info-routing `unknown` pool by registering new Stage-1 noise candidates that flow through the **existing** Wilson-CI shadow→promote gate. The mechanism is real and shipped: `swarm_noise_categories` (registry vocabulary) + `classifier_rules` (promotion-gate telemetry) + the LLM Pass-2 agent `stage-1-category-classifier` + the `classifier-promotion-cron` Wilson-CI evaluator. Adding an LLM-category noise rule is pure registry data (no codegen, no Orq Studio edit) per `docs/agentic-pipeline/stage-1-regex.md`.

**However, the single most important finding is BLOCKING and confirms the CONTEXT caveat with hard evidence:** the Wilson-CI gate has **empty telemetry for info-routing because `public.agent_runs` INSERTs for `swarm_type='info-routing'` are rejected at the database layer by a CHECK constraint.** The LLM Pass-2 runs on every one of the 678 `unknown` info-routing emails (verified in `pipeline_events`), but every `agent_runs` write throws Postgres error `23514` (`agent_runs_swarm_type_check`), so zero telemetry rows exist, zero `classifier_rules` rows exist for info-routing, and nothing can ever promote. This is a Phase-113-class bug (a CHECK constraint that predates a new swarm) and must be the **first task** in the plan — every other task is inert until it lands.

**Primary recommendation:** Plan a Wave 0 "unblock telemetry" task that (1) widens `agent_runs.swarm_type` CHECK to include `'info-routing'`, (2) seeds `classifier_rules` rows for info-routing, then proceeds to register noise candidates as `swarm_noise_categories` rows + LLM categories. Drive promotion through `classifier-promotion-cron` (NOT `labeling-flip-cron`, which is hardcoded to debtor-email). Build a `pipeline_events`-based before/after measurement query per mailbox; the carve-out (NOISE-04) lives inside each new regex/category pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Noise classes to target (LOCKED — from the data):** Five leaking noise classes with observed recurring senders:
1. **Automated security/system reports** — `noreply@securitas.nl` (26/mo, "60289 Smeba Brandbeveiliging V.O.F."), `noreply-gms_nl@securitas.net` (3), `no-reply@login.antispamcloud.com` (4, SpamExperts), fleet/portal reports (`free2move-connectfleet`, `coperama marketplace`, `coupahost`).
2. **Cold-sales / SEO / outreach spam** — freemail + foreign domains with "Rank Higher", "App Idea", "Web Reparatie", "Price List", "website design proposal"; `taiwantrade`, `linkedin` outreach.
3. **Marketing newsletters** — `noreply@lidl.nl`, `noreply@logboekenonline.nl`, `rabobank` alerts, restaurant/event blasts, trade newsletters (metaalnieuws).
4. **Auto-dealer / vehicle spam** — `info@impexcompany.nl` + `.be` (16/mo, "beste bod voor uw auto"), BMW/veiling/baslease/basworld.
5. **Unsolicited job applications** — `*@firemail.de` "Initiativbewerbung", generic "Vision Your Application".

(REQUIREMENTS NOISE-01 also names **survey/feedback invites** as a sixth class — reconcile at plan time; CONTEXT lists 5, REQUIREMENTS implies a 6th. Treat as Claude's discretion to include survey/feedback if data supports it.)

**Mechanism (LOCKED):**
- Register new candidates as `classifier_rules` rows (regex Pass-1 and/or LLM `stage-1-category-classifier` Pass-2 categories) — **registry data, zero per-swarm code branch (SWARM-02)**.
- Candidates run in **shadow** and only promote via the existing **Wilson-CI confidence gate** (`classifier-promotion-cron`). No blind auto-archive. (v8.1 finding: the Wilson-CI gate had empty telemetry — **VERIFIED BLOCKING, see Critical Finding below**.)
- Map each new noise class to a `swarm_noise_categories` key for info-routing (or reuse existing keys cross-swarm; swarm-isolated by default).

**Safety (LOCKED — NOISE-04):**
- Hard **actionable-token carve-out**: never noise-reclass when the email carries an offerte / order / inkooporder / factuur / aanmaning / keuring / ontruiming / storing / werkbon signal (subject or body), even if the sender looks noisy.
- **Word-boundary** matching on all new regex rules (v8.2 RESL-08 lesson).
- The carve-out is verified on a sample before any promotion.

**Measurement (LOCKED — NOISE-03):** Instrument the info@ `unknown` pool true-noise share before/after, **per live mailbox**. Target: ~50% → <20%. Use `pipeline_events` Stage-1 telemetry; a labelled sample establishes the baseline true-noise fraction.

### Claude's Discretion
- Exact regex vs LLM-category split per noise class (regex for stable sender/domain patterns like securitas/impexcompany; LLM Pass-2 for fuzzy cold-sales/newsletter language).
- Whether to add a sender-domain denylist mechanism vs per-rule patterns (prefer existing `classifier_rules` shape).
- Baseline-labelling sample size (enough to estimate the noise fraction with a tight CI).

### Deferred Ideas (OUT OF SCOPE)
- Routing itself (Stage 3 router, forward side-effect) → Phase 131/132.
- Enabling the 4 dormant info@ mailboxes (smeba-fire.be, berki.nl, sicli-noord/sud.be) → registry-flip later.
- Re-evaluating the disabled `own_outbound_invoice_loopback` rule → out of scope (debtor/sales concern).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOISE-01 | Register new Stage-1 `classifier_rules` candidates for the latent-noise classes leaking into the info@ unknown pool (registry rows, no per-swarm branch) | `swarm_noise_categories` INSERT + `classifier_rules` INSERT path mapped (see "How to add a rule"). LLM-category path needs zero codegen per stage-1-regex.md. Regex-path needs a NEW info-routing regex module (today info-routing shares `@/lib/debtor-email/classify`). |
| NOISE-02 | Candidates flow through the existing Wilson-CI shadow→promote gate; no blind auto-archive | `classifier-promotion-cron` (swarm-agnostic) is the gate. Thresholds: N≥30 AND Wilson CI-lo ≥0.92 (`web/lib/classifier/wilson.ts`). **BLOCKED until agent_runs CHECK widened — see Critical Finding.** |
| NOISE-03 | Before/after measurement: unknown-pool noise share drops ~50%→<20%, per live mailbox | `pipeline_events` (stage=1, swarm_type=info-routing) carries decision + `decision_details->>entity` (mailbox proxy). No existing view — a SQL query/view must be built. Baseline = labelled sample (CONTEXT discretion on N). |
| NOISE-04 | Precision guard: zero false-archive of actionable mail (actionable-token carve-out + word-boundary) | Carve-out expressed inside each rule's pattern. Template: the debtor `classify.ts` anchored matchers + block-rules (`SUBJECT_PAYMENT_REQUEST_BLOCK`, `BODY_DISPUTE`, negative-lookahead `(?!FP-)`). No standalone carve-out detector exists. |
| NOISE-05 | Rules apply across both live info@ mailboxes with brand/mailbox awareness; dormant boxes untouched | `info_routing_mailbox_settings` gates ingest (`ingest_enabled`); only `info@smeba.nl`+`info@fire-control.nl` should be live. `swarm_noise_categories` is swarm-scoped (`swarm_type='info-routing'`), so rules auto-apply to all info-routing mailboxes regardless of brand. Dormant boxes are protected by `ingest_enabled=false`. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Noise vocabulary (which keys exist) | Database / Registry (`swarm_noise_categories`) | — | Registry is source-of-truth, read at call-time (stage-1-regex.md) |
| Promotion-gate telemetry (n/agree/ci_lo) | Database (`classifier_rules` + `agent_runs` + `classifier_rule_telemetry` view) | Inngest cron | Wilson-CI math lives in cron; counters live in DB |
| Regex Pass-1 matching | API/Backend code (`stage1_regex_module`) | — | Deterministic rules = code, not registry (stage-1-regex.md exception) |
| LLM Pass-2 noise recovery | Orq.ai agent (`stage-1-category-classifier`) | Inngest worker (`classifier-screen-worker`) | Closed-list passed at call-time; no Studio edit to add a key |
| Shadow→promote evaluation | Inngest cron (`classifier-promotion-cron`) | — | Daily 06:00 Amsterdam Mon-Fri; swarm-agnostic |
| Operator verdict capture (feeds telemetry) | Frontend (`[swarm]/stage-1/actions.ts`) | — | Swarm-agnostic; writes `agent_runs.human_verdict` |
| Before/after measurement | Database (`pipeline_events`) | SQL view (to build) | Canonical Stage-1 telemetry table |
| Mailbox/brand scoping | Database (`info_routing_mailbox_settings`) | Ingest route | `ingest_enabled` flag keeps dormant boxes off |

---

## 🚨 CRITICAL FINDING (Research Question #3): info-routing telemetry is BLOCKED at the DB layer

**Verdict: The Wilson-CI gate CANNOT promote info-routing rules today. Telemetry is empty — not because no verdicts have been given, but because the telemetry rows physically cannot be written. This is a hard prerequisite the plan MUST fix first.**

### Evidence (all live, queried 2026-06-16)

| Probe | Result | Meaning |
|-------|--------|---------|
| `agent_runs WHERE swarm_type='info-routing'` | **count = 0** | The telemetry source table has zero info-routing rows |
| `classifier_rules WHERE swarm_type='info-routing'` | **`[]` (none)** | No candidate rules exist to promote |
| `classifier_rule_telemetry` view | only debtor-email rows | The view feeding `classifier-promotion-cron` has nothing for info-routing |
| `pipeline_events` stage=1 info-routing, `llm_invoked=true` | **678** (= every `unknown`) | LLM Pass-2 IS running on info-routing |
| A pipeline_events row's `agent_run_id` (e.g. `53f0be83…`) | **does NOT resolve in `agent_runs`** | The UUID was generated but the row was never persisted |
| **Direct INSERT test** `agent_runs(swarm_type='info-routing', …)` | **Postgres `23514`: `violates check constraint "agent_runs_swarm_type_check"`** | The smoking gun — reproduced and rolled back |

### Root cause

`public.agent_runs` (migration `supabase/migrations/20260428_public_agent_runs.sql:13`) has:

```sql
swarm_type text not null check (swarm_type in (
  'debtor-email', 'sales-email', 'planning', 'order-entry'
)),
```

`'info-routing'` is **not** in the list. In `classifier-screen-worker.ts` Step 3 (the LLM Pass-2 path, lines ~334–366), every `admin.from("agent_runs").insert({ swarm_type, … })` for an info-routing email fails this CHECK. The worker's own error handling (`if (insertSuccess.error) throw`) then routes into the catch block, which attempts a **failure-path** insert (lines ~387–405) — that ALSO carries `swarm_type='info-routing'` and ALSO fails `23514`. Net: the `agent_run_id` is written into `pipeline_events.decision_details`/`agent_run_id` (generated in-step) but the `agent_runs` row never lands. No telemetry → `classifier_rule_telemetry` stays empty → `classifier-promotion-cron` has nothing to evaluate → nothing promotes, ever.

### Why the `entity` CHECK is NOT also a blocker (correcting an obvious hypothesis)

The same table once had `entity CHECK IN ('smeba','berki','sicli-noord','sicli-sud','smeba-fire')` — which excludes `'fire-control'`. **That CHECK was already dropped** in `20260506_phase74_agent_runs_entity_nullable.sql` (entity is now nullable, no enum). Live `agent_runs` even contains 66 `fire-control` entity rows. So entity is fine; **`swarm_type` is the sole blocker.**

### The fix (direct Phase-113 precedent)

`20260611_phase113_agent_runs_intent_check_sales.sql` fixed the identical class of bug (a CHECK predating a new swarm) by `drop constraint if exists … / add constraint … check (… any(array[…]))`. Mirror it:

```sql
alter table public.agent_runs drop constraint if exists agent_runs_swarm_type_check;
alter table public.agent_runs add constraint agent_runs_swarm_type_check
  check (swarm_type in ('debtor-email','sales-email','planning','order-entry','info-routing'));
```

This is a one-line widen, idempotent, no data migration. **It must be Task 0.** Phase 113's note ("Long-term: drop the CHECK in favour of registry validation or codegen it") suggests considering dropping the CHECK entirely — but for this phase, widening matches precedent and minimizes blast radius.

### Confirming the cron is reachable once telemetry flows

`classifier-promotion-cron` (`web/lib/inngest/functions/classifier-promotion-cron.ts`) is **swarm-agnostic**: it `SELECT`s the whole `classifier_rule_telemetry` view and `classifier_rules` table with no swarm filter, then evaluates each rule. So once (a) the CHECK is widened, (b) `classifier_rules` rows are seeded for info-routing, and (c) operators give verdicts (writing `agent_runs.human_verdict`), info-routing rules WILL appear in the telemetry view and the cron WILL evaluate them. **No cron code change needed.**

⚠️ **`labeling-flip-cron` is the WRONG cron for this phase.** Despite the CONTEXT's reference to "the `labeling-flip-cron` lifecycle", that function (`web/lib/inngest/functions/labeling-flip-cron.ts:127`) is hardcoded `.eq("swarm_type", "debtor-email")` and iterates `debtor.labeling_settings` mailboxes — it does not and cannot process info-routing. The actual promotion gate for `classifier_rules` is **`classifier-promotion-cron`**. The plan should name the correct cron.

### One more telemetry dependency: the cron needs `CLASSIFIER_CRON_MUTATE=true` to actually flip

`classifier-promotion-cron` runs in **shadow mode by default** (`mutate = process.env.CLASSIFIER_CRON_MUTATE === "true"`). In shadow it only writes `classifier_rule_evaluations` rows with `action='shadow_would_promote'` and never mutates `classifier_rules.status`. Promotion to `acting` requires the env flag flipped (operator decision after review). The plan must surface this as the explicit "promote" lever, consistent with NOISE-02's "no blind auto-archive".

---

## Standard Stack (existing machinery to reuse — verified live)

### Core registry / telemetry

| Table / Module | Path | Role |
|----------------|------|------|
| `public.swarm_noise_categories` | def in `20260429b_swarm_registry.sql` (named `swarm_categories` there; renamed) | Stage-1 noise vocabulary. PK `(swarm_type, category_key)`. Cols: `display_label`, `outlook_label`, `action` (`categorize_archive`\|`swarm_dispatch`), `swarm_dispatch`, `display_order`, `enabled` (default true), `updated_at`. |
| `public.classifier_rules` | `20260428_classifier_rules.sql` | Promotion-gate telemetry per `(swarm_type, rule_key)`. Cols: `kind` CHECK(`'regex'`\|`'agent_intent'`), `status` CHECK(`candidate`\|`promoted`\|`demoted`\|`manual_block`) default `candidate`, `n`, `agree`, `ci_lo`, `promoted_at`, `notes`. Unique `(swarm_type, rule_key)`. |
| `public.agent_runs` | `20260428_public_agent_runs.sql` | Per-prediction telemetry. `human_verdict` + `rule_key` are what the telemetry view aggregates. **⚠️ swarm_type CHECK blocks info-routing — fix first.** |
| `public.classifier_rule_telemetry` (view) | `20260428_classifier_rule_telemetry.sql` | `select swarm_type, rule_key, count(*) n, count(*) filter (human_verdict in ('approved','edited_minor')) agree FROM agent_runs WHERE rule_key IS NOT NULL AND human_verdict IS NOT NULL`. The cron's input. |
| `public.pipeline_events` | `20260506a_pipeline_events.sql` | Canonical Stage-0..4 decision telemetry. `stage`, `decision`, `confidence`, `decision_details` jsonb. Source for NOISE-03 measurement. |
| `public.info_routing_mailbox_settings` | `20260521_info_routing_mailbox_settings.sql` | Per-mailbox `ingest_enabled` + `dry_run` + `entity`. 6 rows seeded; only `info@smeba.nl` live (`ingest_enabled=true`). `info@fire-control.nl` seeded `ingest_enabled=false` — **see NOISE-05 note**. |

### Worker / cron / agent

| Component | Path | Role |
|-----------|------|------|
| `classifier-screen-worker` | `web/lib/inngest/functions/classifier-screen-worker.ts` | Stage-1 dispatcher: regex Pass-1 → LLM Pass-2 → pipeline_events → verdict. Registry-driven (REQ-6, no swarm literal except the debtor Step 4.5 block). |
| `classifier-promotion-cron` | `web/lib/inngest/functions/classifier-promotion-cron.ts` | **The Wilson-CI gate for this phase.** Swarm-agnostic. Cron `TZ=Europe/Amsterdam 0 6 * * 1-5`. Shadow unless `CLASSIFIER_CRON_MUTATE=true`. |
| `stage-1-category-classifier` | Orq.ai agent, seeded `20260506_phase74_stage1_classifier_agent.sql` | LLM Pass-2. `category_key` output is `{'type':'string'}` (NOT enum) → closed list passed at call-time from enabled `swarm_noise_categories`. **No Studio edit to add a key.** |
| Wilson math | `web/lib/classifier/wilson.ts` | `PROMOTE_N_MIN=30`, `PROMOTE_CI_LO_MIN=0.92`, `DEMOTE_CI_LO_MAX=0.88`, `DEMOTE_N_MIN=30`. |
| Promoted-rule whitelist cache | `web/lib/classifier/cache.ts` | `readWhitelist(admin, swarm_type)` — reads `classifier_rules WHERE status='promoted'`, 60s TTL. Gate for auto-archive in screen worker Step 5. |
| Operator verdict capture | `web/app/(dashboard)/automations/[swarm]/stage-1/actions.ts` | **Swarm-agnostic** — writes `agent_runs` with `swarm_type`, `rule_key`, `human_verdict`, `predictor`, `corrected_category`, `verdict_set_at/by`. This is the path that fills telemetry. **Also currently blocked by the same CHECK for info-routing.** |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New info-routing regex module | LLM Pass-2 categories only (no regex) | info-routing today has `stage1_regex_module='@/lib/debtor-email/classify'` (reuses debtor regex). Adding a regex Pass-1 rule = CODE (new module + `STAGE1_REGEX_MODULES` map entry + swarms UPDATE). LLM-category = pure registry data. **Prefer LLM-category for fuzzy classes (cold-sales, newsletters); reserve regex only for crisp sender/subject anchors like `securitas`/`impexcompany`** — and only if you accept the code cost of a new module. |
| Widening `agent_runs.swarm_type` CHECK | Dropping the CHECK entirely (registry validation) | Phase 113 precedent suggests eventually dropping; widening is lower-risk for this phase. |

## Package Legitimacy Audit

Not applicable — this phase installs **zero** external packages. All work is SQL migrations + registry data + one possible new TS regex module using existing in-repo patterns. No npm/PyPI/crates dependency added.

## Architecture Patterns

### System data flow (info-routing Stage 1, current + after fix)

```
Zapier Catch Hook ──> POST /api/automations/info-routing/ingest/route.ts
   │  (gate 1: swarms.enabled; gate 2: info_routing_mailbox_settings.ingest_enabled)
   ▼
email_pipeline.emails (INSERT)  +  automation_runs(status='stage_0_safety_pending')
   ▼  inngest.send "stage-0/email.received" {swarm_type:'info-routing', entity}
Stage 0 safety worker ──> "classifier/screen.requested"
   ▼
classifier-screen-worker.ts
   ├─ Step 1: loadSwarm + loadSwarmNoiseCategories('info-routing')
   ├─ Step 2: regex Pass-1 via stage1_regex_module='@/lib/debtor-email/classify'
   │            (debtor regex catches spam/payment/auto_reply/ooo → ~473 spam/mo)
   ├─ (own_outbound_invoice_loopback block — gated on registry 'enabled', off-path here)
   ├─ Step 3: regex='unknown' → LLM Pass-2 'stage-1-category-classifier'
   │            closed list = enabled swarm_noise_categories rows (call-time)
   │            ▼ writes agent_runs(swarm_type='info-routing', rule_key='llm:{cat}:{conf}')
   │            🚨 TODAY: INSERT fails 23514 → telemetry never lands
   ├─ Step 4: pipeline_events INSERT (stage=1, decision, decision_details{entity, llm_*})  ✅ works
   ├─ Step 4.5: debtor-only block — fires because info-routing shares the debtor regex
   │            module key, BUT debtor.labeling_settings lookup returns null for info@
   │            → falls through to Step 5 (no debtor side-effects). ✅ correct behaviour
   └─ Step 5: gate → "classifier/verdict.recorded" (auto-archive only if rule promoted)
                  OR "classifier/screen.requires_review" (stays 'predicted')
   ▼
Operator Bulk Review  /automations/info-routing/review
   └─ stage-1/actions.ts → agent_runs.human_verdict  🚨 ALSO blocked by 23514 today
   ▼
classifier-promotion-cron (daily 06:00) → classifier_rule_telemetry view → Wilson-CI
   └─ shadow (default) OR promote (CLASSIFIER_CRON_MUTATE=true) → classifier_rules.status='promoted'
   ▼
readWhitelist() picks up promoted rule → screen worker Step 5 auto-archives future matches
```

### Pattern 1: Add an LLM-category noise key (pure registry data — PREFERRED)

**What:** Most of the 5 noise classes are fuzzy language (cold-sales, newsletters, job apps) → LLM Pass-2 territory.
**Steps (per stage-1-regex.md "Source-of-truth invariant"):**
1. `INSERT INTO public.swarm_noise_categories (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order) VALUES ('info-routing', '<key>', '<label>', '<Outlook label>', 'categorize_archive', null, <order>)` — idempotent ON CONFLICT (mirror `20260520_phase84_noise_categories.sql`).
2. `INSERT INTO public.classifier_rules (swarm_type, rule_key, kind, status, notes) VALUES ('info-routing', '<key>', 'agent_intent', 'candidate', '...')` — the candidate that the cron promotes. Mirror `20260520_phase84_classifier_rules_seed.sql` (note: that seed used `kind='agent_intent'` for sales-email because it has no regex module — **same applies to info-routing for LLM categories**).
3. No codegen. No Orq Studio edit (the agent's `category_key` is `{'type':'string'}`). The screen worker passes the enabled categories at call-time.
4. The LLM emits `rule_key='llm:{category_key}:{confidence}'`; only `llm:{cat}:high` is promotable.

### Pattern 2: Add a regex Pass-1 noise rule (CODE — use sparingly)

**What:** For crisp sender/subject anchors (`securitas`, `impexcompany`) where deterministic precision beats an LLM call.
**Cost:** info-routing currently has `stage1_regex_module='@/lib/debtor-email/classify'`. Putting info-routing-specific patterns into the debtor module is wrong (cross-swarm pollution). Options:
- (a) Create `web/lib/info-routing/classify.ts`, register it in `STAGE1_REGEX_MODULES` (`classifier-screen-worker.ts:71`), and `UPDATE swarms SET stage1_regex_module='@/lib/info-routing/classify' WHERE swarm_type='info-routing'`. This is real code + a new bundler entry + the SWARM-02 static-check must still pass (no `swarm_type==='X'` literals).
- (b) Keep using the debtor module but accept it won't catch info-specific senders (they fall to LLM Pass-2). **Recommended default unless a class is high-volume + crisp** (e.g. `securitas` 26/mo is the best regex candidate per CONTEXT's "good first shadow rule").
**Pattern template:** anchored sender + subject AND, bounded quantifiers, word-boundaries — see Code Examples.

### Pattern 3: Actionable-token carve-out inside the rule (NOISE-04)

**What:** The carve-out is NOT a separate detector — it is expressed as a **block-rule that returns `unknown` before the noise rule can match**, exactly as `classify.ts` does today with `SUBJECT_PAYMENT_REQUEST_BLOCK`, `SUBJECT_REFUND_BLOCK`, `BODY_DISPUTE`, and the `(?!FP-)` negative-lookahead.
**For LLM categories:** encode the carve-out in the agent's category definitions / few-shot ("never classify as noise if the body mentions offerte/order/keuring/ontruiming/storing/werkbon") AND rely on the Wilson-CI shadow gate to catch false-archives before promotion (a misfire shows as operator `rejected_other` → `agree` drops → CI-lo never clears 0.92).
**For regex:** add explicit `*_BLOCK` regexes checked first, with `\b` word-boundaries.

### Anti-Patterns to Avoid
- **Blanket-archiving `info@smeba.nl`-self "Inzending contactformulier"** (18/mo) — CONTEXT flags this as MIXED (real submissions + bot-gibberish). Treat as a discrimination case, not a noise class.
- **Routing via `labeling-flip-cron`** — wrong cron (debtor-only). Use `classifier-promotion-cron`.
- **Putting info-routing patterns in `@/lib/debtor-email/classify.ts`** — cross-swarm pollution; create a dedicated module if regex is needed.
- **Adding `swarm_intents` rows** — Stage-1 noise lives ONLY in `swarm_noise_categories` (hard-separation invariant, enforced by `web/__tests__/static-checks/swarm-hard-separation.test.ts`).
- **Promoting a rule before the carve-out is sample-verified** (CONTEXT LOCKED).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confidence-gated promotion | Custom threshold logic | `classifier-promotion-cron` + `wilson.ts` | Shipped, shadow-mode safe, audited via `classifier_rule_evaluations` |
| Noise vocabulary store | Hardcoded enum / denylist file | `swarm_noise_categories` rows | Registry read at call-time; no codegen |
| LLM noise recovery | New Orq agent | `stage-1-category-classifier` (existing, cross-cutting) | Closed list passed at call-time; adding a key = registry only |
| Operator feedback → telemetry | New feedback table | `stage-1/actions.ts` → `agent_runs.human_verdict` | Already swarm-agnostic |
| Auto-archive gate | Custom "is promoted?" check | `readWhitelist()` cache | 60s TTL, last-known-good fallback |
| Per-mailbox enable/disable | Code flags | `info_routing_mailbox_settings.ingest_enabled` | One UPDATE per mailbox, no deploy |

**Key insight:** Every mechanism this phase needs already exists and is swarm-agnostic. The ONLY net-new code is (a) the `agent_runs` CHECK widen, (b) registry seed rows, (c) a measurement query/view, and (d) OPTIONALLY one info-routing regex module. Everything else is data.

## Runtime State Inventory

> Rename/refactor categories — this is a data+config phase, not a rename. Most categories are empty, but two are load-bearing.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `pipeline_events`: 1,185 info-routing Stage-1 rows already exist (678 unknown, 473 spam, 28 payment_admittance). `agent_runs`: **0 info-routing rows** (CHECK-blocked). `classifier_rules`: **0 info-routing rows**. `automation_runs(automation='info-routing-review')`: 1,183 completed / 71 predicted / 64 failed. | Seed `classifier_rules`; NO migration of existing pipeline_events needed (they stay as the measurement baseline). |
| Live service config | `info_routing_mailbox_settings`: 6 rows. **`info@fire-control.nl` is seeded `ingest_enabled=false`** despite CONTEXT treating it as a live mailbox (219/mo). Live `pipeline_events` show 79 `fire-control` entity rows, so it HAS ingested — likely flipped manually post-seed. **Verify live `ingest_enabled` state before relying on NOISE-05 scoping.** | Confirm/flip `ingest_enabled=true` for `info@fire-control.nl` if it must be live; keep the other 4 `false`. |
| OS-registered state | None — no cron/task-scheduler entries embed noise rules. The Inngest crons are code-defined. | None. |
| Secrets/env vars | `CLASSIFIER_CRON_MUTATE` (gates promotion); `ZAPIER_INGEST_SECRET` (ingest auth, already configured). | Plan must call out flipping `CLASSIFIER_CRON_MUTATE=true` as the promote lever (operator decision). |
| Build artifacts | None unless a new `@/lib/info-routing/classify` module is added → then `STAGE1_REGEX_MODULES` map + `swarms.stage1_regex_module` must both update (CI codegen check). | Only if regex path chosen. |

## Common Pitfalls

### Pitfall 1: Assuming the Wilson-CI gate "just works" for info-routing
**What goes wrong:** Seed `classifier_rules` rows, give operator verdicts, wait for promotion — nothing ever promotes.
**Root cause:** `agent_runs_swarm_type_check` rejects every info-routing telemetry write (verified `23514`). The telemetry view stays empty.
**Avoid:** Widen the CHECK in Task 0; verify with a real INSERT that succeeds before building anything else.
**Warning sign:** `agent_runs WHERE swarm_type='info-routing'` returns 0 while `pipeline_events` shows `llm_invoked=true` rows.

### Pitfall 2: Using `labeling-flip-cron` as the promotion gate
**What goes wrong:** Plan references the wrong cron; promotion logic is built/verified against a function that hardcodes `swarm_type='debtor-email'`.
**Avoid:** Use `classifier-promotion-cron` (swarm-agnostic). `labeling-flip-cron` flips `debtor.labeling_settings.dry_run`, a different mechanism.

### Pitfall 3: Regex over-match eating routable mail (the v8.2 RESL-08 lesson)
**What goes wrong:** A broad sender/keyword regex archives `adviesinveiligheid@mankr8.nl` (inspecties) or `inkoopstatus@lasaulec.nl` (PO's) — exactly the MIXED routable senders CONTEXT warns about.
**Avoid:** Word-boundary `\b`, anchored `^...$` sender pins, bounded quantifiers `\d{1,12}`, explicit `*_BLOCK` carve-outs FIRST. Sample-verify before promotion. Live `classify.ts` shows the `(?!FP-)` negative-lookahead fix for precisely this.

### Pitfall 4: Forgetting the LLM agent_runs insert is the telemetry source
**What goes wrong:** Adding only `swarm_noise_categories` rows (so the LLM can pick the key) without `classifier_rules` rows → the LLM classifies but there is no candidate row to accumulate n/agree against in a way the cron sees. (The view derives n/agree from `agent_runs.rule_key`, and the cron joins to `classifier_rules` for status — a missing `classifier_rules` row means the rule is treated as `candidate` default but never appears in promotion output cleanly.)
**Avoid:** Always pair a `swarm_noise_categories` INSERT with a `classifier_rules` INSERT (`kind='agent_intent'`, `status='candidate'`).

### Pitfall 5: Measurement without a labelled baseline
**What goes wrong:** "unknown pool dropped" measured purely as `decision` distribution shift — but `unknown` shrinking could mean real routable mail got mis-archived (false success).
**Avoid:** NOISE-03 requires a **labelled true-noise fraction** on a sample, before AND after, per mailbox. Distribution counts alone are necessary but not sufficient.

## Code Examples

### Task 0 — widen the agent_runs CHECK (Phase-113 precedent)
```sql
-- Source: mirror of supabase/migrations/20260611_phase113_agent_runs_intent_check_sales.sql
alter table public.agent_runs drop constraint if exists agent_runs_swarm_type_check;
alter table public.agent_runs add constraint agent_runs_swarm_type_check
  check (swarm_type in (
    'debtor-email','sales-email','planning','order-entry','info-routing'
  ));
```

### Seed an info-routing LLM noise category + candidate rule
```sql
-- Source: mirror of 20260520_phase84_noise_categories.sql + 20260520_phase84_classifier_rules_seed.sql
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('info-routing','cold_sales_outreach','Cold Sales / SEO Outreach','Spam','categorize_archive',null,60)
on conflict (swarm_type, category_key) do update set
  display_label=excluded.display_label, outlook_label=excluded.outlook_label,
  action=excluded.action, display_order=excluded.display_order, updated_at=now();

insert into public.classifier_rules (swarm_type, rule_key, kind, status, notes)
values ('info-routing','cold_sales_outreach','agent_intent','candidate',
        'Phase 130 NOISE-01. LLM Pass-2 attribution; promotion via classifier-promotion-cron Wilson-CI.')
on conflict (swarm_type, rule_key) do nothing;
```

### Regex template with carve-out (for `securitas` — the crisp high-volume candidate)
```typescript
// Source: pattern style from web/lib/debtor-email/classify.ts (Phase 84 anchored matchers)
// Sender-pinned + word-boundary; block-rule FIRST so actionable mail escapes.
const ACTIONABLE_BLOCK =
  /\b(offerte|order|inkooporder|factuur|aanmaning|keuring|ontruiming|storing|werkbon)\b/i;
const SENDER_SECURITAS = /^noreply(-gms_nl)?@securitas\.(nl|net)$/i;
// ... in classify(): if (ACTIONABLE_BLOCK.test(subject) || ACTIONABLE_BLOCK.test(body))
//                       return { category: "unknown", ... };   // carve-out wins
//                     if (SENDER_SECURITAS.test(from)) return { category: "automated_security_report", ... };
```

### NOISE-03 measurement query (per-mailbox unknown-pool composition)
```sql
-- Stage-1 decision distribution per mailbox (entity proxy). No view exists — build one.
-- decision_details->>'entity' carries 'smeba' | 'fire-control'.
select
  decision_details->>'entity'        as mailbox_entity,
  decision,
  count(*)                            as n,
  round(100.0*count(*)/sum(count(*)) over (partition by decision_details->>'entity'),1) as pct
from public.pipeline_events
where swarm_type='info-routing' and stage=1
  and created_at >= now() - interval '30 days'
group by 1,2
order by 1, n desc;
-- Baseline true-noise fraction within `unknown` = labelled-sample numerator / sample size,
-- estimated separately (CONTEXT: sample N at Claude's discretion).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Noise keys as a 3-place enum (TS + Postgres + Orq json_schema) | Single source: enabled `swarm_noise_categories` rows read at call-time | Phase 111 correction | Adding an LLM noise key = registry only; no codegen, no Studio edit |
| `entity NOT NULL CHECK(enum)` on agent_runs | entity nullable, no enum | Phase 74 (`20260506`) | `fire-control`/`info-routing` entities allowed; only `swarm_type` CHECK remains |
| Per-swarm regex enum in `./categories` | Registry-driven `loadSwarmNoiseCategories` | Phase 68/Wave 2 | Stage-1 surfaces are swarm-agnostic |
| `agent_runs_intent_check` listing only 8 debtor intents | widened to union of all swarm intents | Phase 113 (`20260611`) | Direct precedent for the swarm_type CHECK widen this phase needs |

**Deprecated/outdated for this phase:**
- The CONTEXT phrase "the `labeling-flip-cron` lifecycle" as the promotion gate — that cron is debtor-only; the real gate is `classifier-promotion-cron`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `info@fire-control.nl` is live despite seed `ingest_enabled=false` (79 fire-control pipeline_events exist) | Runtime State / NOISE-05 | If still disabled, fire-control half of the measurement/scope is moot until flipped — plan must verify live `ingest_enabled` |
| A2 | The 678 `unknown` info-routing emails are ~50% latent noise (CONTEXT's 120-row sample) | Summary / NOISE-03 | Baseline fraction must be re-established with a labelled sample; the 50% is the operator's estimate, not a query result |
| A3 | Widening (vs dropping) the `agent_runs.swarm_type` CHECK is the right call | Critical Finding | Phase 113 note hints at eventual drop; widening is lower-risk but leaves the enum-maintenance smell |
| A4 | Survey/feedback-invites (REQUIREMENTS NOISE-01) is a real 6th class vs CONTEXT's 5 | User Constraints | If absent from data, drop it; if present, add a 6th category |
| A5 | The screen worker's debtor-only Step 4.5 block correctly no-ops for info-routing (null labeling_settings → fall-through to Step 5) | Architecture | If it does NOT fall through cleanly, info-routing emails could hit a debtor code path — verify in a smoke test (high confidence it's fine; the `if (settings)` guard returns null for info@) |

## Open Questions (RESOLVED at plan time 2026-06-16)

1. **Is `info@fire-control.nl` actually ingesting today?** — RESOLVED: live query of `info_routing_mailbox_settings` confirms `ingest_enabled=true` (flipped 2026-05-21 by nick:zap-go-live). Both info@ mailboxes are in scope; the 4 dormant boxes stay `false`. (Plan 130-02 interfaces block records this.)

   - Known: seeded `ingest_enabled=false`; 79 `fire-control` entity rows exist in pipeline_events.
   - Unclear: whether someone flipped it live, or those rows predate the gate.
   - Recommendation: query live `info_routing_mailbox_settings` at plan time; flip to `true` if it must be in scope.

2. **Regex vs LLM split for `securitas`/`impexcompany` (crisp, high-volume).** — RESOLVED: plans go all-LLM-category (zero-code) per the RESEARCH recommended default; the optional regex module is explicitly out of scope this phase (deferred — promote `securitas` to a dedicated module only if LLM precision/cost later warrants).
   - Known: regex needs a NEW info-routing module (code + bundler map + swarms UPDATE); LLM needs only registry rows.
   - Recommendation: start ALL classes as LLM categories (zero-code), and only promote `securitas` to a dedicated regex module if its LLM precision/cost warrants it. Validates the pipeline end-to-end with the lowest-risk change first (CONTEXT's "good first shadow rule" intent).

3. **`classifier_rules` RLS (RESOLVED — low risk):** plans only INSERT rows via service-role (`createAdminClient`), which bypasses RLS; no new table is created, so `check:supabase` is not newly triggered. The missing-explicit-policy smell is pre-existing and out of scope. The table has `ENABLE ROW LEVEL SECURITY` (`20260428_classifier_rules.sql:44`) but I found no explicit policy migration. Service-role writes bypass RLS, so seeds work; but `npm run check:supabase` may flag missing-policy. Verify before adding rows (low risk — service-role writes only).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (live DB) | All registry/telemetry work | ✓ | mvqjhlxfvtqqubqgdvhz | — |
| Inngest (`classifier-promotion-cron`) | NOISE-02 promotion | ✓ (deployed) | — | — |
| Orq.ai `stage-1-category-classifier` | LLM Pass-2 | ✓ (firing — 678 invocations verified) | — | coerces to `unknown` on error |
| `CLASSIFIER_CRON_MUTATE` env var | Flip shadow→promote | ✗ default (shadow) | — | Operator sets `true` after review (intended gate) |

**Missing dependencies with no fallback:** None that block planning.
**Missing with fallback:** `CLASSIFIER_CRON_MUTATE` defaulting to shadow is by design (no blind auto-archive, NOISE-02).

## Validation Architecture

> `.planning/config.json` not inspected for `nyquist_validation`; including per default-enabled rule.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`web/__tests__/`, `*.test.ts`) |
| Quick run | `cd web && npx vitest run <file>` |
| Full suite | `cd web && npm test` |
| Migration lint | `npm run check:supabase` (pre-push hook; fails on ERROR-level advisor) |
| Codegen drift gate | `npm run codegen && git diff --exit-code` (NOT triggered by noise keys — codegen reads swarm_intents/entity_brand/tenant_domains only) |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Command | Exists? |
|-----|----------|-----------|---------|---------|
| Task 0 | agent_runs accepts info-routing INSERT | integration | live INSERT smoke (mirror of the `23514` repro, expect 201) | ❌ Wave 0 |
| NOISE-01 | new noise category appears in call-time closed list | unit | screen-worker test fixture asserts enabled categories include new key | ⚠️ extend `classifier-screen-worker.test.ts` |
| NOISE-02 | candidate promotes only at N≥30 & CI-lo≥0.92 | unit | `wilson.test.ts` / `classifier-promotion-cron.test.ts` patterns exist | ✅ reuse |
| NOISE-04 | actionable carve-out returns `unknown` | unit | regex/agent fixture: offerte/order/keuring in body → not noise | ❌ Wave 0 (boundary test, mirror `classify` boundary tests) |
| NOISE-04 | hard-separation invariant | static | `web/__tests__/static-checks/swarm-hard-separation.test.ts` | ✅ reuse |
| NOISE-03 | per-mailbox measurement query returns | manual/SQL | run the measurement query before/after | ❌ build query |

### Wave 0 Gaps
- [ ] Migration: widen `agent_runs_swarm_type_check` (+ smoke that INSERT succeeds)
- [ ] Boundary test for actionable-token carve-out (mirror `classify.ts` block-rule tests)
- [ ] Measurement SQL/view for unknown-pool composition per mailbox
- [ ] Extend `classifier-screen-worker.test.ts` to assert info-routing categories pass to the LLM

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Zod on LLM output (`Stage1OutputSchema`); regex anchored + bounded quantifiers (ReDoS guard, already practiced in `classify.ts`) |
| V4 Access Control | yes | `agent_runs`/`classifier_rules`/`pipeline_events` are service-role-write, authenticated-read (RLS). Confirm `classifier_rules` has a policy (Open Q 3). |
| V6 Cryptography | no | — |
| V2/V3 Auth/Session | no (backend pipeline) | Ingest route auth = `ZAPIER_INGEST_SECRET` body field (existing) |

| Threat Pattern | STRIDE | Mitigation |
|----------------|--------|-----------|
| Regex catastrophic backtracking (ReDoS) | DoS | Bounded quantifiers `\d{1,12}`, anchors — existing practice |
| False-archive of actionable mail | Tampering w/ business process | Carve-out block-rules + Wilson-CI shadow gate before promotion (NOISE-04) |
| RLS-disabled new objects | Info disclosure / EoP | No new tables this phase; reuse existing RLS-covered tables. A new measurement VIEW must use `security_invoker=true` (CLAUDE.md). |

## Sources

### Primary (HIGH — verified this session)
- Live Supabase REST queries (project `mvqjhlxfvtqqubqgdvhz`): `agent_runs`/`classifier_rules`/`classifier_rule_telemetry`/`pipeline_events`/`automation_runs` counts; reproduced `23514` CHECK violation on info-routing INSERT.
- `supabase/migrations/`: `20260428_public_agent_runs.sql` (swarm_type CHECK), `20260428_classifier_rules.sql`, `20260428_classifier_rule_telemetry.sql`, `20260506_phase74_agent_runs_entity_nullable.sql`, `20260512_phase9998_agent_runs_predictor.sql`, `20260520_phase84_noise_categories.sql`, `20260520_phase84_classifier_rules_seed.sql`, `20260521_info_routing_mailbox_settings.sql`, `20260521_info_routing_swarm_smeba_minimum_viable.sql`, `20260506a_pipeline_events.sql`, `20260611_phase113_agent_runs_intent_check_sales.sql`.
- `web/lib/inngest/functions/classifier-screen-worker.ts`, `classifier-promotion-cron.ts`, `labeling-flip-cron.ts`; `web/lib/classifier/wilson.ts`, `cache.ts`; `web/lib/debtor-email/classify.ts`; `web/app/(dashboard)/automations/[swarm]/stage-1/actions.ts`; `web/app/api/automations/info-routing/ingest/route.ts`.
- `docs/agentic-pipeline/stage-1-regex.md` (locked RFC), `docs/debtor-email-pipeline-architecture.md`.
- `.claude/skills/spike-findings-agent-workforce/SKILL.md` (Phase 88 info-routing prep: 56% regex transfer, registry-insert onboarding).

### Secondary (MEDIUM)
- CONTEXT.md / REQUIREMENTS.md operator estimates (50% noise, per-sender volumes) — labelled sample needed to confirm.

## Metadata

**Confidence breakdown:**
- Critical Finding (telemetry blocked): **HIGH** — reproduced the exact Postgres CHECK violation; cross-checked counts.
- Standard stack: **HIGH** — every table/module read from migrations + live schema.
- Architecture: **HIGH** — traced ingest→screen-worker→cron→whitelist end to end.
- Measurement approach: **MEDIUM** — query is straightforward, but baseline true-noise fraction depends on a labelled sample not yet taken.
- Mailbox scope (fire-control live state): **MEDIUM** — seed says disabled, live data says it ingested; verify at plan time.

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 (stable infra; re-verify live `ingest_enabled` + telemetry counts if planning slips past then)
