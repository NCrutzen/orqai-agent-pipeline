# Feature Landscape: V7.0 Agent OS

**Domain:** Cinematic AI agent swarm operating dashboard with real-time observability
**Researched:** 2026-04-15
**Confidence:** MEDIUM-HIGH -- UI patterns verified against LangSmith, Langfuse, Datadog LLM Observability, and AG-UI protocol. Existing codebase analyzed for dependencies. Orq.ai trace data availability MEDIUM confidence (OTEL endpoint exists but ingestion pipeline not yet built).

---

## Context: What This Research Covers

This research answers: **what features does V7.0 need to transform the existing dashboard into a cinematic swarm operating view where management sees every swarm, agent, and job in action?**

V6.0 shipped an executive dashboard (KPI cards, trend charts, project health table, ROI analysis) and an extended project model. V7.0 builds ON TOP of that foundation -- same app, new views, new design system.

Key constraints:
- 5-15 users (management + pipeline builders)
- Existing stack: Next.js 16, React 19, shadcn v4, Tailwind CSS v4, Supabase (with Broadcast already wired), Recharts v3, React Flow v12 (`@xyflow/react`), dagre
- Supabase Broadcast infrastructure already works (`useBroadcast` hook, `broadcastStepUpdate`, `run:{runId}` and `runs:live` channels)
- Orq.ai is the source of truth for agent configs, traces, and metrics
- HTML prototype exists at `docs/designs/agent-dashboard-v2.html` defining the target look

---

## Table Stakes

Features users expect from a real-time agent monitoring UI. Missing = product feels incomplete or toy-like.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Dark/light theme toggle with new design system** | Every modern monitoring dashboard has dark mode. The prototype defines both palettes with CSS custom properties (Satoshi body font, Cabinet Grotesk headings, glassmorphism panels). Current app uses shadcn defaults only. | Low | `next-themes` package (new dep), Tailwind CSS v4 `@custom-variant dark`, CSS custom properties for color tokens, Fontshare CDN for Satoshi + Cabinet Grotesk | Foundation for everything. All V7.0 components are designed against these tokens. Without this, nothing looks right. Glassmorphism = `backdrop-blur` + `bg-opacity` + subtle `border` + `box-shadow`. Works in all modern browsers. |
| **Sidebar with swarm navigation** | Users need to switch between swarms (Debtor Email, Sales Email, Tender, etc.). Without this, there is no per-swarm view. Every monitoring tool (Datadog, Grafana, LangSmith) has a navigation structure for switching between monitored entities. | Medium | Existing `AppSidebar` component (shadcn Sidebar), `projects` table for swarm list, new swarm config (mapping agents to swarms) | Current sidebar has 5 static nav items. Must restructure to: (1) Views group with per-swarm entries loaded from DB, (2) Smart filters group, (3) Bottom stats cards. Each swarm entry shows badge with count or "Live" indicator. Prototype shows this clearly. |
| **Subagent fleet cards** | Users need to see which agents exist in a swarm, their status, and key metrics at a glance. This is the primary "who is doing what" view. LangSmith shows per-agent metrics tables. Langfuse shows trace-level breakdowns. Cards are more visual and scannable. | Medium | Orq.ai `/v2/agents` API for agent list + metrics, new `swarm_config` table (maps agent keys to swarm IDs), existing `agentMetrics` in dashboard metrics schema, Supabase for caching | 4 cards per swarm (prototype). Each card: state badge (Busy/Running/Bottleneck/Ready with color dot), name, role description, 3 metric boxes (Active/Queue/Errors), skill tag row. Click opens detail drawer. Data from Orq.ai agent metrics (already collected) + local job tracking. |
| **Real-time event stream (Claude-style terminal)** | A live scrolling log of agent events is now table stakes. Claude.ai, Cursor, Windsurf all show step-by-step activity logs. LangSmith shows trace events. Langfuse shows nested spans. Management expects to see "what just happened." | Medium | Supabase Broadcast (existing `useBroadcast` hook works), new `swarm:{swarmId}` channel, event type taxonomy | Extends existing broadcast infra. New channel per swarm. Events: tool calls (PreToolUse/PostToolUse), reasoning, delegation, human gates, completions, compaction. Monospace font terminal with: timestamp, event type badge (emoji + label), payload text, blinking caret at bottom. Auto-scroll with pause-on-hover. Prototype shows exact format. |
| **AI narrative briefing** | Plain-English swarm health summary is what separates this from raw metrics. LangSmith has "AI summaries" of traces. Management expects actionable prose, not just numbers. "The swarm is healthy, but compliance is becoming the bottleneck." | Medium | New Orq.ai Briefing Agent (must be created), swarm metrics data as agent input, Supabase for caching briefing text, Inngest or Vercel cron for scheduled generation | Dedicated Orq.ai agent receives swarm KPIs (active jobs, blocked count, review queue, done today, error rates) and generates a 2-3 sentence narrative. Runs on schedule (every 30 min) and on-demand via button. Cache in Supabase `swarm_briefings` table. Display with pulsing "Autonomous briefing" eyebrow + KPI grid below (active, review, blocked, done) as in prototype. |
| **Agent detail drawer** | Clicking an agent card must show more detail. Drill-down is expected in any monitoring UI. LangSmith, Datadog, and Grafana all use slide-out panels for entity detail. | Low-Med | Subagent fleet cards (parent), Orq.ai agent detail API, agent event history from Supabase | Slide-out drawer with backdrop blur + main area dim (prototype pattern). Shows: expanded 2-column KPI grid (Active, Avg cycle), description panel, recent communication timeline (last 5 events from that agent), local workflow as tag chips. Uses shadcn Sheet component or custom drawer matching glassmorphism design. |

