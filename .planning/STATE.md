---
gsd_state_version: 1.0
milestone: v8.0
milestone_name: Agentic Platform
status: unknown
stopped_at: Completed 81-03 — Stage 1 shell-wrapped surface + Pending Promotion sub-view
last_updated: "2026-05-11T10:28:15.929Z"
last_activity: 2026-05-11 -- Phase --phase execution started
progress:
  total_phases: 60
  completed_phases: 17
  total_plans: 117
  completed_plans: 101
  percent: 86
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-15)

**Core value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- through a browser UI with real-time visibility, visual agent graphs, and in-app approvals -- without touching a terminal or needing technical knowledge.
**Current focus:** Phase --phase — 81
**Previous milestones:** v0.3 shipped 2026-03-01, V2.0 shipped 2026-03-02, V2.1 shipped 2026-03-13, V3.0 in progress (91%), V4.0 partially complete, V6.0 phases 44-45 complete, V7.0 shipped 2026-04-30

## Current Position

Phase: --phase (81) — EXECUTING
Plan: 1 of --name
Milestone: v8.0 Agentic Platform (11 phases, 63-73)
Last activity: 2026-05-11 -- Phase --phase execution started

Progress: [█████████░] 86%

**v8.0 execution order:** 63 -> 64 -> 65 -> 66 -> 67 -> 68 -> 69 -> 70 -> 71 -> 72 -> 73
**Next action:** `/gsd-verify-work 68`, then `/gsd-discuss-phase 69 --auto`.

## Performance Metrics

**Velocity:**

- Total plans completed: 11
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
| Phase 70 P05 | 12m | 2 tasks | 2 files |
| Phase 70 P06 | 6 | 2 tasks | 3 files |
| Phase 74 P02 | 10min | 3 tasks | 5 files |
| Phase 74 P05 | 20m | 3 tasks | 2 files |
| Phase 76 P03 | 12m | 3 tasks | 4 files |
| Phase 76 P05 | 25m | 3 tasks | 8 files |
| Phase 76 P06 | 25m | 4 tasks | 13 files |
| Phase 76 P07 | 8m | 3 tasks | 7 files |
| Phase 76 P08 | 30m | 2 tasks | 5 files |
| 76 | 8 | - | - |
| Phase 999.7 P01 | 3m | 3 tasks | 11 files |
| Phase 999.7 P02 | 2 | 2 tasks | 3 files |
| Phase 999.7 P03 | 4 | 2 tasks | 2 files |
| Phase 80 P01 | 12m | 3 tasks | 4 files |
| Phase 80 P02 | 4m | 2 tasks | 5 files |
| Phase 80 P03 | 10m | 2 tasks | 4 files |
| Phase Phase 80 PP04 | 4m | 1 task tasks | 1 file files |
| Phase 80 P05 | 10m | 1 tasks | 1 files |
| Phase 80 P06 | 8m | 1 tasks | 1 files |
| Phase 81 P01 | 8m | 2 tasks | 30 files |
| Phase 81 P02 | 5min | 3 tasks | 4 files |
| Phase 81 P02 | 4m | 3 tasks | 4 files |
| Phase 81 P03 | 12m | 3 tasks tasks | 7 files files |

## Accumulated Context

| Phase 48 P01 | 3min | 2 tasks | 9 files |

### Roadmap Evolution

