---
phase: 121-attachment-borne-identifier-extraction
plan: 01
subsystem: pipeline
tags: [stage-2-resolver, attachments, corroboration, eval, gap-manifest, extraction]

# Dependency graph
requires:
  - phase: 116-attachment-ingest
    provides: attachment capture/extraction + the stage-2 body fold (116-05/D-11)
  - phase: 120-d-06-multi-signal-corroboration
    provides: corroboration scorer + correctness-gate harness (resolver-correctness-gate.ts)
provides:
  - "121-GAP-MANIFEST.md — empirical per-row baseline + gap classification that sizes Plans 121-02+"
  - "Confirmed: only #24 (xlsx + one-mail->many) is buildable-now residual; rest are regression-guard/out-of-phase"
  - "Confirmed stale: 4 roadmap assumptions (fold-build, opt-in, subject-factuur, all-bucket-A-build)"
affects: [121-02, 121-03, 122-cross-brand-scope, 123-unify-stage2-on-resolve-candidates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Findings-first: read empirical state (live read-only DB + repo source) before sizing build work"
    - "Task-2 outward-call gate: record from prior harness run + flag gap, never make an unapproved live NXT/Zapier call"

key-files:
  created:
    - .planning/phases/121-attachment-borne-identifier-extraction/121-GAP-MANIFEST.md
  modified: []

key-decisions:
  - "#24 is the single buildable-now residual (xlsx EXTRACTION-GAP + MANY-CUSTOMER guard); everything else is regression-guard, verify-only, or routed to 116/122"
  - "Bucket-D precedence (#83) is a self-auth/120 ranking property, NOT a 121 engine change (ATID-02 / STAGE2-01 keeps engine byte-identical)"
  - "Debtor fixture live re-run deferred to Phase 123 (debtor on resolve_candidates); no outward call made"

patterns-established:
  - "Gap manifest as the phase-sizing artifact: classify each eval row into exactly one class, build = residual only"

requirements-completed: [ATID-01, ATID-03, ATID-04]

# Metrics
duration: 5min
completed: 2026-06-17
---

# Phase 121 Plan 01: Empirical Baseline + Gap Manifest Summary

**Established the fact-based Phase 121 baseline: the attachment fold + opt-in already ship for both swarms, and the only buildable-now residual across the 10 eval rows is #24 (Excel extraction + one-mail→many-customers guard) — every other row is regression-guard, a ranking-verify, or routed to Phase 116/122.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-17T18:59:54Z
- **Completed:** 2026-06-17T19:04:09Z
- **Tasks:** 3
- **Files created:** 1 (`121-GAP-MANIFEST.md`)

## Accomplishments
- **Recorded the real `attachment_config` as fact** (live read-only query + migration source): `sales-email` AND `debtor-email` both `capture=true, extract=true` — opt-in already done (ATID-03/ATID-04 effectively met).
- **Determined extractor format coverage empirically:** PDF + PNG/JPEG only; `.xlsx`/`.csv`/`.docx` → `unsupported`. Live corpus proves **0/20 .xlsx attachments ever produced text** — the decisive fact for #24.
- **Classified all 10 fixture rows into exactly one gap class** and sized Plans 121-02+ to the residual only: build = #24; regression-guard = #16/#19/#28/#29/#86; verify-only = #83; out-of-phase = #85 (→122), #15 (→116).
- **Confirmed 4 roadmap assumptions stale** (fold already exists, opt-in already done, subject-factuur already extracted, only 1 of 7 bucket-A rows is a true extraction-gap).

## Task Commits

1. **Task 1: attachment_config + per-row attachment/extraction state** - `30df61c1` (docs)
2. **Task 2: resolution outcome per row + live-lookup gap flag** - `20630041` (docs)
3. **Task 3: gap classification + Plans 121-02+ scope** - `1fede0f0` (docs)

**Plan metadata:** (this commit)

## Files Created/Modified
- `.planning/phases/121-attachment-borne-identifier-extraction/121-GAP-MANIFEST.md` - per-row fixture baseline (Task 1 + Task 2 tables), per-row gap classification (Task 3), Plans 121-02+ scope derived only from EXTRACTION-GAP + MANY-CUSTOMER, and the stale-assumptions list.

## Decisions Made
- **#24 = MANY-CUSTOMER (primary) with xlsx EXTRACTION-GAP as prerequisite sub-task** — kept as one primary class to honor "exactly one class per row" while recording the coupled defect.
- **#83 PRECEDENCE is verify-only** — the engine already extracts subject factuur (`identifier-match.ts:84`); "factuur > sender" is a self-auth/120 ranking property, and making it an engine change would violate ATID-02 / the STAGE2-01 no-engine-diff guard.
- **No outward NXT/Zapier call** — the 120-04 harness drives debtor via legacy `contact_lookup`/`identifier_lookup` (because `debtorP0Config.auto_safe_kinds=[]`) and there is no `web/.env.local`; outcomes were recorded from `RERUN-FINDINGS.md` + operator `FINDINGS.md`, and the live re-run was flagged as gated on Phase 123.

## Deviations from Plan

None - plan executed exactly as written. The plan is a findings/investigation plan; no production writes, no engine/config/steps edits were made, and the only file written is the gap manifest under the phase dir.

## Issues Encountered
- **No `node_modules` / `xlsx` not installed in this workspace** — the 120-04 harness (and a fixture-parsing helper) need `xlsx`, but deps were never installed here. Per the Rule-3 package-install exclusion I did NOT run an install; the fixture's per-row gold-id locations are already enumerated in the operator-validated `FINDINGS.md` (Bucket A/D), which is the authoritative recorded data — so classification did not require live xlsx parsing. Recorded as a gap (a live debtor re-run is gated on Phase 123 regardless).
- **Task-2 live-lookup gate** — handled by recording from prior data + flagging, not by stopping; no outward call was made, so no checkpoint was required.

## Threat Flags
None - no new network endpoints, auth paths, file access, or schema changes were introduced (read-only investigation only).

## Next Phase Readiness
- **Plan 121-02** scope is fact-based and minimal: (1) add `.xlsx`/`.csv` branch to `extract.ts` (adapter-side, engine byte-identical); (2) one-mail→many-customers guard for #24 (verify/extend `corroborate.ts` disagreement demotion; add adapter-side "too many roots → human" if needed).
- **Plan 121-03** (eval-grounded acceptance over #16/#19/#28/#29/#86 regression-guard rows + #83 precedence) is **blocked until Phase 123** (debtor → `resolve_candidates`). Recorded as the carried dependency.
- **Out-of-phase routing recorded:** #15 → Phase 116, #85 → Phase 122.

## Self-Check: PASSED
- `121-GAP-MANIFEST.md` — FOUND
- `121-01-SUMMARY.md` — FOUND
- Task commits `30df61c1`, `20630041`, `1fede0f0` — all FOUND in git log
- All 10 fixture rows classified into exactly one gap class — verified

---
*Phase: 121-attachment-borne-identifier-extraction*
*Completed: 2026-06-17*
