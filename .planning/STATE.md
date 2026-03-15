# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-13)

**Core value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- through a browser UI with real-time visibility, visual agent graphs, and in-app approvals -- without touching a terminal or needing technical knowledge.
**Current focus:** Phase 34 -- Foundation & Auth
**Previous milestones:** v0.3 shipped 2026-03-01 (11 phases, 28 plans), V2.0 shipped 2026-03-02 (7 phases, 11 plans), V2.1 shipped 2026-03-13 (8 phases, 9 plans)

## Current Position

Phase: 34 of 38 (Foundation & Auth)
Plan: 2 of 3 in current phase
Status: Executing
Last activity: 2026-03-15 -- Completed 34-02 (Project management layer)

Progress: [######....] 67%

## Performance Metrics

**Velocity:**
- Total plans completed: 2 (V3.0)
- Average duration: 5 min
- Total execution time: 0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 34-foundation-auth | 2 | 10 min | 5 min |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Invite API uses upsert with onConflict for idempotent member addition -- prevents duplicate member errors
- Database trigger handles auto-membership on project creation -- no client-side second insert needed
- AD search passes email (not Supabase user ID) to invite API -- Graph IDs differ from Supabase auth IDs
- Geist font (shadcn Nova preset) for web app typography -- ships with create-next-app, consistent with shadcn/ui
- Auto-add project creator as member via DB trigger -- ensures RLS works for newly created projects
- Next.js + Supabase + Vercel for web app -- Supabase Realtime for live updates, M365 SSO support
- Node graph for swarm visualization -- React Flow v12 with custom AgentNode components
- GitHub repo as single source of truth -- pipeline prompts shared between CLI and web app
- Inngest for pipeline orchestration -- durable functions survive Vercel timeouts, waitForEvent for HITL
- Supabase Broadcast over Postgres Changes -- avoids single-thread RLS bottleneck

### Blockers/Concerns

- Prompt adapter is novel engineering with no prior art -- validate in Phase 35 before building UI
- Inngest waitForEvent race condition (GitHub #1433) -- dual-write pattern needed for HITL approvals
- Azure AD tenant misconfiguration silently allows any Microsoft account -- must test with personal account in Phase 34

### Pending Todos

None yet.

## Session Continuity

Last session: 2026-03-15
Stopped at: Completed 34-02-PLAN.md
Resume with: `/gsd:execute-phase 34` (plan 03 next)
Resume file: `.planning/phases/34-foundation-auth/34-02-SUMMARY.md`
