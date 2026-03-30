# Roadmap: Agent Workforce

## Overview

Browser-based interface for creating, deploying, testing, and iterating AI agent swarms on Orq.ai. Non-technical colleagues describe a use case and watch agents get designed, deployed, and tested -- with a real-time dashboard, node graph visualization, and HITL approval workflows. V4.0 adds a browser automation builder so that agents can interact with no-API systems (NXT, iController, Intelly) -- users upload SOPs and screenshots, AI generates and tests Playwright scripts on Browserless.io, and verified scripts deploy as MCP tools attached to agents. V6.0 adds an executive-facing management dashboard with 360-degree data integration (Agent Workforce + Zapier + Orq.ai), full UI redesign for CEO/CTO/CFO audience, and O365 SSO. CLI skills for technical users are available separately in the orqai-agent-pipeline repo.

## Milestones

| Version | Milestone | Status |
|---------|-----------|--------|
| **v0.3** | Core Pipeline + V2.0 Foundation -- V1.0 spec generation + V2.0 install infrastructure | **Shipped 2026-03-01** |
| **V2.0** | Autonomous Orq.ai Pipeline -- deploy, test, iterate, and harden agent swarms via MCP/API | **Shipped 2026-03-02** |
| **V2.1** | Experiment Pipeline Restructure -- rewrite test/iterate with native MCP, smaller subagents | **Shipped 2026-03-13** |
| **V3.0** | Web UI & Dashboard -- browser-based pipeline with authentication, real-time visibility, node graph, HITL approvals | **In Progress** |
| **V4.0** | Browser Automation Builder -- SOP + screenshots to MCP tools for no-API systems via Browserless.io | **Defined** |
| **V5.0** | Cross-Swarm Intelligence -- ecosystem mapping, drift detection, overlap analysis, and fix proposals | **Defined** |
| **V6.0** | Executive Dashboard & UI Revamp -- 360-degree management dashboard, UI redesign, O365 SSO | **Defined** |

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

- [ ] **Phase 44: Project Model & Data Collection** - Extended project model (status lifecycle, automation type), Zapier browser scraper, Orq.ai analytics collector, snapshot tables, status badges on project cards
- [ ] **Phase 45: Executive Dashboard** - KPI summary cards, activity trend charts, project status breakdown, ROI estimates, health indicators, dashboard aggregator, sub-100ms from pre-computed snapshots
- [ ] **Phase 46: Status Monitoring & O365 SSO** - Automated forward status transitions, suggest-only backward transitions, status history audit trail, Azure AD OAuth login alongside email/password
- [ ] **Phase 47: UI Redesign & Polish** - Brand colors and typography from moyneroberts.com, consistent design system, sidebar polish, grid layout, dark mode toggle, responsive tablet/desktop

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
**Goal**: The pipeline is a streaming conversation — an AI narrator asks clarifying questions, explains what it's designing, shows results, and gets user feedback at key decision points, mirroring the CLI skill experience
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

## Progress

**Execution Order:**
V3.0: 34 -> 35 -> 36 -> 37 -> 38
V4.0: 39 -> 40 -> 41 -> 42
V6.0: 44 -> 45 -> 46 -> 47
(Phase 38 depends on Phase 35, not 37 -- can execute in parallel with 36/37 if needed)
(Phase 39 depends on Phase 35 infrastructure, not V3.0 completion -- but V3.0 should ship first)
(Phase 44 depends on Phase 35 + Browserless.io patterns from Phase 39)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 34. Foundation & Auth | V3.0 | 3/3 | Complete | 2026-03-20 |
| 35. Pipeline Engine | V3.0 | 4/4 | Complete | 2026-03-22 |
| 36. Dashboard & Graph | V3.0 | 4/4 | Complete | 2026-03-23 |
| 37. HITL Approval | 4/4 | Complete    | 2026-03-23 | - |
| 37.1 Conversational Pipeline | 3/4 | In Progress|  | - |
| 38. Swarm Activation | V3.0 | 0/TBD | Not started | - |
| 39. Infrastructure & Credential Foundation | 3/3 | Complete    | 2026-03-23 | - |
| 40. Detection, SOP Upload & Vision Analysis | 5/5 | Complete    | 2026-03-23 | - |
| 41. Script Generation, Testing & MCP Deployment | V4.0 | 0/TBD | Not started | - |
| 42. Standalone Automations & Triggers | V4.0 | 0/TBD | Not started | - |
| 43. Upstream Sync | - | 0/3 | Not started | - |
| 44. Project Model & Data Collection | 3/3 | Complete    | 2026-03-28 | - |
| 45. Executive Dashboard | 3/3 | Complete    | 2026-03-30 | - |
| 46. Status Monitoring & O365 SSO | V6.0 | 0/TBD | Not started | - |
| 47. UI Redesign & Polish | V6.0 | 0/TBD | Not started | - |

## Progress Summary

| Version | Phase | Plans Complete | Status | Completed |
|---------|-------|----------------|--------|-----------|
| v0.3 | 1-05.2 (11 phases) | 28/28 | **Shipped** | 2026-03-01 |
| V2.0 | 6-11 (7 phases) | 11/11 | **Shipped** | 2026-03-02 |
| V2.1 | 26-33 (8 phases) | 9/9 | **Shipped** | 2026-03-13 |
| V3.0 | 34-38 (5 phases) | 11/TBD | **In Progress** | - |
| V4.0 | 39-42 (4 phases) | 0/TBD | **Defined** | - |
| V5.0 | TBD | 0/TBD | **Defined** | - |
| V6.0 | 44-47 (4 phases) | 3/TBD | **In Progress** | - |
