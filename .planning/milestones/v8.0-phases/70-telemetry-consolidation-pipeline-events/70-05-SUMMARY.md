---
phase: 70-telemetry-consolidation-pipeline-events
plan: 05
subsystem: telemetry-write-side
tags: [stage-1, ingest-route, pipeline_events, carve-out, wave-2, TELE-01, TELE-02]
requires:
  - "70-02 (pipeline_events table + emitPipelineEvent helper live)"
provides:
  - "Stage 1 dual-write at the canonical r = classify(...) site in the Next.js ingest API route"
  - "4 passing integration tests covering matched / unknown / Pitfall-3 fallback / TELE-02 regression"
affects:
  - "Closes the last v1 emit-site gap — Stage 0..4 emit coverage now complete (Plans 03, 04, 05)"
  - "Bulk Review (Plan 07) can now query Stage 1 rows for every inbound email"
tech-stack:
  added: []
  patterns:
    - "RESEARCH §Pattern 2 — Stage 1 plain-await emit outside step.run, replay-safe by HTTP-handler construction"
    - "Pitfall 3 fallback — email_id null + decision_details.outlook_message_id when canonical uuid not yet resolved"
    - "vitest mock pattern — supabaseInserts:Array<{table,schema,payload}> with chainable from()/schema().from()"
key-files:
  created:
    - .planning/phases/70-telemetry-consolidation-pipeline-events/70-05-SUMMARY.md
  modified:
    - web/app/api/automations/debtor-email/ingest/route.ts
    - web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts
decisions:
  - "Emit ONE row per email at the classify() site (RESEARCH §Open Question Q1 recommendation) — failure branches do NOT add Stage 1 rows; they remain operational rows in automation_runs only."
  - "email_id: null + outlook_message_id stashed in decision_details. Canonical email_pipeline.emails.id (uuid) is not in scope at line 283; resolveOrCreateEmailRow only fires later for the unknown+shadow branch. Plan Action step 5 explicitly authorizes this fallback per Pitfall 3."
  - "automation_run_id: null at this site. Phase 71+ may correlate via automation_run_id; v1 joins via email_id (Pitfall 4 option-b)."
  - "Carve-out comment block at the emit site documents WHY D-09 is relaxed here so a future reader doesn't 'fix' it by wrapping in a step.run that doesn't exist."
metrics:
  duration: ~12m
  completed: 2026-05-05
---

# Phase 70 Plan 05: Wave 2 — Stage 1 Ingest-Route Emit at classify() Summary

Wired the Stage 1 `pipeline_events` emit at the canonical `r = classify(...)` site (~line 283) inside `web/app/api/automations/debtor-email/ingest/route.ts`. This is the one Stage emit that does NOT live inside an Inngest `step.run` — the route is a single-pass synchronous HTTP handler with no replay surface, so a plain awaited INSERT is replay-safe by construction (RESEARCH §Pattern 2). Plan 01's 3 scaffolded tests are unskipped and a 4th TELE-02 regression test was added; all 4 green.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Stage 1 emit at classify() + carve-out comment | b210dd5 | web/app/api/automations/debtor-email/ingest/route.ts |
| 2 | Implement ingest route.test.ts (unskip Plan 01 scaffold) | 70ef797 | web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts |

## Verification

### Task 1 — Route emit (acceptance-criteria greps)

- `grep -c "emitPipelineEvent" web/app/api/automations/debtor-email/ingest/route.ts` → 2 (import + call) ✓ (≥2)
- `grep -c "stage: 1" …` → 1 ✓ (=1, exactly one emit)
- `grep -c "CARVE-OUT FROM D-09" …` → 1 ✓ (≥1)
- `grep -c "Pattern 2" …` → 1 ✓ (≥1)
- `cd web && npx tsc --noEmit | grep "ingest/route.ts" | wc -l` → 0 ✓

### Task 2 — Tests (acceptance-criteria greps + vitest)

