---
phase: 36-lifecycle-slash-commands
plan: 07
subsystem: slash-commands
tags: [orq-agent, SKILL-index, help-banner, SKST, discoverability, LCMD-01, LCMD-02, LCMD-03, LCMD-04, LCMD-05, LCMD-06, LCMD-07]

# Dependency graph
requires:
  - phase: 34-skill-structure-format-foundation
    provides: SKST 9-section schema + lint-skills.sh (required-sections, allowed-tools) + check-protected-pipelines.sh (3-cmd SHA-256 golden set)
  - phase: 35-model-selection-discipline
    provides: snapshot-pinning invariant (N/A for this plan — no model: lines touched)
provides:
  - "orq-agent/SKILL.md Directory Structure + Commands section now index all 6 Phase 36 commands (workspace/traces/analytics/models/quickstart/automations)"
  - "orq-agent/commands/help.md printed banner now lists all 6 new slash commands in pipeline-order (discovery → monitoring → onboarding → automations)"
  - "LCMD-01..07 discoverability wiring complete — users hit the new commands via both standard discovery entry points"
affects: [36-08-full-suite-verify, 43-dist-manifest-ci, 37-observability-setup]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Index-wiring pattern: new slash commands surface via BOTH SKILL.md Directory Structure + Commands table AND commands/help.md printed banner (pipeline-order, not alphabetical)"]

key-files:
  created: []
  modified:
    - "orq-agent/SKILL.md"
    - "orq-agent/commands/help.md"

key-decisions:
  - "Phase 36 commands grouped under a new H3 '### Phase 36 (Lifecycle Slash Commands)' placed AFTER the existing V2.0 Commands table — keeps historical phase grouping pattern and avoids reshuffling legacy rows"
  - "Directory Structure entries appended to the commands/ block AFTER set-profile.md with '# Phase 36: ...' comment prefix — favored phase-grouping over strict alphabetical ordering because the existing block is phase-ordered (see deploy.md / kb.md / harden.md comment markers)"
  - "help.md pipeline-order lists monitoring/discovery first (workspace → traces → analytics → models) then onboarding (quickstart) then governance (automations) — matches the mental model the plan prescribed (discovery/monitoring first, onboarding last, help remains terminal)"
  - "All 6 new commands tagged 'any' tier in the Commands table — they read workspace data via MCP and (for automations --create) mutate via MCP/REST with AskUserQuestion gates; no separate deploy/test/full tier gate currently exists for LCMD scope"
  - "Zero edits to any <pipeline> block anywhere — SKILL.md/help.md are SKST-formatted skill files, not protected entry points; the 3 protected golden hashes (orq-agent.md, prompt.md, architect.md) remain byte-identical"

patterns-established:
  - "Skill index update recipe: when adding N new commands to the suite, touch exactly two files (SKILL.md + help.md) and never the 3 protected entry points — reusable for every future V3.0 phase that adds new slash commands (37+)"

requirements-completed: [LCMD-01, LCMD-02, LCMD-03, LCMD-04, LCMD-05, LCMD-06, LCMD-07]

# Metrics
duration: 1 min
completed: 2026-04-20
---

# Phase 36 Plan 07: Skill Index Wiring Summary

**SKILL.md Directory Structure + Commands table and help.md printed banner updated to surface all 6 Phase 36 slash commands (workspace/traces/analytics/models/quickstart/automations) through the standard discovery paths — LCMD-01..07 cross-cutting discoverability wired without touching any protected `<pipeline>` block.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-20T16:03:49Z
- **Completed:** 2026-04-20T16:05:17Z
- **Tasks:** 1 of 1
- **Files modified:** 2

## Accomplishments

- `orq-agent/SKILL.md` Directory Structure block now lists all 6 new filenames (`workspace.md`, `traces.md`, `analytics.md`, `models.md`, `quickstart.md`, `automations.md`) under `commands/`, each with a `# Phase 36: <purpose> (LCMD-XX)` comment anchoring the requirement ID.
- `orq-agent/SKILL.md` Commands section gained a new `### Phase 36 (Lifecycle Slash Commands)` H3 with a 4-column table (Command | File | Tier Required | Purpose) — 6 rows, one per new command, placed immediately after the existing V2.0 Commands table.
- `orq-agent/commands/help.md` Step-2 printed-help banner now lists the 6 new slash commands in pipeline-order (workspace → traces → analytics → models → quickstart → automations) BEFORE the terminal `/orq-agent:help` line; column alignment preserved to match existing entries.
- All 12 grep anchors declared in the plan's `<automated>` verification block hit (6 filenames in SKILL.md + 6 command literals in each of SKILL.md and help.md).
- `bash orq-agent/scripts/lint-skills.sh --file orq-agent/SKILL.md` exits 0.
- `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/help.md` exits 0.
- `bash orq-agent/scripts/lint-skills.sh` (full suite) exits 0.
- `bash orq-agent/scripts/check-protected-pipelines.sh` exits 0 — all 3 golden SHA-256 hashes still match (orq-agent.md / prompt.md / architect.md untouched).

