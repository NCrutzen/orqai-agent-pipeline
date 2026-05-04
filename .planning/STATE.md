---
gsd_state_version: 1.0
milestone: v8.0
milestone_name: Agentic Platform
status: code-complete
stopped_at: Phase 68 code-complete; Plan 09 Task 2 (live Phase 67 smoke) pending operator
last_updated: "2026-05-04T13:40:00.000Z"
last_activity: 2026-05-04 -- Phase 68 (swarm_registry generalisation) all 9 plans executed
progress:
  total_phases: 45
  completed_phases: 16
  total_plans: 84
  completed_plans: 70
  percent: 83
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-15)

**Core value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- through a browser UI with real-time visibility, visual agent graphs, and in-app approvals -- without touching a terminal or needing technical knowledge.
**Current focus:** Phase 68 code-complete — awaiting operator sign-off on Plan 09 Task 2 (live smoke regression)
**Previous milestones:** v0.3 shipped 2026-03-01, V2.0 shipped 2026-03-02, V2.1 shipped 2026-03-13, V3.0 in progress (91%), V4.0 partially complete, V6.0 phases 44-45 complete, V7.0 shipped 2026-04-30

## Current Position

Phase: 68 — swarm_registry generalisation + canonical context shape — CODE-COMPLETE
Plan: 9/9 (Plan 09 Task 2 pending operator)
Milestone: v8.0 Agentic Platform (11 phases, 63-73)
Last activity: 2026-05-04 -- Phase 68 all 9 plans executed; pushed to GitHub

Progress: [█████████░] 89%

**v8.0 execution order:** 63 -> 64 -> 65 -> 66 -> 67 -> 68 -> 69 -> 70 -> 71 -> 72 -> 73
**Next action:** Operator: re-fire Phase 67 smoke against Vercel preview, then `/gsd-verify-work 68`. Then `/gsd-discuss-phase 69 --auto`.

## Performance Metrics

**Velocity:**

- Total plans completed: 3
- Average duration: --
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 59 | 3 | - | - |
| Phase 63 P01 | 3m 25s | 3 tasks | 3 files |
| Phase 63 P02 | 5m | 5 tasks | 5 files |
| Phase 63 P03 | 2m | 4 tasks | 3 files |
| Phase 65 P02 | 927s | 5 tasks | 8 files |
| Phase 65 P03 | 482s | 2 tasks | 9 files |
| Phase 66 P02 | 7m | 2 tasks | 10 files |
| Phase 66 P04 | 3 minutes | 3 tasks | 1 files |
| Phase 67 P03 | 10m | 3 tasks | 3 files |
| Phase 67 P06 | 18 | 3 tasks | 6 files |

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
- Phase 63 RFC contract docs use verified migration line refs (agent_runs.corrected_category, email_labels.corrected_customer_account_id, draft_quality, feedback_reason); axes 2/3 forward-referenced to Phase 71
- 63-02: Stage 2 omitted Anthropic citation per plan permission (pre-LLM enrichment, not an Anthropic pattern)
- 63-02: Stage 3.5 escalation rendered as ASCII decision diamond + one-line spawn placeholder; full design deferred to Phase 65 per CONTEXT discretion
- 63-03: PROJECT.md verified clean of speculative brand names — D-09 preventive check passed without mutation
- 63-03: docs/agentic-pipeline/README.md is the canonical RFC entry point; CLAUDE.md updated to point at it primary, debtor-email doc demoted to swarm-specific implementation map
- Phase 65-02: Inline model.parameters.response_format on Orq REST API replaces Studio Tools UI ritual (verified end-to-end on 3 agents 2026-05-03)
- Phase 65-02: fallback_models lives at AGENT ROOT level on Orq PATCH; nested-form silently no-ops
- Phase 65 Plan 03 — coordinator V2 rewritten in-place; SwarmCategoryRow.requires_orchestration optional in TS to keep legacy fixtures assignable; debtor/email.received payload extended with optional run_id/automation_run_id/budget_run_id (back-compat)
- 66-04: CONS-03 invariant locked via audit-as-artifact (no source-code changes; allowlist captured in summary)

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

Last session: --stopped-at
Stopped at: Phase 68 context gathered (--auto)
Resume with: `/gsd-execute-phase 65`
Resume file: --resume-file

## Deferred Items

Items acknowledged at v7.0 close on 2026-04-30 — known-deferred, not gating milestone close:

| Category | Count | Action |
|----------|-------|--------|
| Quick tasks (orphaned/stale) | 10 | Review during V8.0 cleanup; most predate current automation focus |
| Pending todos | 2 | zapier-analytics-browser-automation + postgrest-exposed-schemas-for-email-insights — re-prioritize in V8.0 backlog |
| UAT gaps (Phase 61) | 1 | Bulk-review UX regression UAT — to revalidate during V8.0 phase 7 (Bulk Review redesign) |
| Verification gaps (Phase 59, 61) | 2 | Realtime fan-out + bulk-review UX — passed in practice, formal verification deferred |

See .planning/milestones/v7.0-* archive files for full milestone state.

**Planned Phase:** 68 (swarm-registry-generalisation-canonical-context-shape) — 9 plans — 2026-05-04T11:08:41.601Z
