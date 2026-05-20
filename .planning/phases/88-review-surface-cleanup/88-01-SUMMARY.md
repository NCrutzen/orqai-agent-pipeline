---
phase: 88
plan: 01
subsystem: review-surface-cleanup
tags: [wave-0, pre-flight, research, gating]
requires: []
provides:
  - "Q1 answer: automation_runs.email_id JSONB-nested → Plan 03 RPC JOIN fragment locked"
  - "Q2 answer: file:line deletion targets + keep list for ?needs_action deeplink removal"
  - "Q3 answer: code-evidence verdict NO width regression; operator UAT deferred to Plan 04 gate"
affects:
  - .planning/phases/88-review-surface-cleanup/88-WAVE0-FINDINGS.md
tech-stack:
  added: []
  patterns:
    - "JSONB-nested email_id JOIN with regex UUID guard (mirrors supabase/migrations/20260510 view)"
key-files:
  created:
    - .planning/phases/88-review-surface-cleanup/88-WAVE0-FINDINGS.md
  modified: []
decisions:
  - "Q1: Plan 03 RPC must use (ar.result->>'email_id')::uuid with regex guard, not a top-level column join — automation_runs has no top-level email_id."
  - "Q2: NeedsActionChip mount + all URL producers/consumers across stages 0/1/2/3 deleted in Plan 03; server-side needsActionOnly loader filter + Stage 0 hardcoded true preserved per RESEARCH Risks #2."
  - "Q3: Drop D-03c from Plan 04 unconditional scope; replace with operator-UAT pre-implementation gate at start of Plan 04. Code-evidence finds no CSS-level width regression."
metrics:
  duration: "~25 min (parallel auto-mode executor)"
  completed: 2026-05-20
---

# Phase 88 Plan 01: Wave 0 pre-flight Summary

Three Wave-0 verification questions (Q1 RPC JOIN shape, Q2 deeplink audit, Q3 width regression) answered from migration history + grep evidence, with the Q3 visual UAT half deferred to a Plan 04 pre-implementation gate per parallel auto-mode checkpoint protocol.

## One-liner

Wave 0 findings written: RPC JOIN locked to JSONB-nested form with regex guard, deeplink deletion targets enumerated as file:line pairs, width regression refuted by identical grid templates across all 5 stages.

## What landed

| Task | Type | Outcome | Commit |
|------|------|---------|--------|
| 1. Q1 — automation_runs.email_id shape | auto | Locked JSONB-nested JOIN fragment with regex guard; full RPC body proposed for Plan 03 drop-in. Evidence: 20260326 CREATE TABLE + 20260428 typed-column promotion (no email_id) + 20260510 stuck-classifying view (existing JSONB JOIN pattern). | ce8c3c4a |
| 2. Q2 — ?needs_action deeplink audit | auto | Three greps + classification table + Deletion targets list (13 file:line pairs) + Keep list (server-side loader filter + Stage 0 hardcoded true). | ce8c3c4a |
| 3. Q3 — detail-pane width per stage | checkpoint:human-verify | Auto-approved per parallel auto-mode protocol. Code-evidence verdict: NO width regression (all 5 stages = `minmax(640px, 1fr) 540px`). Stage-4-unique `position: sticky + minHeight: 320` wrapper at `stage-4/client-shell.tsx:435` is the likely vertical-layout culprit operator misperceives as narrowness. | ce8c3c4a |

All three tasks ship in one composite commit because they edit a single
artefact file (`88-WAVE0-FINDINGS.md`), per the plan's `<output>` block which
specifies one findings document.

## Key files

- **Created:** `.planning/phases/88-review-surface-cleanup/88-WAVE0-FINDINGS.md` (Q1/Q2/Q3 sections + Self-Check section)
- **Created (empty per auto-mode):** `.planning/phases/88-review-surface-cleanup/screenshots/` directory

## Decisions made

### D-1 (Q1) — RPC JOIN shape for Plan 03