## Differentiators

Features that set Agent OS apart from LangSmith, Langfuse, Datadog LLM Observability, and generic dashboards. These create the "cinematic control room" feel.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Live delegation graph with animated particles** | No competing product visualizes real-time agent-to-agent communication as an animated graph. LangSmith shows static trace trees. Langfuse shows nested span hierarchies. Datadog shows service maps but not with live animated delegation. This makes the orchestrator pattern tangible and alive. | High | React Flow v12 (`@xyflow/react` -- already installed), dagre (`@dagrejs/dagre` -- already installed), Supabase Broadcast for delegation events, custom glassmorphism nodes | Prototype uses hand-positioned SVG with CSS-animated particles (`animateMotion` along paths). Production: React Flow with custom node components (glassmorphism cards showing label/name/active jobs), animated edges using SVG `animateMotion` or React Flow's `AnimatedSVGEdge`. Orchestrator node gets special glow (outline + box-shadow). Particles travel from orchestrator to sub-agents when delegation events fire. Typically 3-5 nodes, not a massive graph -- layout with dagre tree. |
| **Gantt-style observability swimlanes** | Per-agent timeline showing thinking/tool/wait/done phases in parallel. Unique visualization. Langfuse shows sequential trace trees. LangSmith shows waterfall traces. Neither shows per-agent parallel swimlanes. Gives instant visual understanding of where time goes and who is the bottleneck. | High | Orq.ai trace data (OpenTelemetry via `/v2/otel` endpoint), new `agent_spans` table in Supabase for ingested trace data, custom SVG rendering | Prototype: 3 horizontal lanes (Qualifier, Drafter, Compliance) with colored bars: pink=thinking, blue=tool call, amber=waiting, teal=done. Must build trace ingestion pipeline: Orq.ai OTEL -> collector -> Supabase. Then render time-bucketed bars per agent. Build with plain SVG + CSS (prototype approach) -- Recharts is not designed for Gantt. Time axis scrolls right. |
| **Kanban execution board** | Business-stage job tracking (backlog/ready/progress/review/done) with drag-and-drop. Management sees work in business terms, not technical pipeline steps. No agent observability platform has this. LangSmith tracks traces, not business outcomes. This bridges the gap between "what agents are doing" and "where the work stands." | High | New `swarm_jobs` table in Supabase (id, swarm_id, stage, title, description, tags, assigned_agent_id, timestamps, metadata), `@dnd-kit/core` + `@dnd-kit/sortable` (new deps), Supabase Realtime for cross-client sync | Prototype: 5 columns, draggable job cards with title/description/tags (risk/warn/ok colored). Use dnd-kit because it is React-native, accessible (keyboard DnD), has excellent shadcn+tailwind kanban reference implementations. Jobs initially created by agents via tool calls or manually. Stage transitions broadcast via Supabase Realtime for multi-user sync. |
| **Recursive agent detail view** | The drawer reveals that a sub-agent behaves like a micro-orchestrator with its own workflow. No competing product exposes this recursive pattern. Shows the fractal nature of agent swarms. | Medium | Agent detail drawer (parent), Orq.ai agent config (tools = sub-agent references), delegation event log | Prototype: "This agent behaves like a micro-orchestrator with its own intake, verification, and escalation logic." Show local workflow as tag chip sequence (Inbox -> Score -> Clarify -> Escalate -> Done). If agent has tools that are other agents, render a mini delegation graph inside the drawer. |
| **Smart sidebar filters** | "Only blocked jobs", "Needs human review", "High SLA risk" -- one-click exception filters. Management wants problems surfaced, not a firehose. No agent platform does this. | Low-Med | Kanban job data with stage/tag fields, sidebar UI update | Prototype shows these as nav buttons with arrow icons. Implementation: filter functions applied to `swarm_jobs` query (WHERE stage = 'review' AND tags @> '{"risk"}', etc.). Counts displayed as badges. Cheap to build -- just query filters. |

