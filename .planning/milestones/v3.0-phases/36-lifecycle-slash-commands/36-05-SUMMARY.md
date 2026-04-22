---
phase: 36-lifecycle-slash-commands
plan: 05
subsystem: slash-commands
tags: [onboarding, quickstart, lcmd, slash-command, skst, orq-agent, lifecycle]

# Dependency graph
requires:
  - phase: 34-skill-structure-format-foundation
    provides: "SKST-01..10 lint rules; 9 required H2 sections; allowed-tools frontmatter; references-multi-consumer invariant"
  - phase: 35-model-selection-discipline
    provides: "snapshot-pinned-models lint rule (MSEL-02) — this command authors no model IDs, so rule is trivially satisfied"
provides:
  - "/orq-agent:quickstart slash command at orq-agent/commands/quickstart.md"
  - "12-step Build → Evaluate → Optimize onboarding tour with copy-paste prompts"
  - "Stateless UX pattern (no sidecar progress file) established for onboarding flows"
  - "Forward-link graph from quickstart → /orq-agent:workspace, :models, :traces, :datasets, :test, :harden, /orq-agent"
affects: [36-07-wire-skill-index-and-help, 36-08-phase-close-verify, 37-observability-setup, 39-dset-dataset-shapes, 42-evld-evaluator-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stateless onboarding tour: copy-paste prompts in fenced code blocks, Expected-outcome line per step, user owns progress (no sidecar)"
    - "Step heading convention: '## Step N: {Name}' — greppable via /^##? Step [0-9]+:/ for lint-style structural verification"
    - "Forward-link-by-step: each onboarding step routes to a single sibling command so the 12-step sequence doubles as a cross-link graph between Phase 36 commands"

key-files:
  created:
    - orq-agent/commands/quickstart.md
  modified: []

key-decisions:
  - "Stateless quickstart — no .quickstart-progress sidecar file; users own their progress so there is no drift risk between repo state and tour state (confirms 36-CONTEXT.md Claude's Discretion decision)"
  - "12 Step sections rendered as H2 with exact prefix '## Step N:' so the VALIDATION.md grep anchor (grep -cE '^##? Step' ≥ 12) passes structurally"
  - "Each step's copy-paste prompt is a fenced code block with no language tag so triple-click selects the whole prompt verbatim"
  - "Step 3 and Step 10/11 copy-paste blocks hold URLs-only (prefixed with '#' as shell comments) because those steps are Studio-only actions; this preserves the copy-paste convention even when there is no CLI to run"
  - "Evaluator promotion gate wording (TPR ≥ 90% AND TNR ≥ 90%) written inline at Step 12 to forward-link EVLD-08 — readers discover the Phase 42 threshold at the moment they would violate it"

patterns-established:
  - "Stateless-tour pattern: copy-paste prompts + Expected-outcome + no progress file → future onboarding commands (e.g., per-tier quickstarts) inherit this shape"
  - "Heading-count verification: '## Step N:' makes N-step sequences structurally greppable without a custom lint rule"
  - "LCMD-05 + LCMD-07 consolidation: two requirements → one file when their deliverables overlap (onboarding intent + 12-step tour), avoiding a fractured first-impression surface"

requirements-completed: [LCMD-05, LCMD-07]

# Metrics
duration: 3 min
completed: 2026-04-20
---

# Phase 36 Plan 05: Quickstart 12-Step Onboarding Tour Summary

**Shipped `/orq-agent:quickstart` — a stateless 12-step onboarding tour covering MCP connect → enable models → create project → build agent → invoke → analyze traces → build evaluator → build dataset → run experiment → human review → annotation analysis → promote evaluator, with a fenced copy-paste prompt and Expected-outcome line at each step.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-20T15:57:36Z
- **Completed:** 2026-04-20T15:59:50Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments

- Authored `orq-agent/commands/quickstart.md` (219 lines) — new slash command consolidating LCMD-05 (onboarding) + LCMD-07 (12-step tour) into a single first-impression surface.
- All 9 SKST required H2 sections present; SKST lint (`bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/quickstart.md`) exits 0.
- Exactly 12 `## Step N:` headings (N=1..12), each with a fenced copy-paste prompt and an `Expected outcome:` line — VALIDATION.md grep anchor `grep -cE "^##? Step" orq-agent/commands/quickstart.md` returns 12 (≥ 12 gate satisfied).
- Forward-linked all 6 sibling Phase 36 commands referenced in the 12-step seed sequence: `/orq-agent:workspace` (Step 1), `/orq-agent:models` (Step 2), `/orq-agent:traces` (Step 6), `/orq-agent:harden` (Steps 7 + 12), `/orq-agent:datasets` (Step 8), `/orq-agent:test` (Step 9), plus `/orq-agent` itself (Step 4) and `/orq-agent:deploy` (Step 5).
- Protected-pipeline SHA-256 check still 3/3 matches (orq-agent, prompt, architect) — this plan creates a new file and mutates none of the protected entry points.

## Task Commits

1. **Task 1: Author orq-agent/commands/quickstart.md** — `a56e698` (feat)

**Plan metadata:** _(to be added by final metadata commit — this SUMMARY + STATE + ROADMAP + REQUIREMENTS)_

_Note: `a56e698` is a parallel-wave combined commit that also included workspace.md and automations.md from the other Wave-1 plans (36-01 and 36-06) — the per-plan commit boundary is looser than ideal because Phase 36 Wave 1 executes 6 plans in parallel on the same staging tree. See Deviations below._

## Files Created/Modified

- `orq-agent/commands/quickstart.md` — New slash command; 12-step onboarding tour with copy-paste prompts; read-only (emits guidance, mutations live in the commands it routes to).

## Decisions Made

- **Stateless by design** — no progress sidecar file. Confirms the Claude's Discretion note in 36-CONTEXT.md §"quickstart" and avoids hidden coupling between repo state and tour state.
- **Step heading convention `## Step N: {Name}`** — chosen so the VALIDATION.md grep anchor is a simple structural check; no custom lint rule needed.
- **Step 12 inlines the TPR/TNR promotion gate (≥ 90% / ≥ 90%)** — the number is stated where the user would violate it if they skipped Step 11, forward-linking EVLD-08 before Phase 42 is written.
- **Studio-only steps (3, 10, 11) still use fenced code blocks** — the block holds a URL prefixed with `#` as a shell comment so the copy-paste convention is preserved everywhere in the tour.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Commit boundary crossed with parallel Wave-1 plans**
- **Found during:** Task 1 commit step
- **Issue:** Plan 36-05 runs in Wave 1 alongside 36-01 (workspace), 36-02 (traces), 36-03 (analytics), 36-04 (models), 36-06 (automations). All six executors stage new files into the same working tree concurrently. When I went to stage-and-commit `quickstart.md`, a parallel agent had already staged `workspace.md` and `automations.md` and created a combined commit (`a56e698` — `feat(36-06)`) that included my file. The file content in the commit is byte-identical to what I wrote; only the commit subject is attributed to 36-06 instead of 36-05.
- **Fix:** Verified the committed content matches my intended file (`git diff HEAD -- orq-agent/commands/quickstart.md` empty); recorded `a56e698` as the task commit for this plan; documented the commit-boundary drift here.
- **Files modified:** None beyond `orq-agent/commands/quickstart.md` which was already committed by the parallel agent.
- **Verification:** SKST lint `--file` exits 0; protected-pipelines check 3/3 match; step-count grep returns 12; all 6 sibling-command greps pass; `git log --all -- orq-agent/commands/quickstart.md` confirms the file is tracked.
- **Committed in:** `a56e698` (labeled `feat(36-06)`; actual content is the Plan-05 quickstart file plus 36-01 workspace.md plus 36-06 automations.md)

---

**Total deviations:** 1 auto-fixed (1 blocking — parallel-wave commit boundary).
**Impact on plan:** Zero impact on deliverable correctness. The file content matches the plan exactly and all verification gates pass. Only the commit attribution is noisy; `/gsd:verify-work 36` should treat the Wave-1 plans as a commit-cohort rather than expecting one commit per plan.

## Issues Encountered

None — all plan tasks executed as specified; all verification commands exit 0.

## User Setup Required

None — no external service configuration required. `/orq-agent:quickstart` is a local command that emits guidance; the Orq.ai MCP server configuration it assumes is a Phase 36-wide prerequisite (user runs the installer once), not a per-plan setup.

## Next Phase Readiness

- LCMD-05 + LCMD-07 file-level coverage complete. Plan 36-07 (SKILL.md + help.md wiring) can now add a `quickstart.md` row to the SKILL.md Commands table and a `/orq-agent:quickstart` line to help.md's pipeline-order index.
- Manual UX smoke — "does the 12-step flow feel natural on a fresh workspace?" — deferred to `/gsd:verify-work 36` per 36-VALIDATION.md §"Manual-Only Verifications" (row 2).
- Phase 42 (EVLD) will tighten Step 11 / Step 12 wording once TPR/TNR validation is actually wired end-to-end; the numbers (≥ 90% / ≥ 90%) are already baked into the tour so the upgrade is a text tightening, not a behavior change.

## Self-Check: PASSED

Verified claims:

- `[ -f orq-agent/commands/quickstart.md ]` → exists (219 lines)
- `git log -- orq-agent/commands/quickstart.md` → commit `a56e698` present
- `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/quickstart.md` → exit 0
- `bash orq-agent/scripts/check-protected-pipelines.sh` → exit 0 (3/3 matches)
- `grep -cE "^##? Step [0-9]+:" orq-agent/commands/quickstart.md` → 12
- `grep -q "ORQ ► QUICKSTART"` → present
- All 6 sibling-command anchors (`/orq-agent:workspace`, `:models`, `:traces`, `:datasets`, `:test`, `:harden`) → present
- `grep -q "docs.orq.ai/docs/get-started"` → present

---
*Phase: 36-lifecycle-slash-commands*
*Completed: 2026-04-20*
