---
phase: 260618-iwx-cross-swarm-noise-rules-shared-scope
reviewed: 2026-06-18T00:00:00Z
depth: quick
files_reviewed: 6
files_reviewed_list:
  - web/lib/swarms/registry.ts
  - web/lib/swarms/__tests__/registry.test.ts
  - web/lib/inngest/functions/classifier-llm-rules-seed.ts
  - web/lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts
  - supabase/migrations/20260618_crossswarm_noise_shared_scope.sql
  - docs/agentic-pipeline/stage-1-regex.md
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Quick 260618-iwx: Code Review Report

**Reviewed:** 2026-06-18
**Depth:** quick
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Cross-swarm noise-rule sharing via a reserved `swarm_type='*'` sentinel. The change is well-scoped and the four stated invariants hold:

1. **Per-swarm promotion gate intact.** `web/lib/classifier/cache.ts` is untouched (verified by `git diff` — empty). `readWhitelist` still reads `.eq("swarm_type", swarmType)` with no `'*'` union, so promotion cannot leak across swarms. Confirmed.
2. **JS precedence + post-precedence enabled filter is correct.** The `Map`-dedup in `loadSwarmNoiseCategories` writes a key when there is no existing entry OR when the existing entry is `'*'` and the incoming row is the own swarm. This produces own-swarm-shadows-`'*'` in **both** array orderings (own-first and `'*'`-first). The `.filter((row) => row.enabled !== false)` runs AFTER the Map collapse and AFTER the final `.sort`, so an own-swarm `enabled=false` shadow row correctly opts the swarm out of a shared category. The 5 new tests cover shadow, union-different-keys, opt-out, disabled-shared-row, and ordering.
3. **View is hardened correctly.** `classifier_rule_telemetry_crossswarm` is created `WITH (security_invoker = true)` and granted to `service_role` only — matches CLAUDE.md. It is a view (no RLS needed; inherits base-table RLS via security_invoker). All referenced columns (`rule_key`, `human_verdict`, `swarm_type`) exist on `public.agent_runs`, and `'approved'`/`'edited_minor'` are valid `human_verdict` enum members.
4. **`ignoreDuplicates:true` => ON CONFLICT DO NOTHING.** supabase-js maps `ignoreDuplicates:true` to `ON CONFLICT DO NOTHING` (vs. the default DO UPDATE). The seed function relies on this so a re-fire does not demote already-promoted `llm:*:high` rows back to `status='candidate'`. The seed scopes shared-category candidate rows to the **consuming** swarm (`swarm_type: sw.swarm_type`), preserving the gate.

No blockers. Two warnings about test pinning strength and a column dependency, plus three info-level notes.

## Warnings

### WR-01: Regression test pins the call options, not the ON CONFLICT DO NOTHING behavior

**File:** `web/lib/inngest/functions/__tests__/classifier-llm-rules-seed.test.ts:160-176`
**Issue:** The "re-fire is idempotent" test asserts only that `call.opts` equals `{ onConflict, ignoreDuplicates: true }`. It does not exercise the actual demotion-prevention semantics — the mock `upsertFn` always returns `{ error: null }` and never simulates a pre-existing promoted row. If a future refactor swapped `.upsert(..., { ignoreDuplicates: true })` for an explicit `.update()` or dropped the flag in a code path the options-shape assertion does not cover, this test could still pass while the real ON CONFLICT contract regressed. The test is a structural pin (good, cheap) but the invariant it claims to protect (promoted rows survive a re-fire) is asserted indirectly. It is functionally a near-duplicate of WR-02's sibling test at lines 112-124.
**Fix:** Acceptable for a quick task since the supabase-js mapping of `ignoreDuplicates` is stable library behavior. If hardening later, add a stateful mock that records existing `(swarm_type, rule_key)` rows with `status='promoted'` and asserts the upsert does not overwrite `status`. At minimum, add a comment that this is an options-contract pin, not a behavioral one.

### WR-02: Telemetry view silently breaks if `agent_runs.rule_key` or `human_verdict` is ever renamed/dropped

**File:** `supabase/migrations/20260618_crossswarm_noise_shared_scope.sql:44-54`
**Issue:** `create or replace view` binds to `public.agent_runs.{rule_key, human_verdict, swarm_type}` with no guard. These columns currently exist (verified), but the view carries no defensive comment tying it to the owning migration (`20260428_public_agent_runs.sql` / `20260520_phase89_llm_rule_key_backfill.sql`). A later migration dropping `rule_key` would `CREATE OR REPLACE` fail or silently produce a stale definition. Low severity because it is visibility-only (no gating depends on it).
**Fix:** Add an inline comment in the view body documenting the source columns + owning migration, e.g. `-- depends on public.agent_runs.rule_key (20260520_phase89_llm_rule_key_backfill.sql)`. No code change to the query needed.

## Info

### IN-01: View's `agree_total` definition (approved + edited_minor) is undocumented and diverges from the promotion gate

**File:** `supabase/migrations/20260618_crossswarm_noise_shared_scope.sql:48-49`
**Issue:** "Agreement" is defined as `human_verdict in ('approved', 'edited_minor')`. The Wilson-CI promotion gate may count agreement differently (e.g. excluding `edited_minor`, or treating it as partial). Since this view is explicitly visibility-only and promotion stays per-swarm via `classifier_rules`, the divergence is harmless — but an operator reading cross-swarm counts could misread them as gate-eligible signal.
**Fix:** One-line comment clarifying this is a loose agreement proxy for visibility, NOT the promotion-gate definition.

### IN-02: `n_total` includes rows from disabled / opted-out swarms

**File:** `supabase/migrations/20260618_crossswarm_noise_shared_scope.sql:51-54`
**Issue:** The view pools by `rule_key` across ALL `swarm_type` values with no filter on whether the swarm currently has that category enabled (an `enabled=false` shadow opt-out at the registry does not retro-remove historic `agent_runs` rows). `swarm_count` therefore counts swarms that may have since opted out. Visibility-only, so non-blocking.
**Fix:** Acceptable as-is for telemetry. If precision matters later, note in the view comment that counts are historic and not filtered by current enablement.

### IN-03: Migration relies on no `'*'` rows pre-existing; assertion is in prose only

**File:** `supabase/migrations/20260618_crossswarm_noise_shared_scope.sql:11-13, 26-39`
**Issue:** The header asserts "no `'*'` rows exist yet -> no conflict", but the `UPDATE ... set swarm_type='*'` would violate the `(swarm_type, category_key)` PK if any `('*', <key>)` row already existed for one of the 7 keys. The migration does not defend against this (no `ON CONFLICT`, no pre-check) — it would error loudly, which is acceptable, but the safety claim is an unverified assumption baked into prose.
**Fix:** None required (loud failure is safe and the assumption is true today). Optionally add a guarded `WHERE NOT EXISTS` pre-check or a comment noting the migration is intentionally non-idempotent for this one-time re-scope.

---

_Reviewed: 2026-06-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
