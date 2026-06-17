# Resolver Correctness Re-Run — Post-120 (status: DEFERRED → HUMAN-UAT)

**Harness:** `web/scripts/eval/resolver-correctness-gate.ts` (built, tsc-clean, smoke-verified)
**Run command:** `cd web && NXT_LOOKUP_WAIT_MS=60000 npx tsx scripts/eval/resolver-correctness-gate.ts --report`
**Fixture:** `resolver-eval.xlsx` (Validatie, 100 rows; 64% baseline)
**Config replayed:** `debtorP0Config` (live, now corroboration-bearing)

## Why the empirical 100-row re-run is deferred (not a harness defect)

A clean live re-score is **blocked by an architectural fact discovered during this run**,
not by the corroboration code (which is unit-proven and committed):

1. **The live debtor swarm does NOT use the generic `resolve_candidates` substrate.**
   `debtorP0Config` has `auto_safe_kinds: []` (the live row is the P0 config — see W1 in
   120-03-SUMMARY), so the engine's `identifier_match` step falls back to the **legacy
   `nxt.identifier_lookup`** and `sender_match` uses the **legacy `nxt.contact_lookup`**
   (both → Zap `uv5ju6h`). Proven empirically: the harness's `nxt_lookup_requests` rows
   carry `tool_id = nxt.contact_lookup` / `nxt.identifier_lookup`, NOT `nxt.resolve_candidates`.
   So the debtor replay never exercises the generic resolver (`43uuz1r`).

2. Several legacy-Zap lookups did not complete within the wait window during the replay
   (rows stuck `pending`), polluting the score (a timed-out lookup degrades to `unresolved`
   and looks like a wrong answer). The live production pipeline (deployed app) completes the
   same calls — this is a local-replay / legacy-transport reliability issue.

**Conclusion:** a meaningful debtor corroboration re-run requires the debtor swarm to
actually resolve via `resolve_candidates`. That migration (debtor → generic resolver, retire
`contact_lookup`/`identifier_lookup`) is the **next phase** (see
`.planning/todos/pending/2026-06-17-unify-stage2-on-resolve-candidates.md`). The correctness
gate is carried into that phase as its acceptance eval and recorded here as HUMAN-UAT.

## What WAS verified this phase (not deferred)

- The corroboration scorer (boost/demote/lone-signal) is unit-proven (Plan 01 tests).
- Row #2 (a confident-wrong AUTO row) replayed live → resolved `unresolved`/`none` →
  demoted below the AUTO (`high`) lane, the intended direction.
- The sales path resolves via `resolve_candidates` (43uuz1r) — Plan 02; the live
  substrate returns the verified `SB014098 → quote_no → BX228895 (Bever)` row.
- `no-engine-diff-check.sh` PASSES against the re-baselined post-120 donor (FINAL STAGE2-01).

## To run the gate (once debtor is on `resolve_candidates`)

```
cd web
# DEBTOR_FETCH_WEBHOOK_SECRET must be present in web/.env.local (Vercel value, starts 92…)
NXT_LOOKUP_WAIT_MS=60000 npx tsx scripts/eval/resolver-correctness-gate.ts --report
```
The harness tags the 4 confident-wrong AUTO rows + 12 bucket-B rows + gold-signal
non-regression and writes this file with the BEFORE/AFTER table + overall correct%.

---
*Phase 120-04 · gate deferred to the resolve_candidates-unification phase · 2026-06-17*
