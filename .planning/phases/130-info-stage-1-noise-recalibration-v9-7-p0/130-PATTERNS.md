# Phase 130: info@ Stage-1 noise-recalibration (V9.7 P0) - Pattern Map

**Mapped:** 2026-06-16
**Files analyzed:** 5 (1 CHECK-widen migration, 2 registry-seed migrations, 1 measurement query/view, 1 OPTIONAL regex module + worker map entry)
**Analogs found:** 5 / 5 (every file has a direct in-repo precedent — this is a copy-the-pattern phase, no net-new mechanism)

> **READ-FIRST (locked RFC, wins over code inference):** `docs/agentic-pipeline/stage-1-regex.md` (two-pass noise filter; registry source-of-truth invariant) and `docs/agentic-pipeline/README.md` (5-stage funnel, SWARM-02 no-per-swarm-branch). Hard-separation: Stage-1 noise lives ONLY in `swarm_noise_categories` — NEVER add a `swarm_intents` row this phase (enforced by `web/__tests__/static-checks/swarm-hard-separation.test.ts`).

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/<date>_phase130_agent_runs_swarm_type_check_info_routing.sql` | migration | transform (DDL CHECK-widen) | `supabase/migrations/20260611_phase113_agent_runs_intent_check_sales.sql` | exact (same bug class) |
| `supabase/migrations/<date>_phase130_info_routing_noise_categories.sql` | migration | CRUD (registry seed) | `supabase/migrations/20260520_phase84_noise_categories.sql` | exact |
| `supabase/migrations/<date>_phase130_info_routing_classifier_rules_seed.sql` | migration | CRUD (registry seed) | `supabase/migrations/20260520_phase84_classifier_rules_seed.sql` | exact |
| `supabase/migrations/<date>_phase130_info_unknown_pool_composition_view.sql` (or ad-hoc SQL) | migration / analytics | batch (read-model) | `supabase/migrations/20260506a_pipeline_events.sql` (RLS/view pattern) + RESEARCH measurement query | role-match (no existing view; build one) |
| `web/lib/info-routing/classify.ts` + map entry in `web/lib/inngest/functions/classifier-screen-worker.ts:71` — **OPTIONAL, regex path only** | utility (regex Pass-1) | transform (deterministic match) | `web/lib/debtor-email/classify.ts` | exact |

> **Note on file 2 vs 3:** Phase 84 split the registry seed across **two** migrations (`_noise_categories.sql` + `_classifier_rules_seed.sql`). Planner may keep that split (matches precedent) or combine into one migration with two `INSERT` blocks. Either is fine; the column shapes below are load-bearing.

---

## Pattern Assignments

### Task 0 (BLOCKING) — `agent_runs.swarm_type` CHECK widen (migration, DDL transform)

**Analog:** `supabase/migrations/20260611_phase113_agent_runs_intent_check_sales.sql` (exact same bug class — a CHECK that predates a new swarm; Phase 113 widened `agent_runs_intent_check`, Phase 130 widens `agent_runs_swarm_type_check`).

**Current constraint** (`supabase/migrations/20260428_public_agent_runs.sql:13-15`) — the blocker:
```sql
swarm_type text not null check (swarm_type in (
  'debtor-email', 'sales-email', 'planning', 'order-entry'
)),
```
`'info-routing'` is absent → every `agent_runs` INSERT for info-routing throws Postgres `23514`. RESEARCH reproduced this live. Telemetry never lands → Wilson-CI gate has nothing to evaluate → nothing promotes. **This must be Task 0; every other task is inert until it lands.**

**Drop+re-add pattern to copy** (`20260611_phase113...:21-50`):
```sql
alter table public.agent_runs
  drop constraint if exists agent_runs_swarm_type_check;

alter table public.agent_runs
  add constraint agent_runs_swarm_type_check
  check (swarm_type in (
    'debtor-email','sales-email','planning','order-entry','info-routing'
  ));