- Phase 60 added: Debtor email — close the whitelist-gate loop (data-driven AUTO_ACTION_RULES with Wilson-CI auto-promotion cron + queue-driven Bulk Review UI reading automation_runs status=predicted directly)
- Phase 61 added: Restore lost bulk-review UX (60-05 regression fix) — horizontal overflow, email-body expander, per-row notes, rule-hint dropdown / per-item override on top of the new tree-driven shell
- Phase 62 added: classifier-rules-readability — group dashboard rules per category, sectioneer no_match as system row, show human-readable labels + code-permalinks to classify.ts, add overlap-lint warning when seeding new candidates. Cosmetic + ergonomic; promotion-machinerie (Wilson CI per rule_key) blijft ongemoeid.
- Phase 74 added: Stage 1 LLM Category Classifier (swarm-agnostic) — fills the missing Stage 0 → Stage 1 LLM seam exposed during Phase 71 UAT. New Orq agent stage-1-category-classifier (Haiku-class, registry-driven via swarm_categories) + new classifier-screen-worker Inngest function listening on classifier/screen.requested, emits classifier/verdict.recorded with Phase 70 dual-write so verdict-worker dispatches per swarm_categories.action. Cross-swarm reusable for sales-email and future swarms.
- Phase 76 added: Stage 3 → Kanban human-lane wiring (unhandled-intent triage surface). Wires the existing Stage 3 intent coordinator output into a "needs human" Kanban lane when (a) no Stage 4 handler is registered for the picked intent, (b) Stage 3 returns low confidence, or (c) a Stage 4 handler errored. Lane reuses existing automation_runs status='pending'. Two operator actions: Close (resolved manually) and Replay through Stage 4 (re-emit handler_event after operator picks/edits the intent). Depends on Phase 75 noise-vs-intent registry split (shipped 2026-05-07 via 66c0379). Output: every email that leaves Stage 1 either reaches a registered Stage 4 handler OR lands in the Kanban human lane with a clear reason — zero silent dead-letters.
- Phase 77 added: Stage 2 / Stage 3 end-to-end verification (debtor-email). No new handlers. Confirm label-resolver maps customers correctly to iController (≥90% on non-noise); confirm Stage 3 produces sensible ranked intents on a manually-graded 50-email sample. Bugs surfaced fixed in this phase, no carryover. Depends on Phase 76 (Kanban visibility prereq).
- Phase 78 added: Sales-email Stage 0→3 onboarding (verkoop@smeba.nl, ~15-25 emails/day). Registry-insert-only — if any cross-swarm worker needs swarm-specific branches, that's an architecture bug to fix here. Subsumes Phase 73. Runs in PARALLEL with Phase 77, depends on Phase 76 only.
- Phase 79 added: Learning loop — intent surfacing dashboard. Cross-swarm view of intent volumes, top-N picks, Stage 3 confidence distributions, operator override rates, Kanban-lane stuck-row counts by reason. Output is the input to v8.2's data-driven handler prioritization. Depends on 76+77+78.
- Milestone framing: Phases 76-79 form milestone v8.1 "Validation + Visibility" — observe → understand → THEN automate. v8.2 "Selective handler automation" follows, with phases picked from v8.1 data, not pre-planned.
- Phase 81 added: Fold Stage 1 (Bulk Review) into the stage-keyed shell — closes the loop on Sketch 005 / Phase 76 D-04/D-05 (REVISED). Phase 76-08 explicitly chose option (A) "minimum churn" (re-export /review/page.tsx) over option (B) (wrap in _shell + StageTabStrip), so /stage-1 still renders the legacy "Bulk Review" chrome with no stage-tab strip and Pending Promotion sub-view never wires (?sub=pending pushed by QueueTree, but loadPageData reads ?tab=pending which the redirect rewrites away). Output: Stage 1 sits under the same shell as 0/3/4, "Bulk Review" stops being a UI noun, Pending Promotion sub-view actually renders, and a thin Stage 2 placeholder lets the registry-driven tab strip resolve.

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
- Plan 70-06 (Wave 3): Bulk Review loadPageData rewired to pipeline_events for predicted-row feed (sub-queries 2 + 6); cost-outlier RPC stays on automation_runs in v1; D-16 atomic replacement honored.
- Phase 74-05: sales-email source IS SugarCRM (not Outlook); production zap 'MR || Sales email analyzer' replaces step 3 (Orq direct call) with POST to /api/automations/sales-email/ingest
- Phase 76-06: registry-driven stage-keyed shell — Phase 78 onboards sales-email by INSERT only, zero UI code
- Phase 76-07: action-stack parameterized via actions prop — enables Stage 4 reuse without component duplication
- Phase 76-08: re-export pattern for /stage-1 (minimum churn over wrapper duplication)
- Phase 76-08: middleware redirect runs before Supabase auth check (no auth dep)
- Phase 80-01: 3-task split (types-only / dispatcher-test / classifier+backfill-tests) per checker feedback — one-concern commits
- Phase 80-02: caller-side swap to loadSwarmIntents applied in Wave 1 (transient swap) — keeps tsc clean between waves with no live behavior change
- Race-guard via compound .eq() match in classifier flip-status-predicted; Supabase mock updated to support thenable chain (Phase 80 Plan 03)
- Live-traffic switch via single Inngest serve registration of stage3Dispatcher; wildcard */predicted activates routing for all swarms (Phase 80 Plan 03)
- Phase 80-04: agent_runs.status='predicted' maps to Kanban 'progress' lane attributed to 'Stage 3 Dispatcher'; Bulk Review automation_runs.status='predicted' → 'review' path preserved (different table, different feature)
- Phase 80-06: RFC doc lock — stage-3-coordinator.md restructured around the new state machine; State Machine + Transition Table + Stuck-Status Meaning + Cross-Swarm Dispatcher Contract sections added; hard-separation lock restated twice (positive in Cross-Swarm Contract, negative in Registry Tables) for highest-cost violation surface
- Phase 81-02: Stage 2 placeholder route + head-count loader; debtor-only ↗ link, em-dash fallback for other swarms
- Phase 81-02: head-count loader pattern (.select(id,{count:exact,head:true})) for placeholder card counts — no row data pulled
- Phase 81-02: established RSC-page RTL test pattern in this tree (await async component → render → mock loaders at module boundary)
- Phase 81-03: Stage 1 shell-wrapped surface complete — chip strip (swarm_noise_categories only, hard-separation lock), 2-col grid, ?sub=pending Pending Promotion sub-view; Filters popover deferred (URL params still work)

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

Last session: 2026-05-11T10:28:11.849Z
Stopped at: Completed 81-03 — Stage 1 shell-wrapped surface + Pending Promotion sub-view
Resume with: `/gsd-execute-phase 65`
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

**Planned Phase:** 81 (Fold Stage 1 (Bulk Review) into the stage-keyed shell) — 4 plans — 2026-05-08T15:01:34.892Z
