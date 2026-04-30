---
gsd_state_version: 1.0
milestone: v8.0
milestone_name: Agentic Platform
status: defining
stopped_at: "v8.0 ROADMAP.md created — 11 phases (63-73), 47/47 requirements mapped, ready for /gsd-plan-phase 63"
last_updated: "2026-04-30T08:00:00.000Z"
last_activity: 2026-04-30
progress:
  total_phases: 11
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-15)

**Core value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- through a browser UI with real-time visibility, visual agent graphs, and in-app approvals -- without touching a terminal or needing technical knowledge.
**Current focus:** Planning v8.0-agentic-platform — 4-stage funnel architecture redesign
**Previous milestones:** v0.3 shipped 2026-03-01, V2.0 shipped 2026-03-02, V2.1 shipped 2026-03-13, V3.0 in progress (91%), V4.0 partially complete, V6.0 phases 44-45 complete, V7.0 shipped 2026-04-30

## Current Position

Phase: 63 (next), Plan: —, Status: Defining
Milestone: v8.0 Agentic Platform (11 phases, 63-73)
Last activity: 2026-04-30

Progress: [░░░░░░░░░░] 0% (0 of 11 v8.0 phases started)

**v8.0 execution order:** 63 -> 64 -> 65 -> 66 -> 67 -> 68 -> 69 -> 70 -> 71 -> 72 -> 73
**Next action:** `/gsd-plan-phase 63` (Architecture RFC, doc-only foundation)

## Performance Metrics

**Velocity:**

- Total plans completed: 3
- Average duration: --
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 59 | 3 | - | - |

## Accumulated Context

| Phase 48 P01 | 3min | 2 tasks | 9 files |

### Roadmap Evolution

- Phase 60 added: Debtor email — close the whitelist-gate loop (data-driven AUTO_ACTION_RULES with Wilson-CI auto-promotion cron + queue-driven Bulk Review UI reading automation_runs status=predicted directly)
- Phase 61 added: Restore lost bulk-review UX (60-05 regression fix) — horizontal overflow, email-body expander, per-row notes, rule-hint dropdown / per-item override on top of the new tree-driven shell
- Phase 62 added: classifier-rules-readability — group dashboard rules per category, sectioneer no_match as system row, show human-readable labels + code-permalinks to classify.ts, add overlap-lint warning when seeding new candidates. Cosmetic + ergonomic; promotion-machinerie (Wilson CI per rule_key) blijft ongemoeid.

### Decisions

- V7.0 uses parallel CSS namespace (--v7-*) to coexist with existing shadcn tokens
- Azure AD must use OAuth (not SAML) to auto-link existing email/password accounts
- Single Supabase Realtime subscription per swarm view, not per component
- Orq.ai data flows through Inngest cron to Supabase, never client-to-Orq.ai
- Ring buffers from day one for terminal stream and delegation graph (max 500 events)
- Design reference: docs/designs/agent-dashboard-v2.html
- V7 foundation tables use single migration file (logically coupled)
- Supabase Management API for migrations (proven reliable, no CLI dependency)
- [Phase 48]: V7 tokens in existing globals.css with --v7-* prefix, @custom-variant uses [data-theme='dark']

### Blockers/Concerns

- Azure AD tenant setup has organizational dependencies (IT admin access)
- Supabase Management API token expired -- Phase 50 migration apply blocked (seed update also needs this or Studio access)
- Supabase Realtime plan limits need verification (carry forward from Phase 49)

### Outstanding Verification (Deferred)

- **Phase 48-03 Azure AD SSO end-to-end** -- Code is in place (SSO button, access-pending page, project_members gate, middleware exemption) but human verification blocked on Azure AD tenant provisioning + Supabase Azure provider config. Full 8-step verification protocol in `.planning/phases/48-foundation/48-03-SUMMARY.md` under "Deferred: Human Verification (Task 3)". Resume signal: "SSO verified".
- **Phase 50 Data Pipeline migration apply + end-to-end** -- Migration file written and committed (`supabase/migrations/20260416_trace_sync.sql`) but Supabase Management API token in repo is expired. User must apply via Studio SQL editor OR provide a current `sbp_*` token so the next session can run it. Then seed one `projects.orqai_project_id` on a real swarm to kick off the cron. Full protocol in `.planning/phases/50-data-pipeline/50-VERIFICATION.md` under "Deferred: Human Verification". Resume signal: "Phase 50 sync verified".

### Pending Todos

5 pending (see `.planning/todos/pending/`):

- Plan V3 milestones for Playwright and next project phase (planning)
- Build Zapier analytics browser automation (automation)
- Resolve PostgREST exposed-schemas for email_insights (database)

**Debtor-email sub-project — 4 todos, clearly separated:**

- **Intent agent for unknown-bucket debtor mails** (swarm design → `/orq-agent`) — LLM on top of regex classifier's `unknown` fall-through
- **fetchDocument tool** (engineering) — Vercel API route using Zapier SDK for NXT SQL + S3. No swarm involvement.
- **createIcontrollerDraft tool** (engineering) — Vercel API route using Browserless+Playwright. Selectors captured from 2026-04-22 probe.
- **Copy-document sub-agent** (swarm design → `/orq-agent`) — consumes the two tool contracts above. Blocked on both tools existing.

**Tomorrow's first pickup:** build the two engineering tools in parallel (fetcher + drafter). Once both HTTP endpoints are live + registered as Orq.ai tool-calls, fill the swarm brief with data samples and invoke `/orq-agent` for the swarm spec.

## Session Continuity

Last session: 2026-04-29T16:10:58.897Z
Stopped at: Phase 56-02 Zap construction OPEN — operator finishing Zapier wiring (paths/SQL/Custom Response). Phase 56.7 swarm-registry CONTEXT.md ready for /gsd-plan-phase 56.7. Resume: paste smoke-test results when Zap is ON
Resume with: `/gsd-autonomous --from 49`
Resume file: None

## Deferred Items

Items acknowledged at v7.0 close on 2026-04-30 — known-deferred, not gating milestone close:

| Category | Count | Action |
|----------|-------|--------|
| Quick tasks (orphaned/stale) | 10 | Review during V8.0 cleanup; most predate current automation focus |
| Pending todos | 2 | zapier-analytics-browser-automation + postgrest-exposed-schemas-for-email-insights — re-prioritize in V8.0 backlog |
| UAT gaps (Phase 61) | 1 | Bulk-review UX regression UAT — to revalidate during V8.0 phase 7 (Bulk Review redesign) |
| Verification gaps (Phase 59, 61) | 2 | Realtime fan-out + bulk-review UX — passed in practice, formal verification deferred |

See .planning/milestones/v7.0-* archive files for full milestone state.
