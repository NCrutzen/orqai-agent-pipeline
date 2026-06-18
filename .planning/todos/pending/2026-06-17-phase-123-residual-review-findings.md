---
created: 2026-06-17
type: code-quality
area: agentic-pipeline / resolve
phase_origin: 123
resolves_phase:
source: .planning/phases/123-unify-stage-2-on-resolve-candidates-retire-legacy-lookup-too/123-REVIEW.md
---

# Phase 123 residual code-review findings (advisory — CR-01 already fixed)

CR-01 (LLM tiebreaker on the corroboration collect path) was fixed in this phase
(`fix(123): corroboration collect path uses no-op tiebreaker`). The remaining
123-REVIEW.md findings were left as tracked follow-ups (operator scoped the in-phase
fix to CR-01). Verify each before acting — they are single-reviewer findings.

## CR-02 — migration atomicity (advisory; live DB already safe)
`20260617_retire_legacy_lookup_tools.sql` puts the `DELETE` and the constraint
swaps in one `BEGIN…COMMIT`. If applied as-written while legacy rows exist, the
constraint ADD fails and rolls back the whole tx — silently undoing the safe
DELETE. Live prod is already fine (we applied DELETE-only via MCP). Fold into the
widen-back work: split the file into two migrations (DELETE; then constraint swap
after row prune) or add a pre-flight `DO $$ RAISE EXCEPTION $$` guard. See
`2026-06-17-widen-back-nxt-lookup-requests-checks.md`.

## WR-01 — pushSignal hardcodes status: null (stopped-account gate bypass)
`engine.ts` `pushSignal` sets `status: null`, so `scoreCorroboration`'s
`isAutoEligibleStatus(null)` is true — a stopped customer resolved by
sender/identifier match could reach the corroboration boost tier. Confirm whether
the step results already exclude stopped accounts upstream (sender_match filters
`isAutoEligibleStatus(m.status)` before resolving); if so this is defence-in-depth,
else a real gap. Thread the real status onto the collected signal.

## WR-02 — sales adapter omits isAutoEligibleStatus on sender/factuur
`resolve-customer.ts` (~210-214, 312-316): stopped/inactive customers with a
unique-in-scope email or invoice identifier return `confidence: "high"` — the
debtor step modules gate on `isAutoEligibleStatus(m.status)`; the sales adapter does
not. Align the sales adapter with the debtor fail-closed posture.

## WR-03 — stale comments naming deleted tools
`web/scripts/eval/resolver-correctness-gate.ts:19` (contact_lookup) and
`replay-invoice-33050836.ts:4` (identifier_lookup) reference deleted tool names as
if live. No runtime impact; reword so the scripts don't mislead.
