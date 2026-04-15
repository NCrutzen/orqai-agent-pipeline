# Requirements: Agent OS V7.0

**Defined:** 2026-04-15
**Core Value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- through a browser UI with real-time visibility, visual agent graphs, and in-app approvals -- without touching a terminal or needing technical knowledge.

## V7.0 Requirements

Requirements for V7.0 Agent OS milestone. Each maps to roadmap phases.

### Authentication

- [ ] **AUTH-01**: User can login with Microsoft 365 account via Azure AD OAuth SSO
- [ ] **AUTH-02**: Existing email/password accounts automatically link to M365 identity on first SSO login
- [ ] **AUTH-03**: User without project_members association sees "access pending" page after SSO login

### Design System

- [ ] **DS-01**: App uses Satoshi Variable (body) and Cabinet Grotesk Variable (headings) fonts loaded via next/font/local
- [ ] **DS-02**: User can toggle between dark and light theme with persistent preference (no flash on page load)
- [ ] **DS-03**: New design tokens use parallel namespace (--v7-*) that coexists with existing shadcn tokens
- [ ] **DS-04**: Glassmorphism styling (backdrop-blur, semi-transparent panels, subtle borders) applied to all V7 components

### Navigation

- [ ] **NAV-01**: Sidebar displays list of swarms dynamically loaded from projects table
- [ ] **NAV-02**: User can click a swarm in the sidebar to navigate to its dedicated view at /swarm/[swarmId]
- [ ] **NAV-03**: Sidebar shows live mini-stats per swarm (active jobs count, agent count)
- [ ] **NAV-04**: Smart filter buttons in sidebar filter the swarm view (only blocked, needs review, high SLA risk)

### Real-Time Infrastructure

- [ ] **RT-01**: Swarm view maintains a single Supabase Realtime subscription per swarm that distributes events to all child components
- [ ] **RT-02**: New agent_events Supabase table captures all agent execution events (thinking, tool_call, waiting, done)
- [ ] **RT-03**: New swarm_jobs table tracks job lifecycle across Kanban stages (backlog, ready, progress, review, done)
- [ ] **RT-04**: New swarm_agents table registers agents per swarm with status, metrics, and skills

### Data Pipeline

- [ ] **DATA-01**: Inngest cron function (orqai-trace-sync) polls Orq.ai for trace/span data and writes to agent_events table
- [ ] **DATA-02**: Agent events propagate via Supabase Realtime postgres_changes to all connected UI clients
- [ ] **DATA-03**: Orq.ai API rate limits are respected with caching layer in Supabase (no direct client-to-Orq.ai calls)

### AI Briefing

- [ ] **BRIEF-01**: Dedicated Orq.ai Briefing Agent generates plain-English swarm health narrative from structured metrics input
- [ ] **BRIEF-02**: Briefing refreshes on 30-minute Inngest schedule and on-demand via UI button
- [ ] **BRIEF-03**: Briefing panel displays narrative text with KPI grid (active jobs, human review, blocked, done today)

### Fleet Cards

- [ ] **FLEET-01**: Subagent fleet section shows a card per agent with name, role, state badge, and color indicator
- [ ] **FLEET-02**: Each fleet card displays 3 metrics (active jobs, queue depth, error count)
- [ ] **FLEET-03**: Each fleet card displays agent skills as pill tags
- [ ] **FLEET-04**: User can click a fleet card to open the agent detail drawer

### Agent Detail Drawer

- [ ] **DRAW-01**: Slide-out drawer displays agent name, role, active count, average cycle time
- [ ] **DRAW-02**: Drawer shows mini hierarchy description of agent behavior
- [ ] **DRAW-03**: Drawer shows recent communication timeline (last 5 events from agent_events)
- [ ] **DRAW-04**: Drawer shows local workflow stages as tag row

### Delegation Graph

- [ ] **GRAPH-01**: Live delegation graph shows orchestrator and sub-agent nodes with animated connection paths
- [ ] **GRAPH-02**: Animated particles travel along paths using CSS offset-path (not React state) for 60fps performance
- [ ] **GRAPH-03**: Graph layout is auto-computed from agent hierarchy (parent_span_id relationships)
- [ ] **GRAPH-04**: Graph updates in real-time as new delegation events arrive via Realtime subscription

### Kanban Board

- [ ] **KAN-01**: 5-column Kanban board displays jobs across business stages (backlog, ready, in progress, human review, done)
- [ ] **KAN-02**: User can drag and drop jobs between columns using @dnd-kit/react with keyboard accessibility
- [ ] **KAN-03**: Column moves persist to swarm_jobs table with optimistic UI and snapshot rollback on failure
- [ ] **KAN-04**: Jobs display title, description, and colored tag pills (priority, risk, status)

### Observability

- [ ] **OBS-01**: Gantt-style swimlane timeline shows parallel agent activity with colored bars (thinking, tool_call, waiting, done)
- [ ] **OBS-02**: Swimlane data is time-bucketed from agent_events spans per agent
- [ ] **OBS-03**: Claude-style terminal displays scrolling event stream with timestamp, event type badge, and payload text
- [ ] **OBS-04**: Terminal uses ring buffer (max 500 events) with virtualized rendering to prevent memory leaks
- [ ] **OBS-05**: Terminal receives events via Supabase Realtime subscription in real-time

### Polish

- [ ] **POL-01**: Existing V6.0 executive dashboard page migrated to V7 design tokens
- [ ] **POL-02**: Existing projects page migrated to V7 design tokens
- [ ] **POL-03**: Existing settings page migrated to V7 design tokens

## V8+ Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Visualization

- **ADV-01**: Recursive agent detail view with mini sub-graph inside the drawer
- **ADV-02**: Historical swimlane playback (replay past agent execution timelines)
- **ADV-03**: Cross-swarm correlation views (see interactions between different swarms)

### Automation

- **AUTO-01**: Automated project status monitoring (auto-advance idea→building→testing→live)
- **AUTO-02**: Custom alerting/paging on swarm anomalies

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full trace explorer | Orq.ai handles this natively — link out instead of rebuilding |
| Direct agent control (start/stop/restart) | Creates dangerous second control plane alongside Orq.ai |
| Mobile drag-and-drop for Kanban | Desktop-first for management use case; mobile gets read-only view |
| Dashboard builder / custom widgets | Over-engineering for 5-15 users; hardcoded views are more reliable |
| Collaborative cursors / multi-user presence | Not needed for management dashboard — conflict-free by design |
| AI root cause analysis | Premature; need observability data quality first |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| — | — | Pending |

**Coverage:**
- V7.0 requirements: 40 total
- Mapped to phases: 0 (pending roadmap creation)
- Unmapped: 40

---
*Requirements defined: 2026-04-15*
*Last updated: 2026-04-15 after initial definition*
