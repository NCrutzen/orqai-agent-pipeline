# Roadmap: Agent Workforce

## Overview

Browser-based interface for creating, deploying, testing, and iterating AI agent swarms on Orq.ai. Non-technical colleagues describe a use case and watch agents get designed, deployed, and tested -- with a real-time dashboard, node graph visualization, and HITL approval workflows. V4.0 adds a browser automation builder so that agents can interact with no-API systems (NXT, iController, Intelly) -- users upload SOPs and screenshots, AI generates and tests Playwright scripts on Browserless.io, and verified scripts deploy as MCP tools attached to agents. V6.0 adds an executive-facing management dashboard with 360-degree data integration (Agent Workforce + Zapier + Orq.ai), full UI redesign for CEO/CTO/CFO audience, and O365 SSO. V7.0 transforms the app into a cinematic swarm operating system with real-time delegation graphs, AI briefings, Kanban job tracking, and a new glassmorphism design system. CLI skills for technical users are available separately in the orqai-agent-pipeline repo.

## Milestones

| Version | Milestone | Status |
|---------|-----------|--------|
| **v0.3** | Core Pipeline + V2.0 Foundation -- V1.0 spec generation + V2.0 install infrastructure | **Shipped 2026-03-01** |
| **V2.0** | Autonomous Orq.ai Pipeline -- deploy, test, iterate, and harden agent swarms via MCP/API | **Shipped 2026-03-02** |
| **V2.1** | Experiment Pipeline Restructure -- rewrite test/iterate with native MCP, smaller subagents | **Shipped 2026-03-13** |
| **V3.0** | Web UI & Dashboard -- browser-based pipeline with authentication, real-time visibility, node graph, HITL approvals | **In Progress** |
| **V4.0** | Browser Automation Builder -- SOP + screenshots to MCP tools for no-API systems via Browserless.io | **Defined** |
| **V5.0** | Cross-Swarm Intelligence -- ecosystem mapping, drift detection, overlap analysis, and fix proposals | **Defined** |
| **V6.0** | Executive Dashboard & UI Revamp -- 360-degree management dashboard, UI redesign, O365 SSO | **Partially Complete** |
| **V7.0** | Agent OS -- cinematic swarm operating view with new design system, real-time data, AI briefings, delegation graphs | **In Progress** |

---

<details>
<summary>v0.3 Core Pipeline + V2.0 Foundation (Phases 1-05.2) -- SHIPPED 2026-03-01</summary>

**11 phases, 28 plans, 50 requirements satisfied**
**Full archive:** `milestones/v0.3-ROADMAP.md` | `milestones/v0.3-REQUIREMENTS.md`

- [x] Phase 1: Foundation -- References, templates, architect subagent (completed 2026-02-24)
- [x] Phase 2: Core Generation Pipeline -- 5 subagents: researcher, spec-gen, orch-gen, dataset-gen, readme-gen (completed 2026-02-24)
- [x] Phase 3: Orchestrator and Adaptive Pipeline -- Orchestrator wiring with adaptive depth (completed 2026-02-24)
- [x] Phase 4: Distribution -- Install script, update command, GSD integration (completed 2026-02-24)
- [x] Phase 04.1: Discussion Step -- Structured gray area surfacing (completed 2026-02-24)
- [x] Phase 04.2: Tool Selection & MCP Servers -- Tool resolver + unified catalog (completed 2026-02-24)
- [x] Phase 04.3: Prompt Strategy -- XML-tagged, context-engineered instructions (completed 2026-02-24)
- [x] Phase 04.4: KB-Aware Pipeline -- End-to-end knowledge base support (completed 2026-02-26)
- [x] Phase 5: References, Install, Capability Infrastructure -- V2.0 references + modular install (completed 2026-03-01)
- [x] Phase 05.1: Fix Distribution Placeholders -- OWNER/REPO to NCrutzen/orqai-agent-pipeline (completed 2026-03-01)
- [x] Phase 05.2: Fix Tool Catalog & Pipeline Wiring -- Memory tool identifiers + research brief wiring (completed 2026-03-01)

</details>

<details>
<summary>V2.0 Autonomous Orq.ai Pipeline (Phases 6-11) -- SHIPPED 2026-03-02</summary>

**7 phases, 11 plans, 23 requirements satisfied**
**Full archive:** `milestones/V2.0-ROADMAP.md` | `milestones/V2.0-REQUIREMENTS.md`

- [x] Phase 6: Orq.ai Deployment -- Deployer subagent, MCP/REST adapter, idempotent deploy (completed 2026-03-01)
- [x] Phase 7: Automated Testing -- Tester subagent, dataset pipeline, evaluator selection, 3x experiments (completed 2026-03-01)
- [x] Phase 7.1: Test Pipeline Tech Debt -- SDK-to-REST mapping, package declaration, template cleanup (completed 2026-03-01)
- [x] Phase 8: Prompt Iteration Loop -- Iterator subagent, diagnosis, proposals, HITL approval, audit trail (completed 2026-03-01)
- [x] Phase 9: Guardrails and Hardening -- Hardener subagent, guardrail promotion, quality gates, --agent flags (completed 2026-03-01)
- [x] Phase 10: Fix Holdout Dataset Path -- Holdout dataset ID alignment, step label fixes (completed 2026-03-02)
- [x] Phase 11: Flag Conventions + Tech Debt -- Flag alignment, step renumbering, files_to_read fixes (completed 2026-03-02)

</details>

<details>
<summary>V2.1 Experiment Pipeline Restructure (Phases 26-33) -- SHIPPED 2026-03-13</summary>

**8 phases, 9 plans, 24 requirements satisfied**
**Full archive:** `milestones/V2.1-ROADMAP.md` | `milestones/V2.1-REQUIREMENTS.md`

- [x] Phase 26: Dataset Preparer -- MCP/REST upload, smoke test, stratified splits, JSON contract (completed 2026-03-11)
- [x] Phase 27: Experiment Runner -- REST-only execution, adaptive polling, holdout mode (completed 2026-03-11)
- [x] Phase 28: Results Analyzer -- Student's t statistics, category slicing, hardener compatibility (completed 2026-03-12)
- [x] Phase 29: Test Command Rewrite -- 3-subagent orchestration with validation gates (completed 2026-03-12)
- [x] Phase 30: Failure Diagnoser -- Evaluator-to-section mapping, diff proposals, HITL approval (completed 2026-03-12)
- [x] Phase 31: Prompt Editor -- Section-level changes, re-deploy delegation, score comparison (completed 2026-03-12)
- [x] Phase 32: Iterate Command Rewrite -- 2-subagent loop with 5 stop conditions (completed 2026-03-13)
- [x] Phase 33: Fix Iteration Pipeline Wiring -- Holdout schema path + mcp_available forwarding (completed 2026-03-13)

</details>

