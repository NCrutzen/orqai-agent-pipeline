# Requirements: Orq Agent Designer

**Defined:** 2026-03-15
**Core Value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- through a browser UI with real-time visibility, visual agent graphs, and in-app approvals -- without touching a terminal or needing technical knowledge.

## V3.0 Requirements

Requirements for V3.0 Web UI & Dashboard. Each maps to roadmap phases.

### Foundation & Auth

- [ ] **FOUND-01**: User can sign in with their M365 (Azure AD) work account via SSO *(deferred -- removed during Phase 34, to be revisited in a future phase)*
- [ ] **FOUND-02**: Only Moyne Roberts tenant accounts can access the app (tenant-restricted) *(deferred -- depends on FOUND-01)*
- [x] **FOUND-03**: User can enter a use case description in a text input form
- [x] **FOUND-04**: User can trigger the pipeline with a single button click
- [ ] **FOUND-05**: User can view a list of their pipeline runs with status and timestamps

### Pipeline Execution

- [x] **PIPE-01**: Pipeline executes server-side via Inngest durable functions (not API route timeouts)
- [x] **PIPE-02**: Prompt adapter translates markdown pipeline files into Claude API calls
- [x] **PIPE-03**: Pipeline state machine tracks each step (pending/running/complete/failed/waiting)
- [x] **PIPE-04**: User can retry a failed pipeline from the failed step
- [x] **PIPE-05**: Pipeline errors display plain-English messages with retry action

### Real-time Dashboard

- [x] **DASH-01**: User sees live progress indicators as pipeline steps complete (Supabase Realtime)
- [x] **DASH-02**: User sees a log stream with human-readable step descriptions
- [x] **DASH-03**: Dashboard shows vertical timeline of pipeline steps with state indicators
- [x] **DASH-04**: Run list updates in real-time when pipeline status changes

### Node Graph

- [x] **GRAPH-01**: User sees an interactive node graph of the designed agent swarm (React Flow)
- [x] **GRAPH-02**: Nodes show agent name, role, and tool connections
- [x] **GRAPH-03**: Nodes light up during pipeline execution (running/complete/failed states)
- [x] **GRAPH-04**: Agent performance scores display on nodes after pipeline completion

### HITL Approval

- [x] **HITL-01**: Pipeline pauses and creates an approval request when prompt changes are proposed
- [x] **HITL-02**: User sees a diff view of proposed changes with plain-English explanation
- [x] **HITL-03**: User can approve or reject changes with optional comment
- [x] **HITL-04**: Pipeline resumes automatically after approval decision
- [x] **HITL-05**: User receives email notification when approval is needed
- [x] **HITL-06**: All approval decisions are logged with timestamp, user, and comment (audit trail)

### Projects & Access

- [x] **PROJ-01**: User can create and name projects
- [x] **PROJ-02**: User can assign colleagues to a project
- [x] **PROJ-03**: Pipeline runs and agent graphs are scoped to a project (users only see their projects)
- [x] **PROJ-04**: All project members have equal access within a project

### Swarm Activation

- [ ] **ACTV-01**: Each deployed swarm gets a webhook URL for external triggering
- [ ] **ACTV-02**: Webhook is authenticated via API key
- [ ] **ACTV-03**: Webhook trigger starts the full pipeline and returns a run ID
- [ ] **ACTV-04**: External systems can check run status via the run ID

## V4.0 Requirements

Requirements for V4.0 Browser Automation Builder. Each maps to roadmap phases.

### Detection & SOP Intake

- [x] **DETECT-01**: Pipeline auto-detects when a designed agent needs browser automation for a no-API system
- [x] **DETECT-02**: User can upload SOP document (Word/PDF) describing the target process
- [x] **DETECT-03**: User can upload screenshots of the target system screens
- [x] **DETECT-04**: Structured intake wizard validates SOP completeness before script generation
- [x] **DETECT-05**: Pipeline skips automation builder when target system has an API

### AI Vision & Annotation (via Orq.ai)

