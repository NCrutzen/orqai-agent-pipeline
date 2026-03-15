# Requirements: Orq Agent Designer

**Defined:** 2026-03-15
**Core Value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- through a browser UI with real-time visibility, visual agent graphs, and in-app approvals -- without touching a terminal or needing technical knowledge.

## V3.0 Requirements

Requirements for V3.0 Web UI & Dashboard. Each maps to roadmap phases.

### Foundation & Auth

- [ ] **FOUND-01**: User can sign in with their M365 (Azure AD) work account via SSO
- [ ] **FOUND-02**: Only Moyne Roberts tenant accounts can access the app (tenant-restricted)
- [ ] **FOUND-03**: User can enter a use case description in a text input form
- [ ] **FOUND-04**: User can trigger the pipeline with a single button click
- [ ] **FOUND-05**: User can view a list of their pipeline runs with status and timestamps

### Pipeline Execution

- [ ] **PIPE-01**: Pipeline executes server-side via Inngest durable functions (not API route timeouts)
- [ ] **PIPE-02**: Prompt adapter translates markdown pipeline files into Claude API calls
- [ ] **PIPE-03**: Pipeline state machine tracks each step (pending/running/complete/failed/waiting)
- [ ] **PIPE-04**: User can retry a failed pipeline from the failed step
- [ ] **PIPE-05**: Pipeline errors display plain-English messages with retry action

### Real-time Dashboard

- [ ] **DASH-01**: User sees live progress indicators as pipeline steps complete (Supabase Realtime)
- [ ] **DASH-02**: User sees a log stream with human-readable step descriptions
- [ ] **DASH-03**: Dashboard shows vertical timeline of pipeline steps with state indicators
- [ ] **DASH-04**: Run list updates in real-time when pipeline status changes

### Node Graph

- [ ] **GRAPH-01**: User sees an interactive node graph of the designed agent swarm (React Flow)
- [ ] **GRAPH-02**: Nodes show agent name, role, and tool connections
- [ ] **GRAPH-03**: Nodes light up during pipeline execution (running/complete/failed states)
- [ ] **GRAPH-04**: Agent performance scores display on nodes after pipeline completion

### HITL Approval

- [ ] **HITL-01**: Pipeline pauses and creates an approval request when prompt changes are proposed
- [ ] **HITL-02**: User sees a diff view of proposed changes with plain-English explanation
- [ ] **HITL-03**: User can approve or reject changes with optional comment
- [ ] **HITL-04**: Pipeline resumes automatically after approval decision
- [ ] **HITL-05**: User receives email notification when approval is needed
- [ ] **HITL-06**: All approval decisions are logged with timestamp, user, and comment (audit trail)

### Projects & Access

- [ ] **PROJ-01**: User can create and name projects
- [ ] **PROJ-02**: User can assign colleagues to a project
- [ ] **PROJ-03**: Pipeline runs and agent graphs are scoped to a project (users only see their projects)
- [ ] **PROJ-04**: All project members have equal access within a project

### Swarm Activation

- [ ] **ACTV-01**: Each deployed swarm gets a webhook URL for external triggering
- [ ] **ACTV-02**: Webhook is authenticated via API key
- [ ] **ACTV-03**: Webhook trigger starts the full pipeline and returns a run ID
- [ ] **ACTV-04**: External systems can check run status via the run ID

## Future Requirements

### V4.0 Cross-Swarm Intelligence

- **XSWM-01**: Unified inventory of all swarms from local specs and live Orq.ai state
- **XSWM-02**: Drift detection between spec and deployed state
- **XSWM-03**: Overlap and gap analysis across swarms
- **XSWM-04**: Structured fix proposals with HITL approval

### V5.0 Browser Automation

- **BRWS-01**: Playwright script generation for deterministic browser flows
- **BRWS-02**: VPS-hosted MCP server for script execution
- **BRWS-03**: Agent spec wiring with browser automation MCP tools

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
| Zapier integration | Existing Orq.ai Zapier integration covers this |
| Generative UI | Non-technical users need consistency, not AI-generated interfaces |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 34 | Pending |
| FOUND-02 | Phase 34 | Pending |
| FOUND-03 | Phase 35 | Pending |
| FOUND-04 | Phase 35 | Pending |
| FOUND-05 | Phase 35 | Pending |
| PIPE-01 | Phase 35 | Pending |
| PIPE-02 | Phase 35 | Pending |
| PIPE-03 | Phase 35 | Pending |
| PIPE-04 | Phase 35 | Pending |
| PIPE-05 | Phase 35 | Pending |
| DASH-01 | Phase 36 | Pending |
| DASH-02 | Phase 36 | Pending |
| DASH-03 | Phase 36 | Pending |
| DASH-04 | Phase 36 | Pending |
| GRAPH-01 | Phase 36 | Pending |
| GRAPH-02 | Phase 36 | Pending |
| GRAPH-03 | Phase 36 | Pending |
| GRAPH-04 | Phase 36 | Pending |
| HITL-01 | Phase 37 | Pending |
| HITL-02 | Phase 37 | Pending |
| HITL-03 | Phase 37 | Pending |
| HITL-04 | Phase 37 | Pending |
| HITL-05 | Phase 37 | Pending |
| HITL-06 | Phase 37 | Pending |
| PROJ-01 | Phase 34 | Pending |
| PROJ-02 | Phase 34 | Pending |
| PROJ-03 | Phase 34 | Pending |
| PROJ-04 | Phase 34 | Pending |
| ACTV-01 | Phase 38 | Pending |
| ACTV-02 | Phase 38 | Pending |
| ACTV-03 | Phase 38 | Pending |
| ACTV-04 | Phase 38 | Pending |

**Coverage:**
- V3.0 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after roadmap creation*
