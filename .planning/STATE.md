---
gsd_state_version: 1.0
milestone: v0.3
milestone_name: milestone
status: executing
stopped_at: Completed 36-00-PLAN.md
last_updated: "2026-03-23T05:27:40.818Z"
last_activity: 2026-03-23 - Completed 36-00-PLAN.md (Wave 0 test infrastructure)
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 11
  completed_plans: 8
  percent: 73
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-13)

**Core value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- through a browser UI with real-time visibility, visual agent graphs, and in-app approvals -- without touching a terminal or needing technical knowledge.
**Current focus:** Phase 36 -- Dashboard & Graph (Phase 35 complete as of 2026-03-22)
**Previous milestones:** v0.3 shipped 2026-03-01 (11 phases, 28 plans), V2.0 shipped 2026-03-02 (7 phases, 11 plans), V2.1 shipped 2026-03-13 (8 phases, 9 plans)

## Current Position

Phase: 36 of 38 (Dashboard & Graph)
Plan: 1 of 4 in current phase
Status: Executing
Last activity: 2026-03-23 - Completed 36-00-PLAN.md (Wave 0 test infrastructure)

Progress: [███████░░░] 73%

## Performance Metrics

**Velocity:**
- Total plans completed: 8 (V3.0)
- Average duration: 4 min
- Total execution time: 0.4 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 34-foundation-auth | 3 | 11 min | 4 min |
| 35-pipeline-engine | 4 | 16 min | 4 min |
| 36-dashboard-graph | 1 | 2 min | 2 min |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Direct Claude messages.create() over Agent SDK -- pipeline stages are predetermined, not agent-decided
- GitHub raw URL for .md file fetching with PIPELINE_REPO_RAW_URL env var -- runtime fetching per user decision
- Vitest for test framework -- ESM-native, fast, TypeScript out of the box
- Invite API uses upsert with onConflict for idempotent member addition -- prevents duplicate member errors
- Database trigger handles auto-membership on project creation -- no client-side second insert needed
- AD search passes email (not Supabase user ID) to invite API -- Graph IDs differ from Supabase auth IDs
- Geist font (shadcn Nova preset) for web app typography -- ships with create-next-app, consistent with shadcn/ui
- Auto-add project creator as member via DB trigger -- ensures RLS works for newly created projects
- Next.js + Supabase + Vercel for web app -- Supabase Realtime for live updates, email/password auth primary
- Node graph for swarm visualization -- React Flow v12 with custom AgentNode components
- GitHub repo as single source of truth -- pipeline prompts fetched at runtime from orqai-agent-pipeline repo
- Email/password auth primary while Azure AD setup pending -- M365 SSO swap-in when ready, no throwaway code
- orq-agent/ CLI skills separated to orqai-agent-pipeline repo -- this repo is web app only
- Inngest for pipeline orchestration -- durable functions survive Vercel timeouts, waitForEvent for HITL
- Supabase Broadcast over Postgres Changes -- avoids single-thread RLS bottleneck
- [Phase 35]: Stage results stored in Supabase pipeline_steps.result, references returned from step.run() -- avoids Inngest state size limits
- [Phase 35]: retryPipeline resets failed step AND all subsequent steps -- ensures clean slate for re-execution
- [Phase 35]: Client-only new-run page with useActionState for form submission -- simpler than server/client split
- [Phase 35]: Server component + client wrapper pattern for run detail -- server fetches, client polls and handles interactivity
- [Phase 35]: 5-second polling via router.refresh() for live updates -- simple, replaced by Supabase Realtime in Phase 36
- [Phase 36]: jsdom as global test environment replacing node -- all new tests are component tests, existing pure-logic tests work fine in jsdom
- [Phase 36]: it.todo() stubs over it.skip() for Wave 0 -- avoids import errors from non-existent source modules

### Blockers/Concerns

- Prompt adapter is novel engineering with no prior art -- validate in Phase 35 before building UI
- Inngest waitForEvent race condition (GitHub #1433) -- dual-write pattern needed for HITL approvals
- Azure AD tenant setup complete -- M365 SSO verified working with tenant restriction (2026-03-20)

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260319-cl3 | Restructure project for frontend-first Agent Workforce with Azure workaround | 2026-03-19 | b234fd3 | [260319-cl3-restructure-project-for-frontend-first-a](./quick/260319-cl3-restructure-project-for-frontend-first-a/) |

## Session Continuity

Last session: 2026-03-23T05:27:40.814Z
Stopped at: Completed 36-00-PLAN.md
Resume with: `/gsd:execute-phase 36` to continue with plan 36-01
Resume file: .planning/phases/36-dashboard-graph/36-01-PLAN.md
