---
phase: 36-lifecycle-slash-commands
plan: 03
subsystem: slash-commands
tags: [orq-agent, mcp, analytics, slash-command, skst, lcmd-03]

# Dependency graph
requires:
  - phase: 34-skill-structure-format-foundation
    provides: SKST 9-section shape + lint-skills.sh + allowed-tools frontmatter rule
  - phase: 35-model-selection-discipline
    provides: snapshot-pinning + protected-pipeline SHA-256 invariants (analytics.md contains no model IDs, so MSEL-02 is trivially satisfied)
provides:
  - /orq-agent:analytics slash command (read-only, MCP-backed aggregate metrics)
  - --last <5m|1h|24h|7d|30d> window flag, default 24h
  - --group-by <model|deployment|agent|status> grouping flag with STOP-on-invalid discipline
  - Reference pattern for MCP-first command with REST fallback + "MCP tools used" transparency footer
affects:
  - 36-04 (models.md can reuse the same flag-parsing STOP-on-invalid shape)
  - 36-07 (SKILL.md + help.md wiring will need to index analytics.md)
  - 36-08 (full-suite verify: analytics.md now participates in default_file_set lint sweep)
  - 43 (DIST — CI lint will cover this file once wired)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MCP-first command pattern: call MCP tool, fall back to curl REST on error, never fabricate totals"
    - "STOP-on-invalid flag discipline with accepted-values list verbatim in error message"
    - "Banner + flat summary + optional H3 breakdown table + Open-in-orq.ai + MCP-tools-used footer (5-block layout)"
    - "USD currency explicit in output: every cost value prefixed with $ and formatted to 2 decimals"

key-files:
  created:
    - orq-agent/commands/analytics.md
  modified: []

key-decisions:
  - "Default --last window is 24h — matches 36-CONTEXT.md locked decision and existing V2.0 convention"
  - "--group-by has NO default — omitting it emits only the flat total (explicit user intent required for breakdown)"
  - "Cost always rendered with $ prefix and 2 decimals — USD is the only currency Orq.ai emits, so explicit > implicit"
  - "Error rate rendered with % suffix and 1 decimal — normalized from whatever MCP returns (fraction or percentage)"
  - "REST fallback command emitted verbatim inline on MCP error — user can retry out-of-band, never a fabricated table"
  - "Rows sorted by requests desc by default — matches usual operator workflow (find the biggest-volume group first)"
  - "MCP tools footer annotates '(REST fallback)' when the curl path was taken — transparency for debugging"

patterns-established:
  - "Pattern: Flag STOP-on-invalid renders the 4 accepted values verbatim so users self-correct without docs lookup"
  - "Pattern: Markdown table with right-aligned numeric columns (|---:|) for requests/cost/tokens/error-rate columns"
  - "Pattern: Banner width fixed to 55 '━' characters matching orq-agent house style from help.md/systems.md"

requirements-completed: [LCMD-03]

# Metrics
duration: 1m
completed: 2026-04-20
---

# Phase 36 Plan 03: Analytics Slash Command Summary

**Added `/orq-agent:analytics` — an MCP-first, read-only slash command that reports requests / cost / tokens / error-rate for a time window with optional --group-by model|deployment|agent|status breakdown.**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-04-20T15:57:28Z
- **Completed:** 2026-04-20T15:58:58Z
- **Tasks:** 1 / 1
- **Files modified:** 1 (created)

## Accomplishments

- New command file `orq-agent/commands/analytics.md` (212 lines) satisfies LCMD-03 file-level requirement.
- All 9 SKST H2 sections present; `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/analytics.md` exits 0.
- Both mandatory flags (`--last`, `--group-by`) and all 4 group-by values (`model`, `deployment`, `agent`, `status`) appear verbatim; all 4 metric labels (requests, cost, tokens, error rate) appear verbatim; `MCP tools used` footer and `my.orq.ai/analytics` Open-in link both present.
- Protected-pipeline SHA-256 check still 3/3 green (no `<pipeline>` blocks touched).

## Task Commits

Each task was committed atomically:

1. **Task 1: Author orq-agent/commands/analytics.md** — `5d6f2c2` (feat)

**Plan metadata:** (pending — docs commit after SUMMARY + STATE + ROADMAP updates)

## Files Created/Modified

- `orq-agent/commands/analytics.md` — new LCMD-03 slash command. Implements `/orq-agent:analytics [--last <window>] [--group-by <dim>]` with MCP-first data fetch (`get_analytics_overview` for flat totals, `query_analytics` for groupings), REST fallback on MCP error, STOP-on-invalid flag handling, and the standard 5-block output (banner → flat summary → optional breakdown H3 + table → Open-in-orq.ai → MCP-tools-used footer).

## Decisions Made

See frontmatter `key-decisions`. Headline choices:

1. **Default window is 24h** — matches 36-CONTEXT.md lock and the existing V2.0 `--last` convention.
2. **--group-by has no default** — flat total is the safest/cheapest thing to emit; breakdown requires explicit user intent.
3. **USD symbol is mandatory on cost output** — elevated to a top-level `ALWAYS` constraint; Orq.ai emits USD-normalized cost so the `$` is factually correct and prevents unit confusion.
4. **MCP error path surfaces REST curl verbatim** — never fabricate a table; always give the user a manual fallback command they can run immediately.
5. **Rows sorted by requests desc by default** — matches operator workflow (find the biggest-volume group first).

## Deviations from Plan

None — plan executed exactly as written. Every prescribed H2 section (Constraints, When to use, When NOT to use, Companion Skills, Done When, Destructive Actions, Step 1–5, Anti-Patterns, Open in orq.ai, Documentation & Resolution) is present; frontmatter matches the exact specified shape; all verification greps and scripts exit 0.

## Issues Encountered

None. Single-task plan, fully autonomous, no checkpoints, no MCP calls required at author time (behavior spec only).

## User Setup Required

None — this phase creates a slash command file. Live MCP smoke (invoke the command against a real Orq.ai workspace) is deferred to `/gsd:verify-work 36` per 36-VALIDATION.md § Manual-Only Verifications.

## Next Phase Readiness

- LCMD-03 file-level coverage complete. ROADMAP Phase 36 Success Criterion #3 satisfied at file level.
- Manual LLM/MCP smoke deferred to `/gsd:verify-work 36` (requires live Orq.ai API key + workspace).
- Plans 04 (models), 05 (quickstart), 06 (automations), 07 (wiring), 08 (full-suite verify) unblocked; depends_on is `[]` so ordering is author discretion.
- Phase-wide verification (Plan 08) will re-run the full lint sweep + protected-pipeline SHA-256 check; analytics.md now participates in the default_file_set.

## Self-Check: PASSED

Verified immediately before writing this section:

- **File exists:** `orq-agent/commands/analytics.md` — FOUND (212 lines).
- **Commit exists:** `5d6f2c2` — FOUND on current branch (`git log --oneline -1` = `5d6f2c2 feat(36-03): add /orq-agent:analytics slash command`).
- **Lint:** `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/analytics.md` — exit 0.
- **Protected pipelines:** `bash orq-agent/scripts/check-protected-pipelines.sh` — exit 0 (3/3 SHA-256 matches).
- **All 15 acceptance-criteria greps:** PASS (--last, --group-by, model, deployment, agent, status, requests, cost, tokens, error rate, MCP tools used, my.orq.ai/analytics, ORQ ► ANALYTICS banner, allowed-tools frontmatter, file existence).

---
*Phase: 36-lifecycle-slash-commands*
*Plan: 03*
*Completed: 2026-04-20*
