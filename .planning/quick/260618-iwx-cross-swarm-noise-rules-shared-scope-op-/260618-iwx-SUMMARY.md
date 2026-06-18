---
quick_id: 260618-iwx
status: complete
date: 2026-06-18
---

# Quick Task 260618-iwx — Cross-Swarm Noise Rules: SUMMARY

## What shipped

Shared scope for Stage-1 noise categories via a reserved `swarm_type='*'`
sentinel, so info-routing's junk-mail knowledge is no longer siloed —
verkoop@ (sales-email) + debiteuren@ (debtor-email) inherit it. The per-swarm
**promotion** gate is preserved untouched (auto-archive trust is earned per
swarm; only the category *definitions* are shared).

| # | Commit | Change |
|---|--------|--------|
| 1 | `1feb2391` | `loadSwarmNoiseCategories` unions `.in('swarm_type',[swarm,'*'])`; JS own-row-shadows-shared precedence; JS enabled filter (opt-out shadow rows). +5 tests. |
| 2 | `e67c75a7` | seed upsert `ignoreDuplicates:true` (DO NOTHING) so re-fire never demotes info-routing's promoted rules. +regression test. |
| 3 | `6824e0ad` | migration: re-scope 7 junk cats → `'*'`; `classifier_rule_telemetry_crossswarm` view (security_invoker + service_role GRANT); stage-1-regex.md shared-scope + gate note. |

## Verified

- `vitest` registry + seed suites: **27 passed** (5 new cross-swarm cases + seed regression).
- `tsc --noEmit`: exit 0.
- `npm run check:supabase`: 0 ERROR (6 WARN / 23 INFO) — gate green.
- Grep gates: view name + `security_invoker` in migration, "Shared scope" in doc — `GATES_OK`.
- **Per-swarm gate invariant:** `web/lib/classifier/cache.ts` (readWhitelist) UNCHANGED — `grep -c "'*'"` = 0. No shared promoted rule can auto-archive cross-swarm.

## Per-swarm gate — how it stays safe

The closed-list builder now offers the shared cats to every swarm, but the LLM
2nd-pass only auto-archives when `classifier_rules` has a **promoted**
`(swarm_type, llm:{cat}:high)` row for *that* swarm. New swarms get **candidate**
rows (seeded per consuming swarm, never `'*'`), so they observe (`status='predicted'`,
Bulk Review) until each earns its own Wilson-CI promotion. info-routing keeps its
3 already-promoted rules.

## POST-DEPLOY OPS STEPS (manual — not code)

1. **Apply the migration** to the remote (`supabase/migrations/20260618_crossswarm_noise_shared_scope.sql`).
2. **Re-fire `classifier/llm-rules-seed.run` once** (Inngest dashboard or `inngest.send`). This mints per-swarm candidate `llm:{cat}:high` rows for debtor-email + sales-email across the 7 newly-shared cats. Safe to re-run (Task 2's `ignoreDuplicates` keeps info-routing's promoted rules).

## Out of scope (stated, not implemented)

- **Outlook-delta verdict harvesting** (P112.5 Graph-delta / P117 intent-label) — the cheap per-swarm verdict source for the gate. Telemetry reads `agent_runs.human_verdict` source-agnostically, so that work feeds these gates with zero rework here. **Recommended fast-follow.**
- Sharing the 8 AP-noise cats (already duplicated per swarm).
- Sharing `classifier_rules` *rows* (only category definitions are shared).
- Any `'*'` union in `readWhitelist` (would violate the per-swarm gate).

## Environment note (no committed change)

This worktree predates the `tdd-guard-vitest` reporter that is committed on a
newer branch, so tdd-guard had no test-result feed. Worked around without
touching shared config: installed the reporter `--no-save` (gitignored
node_modules) and ran a throwaway local vitest config (since deleted). The
reporter wiring should land here when this branch catches up to the newer base.
</content>