- `grep -c "it.skip" …/route.test.ts` → 0 ✓
- `grep -c "TODO Plan 04" …/route.test.ts` → 0 ✓
- `grep -c "pipeline_events" …/route.test.ts` → 10 ✓ (≥4)
- `grep -E "decision.*['\"](unknown|noise|invoice_copy_request)['\"]" …/route.test.ts | wc -l` → 3 ✓ (≥2)
- `cd web && npx vitest run app/api/automations/debtor-email/ingest/__tests__/route.test.ts` → **4 passed, 0 skipped, exit 0**

### Test breakdown

| # | Test | Asserts |
|---|------|---------|
| 1 | regex-matched email | exactly 1 `pipeline_events` row with `stage=1`, `swarm_type='debtor-email'`, `decision='auto_reply'`, `confidence=0.95`, `triggered_by='pipeline'`, `decision_details.matched=true`, `decision_details.regex_rule_id='subject_autoreply'` |
| 2 | regex no-match | exactly 1 row with `decision='unknown'`, `decision_details.matched=false`, `decision_details.regex_rule_id='no_match'` |
| 3 | Pitfall 3 fallback | `email_id=null`, `decision_details.outlook_message_id` carries the inbound Outlook string id; sanity-asserts the Outlook id is NOT a uuid |
| 4 | TELE-02 regression | legacy `automation_runs` INSERTs still occur alongside the new `pipeline_events` row |

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — Blocking] Comment-line `it.skip(...)` token tripped the acceptance grep**
- **Found during:** Task 2 final verification.
- **Issue:** A header-comment line referencing the previous scaffold contained the literal `it.skip(...)`, causing `grep -c "it.skip"` to return 1 instead of 0 even though no live test was skipped.
- **Fix:** Reworded the header comment to "each previously skipped test is now a real assertion …".
- **Files modified:** `web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts` (folded into the same Task 2 commit `70ef797`).

### Plan-as-written interpretive notes

- The plan referenced `r.topic`, `r.matched`, `r.rule_id`, `r.evidence` on the `classify()` return value. The actual `ClassifyResult` interface (`web/lib/debtor-email/classify.ts`) exposes `category`, `confidence`, `matchedRule` only. Translation applied at the emit site:
  - `r.topic` → `r.category`
  - `r.matched` → `r.category !== "unknown"`
  - `r.rule_id` → `r.matchedRule`
  - `r.evidence` → omitted (no field exists; `decision_details.regex_rule_id` carries audit info instead)
- This is a literal-name vs structural-shape mismatch in the plan, not a behavioral deviation — the plan's intent (record the regex audit trail in `decision_details`) is preserved.

## Threat Mitigations Verified

| Threat ID | Mitigation Status |
|-----------|-------------------|
| T-70-05-01 (Spoofing — forged ingest POST) | Mitigated — emit lives AFTER the `x-zapier-secret` header check (lines 128-137 of route.ts); unauthenticated POST returns 401 before classify() runs. |
| T-70-05-02 (Information Disclosure — PII in decision_details) | Mitigated by Plan 02 RLS (`pipeline_events_service_all` + `pipeline_events_auth_select`); no client-facing read path lands until Plan 07. |
| T-70-05-03 (Repudiation — Vercel/Zapier retries) | Accepted as documented — TELE-02 parity preserved; read-side dedupes by email_id+stage in Phase 72. |
| T-70-05-04 (Tampering — uuid mismatch) | Mitigated — Pitfall 3 fallback (email_id null + outlook_message_id in decision_details) verified by Test 3. |

## Known Stubs

None.

## Threat Flags

None — no new trust-boundary surface introduced. The emit lives entirely within the existing Zapier→ingest auth boundary.

## Self-Check: PASSED

- FOUND: web/app/api/automations/debtor-email/ingest/route.ts (modified, contains `emitPipelineEvent`, `stage: 1`, `CARVE-OUT FROM D-09`, `Pattern 2`)
- FOUND: web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts (4 passing tests, 0 skipped)
- FOUND commit: b210dd5 (Task 1 — Stage 1 emit at classify() + carve-out)
- FOUND commit: 70ef797 (Task 2 — route.test.ts unskip + 4 implemented tests)
