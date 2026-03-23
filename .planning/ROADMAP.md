# Roadmap: Agent Workforce

## Overview

Browser-based interface for creating, deploying, testing, and iterating AI agent swarms on Orq.ai. Non-technical colleagues describe a use case and watch agents get designed, deployed, and tested -- with a real-time dashboard, node graph visualization, and HITL approval workflows. V4.0 adds a browser automation builder so that agents can interact with no-API systems (NXT, iController, Intelly) -- users upload SOPs and screenshots, AI generates and tests Playwright scripts on Browserless.io, and verified scripts deploy as MCP tools attached to agents. CLI skills for technical users are available separately in the orqai-agent-pipeline repo.

## Milestones

| Version | Milestone | Status |
|---------|-----------|--------|
| **v0.3** | Core Pipeline + V2.0 Foundation -- V1.0 spec generation + V2.0 install infrastructure | **Shipped 2026-03-01** |
| **V2.0** | Autonomous Orq.ai Pipeline -- deploy, test, iterate, and harden agent swarms via MCP/API | **Shipped 2026-03-02** |
| **V2.1** | Experiment Pipeline Restructure -- rewrite test/iterate with native MCP, smaller subagents | **Shipped 2026-03-13** |
| **V3.0** | Web UI & Dashboard -- browser-based pipeline with authentication, real-time visibility, node graph, HITL approvals | **In Progress** |
| **V4.0** | Browser Automation Builder -- SOP + screenshots to MCP tools for no-API systems via Browserless.io | **Defined** |
| **V5.0** | Cross-Swarm Intelligence -- ecosystem mapping, drift detection, overlap analysis, and fix proposals | **Defined** |

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

---

## Phases

### V3.0 Web UI & Dashboard (Phases 34-38)

**Milestone Goal:** Build a browser-based interface so non-technical colleagues can create, deploy, test, and iterate agent swarms on Orq.ai -- with authentication, real-time dashboard, node graph visualization, and HITL approval workflows.

- [x] **Phase 34: Foundation & Auth** - Next.js app shell, Supabase DB schema with RLS, Supabase auth (email/password, M365 SSO), project CRUD (completed 2026-03-20)
- [x] **Phase 35: Pipeline Engine** - Prompt adapter, Inngest durable functions, pipeline state machine, use case input form, run list (completed 2026-03-22)
- [x] **Phase 36: Dashboard & Graph** - Real-time progress timeline, log stream, run list updates, interactive node graph with execution overlay (completed 2026-03-23)
- [ ] **Phase 37: HITL Approval** - Pipeline pause/resume, diff viewer, approve/reject flow, email notifications, audit trail
- [ ] **Phase 38: Swarm Activation** - Webhook endpoints for external pipeline triggering with API key auth and status polling

### V4.0 Browser Automation Builder (Phases 39-42)

**Milestone Goal:** Add a browser automation builder to the pipeline so agents can interact with no-API systems (NXT, iController, Intelly) -- users upload SOPs and screenshots, AI analyzes and generates Playwright scripts, scripts are tested on Browserless.io, and verified automations deploy as MCP tools attached to agents. Standalone automations and scheduling extend the capability beyond the agent pipeline.

- [ ] **Phase 39: Infrastructure & Credential Foundation** - Browserless.io connectivity, Supabase Storage for uploads, MCP adapter route, credential vault with encrypted storage
- [ ] **Phase 40: Detection, SOP Upload & Vision Analysis** - No-API system detection, SOP/screenshot upload wizard, AI vision analysis via Orq.ai, annotated step confirmation with user
- [ ] **Phase 41: Script Generation, Testing & MCP Deployment** - Playwright script generation, Browserless.io execution with Session Replay, iterative test-fix loop, MCP tool deployment and agent attachment
- [ ] **Phase 42: Standalone Automations & Triggers** - Standalone automation creation (conversational and SOP-based), dashboard management, scheduling, webhooks, Zapier integration

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

### Phase 38: Swarm Activation
**Goal**: External systems can trigger pipeline runs and check status via authenticated webhook endpoints
**Depends on**: Phase 35
**Requirements**: ACTV-01, ACTV-02, ACTV-03, ACTV-04
**Success Criteria** (what must be TRUE):
  1. Each deployed swarm has a unique webhook URL that external systems can call
  2. Webhook requests without a valid API key are rejected
  3. A webhook call starts the full pipeline and returns a run ID for tracking
  4. External systems can poll the run ID to check pipeline status and completion
**Plans**: TBD

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
**Plans**: 4 plans

Plans:
- [ ] 39-00-PLAN.md -- Wave 0: npm install (mcp-handler, @modelcontextprotocol/sdk, playwright-core), TypeScript types, DB schema, test stubs
- [ ] 39-01-PLAN.md -- Credential encryption (AES-256-GCM), proxy, failure detection, API routes, Inngest health check, MCP adapter route
- [ ] 39-02-PLAN.md -- Settings page with Tabs, credential list table, create/replace/delete modals, auth type selector, status badges
- [ ] 39-03-PLAN.md -- Health dashboard UI, health status cards, API trigger route, Broadcast extension, Settings Health tab wiring

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
**Plans**: TBD

Plans:
- [ ] 40-01: TBD
- [ ] 40-02: TBD
- [ ] 40-03: TBD

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
**Plans**: TBD

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
**Plans**: TBD

Plans:
- [ ] 42-01: TBD
- [ ] 42-02: TBD

## Progress

**Execution Order:**
V3.0: 34 -> 35 -> 36 -> 37 -> 38
V4.0: 39 -> 40 -> 41 -> 42
(Phase 38 depends on Phase 35, not 37 -- can execute in parallel with 36/37 if needed)
(Phase 39 depends on Phase 35 infrastructure, not V3.0 completion -- but V3.0 should ship first)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 34. Foundation & Auth | V3.0 | 3/3 | Complete | 2026-03-20 |
| 35. Pipeline Engine | V3.0 | 4/4 | Complete | 2026-03-22 |
| 36. Dashboard & Graph | V3.0 | 4/4 | Complete | 2026-03-23 |
| 37. HITL Approval | 4/4 | Complete    | 2026-03-23 | - |
| 38. Swarm Activation | V3.0 | 0/TBD | Not started | - |
| 39. Infrastructure & Credential Foundation | V4.0 | 0/4 | Not started | - |
| 40. Detection, SOP Upload & Vision Analysis | V4.0 | 0/TBD | Not started | - |
| 41. Script Generation, Testing & MCP Deployment | V4.0 | 0/TBD | Not started | - |
| 42. Standalone Automations & Triggers | V4.0 | 0/TBD | Not started | - |

## Progress Summary

| Version | Phase | Plans Complete | Status | Completed |
|---------|-------|----------------|--------|-----------|
| v0.3 | 1-05.2 (11 phases) | 28/28 | **Shipped** | 2026-03-01 |
| V2.0 | 6-11 (7 phases) | 11/11 | **Shipped** | 2026-03-02 |
| V2.1 | 26-33 (8 phases) | 9/9 | **Shipped** | 2026-03-13 |
| V3.0 | 34-38 (5 phases) | 11/TBD | **In Progress** | - |
| V4.0 | 39-42 (4 phases) | 0/TBD | **Defined** | - |
| V5.0 | TBD | 0/TBD | **Defined** | - |
