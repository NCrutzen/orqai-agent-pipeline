---
phase: 60
plan: 09
subsystem: debtor-email-classifier
tags: [classifier, regex, false-positive, ooo, ticket-ref]
requires: [60-08]
provides:
  - Tightened SUBJECT_TICKET_REF (excludes factuurportal FP- IDs)
  - Extended BODY_OOO_TEMPORARY (6 new spot-check patterns)
  - First test file for `web/lib/debtor-email/classify.ts` (`__tests__/classify.test.ts`)
affects:
  - web/lib/debtor-email/classify.ts (D-22 boundary lifted only for these 2 named regexes)
tech-stack:
  added: []
  patterns:
    - Negative-lookahead exclusion in alternation branch (`(?!FP-)`)
    - Month-name / weekday-anchored regex extensions to keep office-hours false-match shut
key-files:
  created:
    - web/lib/debtor-email/__tests__/classify.test.ts
  modified:
    - web/lib/debtor-email/classify.ts
decisions:
  - "60-09 D-30: Lift D-22 (read-only) only for SUBJECT_TICKET_REF and BODY_OOO_TEMPORARY. All other rules in classify.ts remain frozen."
  - "60-09 D-31: SUBJECT_TICKET_REF fix uses negative-lookahead (option a from plan), not body-context tightening (option b). Robust against future invoice-portal vendors with similar 2-letter prefixes — extend with `|XX` if telemetry surfaces them."
  - "60-09 D-32: BODY_OOO_TEMPORARY new alternations are anchored on month names or weekday literals, not bare digits. Preserves the prior `t/m 17.00 uur` office-hours regression guard (existing comment + new test)."
  - "60-09 D-33: The FP- 'is ontvangen' acknowledgement variant intentionally falls to `unknown` (not `subject_acknowledgement`) — the upstream ack regex requires `uw factuur (is|wordt) ...` adjacent and does not cover `voor de gemeente X is ontvangen`. Out-of-scope per D-22; deferred to a future plan if queue volume warrants."
  - "60-09 D-34: Task 3 (re-fire `classifier/corpus-backfill.run`) is operator-only — handed back to the user via instructions in this summary, not executed by the agent."
metrics:
  duration: 12min
  completed: 2026-04-29
---

# Phase 60 Plan 09: Tighten SUBJECT_TICKET_REF + extend BODY_OOO_TEMPORARY Summary

**One-liner:** Two targeted regex changes in `classify.ts` — exclude factuurportal `FP-XXXX-XXXXXX:` invoice-portal IDs from SUBJECT_TICKET_REF, and extend BODY_OOO_TEMPORARY with the six leave-pattern alternations (NL `t/m`, `op <weekday>`, `tot en met <month>`, `niet aanwezig op <weekday>`, standalone `momenteel afwezig`, French `absent(e) du X au Y`) the 60-08 spot-check surfaced — landed under TDD with the first ever `web/lib/debtor-email/classify.test.ts`.

## What Shipped

1. **`SUBJECT_TICKET_REF` tightened** (`classify.ts` line ~98) — added `(?!FP-)` lookahead to the `\b[A-Z]{2,5}-\d{3,}-\d{3,}\s*:` branch. The two factuurportal subjects in the corpus that were matching this rule (`FP-2026-177324:` / `FP-2026-316413:`) no longer do; the dangerous "kan helaas niet worden verwerkt" rejection variant now routes to `unknown` for human action (resubmit invoice).

2. **`BODY_OOO_TEMPORARY` extended** (`classify.ts` line ~173) — additive alternations for the 6 spot-check patterns. All anchored on month-name or weekday literals so the prior `van 8.30 uur t/m 17.00 uur` office-hours false-match guard remains intact (covered by a new regression test).

3. **`web/lib/debtor-email/__tests__/classify.test.ts`** — 16 tests across 3 describe-blocks:
   - 6 SUBJECT_TICKET_REF tests (FP- exclusion + 4 legitimate-ticket regression checks)
   - 7 BODY_OOO_TEMPORARY tests (one per new pattern + existing `terug op` regression)
   - 2 broader regression tests (bare auto-reply still routes to `subject_autoreply`; office-hours range still ignored)

