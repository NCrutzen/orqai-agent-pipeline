---
created: 2026-06-17
type: cleanup
area: supabase
phase_origin: 123
resolves_phase:
---

# Widen-back nxt_lookup_requests CHECK constraints (deferred from Phase 123-04)

## Why this exists

Phase 123-04 retired the two legacy Stage-2 lookup tools. The migration
`supabase/migrations/20260617_retire_legacy_lookup_tools.sql` was written to do two
things in one transaction:
1. `DELETE` the 2 `public.zapier_tools` rows (`nxt.contact_lookup`, `nxt.identifier_lookup`).
2. Drop + re-add the two `debtor.nxt_lookup_requests` CHECK constraints
   (`nxt_lookup_requests_tool_id_check`, `nxt_lookup_requests_lookup_kind_check`)
   to the surviving 2-value sets.

**Pre-flight at apply time (2026-06-17) found 1171 historical
`debtor.nxt_lookup_requests` rows** still carrying a retired value
(`tool_id IN ('nxt.contact_lookup','nxt.identifier_lookup')` OR
`lookup_kind IN ('sender_to_account','identifier_to_account')`). The constraint
re-add re-validates every row, so applying step (2) would FAIL and roll back the whole
transaction (threat T-123-10).

**Operator-approved deviation:** only step (1) was applied to prod, via
`apply_migration` name `retire_legacy_lookup_tools_delete_only_p123`. The two CHECK
constraints remain WIDE (still the 20260610a 4-value sets).

## Drift to reconcile

- The repo file `20260617_retire_legacy_lookup_tools.sql` contains the FULL migration
  (DELETE + both constraint swaps) but only the DELETE portion was applied to remote
  (under a different migration name). A naive `supabase db push` would try to apply the
  full file and FAIL on the 1171 rows. Reconcile before any bulk migration sync.

## Follow-up steps

1. Decide on the 1171 inert rows: prune them
   (`DELETE FROM debtor.nxt_lookup_requests WHERE tool_id IN (...) OR lookup_kind IN (...)`)
   — they are historical audit data for a now-dead tool path — OR retain and keep the
   constraints wide permanently.
2. If pruned: apply the constraint widen-back (steps 2+3 of the original migration).
3. Reconcile the repo migration file with what is actually applied to remote so the
   migration history is coherent (either a new forward migration for the constraint
   swap, or adjust the deferred file — never edit already-applied history).
4. `npm run check:supabase` → 0 ERROR.