### Phase 38.1: Full Pipeline Lifecycle
**Goal**: Users can deploy designed agent swarms to Orq.ai, run automated tests, iterate on prompt quality based on test results, and harden agents with production guardrails — all from the web UI
**Depends on**: Phase 37.1 (uses conversational pipeline, chat UI, streaming narrator)
**Requirements**: DEPLOY-WEB-01 through DEPLOY-WEB-04, TEST-WEB-01 through TEST-WEB-04, ITER-WEB-01 through ITER-WEB-03, HARD-WEB-01
**Success Criteria** (what must be TRUE):
  1. After specs are generated, the pipeline deploys agents to Orq.ai via MCP/REST and shows deployment status in the chat
  2. User can trigger automated testing — datasets are prepared, experiments run 3x, results analyzed with statistical summaries
  3. When tests reveal failures, the pipeline diagnoses issues, proposes prompt fixes, and asks user for approval before applying
  4. User can apply guardrails (promoted from test evaluators) to harden production agents
  5. The iterate loop (diagnose → fix → re-deploy → re-test) runs up to 5 times or until the user is satisfied
**Plans**: 3 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 38.1 to break down)

**Pipeline stages to add (9 agents from orqai-agent-pipeline repo):**
| Stage | Agent File | Purpose |
|-------|-----------|---------|
| deployer | deployer.md | Deploy agents, tools, KBs to Orq.ai via MCP/REST |
| dataset-preparer | dataset-preparer.md | Prepare, augment, and upload test datasets |
| experiment-runner | experiment-runner.md | Run 3x experiments with evaluator selection |
| results-analyzer | results-analyzer.md | Statistical analysis of experiment results |
| tester | tester.md | Orchestrate the full test pipeline (dataset → experiment → analysis) |
| failure-diagnoser | failure-diagnoser.md | Map test failures to specific prompt sections |
| prompt-editor | prompt-editor.md | Apply approved prompt changes and re-deploy |
| iterator | iterator.md | Orchestrate diagnose → fix → re-test loop |
| hardener | hardener.md | Promote test evaluators to production guardrails |

### Phase 43: Upstream Sync: orq-agent-pipeline -> agent-workforce

**Goal:** Implement a formal sync workflow so that future changes to agent prompts, new agents, or structural changes in the orqai-agent-pipeline GitHub repo are automatically detected and propagated to the web pipeline — no manual discovery needed
**Requirements**: (1) Pipeline manifest tracking expected file paths, input context tags, and output format contracts (2) Change detection that classifies upstream diffs by impact tier (transparent / monitor / review / code-change) (3) Auto-update PIPELINE_STAGES + STAGE_CONTEXT_MAP when agents are added/removed/renamed (4) GitHub webhook or scheduled check that creates issues/PRs for breaking changes (5) Dashboard UI showing sync status and pending upstream changes
**Depends on:** Phase 38.1 (all agents must be in the pipeline before sync can track them)
**Plans:** 3 plans

Plans:
- [ ] 43-01-PLAN.md -- Manifest JSON + types, refactor stages.ts and pipeline.ts to be manifest-driven
- [ ] 43-02-PLAN.md -- Upstream sync detection (Vercel Cron, GitHub Trees API, tier classification, issue/PR creation), health dashboard Pipeline Sync UI
- [ ] 43-03-PLAN.md -- Systems context passthrough (serialize DB systems to markdown, inject into architect stage)

### Phase 55: Debtor-email pipeline hardening

**Goal:** Production-harden de debtor-email pipeline zodat het intent + copy-document swarm veilig alle 6 debtor-mailboxen kan bedienen. Scope: (a) vervang hardcoded `ICONTROLLER_COMPANY` in cleanup-worker / catchup / review-actions door per-row `mailbox_id` uit `debtor.labeling_settings`; (b) createIcontrollerDraft idempotency + HTML-comment operator marker + cleanup (swarm launch blocker); (c) review-lane provenance chips + Zapier whitelist intra-company forwards + `skipped_not_whitelisted → status=skipped` hygiene + generieke verdict-route `/automations/review/[runId]`; (d) `public.agent_runs` schema met `swarm_type` discriminator + `body_version`/`intent_version` + minimale 👍/👎 verdict-UI (self-training Phase 1 hooks).
**Requirements**: See `.planning/phases/55-debtor-email-pipeline-hardening/55-CONTEXT.md` and source todos: `2026-04-23-cleanup-worker-multi-mailbox.md`, `2026-04-23-create-draft-idempotency-and-cleanup.md`, `2026-04-23-debtor-review-pipeline-provenance-and-scoping.md`, `2026-04-23-self-training-loop-debtor-email-swarm.md` §Phase 1
**Depends on:** Phase 54
**Blocker for:** copy-document swarm production launch (alle mailboxen behalve Smeba)
**Plans:** 5 plans

Plans:
- [ ] 55-01-PLAN.md — Wave 0: public.agent_runs migration + icontroller_drafts sentinel + labeling_settings.icontroller_mailbox_id + vitest scaffolding + 10 test stubs
- [ ] 55-02-PLAN.md — Multi-mailbox resolver: per-row mailbox_id in cleanup-worker / catchup / review-actions; EmailIdentifiers contract swap; ingest route writes icontroller_mailbox_id
- [ ] 55-03-PLAN.md — createIcontrollerDraft idempotency (sentinel row) + HTML-comment operator marker + orphan reconcile in cleanup-worker
- [ ] 55-04-PLAN.md — Review-lane provenance chips (7 triggers) + skipped_not_whitelisted hygiene + generic /automations/review/[runId] route + POST /api/automations/debtor/verdict
- [ ] 55-05-PLAN.md — agent_runs writers → public.agent_runs with swarm_type discriminator + git-sha versioning + context jsonb migration

### Phase 56: iController auto-labeling van accounts aan emails

**Goal:** Inbound debtor-emails in iController automatisch labelen aan het juiste debiteur-account na de cleanup-stap. Per mailbox aan/uit via Zapier; onbekende mails blijven onaangeroerd. Scope: Supabase migratie uitvoeren, NXT invoice→debtor lookup via Zapier (whitelisted IP), sender→debtor fallback, LLM tiebreaker voor ambigue matches, iController label-DOM probe, Browserless label-module, Zapier Zaps per mailbox (6 entities: smeba=4, smeba-fire=5, firecontrol=12, sicli-noord=15, sicli-sud=16, berki=171), dry-run review + flip naar live.
**Requirements**: See todo `2026-04-23-debtor-email-auto-labeling-in-icontroller.md`
**Depends on:** Phase 54 (independent van 55 — eigen code-pad)
**Plans:** 9 plans

Plans:
- [ ] 56-00-PLAN.md — Wave 0: additive migration + 9 vitest scaffolds + probe-script source + NXT-Zap client + LLM tiebreaker + resolve-debtor + label-module skeleton + flip-cron skeleton
- [ ] 56-01-PLAN.md — [BLOCKING] Apply Phase 56 additive migration to live Supabase (mirror of 60-01)
- [ ] 56-02-PLAN.md — [BLOCKING] Confirm NXT contactperson schema + deploy generic NXT-lookup Zap + set Vercel env vars + 5-brand smoke test
- [ ] 56-03-PLAN.md — [BLOCKING] Run probe-label-ui.ts on production iController + curate SELECTORS.md
- [ ] 56-04-PLAN.md — Refactor route.ts to sender-first 4-layer pipeline + always-write email_labels + agent_runs telemetry + broadcast
- [ ] 56-05-PLAN.md — Implement label-email-in-icontroller.ts with probe-confirmed selectors + wire route dispatch
- [ ] 56-06-PLAN.md — Dashboard /automations/debtor-email-labeling: page + counts hook + row list + drawer + approve/reject server actions
- [ ] 56-07-PLAN.md — Implement labeling-flip-cron evaluateMailbox + pickAction + register in Inngest manifest (shadow-mode default)
- [ ] 56-08-PLAN.md — [calendar-soft] Smeba canary review + flip LABELING_CRON_MUTATE=true; per-mailbox rollout checklist