## TDD Gate Compliance

Single test file, both tasks landed as separate commits:

| Phase | Commit | Notes |
| ----- | ------ | ----- |
| RED | `7d2dc52` | 16 tests, 9 fail / 7 pass against unchanged classify.ts |
| GREEN (Task 1) | `7bfbad8` | SUBJECT_TICKET_REF lookahead → 9 pass / 7 fail (Task-2 still red) |
| GREEN (Task 2) | `56cf5b5` | BODY_OOO_TEMPORARY extensions → 16 / 16 |

REFACTOR: not needed — both regex edits are surgical alternations.

## Verification Gates

| Gate | Result |
| ---- | ------ |
| `pnpm vitest run lib/debtor-email --reporter=default` | 16 / 16 pass |
| `pnpm vitest run tests/classifier --reporter=default` | 32 / 32 pass (corpus-mapping=14, backfill=4, corpus-backfill=7, rules-table=7) — no upstream regressions |
| `pnpm tsc --noEmit -p .` | exit 0, no errors |
| `git diff --stat HEAD~3 HEAD -- web/lib/debtor-email/classify.ts` | 2 regexes touched, all other regexes byte-identical |

## SQL Evidence Run (Task 1 design input)

The plan instructed: "RUN THE SQL FIRST — there may be more patterns beyond FP- that need exclusion too."

Query executed via Supabase Management API (project `mvqjhlxfvtqqubqgdvhz`):

```sql
SELECT DISTINCT aur.result->>'subject', aur.result->>'from'
FROM automation_runs aur
JOIN agent_runs ar ON ar.automation_run_id = aur.id
WHERE ar.rule_key='subject_ticket_ref'
GROUP BY 1,2;
```

**9 distinct subjects** currently match `subject_ticket_ref` across the corpus:

| # | Subject (truncated) | Sender | Verdict |
|---|---|---|---|
| 1 | "Aanmelding van melding C2603 00090..." | facilitair.winkelorganisatie@coop.nl | TRUE POSITIVE (keep) |
| 2 | "Aanmelding van melding C2603 00596..." | facilitair.winkelorganisatie@coop.nl | TRUE POSITIVE (keep) |
| 3 | "FP-2026-177324: Uw factuur ... wordt verwerkt" | no-reply@factuurportal.eu | **FALSE POSITIVE** — invoice-portal ack |
| 4 | "FP-2026-316413: Uw factuur ... is ontvangen" | no-reply@factuurportal.eu | **FALSE POSITIVE** — invoice-portal ack |
| 5 | "GCS0113543 is resolved: 527656 - Rekeningoverzicht" | BSOServiceDesk@cbre.com | TRUE POSITIVE (keep) |
| 6 | "GCS0141169 is open: Documenten ..." | BSOServiceDesk@cbre.com | TRUE POSITIVE (keep) |
| 7 | "Minor Hotels - Query reception feedback - Ticket number :564592 ..." | ne.ptp@minor-hotels.com | TRUE POSITIVE (keep) |
| 8 | "opvraag betaalspecificatie - GCS0172543" | ServiceDesk@cbre.com | TRUE POSITIVE (keep) |
| 9 | "RE: RE: CBRE - Sandoz Almere open facturen - GCS0080171" | ServiceDesk@cbre.com | TRUE POSITIVE (keep) |

A second query confirmed the dangerous rejection variant exists in the broader corpus:

```sql
SELECT DISTINCT result->>'subject', result->>'from'
FROM automation_runs WHERE result->>'from' ILIKE '%factuurportal%';
```

Surfaces (among 30 distinct subjects) the critical `FP-2026-270485: Uw factuur voor de gemeente Overbetuwe kan helaas niet worden verwerkt door de crediteurenadministratie.` row from `no-reply@factuurportal.eu`. With the regex unfixed this would have ingested as `subject_ticket_ref → auto_reply → archive`. Now blocks at `unknown`.