```
- Mirror the Phase 113 **header comment style**: root-cause + "This list MUST stay the union of all swarm_type values" + the "long-term: drop the CHECK in favour of registry validation" note (RESEARCH A3).
- Idempotent (`drop constraint if exists`), no data migration, no `BEGIN/COMMIT` strictly required but Phase 84 migrations wrap in `BEGIN; ... COMMIT;` — match the surrounding convention.
- **Verify task:** a live INSERT smoke (`swarm_type='info-routing'`) must return success, not `23514` (mirror the RESEARCH repro, expect the inverse).

> **Do NOT touch the `entity` CHECK** — already dropped/nullable in `20260506_phase74_agent_runs_entity_nullable.sql`; live `agent_runs` already holds `fire-control` entity rows. `swarm_type` is the SOLE blocker (RESEARCH Critical Finding).

---

### `swarm_noise_categories` seed (migration, registry CRUD)

**Analog:** `supabase/migrations/20260520_phase84_noise_categories.sql` (exact — same table, same idempotent upsert, same swarm-scoped seeding).

**Row shape + idempotent upsert to copy** (`20260520_phase84_noise_categories.sql:34-45`):
```sql
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('info-routing', 'cold_sales_outreach', 'Cold Sales / SEO Outreach', 'Spam', 'categorize_archive', null, 60)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();
```
- **PK:** `(swarm_type, category_key)`. **`action`** = `'categorize_archive'` for all noise classes (Phase 84 D-04 convention; the alternative `'swarm_dispatch'` is for routing, out of scope this phase). **`swarm_dispatch`** = `null`.
- **`display_order`** convention: Phase 84 placed new noise families at `>= 70` (after `auto_reply ~10-20`, `payment_admittance ~25-30`, `ooo ~40-50`, `spam`). Pick non-colliding orders for info-routing's new keys.
- One row per noise CLASS, `swarm_type='info-routing'` only (swarm-isolated; do NOT mirror to debtor/sales — those are different swarms). RESEARCH names 5 locked classes (+ possible 6th survey/feedback, A4). Suggested keys: `automated_security_report`, `cold_sales_outreach`, `marketing_newsletter`, `auto_dealer_spam`, `unsolicited_job_application` (+ optional `survey_feedback_invite`).
- **Header comment:** carry the hard-separation note verbatim from the Phase 84 header ("NO row added to swarm_intents... Enforced by web/__tests__/static-checks/swarm-hard-separation.test.ts").

---

### `classifier_rules` seed (migration, registry CRUD)

**Analog:** `supabase/migrations/20260520_phase84_classifier_rules_seed.sql` (exact — and critically, the **sales-email half** of that seed is the precise template, because sales-email has NO regex module and uses `kind='agent_intent'` — same situation as info-routing's LLM-category path).

**Row shape + idempotent insert to copy** (`20260520_phase84_classifier_rules_seed.sql:29-53`):
```sql
insert into public.classifier_rules (swarm_type, rule_key, kind, status, notes)
values
  ('info-routing', 'cold_sales_outreach', 'agent_intent', 'candidate',
   'Phase 130 NOISE-01. LLM Pass-2 attribution; promotion via classifier-promotion-cron Wilson-CI.')
  -- ... one row per noise key ...
on conflict (swarm_type, rule_key) do nothing;
```
- **Unique key:** `(swarm_type, rule_key)`. **`rule_key`** = `category_key` verbatim (flat naming, Phase 84/Phase 60 D-05 pattern).
- **`kind`** CHECK is `'regex' | 'agent_intent'`. Use **`'agent_intent'`** for every LLM-category rule (matches the sales-email rows). Use `'regex'` ONLY for a key that has a real regex matcher (i.e. only if the OPTIONAL `securitas` regex module is built — see below).
- **`status`** defaults to `'candidate'` (CHECK: `candidate|promoted|demoted|manual_block`). Seed all rows `'candidate'`; the cron promotes.
- **`on conflict ... do nothing`** (NOT `do update`) — preserves any operator-modified/hand-promoted status on re-run.
- **CRITICAL pairing (RESEARCH Pitfall 4):** every `swarm_noise_categories` INSERT MUST be paired with a `classifier_rules` INSERT. The telemetry view derives `n`/`agree` from `agent_runs.rule_key`; the cron joins to `classifier_rules` for status. A missing `classifier_rules` row = the rule never appears cleanly in promotion output.
- Zero counters at seed (`n`, `agree`, `ci_lo` default). No codegen, no Orq Studio edit — the `stage-1-category-classifier` agent's `category_key` output is `{'type':'string'}` and the enabled categories are passed at call-time (RESEARCH; stage-1-regex.md source-of-truth invariant).

---

### NOISE-03 measurement query / view (analytics, batch read-model)

**Analog:** No existing view over `pipeline_events` — build one. RLS/view conventions from `supabase/migrations/20260506a_pipeline_events.sql`; the query body from RESEARCH "Code Examples".

**`pipeline_events` columns that matter** (`20260506a_pipeline_events.sql:23-44`):
- `swarm_type` (filter `='info-routing'`), `stage` (filter `=1`), `decision` (the Stage-1 outcome string), `decision_details` jsonb (`->>'entity'` carries `'smeba'|'fire-control'` — the per-mailbox proxy required by NOISE-03/NOISE-05), `created_at`.

**Per-mailbox composition query to copy** (RESEARCH measurement example):
```sql
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
```

**If materialized as a VIEW (not just ad-hoc SQL):** MUST use `security_invoker=true` (CLAUDE.md hard rule — never `SECURITY DEFINER` on `public`/exposed schemas):
```sql
create view public.info_unknown_pool_composition
  with (security_invoker = true) as
  select ... ;
