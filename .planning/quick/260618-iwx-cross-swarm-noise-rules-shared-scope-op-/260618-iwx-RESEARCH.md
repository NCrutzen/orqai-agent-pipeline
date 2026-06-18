# Quick Task 260618-iwx — Research: Cross-Swarm Noise Rules

**Author:** orchestrator (researcher agent died mid-run; findings gathered directly)
**Date:** 2026-06-18

## Verdict: minimal-and-safe change set

The shared scope is **categories-only at the registry+runtime layer**; the
per-swarm promotion gate (LOCKED, inviolable) is preserved for free because the
existing seed flow scopes candidate rules to the **consuming** swarm_type.

### 1. Closed-list builder union → single injection at `loadSwarmNoiseCategories`

`web/lib/swarms/registry.ts:54-76`. Current query:
```ts
.from("swarm_noise_categories").select("*")
.eq("swarm_type", swarmType).eq("enabled", true)
.order("display_order", { ascending: true })
```
This loader is the **single chokepoint** — consumed by the Stage-1 closed-list
builder (`classifier-screen-worker.ts`, both the debtor block ~L191 and the
swarm-agnostic block ~L940), the seed flow, AND ~25 UI readers (stage-1
chip-strips, bulk-review hydrate, kanban-loader, etc.). One change here covers
all of them.

**New shape — union `[swarmType, '*']` with JS precedence+enabled:**
```ts
.from("swarm_noise_categories").select("*")
.in("swarm_type", [swarmType, "*"])
// NOTE: do NOT .eq("enabled", true) at the DB — see Pitfall A
.order("display_order", { ascending: true })
```
Then in JS: group by `category_key`; an **own-swarm row shadows the shared `'*'`
row** (own wins); after precedence, **drop rows whose winning row has
`enabled === false`**. Cache stays keyed by `swarmType` (the resolved per-swarm
list); `'*'` is never passed as a swarmType, so no extra cache entry.

> **Pitfall A (opt-out breaks under DB enabled-filter):** opt-out = an own-swarm
> row with `enabled=false` shadowing a shared row. If `enabled=true` is filtered
> at the DB, the opt-out row is never fetched → the shared row survives →
> opt-out silently fails. Move the enabled filter into JS, applied AFTER
> precedence.

### 2. `readWhitelist` → NO union (union here would be UNSAFE)

`web/lib/classifier/cache.ts:29-55` reads `classifier_rules` for
`(swarm_type, status='promoted')`. Gate confirmed at
`classifier-screen-worker.ts:600-716`: `effectiveMatchedRule = llm:{cat}:{conf}`,
`isWhitelistMatch = whitelistSet.has(effectiveMatchedRule)`; not-matched →
`status='predicted'` (observe, no archive), matched → categorize+archive.

A `swarm_type='*'` **promoted** row unioned into every swarm's whitelist would
auto-archive everywhere with zero per-swarm evidence — a direct violation of the
LOCKED per-swarm gate. **Leave `readWhitelist` unchanged.** The task's literal
"runtime union in readWhitelist" is superseded by the per-swarm-gate decision
(see CONTEXT). Document this explicitly so a later pass doesn't "complete" the
union and break the gate.

### 3. Candidate-seed flow does the per-swarm scoping automatically

`web/lib/inngest/functions/classifier-llm-rules-seed.ts`. For each
`active swarm × enabled noise cat (!= 'unknown')` it upserts
`(swarm_type=<consuming swarm>, rule_key='llm:{cat}:high', status='candidate')`.
Because it reads through `loadSwarmNoiseCategories` (which after change #1
includes the shared cats), **re-firing `classifier/llm-rules-seed.run` seeds
per-swarm candidates for debtor-email + sales-email for all 7 shared cats** —
scoped to debtor-email / sales-email, NOT `'*'`. This is the gate.

> **Pitfall B (seed clobbers promoted status) — REAL BUG TO FIX:** the upsert is
> `.upsert({...status:'candidate'...}, { onConflict: "swarm_type,rule_key" })`
> with NO `ignoreDuplicates`. supabase-js default = `INSERT ... ON CONFLICT DO
> UPDATE` → re-firing would reset info-routing's 3 **promoted** rules
> (`llm:marketing_newsletter:high`, `llm:cold_sales_outreach:high`,
> `llm:auto_dealer_spam:high`) back to `candidate`. The file's own header
> comment claims "Idempotent via ON CONFLICT DO NOTHING" — so the code
> contradicts its contract. **Fix: add `ignoreDuplicates: true`** (→ DO NOTHING).
> Only then is re-fire safe. Add a regression test.