**Conclusion: only the FP- prefix needs exclusion.** No second pattern emerged from the data — the negative lookahead `(?!FP-)` is sufficient.

A third lookup against the spotcheck-tagged subset (`triggered_by='corpus-backfill-spotcheck'`) confirmed only 9 spotcheck rows exist for `subject_ticket_ref`, all already approved (the operator approved them post-spotcheck — the plan's "11/20 = 55% rejection" predates the current state). The plan's evidence remains the source of truth for the design decision.

## Deviations from Plan

**1. [Rule 3 — Blocking] Test-assertion mismatch on FP-`is ontvangen` row.**
- **Found during:** Task 1 GREEN run.
- **Issue:** I had written the test to assert `matchedRule === "subject_acknowledgement"` for `FP-2026-177324: Uw factuur voor de gemeente Overbetuwe is ontvangen.` Reality: SUBJECT_ACKNOWLEDGEMENT requires `uw factuur (?:is\s+ontvangen|wordt\s+verwerkt)` adjacent, but the subject inserts `voor de gemeente Overbetuwe` between "factuur" and "is ontvangen", so it falls through to `no_match`.
- **Fix:** Relaxed the assertion to `matchedRule !== "subject_ticket_ref"` AND `category === "unknown"`. Documented in test docstring + decision D-33 — broadening SUBJECT_ACKNOWLEDGEMENT is out of scope per D-22 boundary; if telemetry shows queue volume from this pattern, a follow-up plan can extend.
- **Files modified:** `web/lib/debtor-email/__tests__/classify.test.ts` (folded into Task 1 GREEN commit `7bfbad8`).

**2. [Note — not a deviation] Task 3 (operator action) skipped per orchestrator instructions.**
- The plan's Task 3 (re-fire `classifier/corpus-backfill.run` from Inngest dashboard, verify telemetry shifts) is hand-back to the operator. Recorded below under "Operator Hand-Off".

## Operator Hand-Off (Task 3)

After this push, Vercel will redeploy. Once deployed:

1. **Fire the backfill** — From the Inngest dashboard, send event `classifier/corpus-backfill.run` (no payload required).
2. **Verify in `public.classifier_rules`:**
   - `subject_ticket_ref` row: `n` should drop (FP- false positives no longer counted in the regex match → no longer surface in the corpus tally for this rule).
   - `subject_autoreply+body_temporary` row: `n` should grow (the 11 spot-check patterns that previously fell to `subject_autoreply` now match the body regex too).
   - `subject_autoreply` row: `n` should drop correspondingly.
   - All other rules unchanged.
3. **Optional — if `subject_ticket_ref` agreement-rate clears 0.92:** re-fire `classifier/spotcheck.queue` to revalidate. If still under, leave demoted and revisit in a future phase.

The operator runbook in `60-08-RUNBOOK.md` covers the full re-fire procedure.

## Self-Check: PASSED

Files exist:
- `web/lib/debtor-email/__tests__/classify.test.ts` — FOUND
- `web/lib/debtor-email/classify.ts` — FOUND (modified)
- `.planning/phases/60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-/60-09-SUMMARY.md` — FOUND

Commits exist on main:
- `7d2dc52` test(60-09): RED — coverage — FOUND
- `7bfbad8` feat(60-09): GREEN — exclude factuurportal IDs from SUBJECT_TICKET_REF — FOUND
- `56cf5b5` feat(60-09): GREEN — extend BODY_OOO_TEMPORARY with 6 spot-check patterns — FOUND

Verification:
- 16 / 16 tests pass in `lib/debtor-email/__tests__/classify.test.ts`
- 32 / 32 tests pass in `tests/classifier`
- `pnpm tsc --noEmit -p .` exit 0
- D-22 boundary respected: only SUBJECT_TICKET_REF (line 98) and BODY_OOO_TEMPORARY (line 173) modified; all other regexes byte-identical.