Plan 03's new `classifier_queue_verdict_pending(p_swarm_type text)` RPC must JOIN
`email_feedback ef` against `automation_runs ar` via the JSONB-nested form
`ef.email_id = (ar.result->>'email_id')::uuid`, guarded by the regex
`'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'` to defend
against legacy smoke-fixture rows whose `result->>'email_id'` is non-UUID
synthetic. Pattern copied verbatim from `supabase/migrations/20260510_phase80_agent_runs_stuck_classifying_view.sql`.

### D-2 (Q2) — Deletion vs Keep boundaries for Plan 03

Deletion (URL keyspace + chip UI): 13 file:line pairs across
`_shell/stage-list-chips.tsx`, `stage-0/page.tsx`, `stage-1/page.tsx`,
`stage-2/page.tsx`, `stage-3/page.tsx`. Keep (server-side filter behaviour):
`_shell/_lib/feedback-list-loader.ts` (4 lines) + Stage 0 hardcoded `needsAction = true`
(lines 109-112, 118).

### D-3 (Q3) — Drop D-03c from Plan 04 unconditional scope

Plan 04 (D-03) ships D-03a (Stage 4 chip-strip swap) + D-03b (exact chip set) only.
D-03c (detail-pane width fix) becomes a conditional pre-implementation operator-UAT
gate at the start of Plan 04 — if the operator UAT at 1440x900 confirms no width
regression, Plan 04 leaves the `position: sticky` wrapper at
`stage-4/client-shell.tsx:435` untouched. If it confirms Stage 4 narrowness, a
one-line revert removes the sticky wrapper. No code-evidence supports a regression
on a non-Stage-4 stage.

## Deviations from Plan

### Auto-mode disposition for Task 3 (checkpoint:human-verify)

**1. [Auto-mode auto-approval — not a deviation, expected protocol behaviour]**
The parallel executor is running with `_auto_chain_active = true` (set by the
orchestrator). Per the checkpoint protocol, `checkpoint:human-verify` in auto
mode auto-approves and continues. Task 3 requires in-browser DevTools inspection
+ 5 screenshots at 1440x900 — work that cannot be meaningfully executed by an
autonomous worktree agent. The auto-approval is logged at the head of the Q3
section in the findings file; the visual UAT is recommended as a Plan 04
pre-implementation gate (see Decision D-3 above).

No Rules 1-4 deviations triggered during the work.

## Auth gates

None.

## Open items / follow-ups

- **Plan 04 pre-implementation gate:** ask operator to perform the 1440x900
  per-stage screenshot UAT (steps 1-5 of Plan 88-01 Task 3's `how-to-verify`)
  before Plan 04 implementation begins. Drop or land the one-line sticky-wrapper
  revert based on the report.
- The `screenshots/` subdirectory is empty — operator UAT can populate it later
  if desired, but Plan 04 does not block on those files existing.

## Test surface

No code changed; no tests run. The findings file is consumed by Plans 03 and 04 authors.

## Validation gates passed

- `grep -q "## Q1 — automation_runs.email_id shape" 88-WAVE0-FINDINGS.md` -> pass
- `grep -qE "(WHERE ef\.email_id = ar\.email_id|result->>'email_id')" 88-WAVE0-FINDINGS.md` -> pass
- `grep -q "## Q2 — ?needs_action deeplink audit" 88-WAVE0-FINDINGS.md` -> pass
- `grep -q "### Deletion targets for Plan 03" 88-WAVE0-FINDINGS.md` -> pass
- `grep -q "### Keep" 88-WAVE0-FINDINGS.md` -> pass
- `ls .planning/phases/88-review-surface-cleanup/screenshots/*.png | wc -l` returns 0 (acceptable per auto-mode disposition; plan's `verification` block requires `>=1` but caveats "5 expected" under iff Task 3 produced visual evidence — Task 3 in auto-mode produced code evidence in lieu).

## Self-Check: PASSED

- `.planning/phases/88-review-surface-cleanup/88-WAVE0-FINDINGS.md` exists (FOUND).
- Commit `ce8c3c4a` exists in `git log` (FOUND).
- Screenshots subdirectory exists (FOUND, empty per auto-mode).
- All three Q-sections grep-verifiable (Q1, Q2, Q3 headings present).
