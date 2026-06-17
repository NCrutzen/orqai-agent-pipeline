---
created: 2026-06-17
type: bug + verification
area: nxt-zapier-transport / eval
phase_origin: 123
resolves_phase:
related: [120-HUMAN-UAT, "Monday Sales eval callback issue"]
---

# candidate_details async callback never lands → blocks clean resolver-correctness re-run

## Symptom (Phase 123-04 eval, 2026-06-17)

The frozen 100-email correctness gate (`web/scripts/eval/resolver-correctness-gate.ts --report`)
scored **18% overall (14/79)** vs the 64% baseline. Root cause is NOT a resolver-quality
regression — it is an async-callback transport failure on the `nxt.candidate_details` tool.

Live DB evidence (`debtor.nxt_lookup_requests`, eval window):

| tool_id | requests | result returned | status |
|---|---|---|---|
| `nxt.resolve_candidates` | 163 | 163 | **all `complete`** ✅ |
| `nxt.candidate_details` | 26 | 0 | **all `pending`** ❌ |

- The unified `resolve_candidates` path (Phase 123's deliverable) works live: 163/163 callbacks landed.
- `nxt.candidate_details` (the LLM-tiebreaker enrichment, a separate pre-existing tool NOT touched
  by Phase 123): the Zap fires (visible in Zapier) but the callback POST back to the app never
  lands → row stays `pending` → the tiebreaker path degrades to unresolved → those emails score as
  "not found".
- Operator: "same problem as Monday with Sales" — a known callback-transport issue, not new.

## Why it matters

When `resolve_candidates` returns ≥2 candidates and the resolver escalates to the LLM tiebreaker,
the tiebreaker needs `candidate_details`. With its callback stuck `pending`, those rows (incl. some
gold factuur/klantnummer rows) collapse to unresolved, dragging the absolute eval % down. The
demotion-DIRECTION targets still passed (confident-wrong 4/4 demoted, bucket-B 12/12) — consistent
with corroboration firing correctly over the generic path.

## Follow-up steps

1. Diagnose why `nxt.candidate_details` (Zap hook `uv5ju6h`) callbacks do not land while
   `nxt.resolve_candidates` (`43uuz1r`) callbacks do — both use the same `async_callback` pattern,
   same Zapier account `15380147`, same `DEBTOR_FETCH_WEBHOOK_SECRET`, both POST back to
   `NEXT_PUBLIC_APP_URL`. Compare the two Zaps' callback step + the app callback route handling for
   `candidate_details` vs `resolve_candidates`. Cross-reference Monday's Sales callback fix.
2. Fix so candidate_details callbacks land and rows reach `complete`.
3. Re-run `cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --report` for a clean
   absolute score; confirm overall correct ≥ 64% baseline + gold non-regression (0).
4. Close the deferred absolute-% portion of the Phase 123 / Phase 120 debtor correctness gate
   (see 120-HUMAN-UAT and 123-04 SUMMARY / HUMAN-UAT).
