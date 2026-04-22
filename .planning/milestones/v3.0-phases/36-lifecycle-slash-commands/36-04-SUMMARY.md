---
phase: 36-lifecycle-slash-commands
plan: 04
subsystem: skill-commands
tags: [orq-agent, slash-command, mcp, model-garden, lcmd-04, msel-02]

# Dependency graph
requires:
  - phase: 34-skill-structure-format-foundation
    provides: SKST 9-section lint rule (required-sections) + allowed-tools rule — every new command must pass
  - phase: 35-model-selection-discipline
    provides: snapshot-pinned-models lint rule (MSEL-02) — forbids floating aliases on model: lines; prose examples follow the same discipline
provides:
  - /orq-agent:models slash command (LCMD-04)
  - Canonical provider x type grouping pattern for Phase 36 LCMD commands
  - Precedent for MCP-first + REST fallback + "MCP tools used:" footer shape
affects: [36-07-PLAN.md (SKILL.md index + help.md wiring), 36-08-PLAN.md (full-suite verify), 43 (DIST packaging)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provider H3 -> Type H4 -> Model rows table -- matches Studio Model Garden layout and orqai-model-catalog.md reference"
    - "MCP-first with documented fallback chain (list_models -> search_entities -> REST /v2/models) + transparency footer"
    - "Positional [search-term] as case-insensitive substring filter; no flags on read-only lookup commands"
    - "Dated-snapshot examples in prose (Phase 35 MSEL-02 extended from YAML model: lines to all illustrative model IDs)"

key-files:
  created:
    - orq-agent/commands/models.md
  modified: []

key-decisions:
  - "Type rendering order fixed to chat / embedding / image / rerank / speech / completion / Other -- rare/future types bucket under single 'Other' H4 rather than spawning many sparse subsections"
  - "Activated column always rendered; when payload lacks activation state, column shows '?' rather than being omitted -- keeps user aware of the limitation"
  - "Deprecated models kept visible with explicit ' (deprecated)' annotation on Model ID cell -- never hidden, never silent"
  - "No flags on this command; if user passes something flag-shaped, surface usage hint and either run unfiltered or treat literal as search term -- prevents flag creep across LCMD commands"
  - "Footer 'MCP tools used:' line dynamically reflects which path succeeded (list_models / search_entities / REST), giving MCP debuggability without extra ceremony"

patterns-established:
  - "LCMD command skeleton: frontmatter with argument-hint -> H1 + one-paragraph purpose -> 9 SKST sections -> Step 1..6 body -> Anti-Patterns -> Open in orq.ai -> Documentation & Resolution"
  - "Snapshot-pinning discipline extended from YAML model: lines (lint rule target) to prose table examples (consistency) -- reinforces MSEL-02 at read-time even where the lint regex does not fire"

requirements-completed: [LCMD-04]

# Metrics
duration: 2min
completed: 2026-04-20
---

# Phase 36 Plan 04: Model Garden Lookup Command Summary

**New /orq-agent:models slash command — MCP-backed Model Garden listing grouped by provider x type with optional case-insensitive positional search-term filter, dated-snapshot examples throughout.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-20T15:57:57Z
- **Completed:** 2026-04-20T16:00:03Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments

- Created `orq-agent/commands/models.md` (208 lines) implementing LCMD-04.
- Passes `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/models.md` (all 9 SKST H2 sections + non-empty `allowed-tools:` frontmatter + MSEL-02 snapshot-pinning rule).
- Passes `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models` full-set invocation (no floating-alias regressions introduced).
- Passes `bash orq-agent/scripts/check-protected-pipelines.sh` (3/3 SHA-256 matches for `orq-agent`, `prompt`, `architect` `<pipeline>` blocks — Phase 36 touches no protected file).
- All 9 required phrase-presence greps hit: banner (`ORQ ► MODELS`), frontmatter key (`allowed-tools:`), type tokens (`chat`, `embedding`, `image`, `rerank`), grouping dimension (`provider`), MCP footer (`MCP tools used`), Open-in link (`my.orq.ai/model-garden`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Author orq-agent/commands/models.md** — `25f518c` (feat)

## Files Created/Modified

- `orq-agent/commands/models.md` — New `/orq-agent:models [search-term]` command; read-only MCP-backed Model Garden lookup grouping models by provider (H3) x type (H4) with `list_models` primary + `search_entities` / REST fallbacks; renders Anthropic chat / OpenAI chat / embedding illustrative tables with dated snapshots (`claude-sonnet-4-5-20250929`, `gpt-4o-2024-11-20`, `claude-haiku-4-5-20251001`, `text-embedding-3-large`); includes 5-row Anti-Patterns table and standard Open-in + Documentation & Resolution footers.

## Decisions Made

- **Type order locked:** chat -> embedding -> image -> rerank -> speech -> completion -> Other. Any type key outside the first six buckets under a single `Other` H4 rather than creating sparse per-type subsections.
- **Activated column always shown:** Even when payload lacks activation state, the column is rendered with `?` placeholders. Omitting the column would let users silently assume "yes".
- **Deprecated-aware:** Deprecated model IDs surface with `(deprecated)` annotation on the Model ID cell — never hidden.
- **No flags, positional only:** Single `[search-term]` positional argument, case-insensitive substring on model id. Flag-shaped input falls back to usage hint + unfiltered run.
- **Dynamic MCP footer:** `MCP tools used:` line reflects the actual path(s) that succeeded (`list_models`, `search_entities`, or REST fallback annotation) so MCP debuggability is baked into the read-only command.
- **Snapshot pinning in prose:** MSEL-02 lint only fires on YAML `model:` lines, but this command emits its illustrative tables with dated snapshots anyway — consistency surface at read-time reinforces the Phase 35 discipline before users copy-paste IDs into specs.

## Deviations from Plan

None — plan executed exactly as written. All 16 body outline items (frontmatter + `## Constraints`, `## When to use`, `## When NOT to use`, `## Companion Skills`, `## Done When`, `## Destructive Actions`, `## Step 1..6`, `## Anti-Patterns`, `## Open in orq.ai`, `## Documentation & Resolution`) present; each required token / phrase landed on first authoring pass; all verification gates green on first run.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Existing Orq.ai MCP server registration (established in prior phases) is sufficient; command tolerates MCP unavailability via documented REST fallback.

## Next Phase Readiness

- LCMD-04 file-level coverage complete. Manual MCP smoke (live invocation against an authenticated workspace) deferred to `/gsd:verify-work 36` per `36-VALIDATION.md` Manual-Only Verifications table.
- Plan 04 of Phase 36 is the 4th of 6 Wave-1 LCMD commands. Siblings 36-01 (`workspace.md`), 36-02 (`traces.md`), 36-03 (`analytics.md`), 36-05 (`quickstart.md`), 36-06 (`automations.md`) are independent Wave-1 plans; this plan pre-committed no shared scaffolding for them.
- Plan 36-07 (SKILL.md + help.md wiring) and Plan 36-08 (full-suite verify) will consume `models.md` as one of the six new command entries; nothing blocks them.
- Pattern established here (provider x type grouping + MCP-first + positional filter + dynamic footer) is reusable by 36-03 (`analytics.md`) and 36-06 (`automations.md`) list mode.

---

## Self-Check: PASSED

- FOUND: `orq-agent/commands/models.md`
- FOUND: commit `25f518c` (feat(36-04): add /orq-agent:models Model Garden lookup command (LCMD-04))
- FOUND: all 9 phrase-presence greps (banner, frontmatter, 4 type tokens, provider token, MCP footer, Open-in link)
- FOUND: `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/models.md` exits 0
- FOUND: `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models` exits 0
- FOUND: `bash orq-agent/scripts/check-protected-pipelines.sh` exits 0 (3/3 SHA-256 matches)

---
*Phase: 36-lifecycle-slash-commands*
*Completed: 2026-04-20*