- [x] **VISION-01**: AI analyzes screenshots via Orq.ai (Agent or AI Routing) to identify UI elements and layout
- [x] **VISION-02**: AI parses SOP document and correlates steps with screenshot elements
- [x] **VISION-03**: AI presents annotated screenshots with highlighted elements back to user
- [x] **VISION-04**: User can confirm or correct AI's interpretation of each automation step
- [x] **VISION-05**: AI incorporates user corrections and updates its understanding

### Script Generation & Testing

- [ ] **SCRIPT-01**: AI generates Playwright script from confirmed steps using getByRole/getByText locators
- [ ] **SCRIPT-02**: Script executes on Browserless.io (REST `/function` for simple, BaaS for stateful multi-step)
- [ ] **SCRIPT-03**: User can view Session Replay recording of test execution (RRWeb-based, built-in Browserless.io)
- [ ] **SCRIPT-04**: Iterative test-fix loop: AI diagnoses failures and proposes script fixes
- [ ] **SCRIPT-05**: DOM accessibility tree captured on execution for informed iteration
- [ ] **SCRIPT-06**: Convergence detection stops iteration when script stabilizes
- [ ] **SCRIPT-07**: Hard iteration cap (5 max) prevents runaway testing
- [ ] **SCRIPT-08**: Persistent sessions maintain auth state across test iterations (cookies/localStorage)

### MCP Deployment & Agent Attachment

- [ ] **MCPTL-01**: Verified Playwright script deploys as MCP tool on same Vercel deployment
- [ ] **MCPTL-02**: MCP tool automatically attaches to the Orq.ai agent that needs it
- [ ] **MCPTL-03**: Orq.ai agent can call the browser automation MCP tool during execution

### Credential Management

- [x] **CRED-01**: User can securely store credentials for target systems
- [x] **CRED-02**: Credentials inject at runtime into Playwright script execution on Browserless.io
- [x] **CRED-03**: Credential rotation reminders notify when credentials may need updating
- [x] **CRED-04**: Per-system authentication profiles support different auth methods

### Standalone Automations

- [ ] **AUTO-01**: User can create browser automations standalone (without the agent pipeline)
- [ ] **AUTO-02**: Simple automations can be described conversationally without SOP + screenshots
- [ ] **AUTO-03**: Complex standalone automations use the full SOP + screenshot flow
- [ ] **AUTO-04**: User can manage automations from the web app dashboard (list, view, edit, delete)

### Scheduling & External Triggers

- [ ] **TRIG-01**: User can schedule automations from the web app (daily, weekly, cron)
- [ ] **TRIG-02**: Automations can be triggered via webhook endpoint (HTTP POST)
- [ ] **TRIG-03**: Custom Zapier integration with callback URL for result waiting in larger flows
- [ ] **TRIG-04**: Automation execution results returned to caller (webhook response, Zapier callback)

## Future Requirements

### V5.0 Cross-Swarm Intelligence

- **XSWM-01**: Unified inventory of all swarms from local specs and live Orq.ai state
- **XSWM-02**: Drift detection between spec and deployed state
- **XSWM-03**: Overlap and gap analysis across swarms
- **XSWM-04**: Structured fix proposals with HITL approval

### V4.0+ Automation Enhancements

- **AUTOX-01**: Health check canaries for deployed automations (detect UI changes)
- **AUTOX-02**: Automation versioning when target system UI changes
- **AUTOX-03**: Multi-step automations spanning multiple systems in sequence
- **AUTOX-04**: Automation templates for common enterprise patterns

## Out of Scope

