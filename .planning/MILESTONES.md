# Milestones

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