### Phase 57: v7 review dashboard polish

**Goal:** Job-detail drawer bouwen voor v7 kanban cards en screenshot-rendering fixen. Scope: (a) `kanban-job-card.tsx` click → `JobDrawerContext` drawer (header, timeline van log-entries, linked automation_runs, screenshots); (b) `extractScreenshots` in `web/lib/automations/types.ts` fixen — data is `{url, path}`-shape, niet `string`; public-bucket OR on-demand signed-URL refresh. Wacht op Phase 55 (backend stabiel) voordat UI-polish zin heeft.
**Requirements**: See todos `2026-04-23-v7-review-dashboard-card-popout-missing.md`, `2026-04-23-v7-review-screenshots-not-rendering.md`
**Depends on:** Phase 55
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 57 to break down)

### Phase 59: Supabase realtime fan-out reduction

**Goal:** Get Supabase realtime messages back under cap (currently 6.5M / 5.5M; grace until 2026-05-26). Phase 58 attacked the upstream writes; Phase 59 attacks the subscription architecture so we don't grow back into the cap as automation volume scales.

**Depends on:** Phase 58 (cron windowing — completed).
**Plans:** 3/3 plans complete

Plans:
- [x] 59-01-PLAN.md — agent_events postgres_changes → batched broadcast + refetch (decision #1)
- [x] 59-02-PLAN.md — automation_runs unfiltered subscription → broadcast-driven refetch (decision #2)
- [x] 59-03-PLAN.md — Pipeline broadcast coalescing → 500ms debounce in broadcast.ts (decision #3)

### Phase 58: Inngest cron cost optimization (Shipped 2026-04-26)

**Goal:** Bring Inngest free-tier usage back under 50k runs/mo after dual billing alerts (Inngest 42k/50k mid-month, Supabase 6.5M/5.5M realtime messages). Window high-frequency crons to business hours (06:00–19:58 Europe/Amsterdam, Mon–Fri) and pause `orqai-trace-sync` entirely while Executive Dashboard work is on hold.

**Outcome:** Cron-only baseline cut from ~97,600/mo → ~25,000/mo (74% reduction). Bridge cadence 1 min → 2 min within window. orqai-trace-sync converted to event-trigger (`analytics/orqai-trace-sync.run`) so it can be invoked manually when dashboard work resumes.

**Plans:** 58-01 (single atomic edit across 4 Inngest functions).

### Phase 60: Debtor email — close the whitelist-gate loop: data-driven AUTO_ACTION_RULES with Wilson-CI auto-promotion cron + queue-driven Bulk Review UI reading automation_runs status=predicted directly

**Goal:** Replace the 6-rule hardcoded AUTO_ACTION_RULES Set with a cross-swarm data-driven classifier-rules engine: `public.classifier_rules` table + 60s in-memory cache, daily Inngest cron computing Wilson 95% CI-lo per rule and (post-flip) auto-promoting/demoting with hysteresis, plus a queue-driven Bulk Review UI that reads `automation_runs WHERE status=predicted` directly via topic→entity→mailbox tree-nav with cursor pagination and a race-cohort bulk-clear affordance.
**Requirements**: D-00..D-29 from `60-CONTEXT.md` (locked decisions; cross-referenced in each plan's `requirements` field)
**Depends on:** Phase 59
**Plans:** 8 plans

Plans:
- [ ] 60-00-PLAN.md — Wave 0 scaffold: 7 SQL migrations (public.agent_runs rename absorbing 55-05 + 4 classifier tables + RPC + view), classifier library (types/wilson/cache/read), 10 vitest stub files
- [ ] 60-01-PLAN.md — [BLOCKING] Schema push of all 7 Wave 0 migrations to live Supabase (autonomous: false — Management API token may be expired)
- [ ] 60-02-PLAN.md — classifier-backfill Inngest one-shot + ingest-route refactor (readWhitelist cache + typed columns on every automation_runs insert + classify.ts UNCHANGED)
- [ ] 60-03-PLAN.md — classifier-promotion-cron daily at TZ=Europe/Amsterdam 0 6 * * 1-5 with shadow-mode flag (CLASSIFIER_CRON_MUTATE) + manual_block exception
- [ ] 60-04-PLAN.md — /automations/classifier-rules cross-swarm dashboard (page + 5 components + Block/Unblock server actions, shadow banner, ci_lo sparkline)
- [ ] 60-05-PLAN.md — Queue UI rewrite: page.tsx (RPC counts + cursor pagination) + queue-tree (3-level URL-driven) + predicted-row-list/item + race-cohort-banner
- [ ] 60-06-PLAN.md — actions.ts rewrite (verdict-write only) + classifier-verdict-worker (event-trigger, split step.run for categorize/archive/iController-delete-via-cleanup-queue)
- [ ] 60-07-PLAN.md — Post-shadow cleanup: drop FALLBACK_WHITELIST after 1-day clean run + flip CLASSIFIER_CRON_MUTATE=true after 14-day shadow review (autonomous: false)

### Phase 61: Restore lost bulk-review UX (60-05 regression fix): horizontal overflow, missing email-body expander, missing per-row notes, missing rule-hint dropdown / per-item override. Reintroduce these on top of the new tree-driven shell — don't revert 60-05's data-driven architecture.

**Goal:** Restore the four UX features lost in the Phase 60-05 rewrite (email-body expander, override dropdown, per-row notes, page-scoped keyboard shortcuts) and fix horizontal overflow with a 3-column max-w-[1600px] layout — without reverting 60-05'''s data-driven tree architecture.
**Requirements**: See `61-CONTEXT.md` (D-LAYOUT-3COL, D-DETAIL-PANE, D-DETAIL-BODY-LAZY, D-DETAIL-OVERRIDE, D-DETAIL-NOTES, D-KEYBOARD-SHORTCUTS, D-AUTO-ADVANCE, D-TREE-PENDING-SIBLING, D-PERSIST-OVERRIDE, D-PERSIST-NOTES, D-FETCH-EMAIL-BODY, D-LABEL-ONLY-SKIP, plus 4 polish requirements)
**Depends on:** Phase 60
**Plans:** 3 plans

Plans:
- [x] 61-01-PLAN.md — Extend recordVerdict (override+notes, zod) + re-add fetchReviewEmailBody + 2 vitest files
- [x] 61-02-PLAN.md — 3-col layout + page.tsx ?selected loader + rename row-list/row-strip (no buttons) + new detail-pane + new keyboard-shortcuts + queue-tree summary header + Pending sibling node
- [x] 61-03-PLAN.md — Visual polish (Lucide audit, min-w-0 sweep, kbd styling) + 33-item manual UAT checkpoint

---

## Phases

### V3.0 Web UI & Dashboard (Phases 34-38)

**Milestone Goal:** Build a browser-based interface so non-technical colleagues can create, deploy, test, and iterate agent swarms on Orq.ai -- with authentication, real-time dashboard, node graph visualization, and HITL approval workflows.

- [x] **Phase 34: Foundation & Auth** - Next.js app shell, Supabase DB schema with RLS, Supabase auth (email/password, M365 SSO), project CRUD (completed 2026-03-20)
- [x] **Phase 35: Pipeline Engine** - Prompt adapter, Inngest durable functions, pipeline state machine, use case input form, run list (completed 2026-03-22)
- [x] **Phase 36: Dashboard & Graph** - Real-time progress timeline, log stream, run list updates, interactive node graph with execution overlay (completed 2026-03-23)
- [ ] **Phase 37: HITL Approval** - Pipeline pause/resume, diff viewer, approve/reject flow, email notifications, audit trail
- [ ] **Phase 37.1: Conversational Pipeline** - Streaming chat interface, discussion phase, architect/spec review with user interaction, narrator summaries, chat UI with user input
- [ ] **Phase 38: Swarm Activation** - Webhook endpoints for external pipeline triggering with API key auth and status polling
- [ ] **Phase 38.1: Full Pipeline Lifecycle** - Add deploy, test, iterate, and harden stages to web pipeline (9 agents: deployer, dataset-preparer, experiment-runner, results-analyzer, tester, failure-diagnoser, prompt-editor, iterator, hardener)

### V4.0 Browser Automation Builder (Phases 39-42)

**Milestone Goal:** Add a browser automation builder to the pipeline so agents can interact with no-API systems (NXT, iController, Intelly) -- users upload SOPs and screenshots, AI analyzes and generates Playwright scripts, scripts are tested on Browserless.io, and verified automations deploy as MCP tools attached to agents. Standalone automations and scheduling extend the capability beyond the agent pipeline.

- [ ] **Phase 39: Infrastructure & Credential Foundation** - Browserless.io connectivity, Supabase Storage for uploads, MCP adapter route, credential vault with encrypted storage
- [ ] **Phase 40: Detection, SOP Upload & Vision Analysis** - No-API system detection, SOP/screenshot upload wizard, AI vision analysis via Orq.ai, annotated step confirmation with user
- [ ] **Phase 41: Script Generation, Testing & MCP Deployment** - Playwright script generation, Browserless.io execution with Session Replay, iterative test-fix loop, MCP tool deployment and agent attachment
- [ ] **Phase 42: Standalone Automations & Triggers** - Standalone automation creation (conversational and SOP-based), dashboard management, scheduling, webhooks, Zapier integration

### V6.0 Executive Dashboard & UI Revamp (Phases 44-47)

**Milestone Goal:** Transform the Agent Workforce app into an executive-worthy platform with a 360-degree management dashboard showing ROI, activity, and health metrics across all automation types -- pulling data from Agent Workforce, Zapier (browser scraper), and Orq.ai analytics (API). Full UI redesign for CEO/CTO/CFO audience. O365 SSO for Microsoft 365 login.

- [x] **Phase 44: Project Model & Data Collection** - Extended project model (status lifecycle, automation type), Zapier browser scraper, Orq.ai analytics collector, snapshot tables, status badges on project cards (completed 2026-03-28)
- [x] **Phase 45: Executive Dashboard** - KPI summary cards, activity trend charts, project status breakdown, ROI estimates, health indicators, dashboard aggregator, sub-100ms from pre-computed snapshots (completed 2026-03-30)
- [ ] **Phase 46: Status Monitoring & O365 SSO** - Automated forward status transitions, suggest-only backward transitions, status history audit trail, Azure AD OAuth login alongside email/password
- [ ] **Phase 47: UI Redesign & Polish** - Brand colors and typography from moyneroberts.com, consistent design system, sidebar polish, grid layout, dark mode toggle, responsive tablet/desktop

### V7.0 Agent OS (Phases 48-54)

**Milestone Goal:** Transform the Agent Workforce app into a cinematic swarm operating system where management sees every swarm, agent, and job in action -- powered by a new glassmorphism design system, Supabase Realtime data pipeline, AI narrative briefings, live delegation graphs, and Kanban job tracking. O365 SSO for frictionless executive access.

- [x] **Phase 48: Foundation** - Design system (Satoshi + Cabinet Grotesk, glassmorphism tokens, dark/light toggle), new Supabase tables (agent_events, swarm_jobs, swarm_agents), Azure AD OAuth SSO with account linking (code-complete 2026-04-16; SSO human-verify deferred pending Azure AD tenant)
- [x] **Phase 49: Navigation & Realtime** - Sidebar with dynamic swarm list, /swarm/[swarmId] routing, single Realtime subscription per swarm view, useRealtimeTable hook (code-complete 2026-04-16; browser-based navigation + channel teardown verification deferred)
- [x] **Phase 50: Data Pipeline** - Inngest orqai-trace-sync cron, Orq.ai trace-to-agent_events mapping, Supabase caching layer, rate limit handling (code-complete 2026-04-16; migration apply + end-to-end verify deferred pending Management API token)
- [x] **Phase 51: Hero Components** - Subagent fleet cards with state badges and metrics, AI narrative briefing panel with Orq.ai Briefing Agent, agent detail drawer with communication timeline (code-complete 2026-04-16; browser verification deferred pending fixture apply + ORQ_API_KEY runtime)
- [x] **Phase 52: Live Interactivity** - Claude-style terminal event stream with ring buffer, 5-column Kanban board with dnd-kit drag-and-drop, smart sidebar filters (code-complete 2026-04-16; 10-row swarm_jobs fixture APPLIED via Management API; browser walkthrough deferred)
- [x] **Phase 53: Advanced Observability** - Live delegation graph with CSS-animated particles, Gantt-style swimlane timeline per agent (code-complete 2026-04-16; cross-agent fixture APPLIED via Management API; browser walkthrough deferred)
- [x] **Phase 54: Polish** - Migrate executive dashboard, projects page, and settings page to V7 design tokens

<details>
<summary>V5.0 Cross-Swarm Intelligence -- DEFINED</summary>

Phase numbers TBD (after V4.0 phases are finalized).

- [ ] Ecosystem Foundation -- Unified inventory of all swarms from local specs and live Orq.ai state
- [ ] Drift Detection -- Field-by-field comparison between spec and deployed state
- [ ] Overlap & Gap Analysis -- Semantic role overlap, tool duplication, blind spot identification
- [ ] Fix Proposals -- Structured fix proposals with diff previews, risk classification, HITL approval

</details>

## Phase Details

### Phase 34: Foundation & Auth
**Goal**: Users can securely sign in and organize pipeline work into projects with colleague access
**Depends on**: Nothing (first V3.0 phase)
**Requirements**: FOUND-01, FOUND-02, PROJ-01, PROJ-02, PROJ-03, PROJ-04
**Success Criteria** (what must be TRUE):
  1. User can sign in with email/password and reach the app dashboard
  2. User can create a named project and invite colleagues to it
  3. User only sees projects they belong to -- no cross-project data leakage
**Deferred**: M365 SSO (FOUND-01, FOUND-02) moved to future phase -- Azure AD integration removed during development
**Plans**: 3 plans

Plans:
- [x] 34-01-PLAN.md -- App scaffold, Supabase auth (email/password, M365 SSO future), proxy.ts, DB schema with RLS
- [x] 34-02-PLAN.md -- Project list home page, create project modal, invite flow (AD + email), project detail
- [x] 34-03-PLAN.md -- Checkpoint: verify auth flow, tenant restriction, project CRUD, invitation

### Phase 35: Pipeline Engine
**Goal**: Users can submit a use case description and watch it execute as a durable pipeline that survives server restarts and recovers from failures
**Depends on**: Phase 34
**Requirements**: FOUND-03, FOUND-04, FOUND-05, PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05
**Success Criteria** (what must be TRUE):
  1. User can type a use case description and click one button to start the pipeline
  2. Pipeline executes via Inngest durable functions (not API routes) and completes end-to-end
  3. User can see a list of their pipeline runs with current status and timestamps
  4. User can retry a failed pipeline from the exact step that failed (not from scratch)
  5. Pipeline errors display plain-English messages (not stack traces) with a retry button
**Plans**: 4 plans

Plans:
- [x] 35-01-PLAN.md -- Database schema (pipeline_runs/steps/files), Inngest setup, prompt adapter, stage definitions, error mapper
- [x] 35-02-PLAN.md -- Pipeline durable function (Inngest step-per-stage), server action to trigger runs, retry-from-failed-step
- [x] 35-03-PLAN.md -- New run form (use case textarea, file upload), run detail page (step timeline, expandable logs, retry)
- [x] 35-04-PLAN.md -- Run list UI (project tabs, global runs page, run cards), end-to-end verification checkpoint

### Phase 36: Dashboard & Graph
**Goal**: Users have real-time visibility into pipeline execution through a live timeline, log stream, and interactive agent swarm graph
**Depends on**: Phase 35
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04
**Success Criteria** (what must be TRUE):
  1. User sees pipeline steps complete in real time without refreshing the page (via Supabase Broadcast)
  2. User sees a vertical timeline of pipeline steps with human-readable descriptions and state indicators
  3. Run list page updates automatically when any pipeline run changes status
  4. User sees an interactive node graph showing agents, their roles, and tool connections
  5. Graph nodes light up during execution and display performance scores after completion
**Plans**: 4 plans

Plans:
- [x] 36-00-PLAN.md -- Wave 0: test infrastructure (vitest jsdom config, 5 test stub files for Nyquist compliance)
- [x] 36-01-PLAN.md -- Broadcast infrastructure, graph-mapper utility, pipeline Broadcast emissions, npm deps install
- [x] 36-02-PLAN.md -- React Flow graph components (AgentNode, AnimatedEdge, dagre layout, AgentDetailPanel, SwarmGraph wrapper with celebration)
- [x] 36-03-PLAN.md -- Page integration (graph-primary run detail, Sheet timeline drawer, live run list, Swarm Graph tab), verification checkpoint

### Phase 37: HITL Approval
**Goal**: Users can review, approve, or reject proposed prompt changes from the pipeline with full context and audit trail
**Depends on**: Phase 36
**Requirements**: HITL-01, HITL-02, HITL-03, HITL-04, HITL-05, HITL-06
**Success Criteria** (what must be TRUE):
  1. Pipeline pauses automatically when prompt changes are proposed and user sees a pending approval
  2. User sees a diff view with plain-English explanation of what changed and why
  3. User can approve or reject with an optional comment, and the pipeline resumes automatically
  4. User receives an email notification when an approval is waiting for them
  5. All approval decisions are logged with timestamp, user identity, and comment (audit trail)
**Plans**: 4 plans

Plans:
- [ ] 37-00-PLAN.md -- Wave 0: test stubs (6 test files), npm install (react-diff-viewer-continued, resend)
- [ ] 37-01-PLAN.md -- DB schema (approval_requests), Inngest events, Broadcast extension, approval helpers, pipeline waitForEvent integration
- [ ] 37-02-PLAN.md -- Approval UI (DiffViewer, ApprovalPanel, ApprovalBadge), StepStatusBadge + StepLogPanel waiting state, RunDetailClient wiring
- [ ] 37-03-PLAN.md -- Email notifications (Resend), audit trail UI (ApprovalHistory), graph node waiting state, end-to-end verification

### Phase 37.1: Conversational Pipeline
**Goal**: The pipeline is a streaming conversation -- an AI narrator asks clarifying questions, explains what it's designing, shows results, and gets user feedback at key decision points, mirroring the CLI skill experience
**Depends on**: Phase 37 (uses HITL approval infrastructure, terminal panel, broadcast)
**Requirements**: UAT-DIALOGUE, UAT-DISCUSSION, UAT-STREAMING
**Success Criteria** (what must be TRUE):
  1. User sees a streaming chat conversation in the run detail page, not just status cards
  2. Before the pipeline runs, a discussion phase asks clarifying questions about the use case (multi-turn)
  3. After the architect stage, user sees a conversational summary of the designed swarm and can confirm or give feedback
  4. After the spec-generator stage, user sees spec highlights and can approve or request changes
  5. Silent stages (tool-resolver, researcher, etc.) show brief status messages in the chat without extra API calls
  6. User has a text input field to respond at interaction points, and the pipeline resumes based on their response
**Plans**: 4 plans

Plans:
- [ ] 37.1-01-PLAN.md -- DB schema (pipeline_chat_messages), types, Inngest event, broadcast chat-token helpers, discussion server action
- [ ] 37.1-02-PLAN.md -- Streaming narrator module, discussion agent module, pipeline.ts modifications (discussion loop, narrator interjections, template messages)
- [ ] 37.1-03-PLAN.md -- Chat UI components (ChatMessageBubble, ChatInput, ChatPanel with RAF token accumulation, StageProgressBar)
- [ ] 37.1-04-PLAN.md -- RunDetailClient wiring (ChatPanel replaces TerminalPanel, server page hydration, server action dispatch), end-to-end verification

### Phase 38: Swarm Activation
**Goal**: External systems can trigger pipeline runs and check status via authenticated webhook endpoints
**Depends on**: Phase 35
**Requirements**: ACTV-01, ACTV-02, ACTV-03, ACTV-04
**Success Criteria** (what must be TRUE):
  1. Each deployed swarm has a unique webhook URL that external systems can call
  2. Webhook requests without a valid API key are rejected
  3. A webhook call starts the full pipeline and returns a run ID for tracking
  4. External systems can poll the run ID to check pipeline status and completion
**Plans**: 3 plans

Plans:
- [ ] 38-01: TBD

### Phase 39: Infrastructure & Credential Foundation
**Goal**: The platform has verified connectivity to Browserless.io, secure credential storage, file upload infrastructure, and an MCP tool hosting route -- all validated before any automation features are built
**Depends on**: Phase 35 (uses Inngest pipeline, Supabase DB, Next.js API routes)
**Requirements**: CRED-01, CRED-02, CRED-03, CRED-04
**Success Criteria** (what must be TRUE):
  1. User can store credentials for a target system and see them listed (names only, values hidden) in the web app
  2. Stored credentials can be injected into a Browserless.io script execution without exposing them in logs or client-side code
  3. User receives a reminder notification when stored credentials are approaching their rotation date
  4. Different target systems can use different authentication methods (username/password, SSO token, certificate) via per-system auth profiles
  5. Browserless.io connectivity, Supabase Storage uploads, and MCP adapter route all respond successfully from an Inngest step (infrastructure smoke test)
**Plans**: 3 plans

Plans:
- [ ] 39-00-PLAN.md -- Wave 0: npm install (mcp-handler, @modelcontextprotocol/sdk, playwright-core), TypeScript types, DB schema, test stubs
- [ ] 39-01-PLAN.md -- Credential encryption (AES-256-GCM), proxy, failure detection, API routes, Inngest health check, MCP adapter route, email notification
- [ ] 39-02-PLAN.md -- Full UI layer: settings page with tabs, credential CRUD (list/create/replace/delete), auth type selector, health dashboard with Broadcast, project credential linking, sidebar navigation

### Phase 40: Detection, SOP Upload & Vision Analysis
**Goal**: The pipeline detects when agents need browser automation, guides users through SOP and screenshot upload, and uses AI vision to build a confirmed step-by-step understanding of the target process
**Depends on**: Phase 39
**Requirements**: DETECT-01, DETECT-02, DETECT-03, DETECT-04, DETECT-05, VISION-01, VISION-02, VISION-03, VISION-04, VISION-05
**Success Criteria** (what must be TRUE):
  1. Pipeline automatically identifies when a designed agent targets a no-API system and activates the automation builder -- and skips it when the target system has an API
  2. User can upload an SOP document (Word or PDF) and screenshots of the target system through a guided wizard that validates completeness
  3. AI analyzes uploaded screenshots via Orq.ai (Agent or AI Routing) and presents annotated screenshots with highlighted UI elements back to the user
  4. AI parses the SOP document and correlates each step with specific elements identified in the screenshots
  5. User can confirm or correct the AI's interpretation of each step, and the AI incorporates corrections into its updated understanding
**Plans**: 5 plans

Plans:
- [ ] 40-00-PLAN.md -- Wave 0: test stub files (4 test files for Nyquist compliance: automation-detector, vision-adapter, annotation-highlight, upload)
- [ ] 40-01-PLAN.md -- DB schema (systems, system_project_links, automation_tasks), TypeScript types, npm install (react-markdown, remark-gfm), pipeline constants, events, systems registry UI
- [ ] 40-02-PLAN.md -- Terminal interaction panel (replaces Sheet drawer), card-based entry rendering, approval migration, extended status badge, RunDetailClient rewrite
- [ ] 40-03-PLAN.md -- Automation detector Inngest step, vision adapter (Orq.ai multimodal), pipeline branch, SOP upload/paste UI, screenshot upload with signed URLs
- [ ] 40-04-PLAN.md -- Annotation review overlay (full-width Dialog), side-by-side SOP + screenshots, per-step confirm/edit, CSS overlay highlights, re-analysis with corrections

### Phase 41: Script Generation, Testing & MCP Deployment
**Goal**: AI generates Playwright scripts from confirmed automation steps, tests them on Browserless.io with user-visible Session Replay, iterates until stable, and deploys verified scripts as MCP tools attached to the target Orq.ai agent
**Depends on**: Phase 40
**Requirements**: SCRIPT-01, SCRIPT-02, SCRIPT-03, SCRIPT-04, SCRIPT-05, SCRIPT-06, SCRIPT-07, SCRIPT-08, MCPTL-01, MCPTL-02, MCPTL-03
**Success Criteria** (what must be TRUE):
  1. AI generates a Playwright script using getByRole/getByText locators from the confirmed automation steps and executes it on Browserless.io
  2. User can watch a Session Replay recording of the test execution to see exactly what happened in the browser
  3. When a script fails, AI diagnoses the failure using DOM accessibility tree context and proposes fixes -- iterating up to 5 times or until the script stabilizes
  4. Auth state persists across test iterations via cookies/localStorage so the user does not need to re-authenticate the target system repeatedly
  5. Verified script deploys as an MCP tool on the Vercel deployment, automatically attaches to the Orq.ai agent, and the agent can successfully call the tool during execution
**Plans**: 3 plans

Plans:
- [ ] 41-01: TBD
- [ ] 41-02: TBD
- [ ] 41-03: TBD

### Phase 42: Standalone Automations & Triggers
**Goal**: Users can create and manage browser automations independently of the agent pipeline, with scheduling and external trigger capabilities for recurring execution
**Depends on**: Phase 41 (reuses script generation, testing, and deployment infrastructure)
**Requirements**: AUTO-01, AUTO-02, AUTO-03, AUTO-04, TRIG-01, TRIG-02, TRIG-03, TRIG-04
**Success Criteria** (what must be TRUE):
  1. User can create a browser automation directly from the dashboard without starting an agent pipeline run
  2. Simple automations can be described conversationally (no SOP or screenshots needed), while complex automations use the full SOP + screenshot flow
  3. User can view, edit, and delete their automations from a management dashboard
  4. User can schedule an automation to run on a recurring basis (daily, weekly, or custom cron) and trigger it via webhook
  5. Automation results are returned to the caller -- webhook response for direct triggers, callback URL for Zapier integration
**Plans**: 3 plans

Plans:
- [ ] 42-01: TBD
- [ ] 42-02: TBD

### Phase 44: Project Model & Data Collection
**Goal**: Every project has a status lifecycle and automation type classification, and data from Zapier (browser scraper) and Orq.ai (analytics API) accumulates in Supabase -- so the executive dashboard has real data to display from day one
**Depends on**: Phase 35 (uses Inngest, Supabase DB, Next.js API routes; also uses Browserless.io patterns from Phase 39)
**Requirements**: PEXT-01, PEXT-02, PEXT-03, DINT-01, DINT-02, DINT-03, DINT-04, DINT-05
**Success Criteria** (what must be TRUE):
  1. User can see status (idea/building/testing/live) and automation type (zapier-only/hybrid/standalone-app/orqai-agent) badges on project cards throughout the app
  2. Zapier analytics data (active zaps, task counts, success rates) is scraped via Browserless.io and stored in Supabase snapshots multiple times per day
  3. Zapier scraper includes validation that detects broken selectors or stale data and flags the issue instead of silently storing bad data
  4. Orq.ai analytics (usage, cost, latency, errors, agent performance) is collected via MCP analytics API and stored in Supabase snapshots on a schedule
  5. Both collectors run as Inngest cron functions and accumulate data independently of whether the dashboard UI exists yet
**Plans**: 3 plans

Plans:
- [x] 44-01-PLAN.md -- DB migration (project model extension + snapshot tables), TypeScript types, ProjectStatusBadge + AutomationTypeTag components, ProjectCard update
- [x] 44-02-PLAN.md -- Orq.ai analytics collector (Inngest hourly cron, MCP API, Zod validation, orqai_snapshots)
- [x] 44-03-PLAN.md -- Zapier analytics browser scraper (Inngest twice-daily cron, Browserless.io, multi-fallback selectors, validation layer, zapier_snapshots)

### Phase 45: Executive Dashboard
**Goal**: Executives (CEO/CTO/CFO) can open a single dashboard page and see a 360-degree overview of all automation activity, project health, ROI estimates, and trends -- loaded from pre-computed snapshots in under 100ms
**Depends on**: Phase 44 (data from all three sources must be accumulating)
**Requirements**: EDASH-01, EDASH-02, EDASH-03, EDASH-04, EDASH-05, EDASH-06, DINT-06
**Success Criteria** (what must be TRUE):
  1. Dashboard shows KPI summary cards with real data (total runs, success rate, active automations, estimated time saved)
  2. Dashboard shows activity trend charts (runs over time, broken down by source) using Recharts via shadcn chart components
  3. Dashboard shows project status breakdown by lifecycle stage (idea/building/testing/live) as a visual distribution
  4. ROI metrics are clearly labeled as "estimates" with distinct visual treatment separating measured from estimated data
  5. Health indicators show error rates and reliability trends per project with traffic-light status (green/yellow/red)
  6. Dashboard page loads in under 100ms by reading only from pre-computed `dashboard_snapshots` table, never querying external services directly
**Plans**: 3 plans

Plans:
- [x] 45-01-PLAN.md -- DB migration (dashboard_snapshots + ROI baselines), types, Zod schemas, health score, format utils, aggregator logic, Inngest cron, test stubs
- [ ] 45-02-PLAN.md -- npm install (recharts, date-fns), shadcn chart/select/table, KPI card components, dashboard page shell, sidebar nav, loading/empty states
- [ ] 45-03-PLAN.md -- Chart and table components (8 total), wire into page tab content, visual verification checkpoint

### Phase 46: Status Monitoring & O365 SSO
**Goal**: Project statuses stay accurate through automated monitoring that auto-applies forward transitions and suggests backward transitions, and users can sign in with their Microsoft 365 work account alongside existing email/password auth
**Depends on**: Phase 45 (needs dashboard infrastructure and accumulated signal data); O365 is independent but grouped here for coarse granularity
**Requirements**: PEXT-04, PEXT-05, O365-01, O365-02, O365-03
**Success Criteria** (what must be TRUE):
  1. Status monitor auto-transitions projects forward (idea->building->testing->live) based on observed activity signals without user intervention
  2. Backward status transitions are suggested via notification only -- user must confirm before the status changes
  3. User can sign in with "Sign in with Microsoft" button using their Moyne Roberts M365 account (Azure AD OAuth)
  4. Existing email/password users are pre-linked to their Azure AD identity so SSO login connects to their existing account and project data (no duplicate accounts)
**Plans**: 3 plans

Plans:
- [ ] 46-01: TBD
- [ ] 46-02: TBD

### Phase 47: UI Redesign & Polish
**Goal**: The entire application looks executive-worthy with consistent branding, professional typography, and dark mode -- covering all existing pages plus the new executive dashboard
**Depends on**: Phase 46 (all pages must exist before full-surface redesign)
**Requirements**: UIDX-01, UIDX-02, UIDX-03, UIDX-04, UIDX-05, UIDX-06
**Success Criteria** (what must be TRUE):
  1. App uses Moyne Roberts brand colors and typography derived from moyneroberts.com across all pages
  2. All UI components (cards, buttons, inputs, badges, navigation) follow a consistent design system with no visual inconsistencies between pages
  3. Sidebar navigation is polished with active state indicators, branding, and professional visual hierarchy
  4. Dark mode toggle persists user preference and all pages render correctly in both light and dark themes
  5. Layout is responsive and usable on both tablet and desktop screens
**Plans**: 3 plans

Plans:
- [ ] 47-01: TBD
- [ ] 47-02: TBD

### Phase 48: Foundation
**Goal**: The new design system, database schema, and Azure AD SSO are in place so all V7 visual and data-driven features can build on a stable foundation
**Depends on**: Phase 45 (V6.0 executive dashboard complete; V7 extends it)
**Requirements**: DS-01, DS-02, DS-03, DS-04, AUTH-01, AUTH-02, AUTH-03, RT-02, RT-03, RT-04
**Success Criteria** (what must be TRUE):
  1. App renders with Satoshi Variable (body) and Cabinet Grotesk Variable (headings) fonts with no CLS flash on load
  2. User can toggle between dark and light theme and their preference persists across sessions with no flash of unstyled content
  3. V7 glassmorphism components (backdrop-blur, semi-transparent panels) render correctly without breaking any existing V6 pages
  4. User can sign in with "Sign in with Microsoft" button and existing email/password accounts link automatically to M365 identity
  5. User without project_members association sees "access pending" page after SSO login (not a blank screen or error)
**Plans**: 3 plans

Plans:
- [x] 48-01-PLAN.md — V7 design system (fonts, theme toggle, tokens, GlassCard)
- [x] 48-02-PLAN.md — Database migrations (agent_events, swarm_jobs, swarm_agents, swarm_briefings)
- [ ] 48-03-PLAN.md — Azure AD OAuth SSO with access-pending gate

### Phase 49: Navigation & Realtime
**Goal**: Users can browse swarms via a sidebar and each swarm view shares a single Realtime connection that all child components consume
**Depends on**: Phase 48
**Requirements**: NAV-01, NAV-02, NAV-03, RT-01
**Success Criteria** (what must be TRUE):
  1. Sidebar displays swarm list dynamically loaded from the projects table with live mini-stats (active jobs, agent count)
  2. User can click a swarm in the sidebar to navigate to /swarm/[swarmId] and see the swarm-specific view
  3. A single Supabase Realtime subscription per swarm view distributes events to all child components (no per-component subscriptions)
  4. Navigating between swarms cleanly tears down the previous subscription and creates a new one (no stale data, no channel leaks)
**Plans**: TBD

Plans:
- [ ] 49-01: TBD
- [ ] 49-02: TBD

### Phase 50: Data Pipeline
**Goal**: Orq.ai trace and span data flows into Supabase automatically so all live UI components have real agent execution events to display
**Depends on**: Phase 49 (Realtime subscription infrastructure must exist)
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. Inngest orqai-trace-sync cron function polls Orq.ai for trace/span data and writes structured events to the agent_events table
  2. New agent_events rows propagate to connected UI clients via Supabase Realtime postgres_changes within seconds
  3. Orq.ai API rate limits are respected through server-side caching -- no client ever calls Orq.ai directly
**Plans**: 2 plans

Plans:
- [x] 50-01: Migration + shared Orq.ai MCP helper + pure trace mapper + vitest tests
- [x] 50-02: Inngest cron function wiring + serve route registration

### Phase 51: Hero Components
**Goal**: Management sees at a glance what each agent is doing (fleet cards), gets a plain-English health narrative (briefing), and can drill into any agent for details (drawer)
**Depends on**: Phase 49 (uses swarm routing and Realtime infrastructure); Phase 50 for drawer communication timeline
**Requirements**: FLEET-01, FLEET-02, FLEET-03, FLEET-04, BRIEF-01, BRIEF-02, BRIEF-03, DRAW-01, DRAW-02, DRAW-03, DRAW-04
**Success Criteria** (what must be TRUE):
  1. Subagent fleet section shows a card per agent with name, role, state badge, color indicator, 3 metrics (active jobs, queue depth, error count), and skill pill tags
  2. AI briefing panel displays a plain-English swarm health narrative with KPI grid (active jobs, human review, blocked, done today)
  3. Briefing refreshes automatically every 30 minutes and on-demand via a UI button
  4. User can click a fleet card to open a slide-out drawer showing agent name, role, active count, average cycle time, behavior description, recent communication timeline (last 5 events), and workflow stage tags
**Plans**: TBD

Plans:
- [x] 51-01: Fleet cards (SubagentFleet + SubagentFleetCard + AgentStateBadge)
- [x] 51-02: AI briefing panel (Orq.ai Briefing Agent + server action + panel + 30-min cron)
- [x] 51-03: Agent detail drawer (DrawerContext + AgentDetailDrawer via shadcn Sheet + timeline/cycle utils)

### Phase 52: Live Interactivity
**Goal**: Users have a live scrolling event stream for real-time monitoring and a Kanban board for tracking where jobs stand in the business process, with smart filters to surface exceptions
**Depends on**: Phase 50 (terminal needs agent_events data flowing); Phase 49 (Kanban uses Realtime for multi-user sync)
**Requirements**: OBS-03, OBS-04, OBS-05, KAN-01, KAN-02, KAN-03, KAN-04, NAV-04
**Success Criteria** (what must be TRUE):
  1. Claude-style terminal displays scrolling event stream with timestamp, event type badge, and payload text -- receiving events via Supabase Realtime in real-time
  2. Terminal uses a ring buffer (max 500 events) with virtualized rendering and never causes memory leaks on always-on monitoring screens
  3. 5-column Kanban board displays jobs across business stages (backlog, ready, in progress, human review, done) with title, description, and colored tag pills
  4. User can drag and drop jobs between Kanban columns with keyboard accessibility, and moves persist to swarm_jobs with optimistic UI and snapshot rollback on failure
  5. Smart filter buttons in the sidebar filter the swarm view to show only blocked, needs review, or high SLA risk items
**Plans**: 3 plans

Plans:
- [x] 52-01: Terminal event stream with ring buffer (useSyncExternalStore + module store) + auto-scroll + pause + clear + missed-events pill
- [x] 52-02: Kanban board with dnd-kit (5 columns, multi-column sortable, optimistic moveJob server action with sonner-revert, Realtime sync) + 10-row fixture
- [x] 52-03: Sidebar smart filter chips with shareable URL ?filter= state (Only blocked / Needs review / High SLA risk)

### Phase 53: Advanced Observability
**Goal**: Users can see real-time agent-to-agent delegation as an animated graph and parallel agent activity as a Gantt-style timeline -- the primary differentiators from competing agent platforms
**Depends on**: Phase 50 (needs proven agent_events data with parent_span_id relationships)
**Requirements**: GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04, OBS-01, OBS-02
**Success Criteria** (what must be TRUE):
  1. Live delegation graph shows orchestrator and sub-agent nodes with animated connection paths that update in real-time as delegation events arrive
  2. Animated particles travel along graph paths using CSS offset-path (not React state) for 60fps performance
  3. Graph layout is auto-computed from agent hierarchy (parent_span_id relationships) -- no manual positioning needed
  4. Gantt-style swimlane timeline shows parallel agent activity with colored bars (thinking, tool_call, waiting, done) time-bucketed from agent_events spans per agent
**Plans**: TBD

Plans:
- [ ] 53-01: TBD
- [ ] 53-02: TBD

### Phase 54: Polish
**Goal**: All existing pages share the V7 visual identity so the app feels cohesive from end to end
**Depends on**: Phase 53 (all new features complete before full-surface migration)
**Requirements**: POL-01, POL-02, POL-03
**Success Criteria** (what must be TRUE):
  1. Executive dashboard page renders with V7 design tokens (Satoshi/Cabinet Grotesk fonts, glassmorphism panels, V7 color palette)
  2. Projects page renders with V7 design tokens and all project cards use the new visual style
  3. Settings page renders with V7 design tokens with no visual inconsistencies against V7 pages
**Plans**: TBD

Plans:
- [x] 54-01: V7 migration across dashboard, executive, projects, settings

## Progress

**Execution Order:**
V3.0: 34 -> 35 -> 36 -> 37 -> 37.1 -> 38 -> 38.1
V4.0: 39 -> 40 -> 41 -> 42
V6.0: 44 -> 45 -> 46 -> 47
V7.0: 48 -> 49 -> 50 -> 51 -> 52 -> 53 -> 54

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 34. Foundation & Auth | V3.0 | 3/3 | Complete | 2026-03-20 |
| 35. Pipeline Engine | V3.0 | 4/4 | Complete | 2026-03-22 |
| 36. Dashboard & Graph | V3.0 | 4/4 | Complete | 2026-03-23 |
| 37. HITL Approval | V3.0 | 4/4 | Complete | 2026-03-23 |
| 37.1 Conversational Pipeline | V3.0 | 3/4 | In Progress | - |
| 38. Swarm Activation | V3.0 | 0/TBD | Not started | - |
| 38.1 Full Pipeline Lifecycle | V3.0 | 0/TBD | Not started | - |
| 39. Infrastructure & Credential Foundation | V4.0 | 3/3 | Complete | 2026-03-23 |
| 40. Detection, SOP Upload & Vision Analysis | V4.0 | 5/5 | Complete | 2026-03-23 |
| 41. Script Generation, Testing & MCP Deployment | V4.0 | 0/TBD | Not started | - |
| 42. Standalone Automations & Triggers | V4.0 | 0/TBD | Not started | - |
| 43. Upstream Sync | - | 0/3 | Not started | - |
| 44. Project Model & Data Collection | V6.0 | 3/3 | Complete | 2026-03-28 |
| 45. Executive Dashboard | V6.0 | 3/3 | Complete | 2026-03-30 |
| 46. Status Monitoring & O365 SSO | V6.0 | 0/TBD | Not started | - |
| 47. UI Redesign & Polish | V6.0 | 0/TBD | Not started | - |
| 48. Foundation | V7.0 | 2/3 | In Progress|  |
| 49. Navigation & Realtime | V7.0 | 0/TBD | Not started | - |
| 50. Data Pipeline | V7.0 | 0/TBD | Not started | - |
| 51. Hero Components | V7.0 | 0/TBD | Not started | - |
| 52. Live Interactivity | V7.0 | 0/TBD | Not started | - |
| 53. Advanced Observability | V7.0 | 0/TBD | Not started | - |
| 54. Polish | V7.0 | 1/1 | Code-complete | 2026-04-16 |

## Progress Summary

| Version | Phase | Plans Complete | Status | Completed |
|---------|-------|----------------|--------|-----------|
| v0.3 | 1-05.2 (11 phases) | 28/28 | **Shipped** | 2026-03-01 |
| V2.0 | 6-11 (7 phases) | 11/11 | **Shipped** | 2026-03-02 |
| V2.1 | 26-33 (8 phases) | 9/9 | **Shipped** | 2026-03-13 |
| V3.0 | 34-38.1 (7 phases) | 14/TBD | **In Progress** | - |
| V4.0 | 39-42 (4 phases) | 8/TBD | **Partially Complete** | - |
| V5.0 | TBD | 0/TBD | **Defined** | - |
| V6.0 | 44-47 (4 phases) | 6/TBD | **Partially Complete** | - |
| V7.0 | 48-54 (7 phases) | 0/TBD | **Not started** | - |