```
The RLS gate is then the caller's (`pipeline_events` is `authenticated`-select / `service_role`-all per `20260506a:50-59`). No new base table → no new RLS policy needed. `npm run check:supabase` will flag a `SECURITY DEFINER` view — so the `security_invoker=true` clause is load-bearing.

**Measurement discipline (RESEARCH Pitfall 5, NOISE-03 LOCKED):** distribution counts alone are necessary but NOT sufficient — a labelled true-noise fraction on a sample (per mailbox, before AND after) is required, else `unknown` shrinking could mean routable mail got mis-archived (false success). Sample N is Claude's discretion (CONTEXT).

---

### OPTIONAL — `web/lib/info-routing/classify.ts` regex Pass-1 module (utility, deterministic transform)

> **Only build this if a class is high-volume AND crisp** (RESEARCH recommends `securitas` 26/mo as the single best candidate; CONTEXT calls it "good first shadow rule"). LLM-category is the zero-code default for all fuzzy classes (cold-sales, newsletters, job-apps). Adding regex = CODE cost: new module + worker-map entry + `swarms.stage1_regex_module` UPDATE + SWARM-02 static-check must still pass.

**Analog:** `web/lib/debtor-email/classify.ts` (exact — same `classify({subject, from, bodySnippet})` shape; this is the only existing Stage-1 regex module).

**1. Block-rule-FIRST carve-out pattern (NOISE-04, the cardinal safety constraint).** `classify.ts` expresses carve-outs as block-rules that return early BEFORE any noise rule can match, with `\b` word-boundaries and the `(?!FP-)` negative-lookahead fix for over-match. Mirror this structure:
- The actionable-token carve-out must be a `*_BLOCK` regex checked FIRST: `/\b(offerte|order|inkooporder|factuur|aanmaning|keuring|ontruiming|storing|werkbon)\b/i` over subject AND body → return `unknown` before the noise rule runs.
- Reference block-rules in `classify.ts`: `SUBJECT_PAYMENT_REQUEST_BLOCK` (line 150), `SUBJECT_REFUND_BLOCK` (157), `BODY_DISPUTE` (176), the `(?!FP-)` lookahead (119). The evaluation order is set in `classify()` (lines ~300-340): normalize subject, compute all matchers as booleans, then hard-blocks fire first (`[SPAM]` prefix at 333), then noise matchers (Phase 84 block at 337).
- **v8.2 RESL-08 / ReDoS:** anchored sender pins (`^...$`), word-boundaries `\b`, bounded quantifiers `\d{1,12}` — never unbounded `.*` over keyword soup.

**Securitas template** (RESEARCH Code Example, in the `classify.ts` style):
```typescript
const ACTIONABLE_BLOCK =
  /\b(offerte|order|inkooporder|factuur|aanmaning|keuring|ontruiming|storing|werkbon)\b/i;
