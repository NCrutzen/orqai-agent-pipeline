# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- including agents that interact with browser-only systems via deterministic Playwright scripts.
**Current focus:** V5.0 Browser Automation -- Phase 22 (Capabilities Config & VPS Scaffold)
**Previous milestones:** v0.3 shipped 2026-03-01 (11 phases, 28 plans), V2.0 shipped 2026-03-02 (7 phases, 11 plans), V3.0 defined (5 phases), V4.0 defined (5 phases)

## Current Position

Phase: 22 of 25 (Capabilities Config & VPS Scaffold)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-03-03 -- V5.0 roadmap created (4 phases, 21 requirements)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

## Accumulated Context

### Decisions

- [V5.0]: MCP server on VPS for Playwright scripts -- agents call browser automation via MCP tools
- [V5.0]: Fixed scripts over dynamic browser-use -- dynamic already solved via existing Orq.ai MCP tools
- [V5.0]: Application capabilities config + discussion step fallback for unknown systems
- [V5.0]: Streamable HTTP transport (SSE deprecated in MCP spec 2025-03-26)
- [V5.0]: Workflow-level MCP tools only -- no generic browser primitives
- [V5.0]: Credentials on VPS only -- never flow through agent tool parameters

### Blockers/Concerns

- Real DOM context for NXT must be captured (Playwright codegen recording) before script generation can produce reliable scripts
- VPS provider not yet selected -- must be decided before Phase 22 security architecture is finalized
- iController SSO auth method unknown -- may block service account login for Phase 25

## Session Continuity

Last session: 2026-03-03
Stopped at: V5.0 roadmap created -- 4 phases, 21 requirements mapped
Resume with: `/gsd:plan-phase 22`
