# Milestones

## V11.0 Intent-Prioritised Handlers (Defined: 2026-05-12)

**Phases:** TBD (numbered after V10.0 phases are finalized)
**Status:** Defined — depends on V10.0 producing intent-volume signal across two swarms

**Goal:** Convert Stage 3 intent volume into Stage 4 handler coverage in priority order. Today the Kanban human-lane (Phase 76) is the catch-all for intents without handlers — operators do them by hand. V11.0 builds the dashboard that ranks uncovered intents by frequency, plus a scaffolding template that turns "the top-3 uncovered intents" into 3 new handler phases per milestone cycle.

**Target capabilities:**

- Intent-coverage dashboard reading `swarm_intents` (handler-mapped) ∪ `pipeline_events` (Stage 3 verdicts) — surfaces the gap and ranks by 30-day frequency × business-value weight
- Handler-scaffolding template (`/gsd-add-phase` integration) — given a chosen intent, drafts a Stage 4 handler phase with CONTEXT.md pre-filled (intent definition from V9.0 + sample emails + suggested side-effects)
- Dispatch via `swarm_intents.handler_event` registry — new handlers register via INSERT, no code edits to `stage-3-dispatcher.ts`
- Per-intent volume telemetry in the existing `pipeline_events_email_summary_v2` view, exposed via the dashboard

**Architecture:** Reads from V9.0 (intent definitions from operator prose) and V10.0 (intent-frequency telemetry across both swarms). Does NOT introduce new auto-execution — handlers still ship via standard phases, but the *prioritisation* is data-driven instead of opinion-driven.

**Success criteria:** N most-frequent uncovered intents have shipped handlers within Y weeks of being identified. Concrete numbers TBD when V10.0 produces baseline volume data.

**Depends on:** V10.0 (multi-swarm intent volume signal; sales-email-specific Stage 3 intents shipping)

---

## V10.0 Sales-Email Canonical Pipeline (Defined: 2026-05-12)

**Phases:** TBD (Phase 78 directory exists but is empty — needs proper plan)
**Status:** Defined — depends on V9.0 Stream B (intent capture) being operator-usable

**Goal:** `verkoop@smeba.nl` runs the same canonical 5-stage funnel as debtor-email, end-to-end, with full Bulk Review trace. Today Phase 74 stops sales-email at `manual_review` for noise categories; Phase 78 was never executed; the `sales-email-analyzer/` module is the legacy direct-Orq.ai path. V10.0 is the actual "second swarm validation" that v8.0 promised.

**Target capabilities:**

- New sales-email Stage 2 entity resolver — Sugar-account lookup (SugarCRM SDK or Zapier bridge), NOT a copy of debtor-email's NXT resolver. Customer-less emails fall through to Stage 3.
- Sales-email-specific Stage 3 intent agent — separate from `debtor-intent-agent`; intents derived from V9.0 Stream B prose feedback by the sales-email operator
- Phase 78 properly planned and executed (currently `.gitkeep` only) — includes the Sugar archive resolve route (Phase 75 in ROADMAP) + flipping noise categories from `manual_review` back to `categorize_archive`
- Multi-operator handling — V9.0 added single-operator scaffolding; V10.0 forces `operator_id` columns, scope filtering in the Learning Inbox, and vocabulary-reconciliation in the synthesis layer (different operators describe the same intent differently)
- Stage 0 telemetry coverage for sales-email already at 91% (no Phase 82.2 follow-up needed)

**Architecture:** Sales-email is the second customer of V9.0's feedback infrastructure. Both swarms write to the same `pipeline_events`, the same `agent_runs`, the same `promotion_candidates` (V9.0 table). The sales-email operator and the debtor-person produce parallel feedback streams that the V9.0 synthesis layer aggregates into proposed system changes.

**Success criteria:**