## Task Commits

1. **Task 1: Update SKILL.md directory listing + Commands table, update help.md pipeline-order help block** — `f5a5c28` (feat)

**Plan metadata:** pending (separate docs commit below)

## Files Created/Modified

- `orq-agent/SKILL.md` (modified) — added 6 lines to Directory Structure `commands/` block + appended a new `### Phase 36 (Lifecycle Slash Commands)` H3 + 6-row Commands table immediately after the V2.0 Commands table.
- `orq-agent/commands/help.md` (modified) — inserted 6 new command lines into the Step-2 printed-banner Commands block in pipeline-order, immediately before the terminal `/orq-agent:help` line.

## Decisions Made

- **Phase-grouped Directory Structure order (not strict alphabetical)** — The existing block is phase-ordered (see `deploy.md # Phase 5:`, `harden.md # Phase 9:`) so the 6 new entries appended at the end of the commands/ group as a contiguous `# Phase 36:` cluster reads more consistently than interleaving alphabetically and splitting the Phase 36 group across the block.
- **New H3 placed AFTER V2.0 Commands (not merged)** — Preserves historical phase grouping so users can see the evolution of the command suite (Orchestrator → V2.0 → Phase 36) rather than flattening everything into a single table that loses the phase lineage.
- **Tier Required column = 'any' for all 6 rows** — Phase 36 commands are observational/onboarding surface area (workspace/traces/analytics/models are read-only MCP queries; quickstart prints text; automations has an AskUserQuestion-gated mutation path but does not require a separate deploy/test/full tier today). If a future tier gate is added the column is already present and can be updated in place.
- **help.md pipeline-order matches plan prescription** — Discovery/monitoring first (workspace → traces → analytics → models), then onboarding (quickstart), then governance (automations), with `/orq-agent:help` kept as the terminal line. Alphabetical ordering would lose the mental-model signal that the plan's Anti-Pattern table explicitly calls out.
- **Zero edits to `<pipeline>` blocks anywhere** — SKILL.md and help.md are SKST-formatted skill files, not protected entry points. The 3 golden hashes (orq-agent.md, prompt.md, architect.md) stayed byte-identical — verified pre-edit and post-edit by `check-protected-pipelines.sh`.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** Clean execution; both files passed SKST lint and the protected-pipeline golden-hash check on the first attempt.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This plan only wires discovery surfaces; the commands themselves were authored in plans 36-01..06 and already have their own User Setup (MCP + `$ORQ_API_KEY` covered in install flow).

## Next Phase Readiness

- All 6 Phase 36 commands are now discoverable through the standard discovery entry points (SKILL.md index + `/orq-agent:help` banner). LCMD-01..07 discoverability wiring is complete.
- Plan 36-08 (Wave 3 — full-suite verify) can now run the final phase-close verification sweep knowing that every file is indexed and reachable.
- Manual smoke (does `/orq-agent:help` actually print all 15 commands at runtime?) deferred to `/gsd:verify-work 36` per 36-VALIDATION.md Manual-Only Verifications table.
- No blockers for plan 36-08 or subsequent V3.0 phases.

---
*Phase: 36-lifecycle-slash-commands*
*Completed: 2026-04-20*

## Self-Check: PASSED

- `orq-agent/SKILL.md` contains all 6 new filenames (`workspace.md`, `traces.md`, `analytics.md`, `models.md`, `quickstart.md`, `automations.md`) — grep-verified.
- `orq-agent/SKILL.md` contains all 6 new slash-command literals — grep-verified.
- `orq-agent/commands/help.md` contains all 6 new slash-command literals — grep-verified.
- `.planning/phases/36-lifecycle-slash-commands/36-07-SUMMARY.md` exists on disk.
- Task commit `f5a5c28` is present in `git log`.
- `bash orq-agent/scripts/lint-skills.sh --file orq-agent/SKILL.md` exits 0.
- `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/help.md` exits 0.
- `bash orq-agent/scripts/lint-skills.sh` (full suite) exits 0.
- `bash orq-agent/scripts/check-protected-pipelines.sh` exits 0.
