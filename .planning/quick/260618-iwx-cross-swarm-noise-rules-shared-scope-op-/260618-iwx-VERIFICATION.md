---
phase: 260618-iwx-cross-swarm-noise-rules
verified: 2026-06-18T14:42:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Quick Task 260618-iwx — Cross-Swarm Noise Rules Shared Scope Verification Report

**Goal:** Shared `swarm_type='*'` scope for Stage-1 noise categories with runtime union, per-swarm opt-out, cross-swarm telemetry view, and migration of info-routing's 7 junk categories — while keeping the per-swarm promotion gate inviolable.
**Verified:** 2026-06-18T14:42:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | `loadSwarmNoiseCategories` returns own rows UNIONed with shared `'*'` rows, own row shadows shared of same `category_key` | ✓ VERIFIED | `registry.ts:70` `.in("swarm_type", [swarmType, "*"])`; `:79-85` `byKey` map with precedence `existing.swarm_type === "*" && row.swarm_type === swarmType`. Test `registry.test.ts:287,303`. |
| 2 | An own-swarm `enabled=false` shadow row opts out of a shared category | ✓ VERIFIED | `registry.ts:67-71` removes DB-level `.eq("enabled",true)`; `:87-89` JS `.filter(row => row.enabled !== false)` runs AFTER precedence so shadow row is fetched and shadows. Test `registry.test.ts:322`. |
| 3 | Re-firing seed does NOT reset promoted `llm:*:high` rules to candidate | ✓ VERIFIED | `classifier-llm-rules-seed.ts:72` `{ onConflict: "swarm_type,rule_key", ignoreDuplicates: true }` → ON CONFLICT DO NOTHING. Regression test `classifier-llm-rules-seed.test.ts:160`. |
| 4 | info-routing's 7 junk categories scoped `swarm_type='*'` so debtor-email + sales-email see them | ✓ VERIFIED | Migration `20260618...sql:27-39` UPDATE to `'*'` for the exact 7 keys; union from truth #1 surfaces them to every swarm. Doc lists same 7 keys (`stage-1-regex.md:117-120`). |
| 5 | Cross-swarm telemetry view aggregates `human_verdict` by `rule_key` across swarms, readable by service_role | ✓ VERIFIED | Migration `:44-56` `classifier_rule_telemetry_crossswarm` with `security_invoker=true`, GROUP BY `rule_key`, `count(distinct swarm_type) as swarm_count`, `GRANT SELECT ... TO service_role`. Mirrors reference `20260428`. |
| 6 | `readWhitelist` stays per-swarm (no `'*'` union) — promotion never leaks | ✓ VERIFIED | `cache.ts:40-41` `.eq("swarm_type", swarmType).eq("status", "promoted")`; `grep -c "'*'" cache.ts` = 0; file UNCHANGED. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `web/lib/swarms/registry.ts` | Union + JS precedence + JS enabled filter | ✓ VERIFIED | `.in("swarm_type",[swarmType,"*"])`, no DB `enabled` filter, JS precedence + filter + re-sort; cache still keyed by `swarmType` only. Wired: read by `classifier-llm-rules-seed.ts:27,49` + ~25 callers. |
| `supabase/migrations/20260618_crossswarm_noise_shared_scope.sql` | 7-cat re-scope + cross-swarm view | ✓ VERIFIED | UPDATE (7 keys → `'*'`, `updated_at=now()` — column exists per `20260511` migration) + view with `security_invoker` + service_role GRANT. |
| `web/lib/inngest/functions/classifier-llm-rules-seed.ts` | `ignoreDuplicates:true` on upsert | ✓ VERIFIED | Line 72 carries `ignoreDuplicates: true`. Header contract (line 4) now matches code. |
| `docs/agentic-pipeline/stage-1-regex.md` | Shared-scope + per-swarm-gate note | ✓ VERIFIED | `:97-120` subsection covers union mechanism, opt-out shadow, per-swarm promotion gate (forbids `'*'` promoted rule), shipped 7 cats. RFC note is load-bearing and present. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `registry.ts` | `swarm_noise_categories` | `.in("swarm_type",[swarmType,"*"])` | ✓ WIRED | Line 70 query + JS resolution + cache write at `:90`. |
| `classifier-llm-rules-seed.ts` | `loadSwarmNoiseCategories` | seeds per-consuming-swarm candidates for unioned shared cats | ✓ WIRED | Import `:27`, call `:49` `loadSwarmNoiseCategories(admin, sw.swarm_type)`; candidate rows scoped to `sw.swarm_type` (never `'*'`) at `:56` — this scoping IS the per-swarm gate. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `registry.ts` loader | `value` (resolved cat list) | `swarm_noise_categories` query | ✓ Real query; live `'*'` rows arrive after post-deploy migration apply (out-of-scope per task) | ✓ FLOWING (code path real; data population is the documented ops step) |
| crossswarm view | `n_total/agree_total/swarm_count` | `public.agent_runs` (real columns) | ✓ Source columns confirmed in reference view `20260428` | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Affected suites green | `vitest run registry + seed` | 2 files / 27 tests passed | ✓ PASS |
| cache.ts no `'*'` union | `grep -c "'*'" cache.ts` | 0 | ✓ PASS |
| Migration grep gates | view name + security_invoker + "Shared scope" | GATES_OK | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CROSS-SWARM-NOISE-01 | 260618-iwx-PLAN | Shared `'*'` noise scope + runtime union + per-swarm opt-out + cross-swarm telemetry + 7-cat migration; per-swarm promotion gate inviolable | ✓ SATISFIED | Truths 1-6 all VERIFIED. |

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX` in any modified file. No stubs — all logic substantive and wired. cache.ts correctly left untouched (the inviolable gate).

### Human Verification Required

None. This task is backend code + SQL migration + docs. The two post-deploy items (apply migration to remote, re-fire `classifier/llm-rules-seed.run`) are explicitly scoped as POST-DEPLOY OPS STEPS in the PLAN `<ops_step>` and SUMMARY — they are operational follow-ups, NOT verification gaps for the code/migration/doc deliverables under review. Live DB state is out of scope per the verification brief.

### Gaps Summary

No gaps. All 6 must-have truths verified against the codebase, all 4 artifacts exist/substantive/wired, both key links wired, telemetry view and migration correct (security_invoker + service_role GRANT, `updated_at` column confirmed present), per-swarm promotion gate proven inviolable (cache.ts unchanged, 0 `'*'` matches). 27 affected tests green (corroborated). The migration is authored but intentionally not applied to live DB, and the seed re-fire is a documented manual ops step — both correctly excluded from code-artifact verification.

---

_Verified: 2026-06-18T14:42:00Z_
_Verifier: Claude (gsd-verifier)_