- X% of inbound sales emails reach a Stage 3 verdict without `manual_review` (target TBD — current baseline ≈ 0% via the canonical path)
- Sales-email operator gives Stream B feedback for ≥ 80% of Stage 3 rows within first 14 days
- At least one V9.0-proposed system change is approved using cross-swarm feedback (i.e., the synthesis layer sees both operators' input)

**Depends on:** V9.0 (Stream B operator surface live; promotion_candidates table; synthesis layer ≥ T2)

---

## V9.0 Promotion Recommender + Learning Inbox (Defined: 2026-05-12)

**Phases:** TBD — Phase 72 from v8.0 reframed; old phase definition (telemetry-only "promotion candidates") deprecated
**Status:** Defined — depends on v8.0 closure (Phase 82.2 + Phase 82.4)

**Scope cut 2026-05-12:** Capture infrastructure (`email_feedback` table, Stage 2/3 prose form, history view) moved into v8.0 as **Phase 82.4** so the debtor-person has a place to put feedback from day 1 of their onboarding (2026-05-18). V9.0 is now **pure synthesis on top of pre-existing captured data** — smaller scope, cleaner thesis.

**Goal:** Turn captured operator prose feedback into proposed system changes via LLM synthesis (T2 draft-proposer tier). Read `email_feedback` (populated by 82.4), cluster by pattern, draft concrete changes, surface in a Learning Inbox tab on Bulk Review, apply on one-click for data-shaped changes.

**Target capabilities:**

- **Synthesis layer** (T2, weekly batch): LLM reads N days of `email_feedback`, clusters by pattern (e.g., "12 Stage 2 fails this week clustered into 3 patterns: (a) PO-number-in-body, (b) intra-company forwards, (c) supplier-on-behalf-of"), drafts a concrete change for each cluster (new resolver step / new noise rule / new intent definition), writes to a new `proposed_actions` table.
- **Learning Inbox UI** — new tab on Bulk Review (NOT a separate page): filtered view of `proposed_actions WHERE status='pending_review'`. Operator sees the cluster + the draft change + a one-click "Apply" that executes the data-shaped changes (INSERT into `swarm_intents` / `classifier_rules` / new resolver-step row).
- **Immediate-apply enablement on new intents** — flip the V9.0 switch so 82.4-captured new-intent labels enter the Stage 3 LLM's intent list automatically (with the fuzzy-match dedup already in 82.4). 82.4 captures; V9.0 wires it through.
- **Data-driven resolver steps** — refactor `resolveDebtor` from hardcoded 4-layer pipeline to data-driven `stage2_resolver_steps` table so LLM-proposed resolver changes land as INSERTs, not PR code review.
- **Eval gate for the clusterer** — held-out dataset of ≥ 100 captured Stage 2/3 corrections (from 82.4's accumulating corpus) with hand-labelled cluster IDs; LLM clusterer must hit X% accuracy before going live (Phase 1 deliverable, not side-quest).

**Inherited from Phase 82.4 (already shipped under v8.0):**

- `email_feedback` table + Stage 2 incorrect-mapping form + Stage 3 confirm-or-correct form + own-feedback-history view + fuzzy-match guardrail on new-intent typing.

**Architectural decisions (locked):**

- **Synthesis tier: T2.** LLM drafts; operator clicks approve; system applies for data-shaped changes only. Code-shaped changes fall back to "LLM drafted, human implements" (T1).
- **Operator: single (debtor-person)** — multi-operator handling deferred to V10.0
- **Wilson-CI noise-rule promotion coexists**, not absorbed. `labeling-flip-cron` keeps running in the background. V9.0 only touches Stage 2/3.
- **Stage scope: 2 + 3 only** — Stages 0/1 already have 4-axis overrides in Bulk Review (Phase 71); no prose needed. Operator effort ≈ 50 events/day (15 with prose), not 250.
- **Form shape: structured-first, prose-optional** — operator confirms LLM verdict in 5 seconds when correct; types prose only when overriding or proposing new label.

**Success criteria:**

- ≥ 80% of repeat Stage 3 overrides get auto-suppressed within 7 days (the new intent is applied immediately, the next similar email is classified correctly without operator intervention)
- ≥ 1 V9.0-proposed Stage 2 system change shipped per week (drafted by LLM, applied via Learning Inbox)
- Operator time per Stage 3 row ≤ 15 seconds median (structured confirm path)
- Clusterer eval accuracy ≥ X% on held-out set before T2 goes live (X TBD)

**Depends on:** Phase 82.2 (Stage 0 coverage fix); debtor-person operator availability from 2026-05-18

**Risk register:**

- LLM clusterer over-generalises → mitigated by held-out eval gate
- New-intent fragmentation (operator types 3 variants of same intent) → mitigated by fuzzy-match UX guardrail at form level
- "Immediate apply" creates intent-list pollution → mitigated by weekly cleanup pass in synthesis layer (merges duplicate intents)
- Operator fatigue at 50 events/day → mitigated by structured-first form; if fatigue still appears, V9.0 falls back to sampling instead of every-row review

---

## v7.0 Agent OS (Shipped: 2026-04-30)

**Phases completed:** 18 phases, 50 plans, 15 tasks

**Key accomplishments:**

- 4 V7 foundation tables (agent_events, swarm_jobs, swarm_agents, swarm_briefings) with indexes, RLS, and Supabase Realtime publication
- Microsoft SSO button on /login, access-pending page for unauthorized users, and project_members gate on the dashboard layout with middleware exemption.
- V7 swarm sidebar + single-channel Realtime provider and hook.
- `/swarm/[swarmId]` route, layout shell, and 404.
- DB migration + shared MCP helper + pure trace mapper with 8 unit tests.
- Inngest cron function that syncs Orq.ai traces to agent_events, and its route registration.
- Orq.ai Briefing Agent + server action + client panel + 30-min cron.
- Slide-out drawer + shell wiring + test fixture.
- Live event stream with bounded ring buffer.
- 5-column Kanban board with dnd-kit + optimistic moveJob server action.
- 3 sidebar filter chips with shareable URL state.
- Cinematic SVG graph wired to live Realtime data: nodes from swarm_agents, edges from agent_events.parent_span_id traversal, animated particles on edges active in the last 60 seconds.
- Per-agent Gantt-style timeline of recent activity. One lane per swarm_agent (alphabetical, capped at 8), bars colored by event type with terminal-type promotion, hover/focus reveals a tooltip with span name, duration, agent, and timestamps. Reuses Phase 49's SwarmRealtimeProvider via useRealtimeTable.
- Two RLS-protected Supabase tables (`public.swarms` + `public.swarm_categories`) plus a 60s in-memory TTL loader (`web/lib/swarms/registry.ts`) that lets Wave 2 verdict-worker and Wave 3 generic queue UI pivot off DB rows instead of hardcoded constants.
- Rewrote `classifier-verdict-worker` to dispatch by `swarm_categories.action` (4-branch switch) instead of the hardcoded `CATEGORY_LABEL` map — adding a future swarm with a custom side-effect now requires only `INSERT swarms` + `INSERT swarm_categories(action='swarm_dispatch')` + a new Inngest worker, with zero edits to this file.
- One-liner:
- `web/lib/automations/swarm-bridge/sync.ts`
- Replaced unfiltered automation_runs postgres_changes with one broadcast per write on `automations:${automation}:stale` and a subscriber that opens one channel per explicit name (no LIKE, no ancestor fanout).
- 500ms emit-the-latest debounce inside `web/lib/supabase/broadcast.ts` keyed by (channel, event-key); chat tokens and chat messages bypass; zero caller-site edits.
- 1. [Rule 3 - Tooling] vitest 4.x dropped `--reporter=basic`
- 1. [Rule 3 — Plan vs live-DB] `mailbox_id: settings.id` replaced with `ICONTROLLER_MAILBOXES` lookup
- 1. [Rule 1 -- Bug in plan example] Test fixtures n=50, agree=49 do NOT clear the 0.95 promote gate
- 1. [Rule 3 - Blocking] Test DOM leakage between renders
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- 1. [Rule 3 - Blocker] Zod v4 strict UUID validator rejected test fixtures
- 1. [Rule 3 - Blocker] jsdom does not populate `isContentEditable` after `setAttribute`
- `web/app/(dashboard)/automations/debtor-email-review/detail-pane.tsx`

---

## V7.0 Agent OS (Defined: 2026-04-15)

**Phases:** 7 (phases 48-54)
**Requirements:** 45 (DS-01-04, AUTH-01-03, NAV-01-04, RT-01-04, DATA-01-03, BRIEF-01-03, FLEET-01-04, DRAW-01-04, GRAPH-01-04, KAN-01-04, OBS-01-05, POL-01-03)

**Planned deliverables:**

1. New design system (Satoshi + Cabinet Grotesk, glassmorphism, dark/light toggle with parallel --v7-* tokens)
2. Azure AD OAuth SSO with automatic account linking for existing email/password users
3. Sidebar with dynamic swarm navigation and live mini-stats
4. Single Supabase Realtime subscription per swarm view distributing events to all child components
5. Inngest orqai-trace-sync cron pipeline from Orq.ai traces to agent_events table
6. Subagent fleet cards with metrics, skills, and recursive agent detail drawer
7. AI narrative briefing via dedicated Orq.ai Briefing Agent on 30-minute schedule
8. Claude-style terminal event stream with ring buffer and virtualized rendering
9. 5-column Kanban board with dnd-kit drag-and-drop and optimistic persistence
10. Live delegation graph with CSS-animated particles at 60fps
11. Gantt-style observability swimlanes per agent
12. V7 design token migration for all existing pages

**Architecture:** Supabase Realtime postgres_changes pattern -- Inngest cron polls Orq.ai, writes to agent_events, Realtime propagates to all connected UIs. Single subscription per swarm view, ring buffers for unbounded streams.

**Design reference:** docs/designs/agent-dashboard-v2.html

**Research flags:**

- Phase 50: Orq.ai trace MCP tool names unverified (list_traces/list_spans) -- must validate before planning
- Phase 53: Custom SVG swimlane complexity -- flag for early prototype

---

## V6.0 Executive Dashboard & UI Revamp (Defined: 2026-03-27)

**Phases:** 4 (phases 44-47)
**Requirements:** 26 (UIDX-01-06, EDASH-01-06, DINT-01-06, PEXT-01-05, O365-01-03)

**Planned deliverables:**

1. Extended project model with status lifecycle (idea/building/testing/live) and automation type classification
2. Zapier analytics browser scraper (Browserless.io) and Orq.ai analytics collector (MCP API) with Inngest cron scheduling
3. Executive dashboard with KPI cards, trend charts, project status distribution, ROI estimates, and health indicators -- all from pre-computed snapshots
4. Automated project status monitoring (auto-apply forward, suggest-only backward)
5. O365 SSO via Azure AD OAuth alongside existing email/password auth
6. Full UI redesign with Moyne Roberts branding, dark mode, responsive layout

**Architecture:** Pre-computed snapshot pattern -- Inngest cron functions collect data from Zapier (browser scraper) and Orq.ai (MCP analytics API), write to intermediate Supabase tables; dashboard reads only from pre-computed snapshots for sub-100ms loads.

---

## V2.1 Experiment Pipeline Restructure (Shipped: 2026-03-13)

**Phases completed:** 8 phases, 9 plans
**Timeline:** 3 days (2026-03-11 → 2026-03-13)
**Deliverables:** 5 new subagents + 2 rewritten commands (2,421 lines)
**Requirements:** 24/24 satisfied (DATA-01-05, EXPR-01-06, ANLZ-01-05, TEST-01-03, ITPIPE-01-06, LOOP-01-03)

**Key accomplishments:**

1. Dataset-preparer subagent with MCP/REST upload, smoke test validation, stratified 60/20/20 splits, and JSON handoff contract
2. Experiment-runner subagent with REST-only execution, adaptive 10-30s polling, holdout re-test mode, and per-run per-evaluator raw scores
3. Results-analyzer subagent with Student's t 95% CI statistics, role-based pass/fail thresholds, category-sliced scoring, and backward-compatible hardener output
4. Rewritten test.md orchestrating 3 subagents with validation gates between each step
5. Failure-diagnoser + prompt-editor subagents for section-level diagnosis, HITL-approved diffs, re-deploy delegation, and before/after score comparison
6. Rewritten iterate.md with 2-subagent loop, 5 stop conditions, and holdout re-test verification

**Tech debt accepted:** 1 non-blocking item (evaluator_ids passthrough optimization — see V2.1-MILESTONE-AUDIT.md)
**Archive:** `milestones/V2.1-ROADMAP.md`, `milestones/V2.1-REQUIREMENTS.md`

---

## V2.0 Autonomous Orq.ai Pipeline (Shipped: 2026-03-02)

**Phases completed:** 7 phases, 11 plans
**Timeline:** 2 days (2026-03-01 → 2026-03-02)
**Codebase:** 10,628 lines (orq-agent/ — markdown + JSON)
**Requirements:** 23/23 satisfied (DEPLOY-01-08, TEST-01-05, ITER-01-07, GUARD-01-03)

**Key accomplishments:**

1. Deployer subagent with MCP-first/REST-fallback deployment pipeline, idempotent create-or-update, and read-back verification
2. Tester subagent with V1.0 dataset transformation, role-based evaluator auto-selection, and 3x median experiment execution via evaluatorq SDK
3. Iterator subagent with evaluator-to-section failure diagnosis, diff-style proposals, HITL approval, and 4 automatic stopping conditions
4. Hardener subagent with evaluator-to-guardrail promotion via native Orq.ai `settings.guardrails` API and threshold-based quality gates
5. Per-agent incremental operations (`--agent` flag) across all 4 pipeline commands with interactive deploy picker
6. Complete data contract alignment across deploy/test/iterate/harden pipeline (holdout dataset paths, flag conventions, step numbering)

**Tech debt accepted:** 5 non-blocking items (see V2.0-MILESTONE-AUDIT.md)
**Archive:** `milestones/V2.0-ROADMAP.md`, `milestones/V2.0-REQUIREMENTS.md`

---

## v0.3 Core Pipeline + V2.0 Foundation (Shipped: 2026-03-01)

**Phases completed:** 11 phases (V1.0: 8, V2.0: 3), 28 plans, 147 commits
**Timeline:** 6 days (2026-02-24 → 2026-03-01)
**Codebase:** 43 files, 7,162 lines (markdown + shell + JSON)
**Requirements:** 50/50 satisfied (40 V1.0 + 10 V2.0)

**Key accomplishments:**

1. End-to-end agent swarm generation from natural language use cases — architect → researcher → spec-gen → orchestration → tools → datasets → README
2. Adaptive pipeline with structured discussion — surfaces domain gray areas, skips research when input is detailed
3. KB-aware pipeline — end-to-end knowledge base support from discussion through orchestration output
4. XML-tagged prompt strategy with Anthropic context engineering patterns across all 7 subagents
5. Tool resolver with unified catalog — verified recommendations for built-in, function, HTTP, MCP, and agent-as-tool types
6. Modular install with capability tiers (core/deploy/test/full) — API key validation, MCP auto-registration for V2.0

**Tech debt accepted:** 8 non-blocking items (see v0.3-MILESTONE-AUDIT.md)
**Archive:** `milestones/v0.3-ROADMAP.md`, `milestones/v0.3-REQUIREMENTS.md`

---