## Anti-Features

Features to explicitly NOT build. Tempting but wrong for V7.0.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Full trace explorer / individual span viewer** | Orq.ai has this natively and it is better than anything custom-built. PROJECT.md explicitly lists "Real-time agent monitoring/observability -- Orq.ai handles this natively" as out of scope. Building a trace explorer duplicates Orq.ai's core product. | Show summary swimlanes (Gantt view) for bottleneck identification. Link to Orq.ai trace explorer from event stream entries for deep-dive. |
| **Custom alerting / paging system** | Overkill for 5-15 users. Building threshold config, delivery channels, snooze logic is a product unto itself. | Use Zapier webhooks triggered by Supabase database changes (e.g., job stuck in "review" > 2 hours -> Slack notification). |
| **Historical playback / time-travel** | Replaying event streams at arbitrary timestamps is extremely complex (event sourcing, snapshot management, scrubber UI). Zero management ask. | Store metric snapshots for trend charts (already done via `dashboard_snapshots`). Live view is live only. |
| **Mobile-responsive kanban drag-and-drop** | Drag-and-drop on mobile is poor UX. All 5-15 users are office-based on desktop/laptop. | Make sidebar collapsible on tablet. Stack cards vertically on small screens but disable drag. Read-only on mobile. |
| **Custom dashboard builder / widget arrangement** | Massive engineering effort for 5-15 users. Every "configurable" dashboard ships late and confuses users. | Fixed layout per prototype. Iterate based on user feedback in subsequent versions. |
| **Direct agent control (start/stop/restart/redeploy)** | Agent lifecycle is managed via Orq.ai and the pipeline. Adding control buttons creates a dangerous second control plane with sync issues. | Show status. Link to Orq.ai Studio for admin actions. |
| **Multi-tenant / org switching** | Only Moyne Roberts uses this. Multi-tenancy adds complexity for zero users. | Hardcode single org. Supabase RLS scoped to authenticated users. |
| **Real-time collaborative cursors on kanban** | Tempting because Supabase has Presence. But 5-15 users will never have contention on the same board. Over-engineering. | Optimistic updates via Supabase Broadcast. Last-write-wins is fine at this scale. |
| **AI-powered root cause analysis** | "Your swarm is slow because the compliance agent's checklist tool has a cold start" -- unreliable and risks hallucinated explanations damaging credibility with management. | The narrative briefing states facts ("compliance is the bottleneck") without speculating on causes. Engineers investigate via Orq.ai traces. |