| Feature | Reason |
|---------|--------|
| Drag-and-drop pipeline builder | Pipeline is fixed; users describe use cases, not design pipelines |
| Chat-based interface | Structured pipeline with clear input/output; chat creates false expectations |
| Real-time agent monitoring | Orq.ai handles this natively; no need to duplicate |
| Role-based access control (RBAC) | All project members have equal access; 5-15 internal users |
| Multi-tenant workspace separation | Single company; projects provide sufficient isolation |
| Custom evaluator configuration UI | Pipeline auto-selects evaluators based on agent role |
| Mobile-optimized interface | 5-15 internal users on office desktops/laptops |
| Generative UI | Non-technical users need consistency, not AI-generated interfaces |
| Dynamic/exploratory browser-use | Already handled by existing Orq.ai MCP tools |
| No-code visual builder / record-replay | Contradicts SOP-upload value proposition |
| Self-hosted Playwright infrastructure | Browserless.io SaaS handles this |
| BrowserQL stealth mode | Internal enterprise systems don't need anti-detection (available as fallback) |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 34 | Deferred |
| FOUND-02 | Phase 34 | Deferred |
| FOUND-03 | Phase 35 | Complete |
| FOUND-04 | Phase 35 | Complete |
| FOUND-05 | Phase 35 | Pending |
| PIPE-01 | Phase 35 | Complete |
| PIPE-02 | Phase 35 | Complete |
| PIPE-03 | Phase 35 | Complete |
| PIPE-04 | Phase 35 | Complete |
| PIPE-05 | Phase 35 | Complete |
| DASH-01 | Phase 36 | Complete |
| DASH-02 | Phase 36 | Complete |
| DASH-03 | Phase 36 | Complete |
| DASH-04 | Phase 36 | Complete |
| GRAPH-01 | Phase 36 | Complete |
| GRAPH-02 | Phase 36 | Complete |
| GRAPH-03 | Phase 36 | Complete |
| GRAPH-04 | Phase 36 | Complete |
| HITL-01 | Phase 37 | Complete |
| HITL-02 | Phase 37 | Complete |
| HITL-03 | Phase 37 | Complete |
| HITL-04 | Phase 37 | Complete |
| HITL-05 | Phase 37 | Complete |
| HITL-06 | Phase 37 | Complete |
| PROJ-01 | Phase 34 | Complete |
| PROJ-02 | Phase 34 | Complete |
| PROJ-03 | Phase 34 | Complete |
| PROJ-04 | Phase 34 | Complete |
| ACTV-01 | Phase 38 | Pending |
| ACTV-02 | Phase 38 | Pending |
| ACTV-03 | Phase 38 | Pending |
| ACTV-04 | Phase 38 | Pending |
| DETECT-01 | Phase 40 | Complete |
| DETECT-02 | Phase 40 | Complete |
| DETECT-03 | Phase 40 | Complete |
| DETECT-04 | Phase 40 | Complete |
| DETECT-05 | Phase 40 | Complete |
| VISION-01 | Phase 40 | Complete |
| VISION-02 | Phase 40 | Complete |
| VISION-03 | Phase 40 | Complete |
| VISION-04 | Phase 40 | Complete |
| VISION-05 | Phase 40 | Complete |
| SCRIPT-01 | Phase 41 | Pending |
| SCRIPT-02 | Phase 41 | Pending |
| SCRIPT-03 | Phase 41 | Pending |
| SCRIPT-04 | Phase 41 | Pending |
| SCRIPT-05 | Phase 41 | Pending |
| SCRIPT-06 | Phase 41 | Pending |
| SCRIPT-07 | Phase 41 | Pending |
| SCRIPT-08 | Phase 41 | Pending |
| MCPTL-01 | Phase 41 | Pending |
| MCPTL-02 | Phase 41 | Pending |
| MCPTL-03 | Phase 41 | Pending |
| CRED-01 | Phase 39 | Complete |
| CRED-02 | Phase 39 | Complete |
| CRED-03 | Phase 39 | Complete |
| CRED-04 | Phase 39 | Complete |
| AUTO-01 | Phase 42 | Pending |
| AUTO-02 | Phase 42 | Pending |
| AUTO-03 | Phase 42 | Pending |
| AUTO-04 | Phase 42 | Pending |
| TRIG-01 | Phase 42 | Pending |
| TRIG-02 | Phase 42 | Pending |
| TRIG-03 | Phase 42 | Pending |
| TRIG-04 | Phase 42 | Pending |

**V3.0 Coverage:**
- V3.0 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

**V4.0 Coverage:**
- V4.0 requirements: 33 total (corrected from 32 -- SCRIPT category has 8 requirements)
- Mapped to phases: 33
- Unmapped: 0

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-23 after V4.0 roadmap creation*