### 4. Data migration (re-scope in place)

`UPDATE public.swarm_noise_categories SET swarm_type='*', updated_at=now()
WHERE swarm_type='info-routing' AND category_key IN (
  'spam','marketing_newsletter','cold_sales_outreach','auto_dealer_spam',
  'unsolicited_job_application','survey_feedback_invite','automated_security_report');`

PK is `(swarm_type, category_key)` with no FK and no `'*'` rows yet → UPDATE is
safe (no conflict). info-routing keeps seeing them via the union. info-routing's
3 promoted RULES stay scoped `info-routing` (untouched — it earned them).
debtor/sales earn their own gates via the seed candidates + verdicts.

> Re-scope in place (not additive copies): avoids duplicate-row drift. info-routing
> behaviour is net-unchanged (union restores the same effective list).

### 5. Cross-swarm telemetry view (visibility only; promotion stays per-swarm)

Pattern: `supabase/migrations/20260428_classifier_rule_telemetry.sql` aggregates
`agent_runs` by `(swarm_type, rule_key)` using `human_verdict IN
('approved','edited_minor')`. Columns `agent_runs.swarm_type / rule_key /
human_verdict` confirmed to exist (existing view selects them).

New view = same, **without swarm_type in GROUP BY** → pooled per `rule_key`
(rule_key embeds the category as `llm:{cat}:high`), plus a `swarm_count`:
```sql
CREATE VIEW public.classifier_rule_telemetry_crossswarm
  WITH (security_invoker = true) AS
SELECT ar.rule_key,
       COUNT(*)::int AS n_total,
       COUNT(*) FILTER (WHERE ar.human_verdict IN ('approved','edited_minor'))::int AS agree_total,
       COUNT(DISTINCT ar.swarm_type)::int AS swarm_count
FROM public.agent_runs ar
WHERE ar.rule_key IS NOT NULL AND ar.human_verdict IS NOT NULL
GROUP BY ar.rule_key;
GRANT SELECT ON public.classifier_rule_telemetry_crossswarm TO service_role;
```
Source-agnostic: reads `human_verdict` regardless of Bulk-Review vs future
Outlook-delta origin (CONTEXT fast-follow seam).

### 6. No codegen, no new table, RLS

- **Codegen:** generators (`gen-intent-types.ts`, `gen-tenant-domains.ts`) read
  `swarm_intents` / `swarms.tenant_domains` — NOT `swarm_noise_categories` /
  `classifier_rules`. RFC stage-1-regex.md:85-91 confirms noise keys are
  call-time registry data. **No codegen, no `*.generated.ts` change.**
- **No new table:** opt-out = shadow row (existing table, existing RLS). Shared
  rows are ordinary rows in the already-RLS'd `swarm_noise_categories`.
- **RLS/view:** only the new view needs `security_invoker=true` + service_role
  GRANT (per CLAUDE.md). `npm run check:supabase` must stay green.

### 7. RFC doc update (RFC wins over code)

`docs/agentic-pipeline/stage-1-regex.md` must gain a short "Shared scope (`'*'`)
+ per-swarm gate" note: shared categories union into every swarm's closed list;
promotion stays per-swarm; `readWhitelist` deliberately does NOT union `'*'`.

## Change-set summary (smallest diff)
1. `registry.ts` — union + JS precedence/enabled in `loadSwarmNoiseCategories`.
2. `classifier-llm-rules-seed.ts` — `ignoreDuplicates: true` fix.
3. One migration — UPDATE 7 cats → `'*'`; CREATE cross-swarm view.
4. Re-fire `classifier/llm-rules-seed.run` (post-migration, ops step).
5. Tests — union precedence, opt-out shadow, seed-idempotency-keeps-promoted.
6. Doc — stage-1-regex.md shared-scope note.

`readWhitelist` UNCHANGED. No new table. No codegen.

## RESEARCH COMPLETE
File: .planning/quick/260618-iwx-cross-swarm-noise-rules-shared-scope-op-/260618-iwx-RESEARCH.md
</content>