## Feature Dependencies

```
Design System (CSS tokens + fonts + glassmorphism)
  |-> Dark/light theme toggle (next-themes)
  |-> All visual components (cards, panels, drawer, terminal, kanban columns)

Sidebar with swarm navigation
  |-> Swarm-specific routes (/swarm/[id])
  |-> All per-swarm views depend on knowing which swarm is selected

Supabase data model (new tables)
  |-> swarm_config (maps agents to swarms)
  |     |-> Subagent fleet cards
  |     |-> AI narrative briefing (knows which agents to summarize)
  |
  |-> swarm_jobs (id, swarm_id, stage, title, tags, agent_id, timestamps)
  |     |-> Kanban execution board
  |     |-> Smart sidebar filters
  |
  |-> agent_events (id, swarm_id, agent_key, event_type, payload, created_at)
  |     |-> Real-time event stream (historical backfill)
  |     |-> Agent detail drawer (recent events)
  |
  |-> swarm_briefings (swarm_id, text, kpis, generated_at)
  |     |-> AI narrative briefing (cache storage)
  |
  |-> agent_spans (id, agent_key, span_type, start_at, end_at, metadata)
        |-> Gantt-style swimlanes

Orq.ai API integration
  |-> Agent list + metrics -> Subagent fleet cards
  |-> Trace data (OTEL) -> agent_spans table -> Gantt swimlanes
  |-> New Briefing Agent -> AI narrative briefing

Supabase Broadcast (extend existing infra)
  |-> New channel: swarm:{swarmId}
  |     |-> Real-time event stream (live events)
  |     |-> Kanban optimistic updates
  |     |-> Delegation graph animations

React Flow (already installed)
  |-> Custom glassmorphism nodes -> Live delegation graph
  |-> AnimatedSVGEdge or custom particle edge -> Delegation animations

dnd-kit (new dependency)
  |-> @dnd-kit/core + @dnd-kit/sortable -> Kanban drag-and-drop
```

**Critical path:** Design system MUST come first (everything is styled against its tokens). Sidebar + data model second (structural foundation). Subagent cards + briefing third (hero components). Event stream + kanban fourth (interactivity). Delegation graph + swimlanes last (highest complexity, most data dependencies).

## MVP Recommendation

Build in this order based on dependency chain, visual impact, and risk:

