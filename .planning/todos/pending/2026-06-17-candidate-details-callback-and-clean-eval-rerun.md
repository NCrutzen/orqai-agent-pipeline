---
created: 2026-06-17
type: bug + verification
area: nxt-zapier-transport / eval
phase_origin: 123
resolves_phase:
related: [120-HUMAN-UAT, "Monday Sales eval callback issue"]
---

# candidate_details async callback never lands → blocks clean resolver-correctness re-run

## RESOLUTION (2026-06-18) — callback part WON'T-FIX (moot); re-run de-risked

The "callback bug" is **not a bug**. The operator deliberately turned OFF the
`candidate_details` Zap (`uv5ju6h`) to force the swarm onto the single generic
`resolve_candidates` method. The 26 `pending` rows are historical eval rows from
**before** debtor opted into corroboration — not an active transport failure.

Verified 2026-06-18 (read-only):
- Both `debtor-email` and `sales-email` now carry `resolution_config.corroboration`
  (`min_signals: 2`, `boost: high`) in `public.swarms` (live).
- With `corroboration` present, `engine.ts:221` skips the legacy first-hit block and
  runs the Phase-120 **collect path**, which injects `noopTiebreak` (`engine.ts:198`,
  wired at 329/337) instead of the real `llmTiebreak`.
- `lookupCandidateDetails` has exactly ONE production call site (`engine.ts:380`,
  inside `runLlmTiebreak`) — **unreachable** on the collect path. So `candidate_details`
  is **config-dead** on both live resolver paths; the disabled Zap has zero live impact.
- Over 30 days `candidate_details` completed 299/325 — there was never a structural
  callback defect; the eval-window failures were the now-superseded `llmTiebreak` path
  hitting the intentionally-disabled Zap.

**Won't-fix:** no app-code or Zapier fix. The diagnosis agent's proposed Zod change
(`status`/`modified_on` → optional) is unrelated hardening and does NOT explain the
`pending` rows (the callback route sets `complete` independent of client-side Zod).

**Remaining actionable item (de-risked):** the clean frozen-100 re-run no longer
depends on `candidate_details` or the Zap. The harness (`resolver-correctness-gate.ts`)
runs `debtorP0Config`, whose `.corroboration` is kept in lockstep with the live seed
(`20260616a_debtor_corroboration_optin.sql`), so it exercises the collect path. The
re-run now needs ONLY: `DEBTOR_FETCH_WEBHOOK_SECRET` (present in the main
`/Volumes/Developer/agent-workforce` checkout) + running from there. Tracked as the
Phase-123 / Phase-120 debtor acceptance item.

**Optional cleanup (separate, not urgent):** retire `candidate_details` dead code
(drop from `NxtToolId`, remove the unreachable `runLlmTiebreak`/`lookupCandidateDetails`
branch, drop the `zapier_tools` row) — touches `engine.ts`, so it belongs in a small
deliberate phase with a no-engine-diff re-baseline, exactly as Phase 123 retired
`contact_lookup`/`identifier_lookup`.

---

## Symptom (Phase 123-04 eval, 2026-06-17) — superseded by RESOLUTION above

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