const SENDER_SECURITAS = /^noreply(-gms_nl)?@securitas\.(nl|net)$/i;
// in classify(): carve-out wins —
//   if (ACTIONABLE_BLOCK.test(subject) || ACTIONABLE_BLOCK.test(body)) return { category: "unknown", matchedRule: null };
//   if (SENDER_SECURITAS.test(from)) return { category: "automated_security_report", matchedRule: "automated_security_report" };
```

**2. Worker-map registration** (`web/lib/inngest/functions/classifier-screen-worker.ts:71-73`):
```typescript
const STAGE1_REGEX_MODULES: Record<string, { classify: Stage1ClassifyFn }> = {
  "@/lib/debtor-email/classify": { classify: debtorEmailClassify as Stage1ClassifyFn },
  // ADD: "@/lib/info-routing/classify": { classify: infoRoutingClassify as Stage1ClassifyFn },
};
```
Plus a static `import { classify as infoRoutingClassify } from "@/lib/info-routing/classify"` (mirror line 46) and `UPDATE swarms SET stage1_regex_module='@/lib/info-routing/classify' WHERE swarm_type='info-routing'`. The worker note (lines 58-65) warns: fully-dynamic import breaks the Vercel bundler — the static map entry is mandatory. The `classify` fn signature to satisfy is `Stage1ClassifyFn` (lines 66-70): `(input: {subject, from, bodySnippet?}) => {category: string; matchedRule: string | null}`.

> If regex is skipped (recommended default), info-routing keeps `stage1_regex_module='@/lib/debtor-email/classify'` and the new senders simply fall through Pass-1 to the LLM Pass-2 — no code change at all.

---

## Shared Patterns

### Idempotent migration envelope
**Source:** all Phase 84 migrations (`20260520_phase84_*.sql`)
**Apply to:** all 3-4 migration files
```sql
BEGIN;
-- inserts with `on conflict ... do update` (categories, preserves latest values)
-- or `on conflict ... do nothing` (rules, preserves operator-modified status)
COMMIT;
```
Header comment block (3-4 lines) explaining the bug/decision + the hard-separation invariant note + the `web/__tests__/static-checks/swarm-hard-separation.test.ts` reference. Every Phase 84 / Phase 113 migration leads with this.

### RLS / view security
**Source:** `supabase/migrations/_template.sql` + `20260506a_pipeline_events.sql:49-59`
**Apply to:** the measurement view (if materialized)
- No NEW base table this phase → reuse existing RLS-covered tables; no new policy needed for the CHECK-widen or the seeds.
- A new VIEW MUST be `with (security_invoker = true)` — never `SECURITY DEFINER` (CLAUDE.md; `npm run check:supabase` ERROR gate).

### Promotion gate (NO code change — name the RIGHT cron)
**Source:** `web/lib/inngest/functions/classifier-promotion-cron.ts` + `web/lib/classifier/wilson.ts`
**Apply to:** NOISE-02 verification (not a file to write — a runtime behavior the plan depends on)
- `classifier-promotion-cron` is **swarm-agnostic** (selects whole `classifier_rule_telemetry` view, no swarm filter) → once the CHECK is widened + `classifier_rules` seeded + operators give verdicts, info-routing rules WILL flow through it. **No cron code change.**
- ⚠️ **`labeling-flip-cron` is the WRONG cron** (hardcoded `.eq("swarm_type","debtor-email")` at `labeling-flip-cron.ts:127`). CONTEXT's "labeling-flip-cron lifecycle" phrasing is stale — the plan must say `classifier-promotion-cron`.
- Wilson thresholds (`wilson.ts`): `PROMOTE_N_MIN=30`, `PROMOTE_CI_LO_MIN=0.92`. Promotion to `acting`/`promoted` requires env `CLASSIFIER_CRON_MUTATE=true` (default = shadow). The plan must surface flipping that env var as the explicit operator "promote" lever (NOISE-02 "no blind auto-archive").

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | Every file has a direct in-repo precedent. The measurement view is the weakest match (no existing `pipeline_events` analytics view), but its query body, RLS pattern, and `security_invoker` requirement are all sourced from existing migrations + RESEARCH. |

---

## Metadata

**Analog search scope:** `supabase/migrations/` (CHECK-widen, registry seeds, pipeline_events/RLS), `web/lib/debtor-email/classify.ts` (regex Pass-1 + carve-out block-rules), `web/lib/inngest/functions/classifier-screen-worker.ts` (STAGE1_REGEX_MODULES map).
**Files scanned:** 7 (3 read in full, 4 via targeted grep/sed).
**Pattern extraction date:** 2026-06-16
**Verified preconditions to re-check at plan time (from RESEARCH):** live `info_routing_mailbox_settings.ingest_enabled` for `info@fire-control.nl` (A1); whether survey/feedback is a real 6th class (A4); `classifier_rules` RLS policy presence (Open Q3 — low risk, service-role writes only).