### Phase 1: Design System + Structure
1. **Design system** -- CSS custom properties (prototype's color tokens), Satoshi + Cabinet Grotesk fonts via Fontshare, glassmorphism panel classes, `next-themes` for dark/light toggle. Low complexity, unblocks everything.
2. **Sidebar restructure** -- Dynamic swarm navigation from DB, smart filter placeholders, bottom stats cards, theme toggle button. Routing: `/swarm/[id]` pattern.
3. **Supabase schema** -- Create `swarm_config`, `swarm_jobs`, `agent_events`, `swarm_briefings` tables. Seed with Debtor Email swarm config.

### Phase 2: Hero Components
4. **Subagent fleet cards** -- 4-column grid of glassmorphism agent cards with state, metrics, skills. Data from Orq.ai API + local cache.
5. **AI narrative briefing** -- Create Orq.ai Briefing Agent, integrate with swarm metrics, display briefing card with KPI grid.
6. **Agent detail drawer** -- Slide-out with expanded metrics, recent events, local workflow tags.

### Phase 3: Interactivity
7. **Real-time event stream** -- Terminal component with Supabase Broadcast subscription. Event type badges, auto-scroll, blinking caret.
8. **Kanban execution board** -- 5-column board with dnd-kit drag-and-drop. Supabase Realtime sync.
9. **Smart sidebar filters** -- Wire up "Only blocked", "Needs review", "High SLA risk" filters to kanban query.

### Phase 4: Advanced Observability
10. **Live delegation graph** -- React Flow with custom nodes, animated particle edges, delegation event integration.
11. **Gantt-style swimlanes** -- Trace ingestion from Orq.ai OTEL, `agent_spans` table, custom SVG timeline renderer.

### Defer to V8.0+
- Recursive agent detail view (mini sub-graph in drawer) -- add after basic drawer is validated
- Historical swimlane playback
- Cross-swarm correlation views
- Agent performance leaderboard

## Data Sources Required

| Data Point | Source | Status | Effort to Access | Notes |
|------------|--------|--------|-------------------|-------|
| Agent list per swarm | Orq.ai `/v2/agents` API + local `swarm_config` mapping | Available (API exists), mapping must be built | Low | Orq.ai does not group agents into "swarms" -- that is our abstraction. Need a config table. |
| Agent metrics (requests, latency, cost, errors) | Orq.ai API / existing `agentMetrics` in dashboard_snapshots | Available now | None | Already collected by Orq.ai collector and stored in snapshots. |
| Agent trace spans (thinking/tool/wait durations) | Orq.ai OpenTelemetry (`/v2/otel`) | Available but untapped | High | Must build trace ingestion pipeline: Orq.ai OTEL endpoint -> ingestion API route -> Supabase `agent_spans`. This is the hardest data integration. |
| Job/task status per swarm | Does not exist yet | Must build from scratch | Medium | New `swarm_jobs` table. Initially seeded manually or via API. Later, agents create/update jobs via Orq.ai tool calls that hit Vercel API routes. |
| Delegation events (agent A delegates to agent B) | Orq.ai traces (agent-as-tool pattern creates trace spans) | Partially available in traces | Medium | Must extract delegation events from OTEL trace data. Each agent-as-tool call = one delegation event. |
| Briefing text | New Orq.ai Briefing Agent output | Must build agent | Medium | Create dedicated agent, deploy to Orq.ai. Schedule via Inngest cron. Cache in `swarm_briefings`. |
| Live events for terminal stream | Supabase Broadcast | Infrastructure exists | Low | Extend existing `broadcastStepUpdate` pattern. New channel: `swarm:{swarmId}`. Emit events from agent tool call webhooks. |
| Swarm KPIs (active/blocked/review/done counts) | Derived from `swarm_jobs` table | Must build | Low | Simple COUNT queries with GROUP BY stage. Refresh on Broadcast events. |

## Complexity Summary

| Feature | Effort | Risk | Priority | Existing Infra Leverage |
|---------|--------|------|----------|------------------------|
| Design system + theme toggle | S | LOW | P0 | shadcn theming, Tailwind v4 |
| Sidebar restructure | M | LOW | P0 | Existing AppSidebar, shadcn Sidebar |
| Supabase schema (new tables) | S | LOW | P0 | Existing Supabase admin client |
| Subagent fleet cards | M | LOW | P1 | Existing agentMetrics, Orq.ai collector |
| AI narrative briefing | M | MEDIUM | P1 | Orq.ai agent infra, Inngest cron |
| Agent detail drawer | S | LOW | P1 | shadcn Sheet, existing Broadcast |
| Real-time event stream | M | LOW | P2 | Existing useBroadcast hook, Broadcast channels |
| Kanban execution board | L | MEDIUM | P2 | New dep (dnd-kit), new table |
| Smart sidebar filters | S | LOW | P2 | Depends on kanban data |
| Live delegation graph | L | MEDIUM | P3 | React Flow v12 + dagre already installed |
| Gantt-style swimlanes | XL | HIGH | P3 | Orq.ai OTEL pipeline must be built first |

## Sources

### Agent Observability Platforms (UI Pattern Research)
- [LangSmith Observability](https://www.langchain.com/langsmith/observability) -- trace visualization, execution path graphs, per-tool analytics
- [Langfuse Observability Overview](https://langfuse.com/docs/observability/overview) -- nested span visualization, OpenTelemetry integration, multi-turn tracing
- [Datadog LLM Observability](https://docs.datadoghq.com/llm_observability/) -- out-of-the-box dashboards, trace/metric/event signal taxonomy
- [Portkey LLM Observability Guide](https://portkey.ai/blog/the-complete-guide-to-llm-observability/) -- comprehensive signal taxonomy (traces, metrics, events)
- [Top 5 AI Agent Observability Platforms 2026](https://o-mega.ai/articles/top-5-ai-agent-observability-platforms-the-ultimate-2026-guide) -- platform comparison

### Agent UI Design Patterns
- [Agent Status Monitoring Pattern](https://www.aiuxdesign.guide/patterns/agent-status-monitoring) -- 4-layer status display (ambient/progress/attention/summary)
- [AG-UI Protocol](https://www.marktechpost.com/2025/09/18/bringing-ai-agents-into-any-ui-the-ag-ui-protocol-for-real-time-structured-agent-frontend-streams/) -- event-based streaming architecture, TEXT_MESSAGE_CONTENT/TOOL_CALL/STATE events
- [UI Design for AI Agents (Enterprise)](https://fuselabcreative.com/ui-design-for-ai-agents/) -- enterprise interface requirements
- [AI Agent Dashboard Comparison 2026](https://thecrunch.io/ai-agent-dashboard/) -- market overview

### Graph Visualization
- [React Flow](https://reactflow.dev/) -- node-based graph library (already installed as `@xyflow/react`)
- [React Flow AnimatedSVGEdge](https://reactflow.dev/ui/components/animated-svg-edge) -- animated edge component for delegation visualization

### Drag-and-Drop
- [dnd-kit Kanban with shadcn + Tailwind](https://github.com/Georgegriff/react-dnd-kit-tailwind-shadcn-ui) -- reference implementation matching our stack
- [Build Kanban Board with dnd-kit](https://blog.logrocket.com/build-kanban-board-dnd-kit-react/) -- step-by-step guide

### Real-time Infrastructure
- [Supabase Realtime with Next.js](https://supabase.com/docs/guides/realtime/realtime-with-nextjs) -- official guide for WebSocket channels
- [Supabase Broadcast](https://supabase.com/docs/guides/realtime/getting_started) -- channel-based pub/sub

### Orq.ai Data Sources
- [Orq.ai Observability & Monitoring](https://orq.ai/platform/observe) -- native trace/metrics platform
- [Orq.ai OpenTelemetry Integration](https://orq.ai/blog/tracing-openclaw-with-opentelemetry-and-orq.ai) -- OTEL endpoint `/v2/otel`, trace ingestion
- [Orq.ai Logs and Metrics Enhancement](https://docs.orq.ai/changelog/log-and-metrics-enhacements) -- enhanced logging capabilities

### Design System
- [Dark Glassmorphism 2026 Trend](https://medium.com/@developer_89726/dark-glassmorphism-the-aesthetic-that-will-define-ui-in-2026-93aa4153088f) -- design trend validation
- [Glassmorphism with Tailwind CSS](https://flyonui.com/blog/glassmorphism-with-tailwind-css/) -- implementation guide
- [Glass UI Components](https://allshadcn.com/components/glass-ui/) -- shadcn glass components

### Existing Codebase (analyzed)
- `web/components/app-sidebar.tsx` -- current sidebar (5 static nav items, must restructure)
- `web/lib/supabase/broadcast.ts` -- existing broadcast infra (channels, step updates, run updates)
- `web/lib/supabase/broadcast-client.ts` -- existing `useBroadcast` hook (typed, cleanup on unmount)
- `web/lib/dashboard/metrics-schema.ts` -- existing Zod schemas including `agentMetrics`
- `web/app/(dashboard)/executive/page.tsx` -- existing executive dashboard (V6.0)
- `docs/designs/agent-dashboard-v2.html` -- HTML prototype defining V7.0 target design

---
*Research completed: 2026-04-15*
*Ready for roadmap: yes*
