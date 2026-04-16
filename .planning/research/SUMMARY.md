# Project Research Summary

**Project:** Agent Workforce V7.0 Agent OS
**Domain:** Cinematic real-time agent swarm operating dashboard
**Researched:** 2026-04-15
**Confidence:** MEDIUM-HIGH

## Executive Summary

V7.0 transforms an existing Next.js executive dashboard (V6.0) into a cinematic swarm operating system where management sees every agent, every job, and every delegation event in real time. The recommended approach builds incrementally on the validated V6.0 foundation: same Supabase + Inngest + Orq.ai stack, same auth middleware, same broadcast infrastructure. Only two new npm packages are added (motion v12, @dnd-kit/react v0.4). The core complexity is architectural — wiring Orq.ai trace data into a Supabase-backed real-time pipeline so multiple UI visualizations (terminal stream, swimlane timeline, delegation graph) share a single data source rather than each polling Orq.ai independently.

The recommended approach follows the pattern already proven in the codebase: Server Component fetches initial data, Client Component manages Supabase Realtime subscriptions via `postgres_changes`. An Inngest cron job (`orqai-trace-sync`) polls Orq.ai for trace/span data and writes to a new `agent_events` table, which Realtime propagates to all connected UIs. This avoids client-side polling, respects Orq.ai rate limits, and keeps the API key server-side. The design system migrates from Geist to Satoshi + Cabinet Grotesk fonts with glassmorphism tokens, using a parallel CSS variable namespace to avoid breaking the 100% of the app that is not yet V7.

The three highest-risk items are: (1) Azure AD SSO must use OAuth (not SAML) or existing email/password accounts will be orphaned into duplicate records; (2) the design system CSS token migration must use parallel namespacing, never overwriting existing shadcn tokens until each page is deliberately migrated; and (3) Supabase Realtime event accumulation in the terminal stream and delegation graph must use ring buffers from day one — retrofitting memory limits into append-only state is expensive and causes tab crashes on always-on monitoring screens.

## Key Findings

### Recommended Stack

The V7.0 stack adds exactly two new npm packages to an already locked and validated foundation. `motion` v12 (renamed from framer-motion) provides 120fps hardware-accelerated animations for page transitions, glassmorphism hover effects, and Kanban card movement without triggering React re-renders. `@dnd-kit/react` v0.4 (the v2 single-package rewrite) provides accessible keyboard-first drag-and-drop for the Kanban board — the legacy `@dnd-kit/core` + `@dnd-kit/sortable` combo and the abandoned `react-beautiful-dnd` are both dead ends for React 19. All other new capabilities (Azure SSO, Realtime subscriptions, glassmorphism CSS, swimlane timeline) are delivered through configuration, custom CSS, or custom components on top of the existing stack.

**Core new technologies:**
- `motion` v12 — animations, micro-interactions, Kanban card movement — React-native API, 120fps, v12 supports oklch colors matching Tailwind 4
- `@dnd-kit/react` v0.4 — Kanban drag-and-drop — modern v2 rewrite, accessible, active development, shadcn reference implementations exist
- Satoshi Variable + Cabinet Grotesk Variable (self-hosted woff2) — body + heading fonts — free commercial license via Fontshare, loaded via `next/font/local`
- CSS custom properties only — glassmorphism design tokens — no library needed, Tailwind 4 has `backdrop-blur-*` built in
- Supabase Auth Azure provider — O365 SSO — first-class provider, no extra packages, existing middleware unchanged
- Supabase Realtime `postgres_changes` — live UI updates — already in stack, extends existing broadcast infrastructure
- Custom SVG + Motion — swimlane timeline (Gantt-style) — all Gantt libraries solve the wrong problem (project management, not trace visualization)

### Expected Features

**Must have (table stakes):**
- Dark/light theme toggle with new design system (glassmorphism, Satoshi/Cabinet Grotesk fonts) — foundation for all V7 components
- Sidebar with dynamic swarm navigation loaded from DB — without this, no per-swarm view exists
- Subagent fleet cards (state badge, metrics, skills per agent) — primary "who is doing what" view
- Real-time event stream (Claude-style terminal) — live scrolling log, table stakes in 2026 monitoring UIs
- AI narrative briefing — plain-English swarm health summary distinguishes from raw metrics dashboards
- Agent detail drawer — slide-out drill-down expected in any monitoring tool

**Should have (differentiators):**
- Live delegation graph with animated particles — no competitor visualizes real-time agent-to-agent communication as animated graph
- Gantt-style observability swimlanes — per-agent parallel timelines show bottlenecks; LangSmith/Langfuse show sequential traces, not parallel swimlanes
- Kanban execution board — business-stage job tracking bridges "what agents do" and "where work stands"; no agent platform has this
- Smart sidebar filters (only blocked, needs review, high SLA risk) — exception-first management view

**Defer to V8+:**
- Recursive agent detail view (mini sub-graph in drawer)
- Historical swimlane playback
- Cross-swarm correlation views
- Full trace explorer (Orq.ai does this better natively — link to it instead)
- Custom alerting/paging system (use Zapier webhook on Supabase DB change instead)
- Direct agent control (start/stop/restart) — creates dangerous second control plane

### Architecture Approach

The architecture extends the existing Server Component + Client Component pattern proven in `RunListLive` and `SwarmGraph`. A new `swarm/[swarmId]/page.tsx` Server Component fetches initial data in parallel, passes it to a `swarm-client.tsx` Client Component that manages a single Supabase Realtime subscription to `agent_events` and distributes events to child components via props or context. All Orq.ai data flows through an Inngest cron (`orqai-trace-sync`) that writes to Supabase, never from client to Orq.ai directly. Four new Supabase tables drive the live UI: `agent_events` (central event log powering terminal, swimlane, graph), `swarm_jobs` (Kanban state), `swarm_briefings` (cached AI narratives), and `swarm_agents` (agent registry per swarm).

**Major components:**
1. `SwarmSidebar` — dynamic swarm navigation from `projects` table, theme toggle, user menu — replaces static `app-sidebar.tsx`
2. `swarm-client.tsx` — single Realtime subscription owner per swarm view, distributes events to all child components — avoids N-channels anti-pattern
3. `orqai-trace-sync` Inngest function — Orq.ai MCP polling to `agent_events` UPSERT to Realtime triggers all subscribers automatically
4. `terminal-stream.tsx` — ring-buffered Claude-style event log with virtualized rendering via `@tanstack/virtual`
5. `swimlane-timeline.tsx` — custom SVG flame chart per agent, time-bucketed from `agent_events` spans
6. `delegation-graph.tsx` — React Flow + dagre with CSS-animated particle edges, graph built from `parent_span_id` hierarchy
7. `kanban-board.tsx` — dnd-kit drag-and-drop, optimistic updates with snapshot rollback, Realtime sync for multi-user
8. `briefing-panel.tsx` — Orq.ai Briefing Agent output cached in `swarm_briefings`, refreshed on 30-min schedule and on-demand

### Critical Pitfalls

1. **Azure AD creates duplicate accounts** — Use OAuth provider (`signInWithOAuth({ provider: 'azure' })`), NOT SAML SSO. OAuth identities auto-link when emails match and are verified. Confirm all existing email/password accounts have verified emails before enabling. Configure single-tenant to block personal Microsoft accounts. Build post-login check: user with zero `project_members` rows redirects to "access pending" page.

2. **Design system breaks all existing pages** — Never overwrite existing shadcn CSS variable values in `globals.css`. Add parallel V7 namespaced tokens (`--v7-*`) for new components. Migrate existing pages one at a time as deliberate tasks with their own PRs. Screenshot every route before any `globals.css` change.

3. **Unbounded Realtime event accumulation crashes browser tabs** — Ring buffer from day one in terminal stream and delegation graph state (max 500-1000 events). Virtualized rendering via `@tanstack/virtual` for terminal rows. Never use ever-growing state arrays for real-time data in an always-on monitoring screen.

4. **Theme hydration mismatch causes flash of unstyled content** — Use `next-themes` with `attribute="data-theme"` (not class-based). Update Tailwind to `@custom-variant dark (&:is([data-theme="dark"] *))`. Never conditionally render different JSX based on theme in Server Components.

5. **SVG animation jank on delegation graph** — CSS `offset-path`/`offset-distance` with `@keyframes` for particles, not React state. Animate only `transform` and `opacity`. Max 2-3 particles per edge. Profile with Chrome DevTools Performance before merging.

## Implications for Roadmap

Based on the dependency graph across all research files, the phase structure must be strictly ordered: infrastructure before features, design system before any visual work, Realtime architecture before any live component. The Orq.ai trace pipeline is the critical path for the highest-value features (swimlanes, delegation graph, terminal stream) and must be validated before those features begin.

### Phase 1: Foundation — Design System + Database + Auth
**Rationale:** Three true blockers that everything else depends on. CSS tokens must be parallel-namespaced before any visual work or existing pages break. New Supabase tables must exist before any feature can store or subscribe to data. Azure SSO must be resolved early — identity linking bugs are hardest to fix retroactively with many users.
**Delivers:** New design system applied to root layout (fonts, glassmorphism tokens, dark/light theme with no FOUC), four new Supabase tables with RLS policies and Realtime publication enabled, Azure AD OAuth working with existing account linking verified.
**Addresses:** Dark/light theme toggle, design system foundation, O365 SSO
**Avoids:** Pitfall 1 (duplicate SSO accounts), Pitfall 2 (CSS token collision), Pitfall 4 (hydration mismatch), Pitfall 9 (font CLS)

### Phase 2: Navigation + Realtime Infrastructure
**Rationale:** Swarm-scoped routing and the shared Realtime hook must exist before any swarm-specific component can be built. Establishing channel strategy (one subscription per swarm view, not per component) now prevents costly refactors when features are added. The `useRealtimeTable` hook defines the contract all subsequent components use.
**Delivers:** SwarmSidebar with dynamic swarm list from projects table, `/swarm/[swarmId]` routing, `useRealtimeTable` hook, Supabase Realtime connection management validated.
**Addresses:** Sidebar with swarm navigation
**Avoids:** Pitfall 8 (channel exhaustion), Pitfall 11 (cleanup race conditions)

### Phase 3: Orq.ai Data Pipeline
**Rationale:** The terminal stream, swimlane timeline, and delegation graph all depend on `agent_events` being populated from Orq.ai trace data. Building the Inngest `orqai-trace-sync` function and validating the MCP to Supabase to Realtime pipeline end-to-end is the critical prerequisite. This phase de-risks the biggest architectural unknown (Orq.ai trace API availability).
**Delivers:** `orqai-trace-sync` Inngest cron writing spans to `agent_events`, span-to-event mapping validated, Supabase caching layer in place, rate limit handling confirmed.
**Addresses:** Data foundation for terminal stream, swimlanes, delegation graph
**Avoids:** Pitfall 7 (Orq.ai rate limits/stale data), Anti-Pattern of client-side Orq.ai polling

### Phase 4: Hero Components — Fleet Cards + Briefing + Drawer
**Rationale:** Fleet cards and AI briefing are highest-visibility features that deliver management value immediately. Fleet cards use already-available `orqai_snapshots` data (no trace pipeline needed). Briefing creates the Orq.ai Briefing Agent and validates the structured-JSON-input pattern against hallucination risk.
**Delivers:** Subagent fleet cards with glassmorphism styling and state badges, Agent detail drawer, AI narrative briefing panel with Orq.ai Briefing Agent, KPI grid, 30-minute Inngest cron.
**Addresses:** Subagent fleet cards, AI narrative briefing, Agent detail drawer
**Avoids:** Pitfall 14 (hallucinated metrics — structured JSON input, post-generation validation)

### Phase 5: Live Interactivity — Terminal + Kanban + Filters
**Rationale:** Terminal stream and Kanban board are parallel builds that both depend on Phase 2 Realtime infrastructure but are otherwise independent. Terminal validates the Phase 3 data pipeline end-to-end. Kanban uses its own `swarm_jobs` table. Smart filters are low-effort additions once Kanban data exists.
**Delivers:** Ring-buffered terminal event stream with virtualized rendering, 5-column Kanban board with dnd-kit drag-and-drop plus optimistic rollback plus Realtime sync, smart sidebar filters.
**Addresses:** Real-time event stream, Kanban execution board, Smart sidebar filters
**Avoids:** Pitfall 3 (memory leak from unbounded events), Pitfall 6 (Kanban state desync)

### Phase 6: Advanced Observability — Delegation Graph + Swimlanes
**Rationale:** Highest-complexity features with the most data dependencies. Delegation graph requires `parent_span_id` relationships from Phase 3 to be verified and producing clean data. Swimlanes require the same span data plus time axis rendering. Deferred until the data pipeline is proven stable through Phase 5 terminal stream usage.
**Delivers:** Live delegation graph (React Flow + dagre, CSS-animated particle edges), Gantt-style swimlane timeline (custom SVG, time-bucketed per agent).
**Addresses:** Live delegation graph, Gantt-style swimlanes (primary differentiators)
**Avoids:** Pitfall 5 (SVG animation jank — CSS animations only), Pitfall 13 (swimlane timestamp drift — UTC normalization on ingestion)

### Phase 7: Polish — Executive Dashboard Restyle
**Rationale:** Existing V6.0 pages are restyled to V7 design system as a final deliberate pass. Each page migrated individually per the parallel token strategy. "Looks done but isn't" checklist completed.
**Delivers:** Executive dashboard, projects, runs, and settings pages migrated to V7 design tokens, full regression pass confirming no existing-page regressions.
**Addresses:** Consistent design across entire app
**Avoids:** Pitfall 2 (each page migration is deliberate, not a side effect)

### Phase Ordering Rationale

- Phases 1-3 are strict prerequisites: no feature phase begins until design system is safe to build against, routing structure exists, and data pipeline is proven
- Phases 4-6 can partially overlap once Phase 3 is validated (fleet cards can start before trace sync completes since they use snapshot data, not trace data)
- Phase 7 is deliberately last — existing pages keep working throughout on original tokens, avoiding user-facing regressions during construction
- The Orq.ai trace API uncertainty is surfaced in Phase 3 where it can be resolved before dependent features are built, not discovered mid-Phase 6

### Research Flags

Phases needing `/gsd:research-phase` during planning:
- **Phase 3 (Orq.ai trace pipeline):** Orq.ai MCP `list_traces`/`list_spans` tool names unverified. Must call `tools/list` on `https://my.orq.ai/v2/mcp` before designing the sync function. SDK method availability for trace listing also unconfirmed. This is the highest-uncertainty item in the entire project and gates Phases 5-6.
- **Phase 6 (Swimlanes):** Custom SVG swimlane complexity estimated at 150-200 lines but no exact precedent exists. If span data from Phase 3 has unexpected shape, the time-axis rendering may need rethinking. Flag for early prototype within the phase.

Phases with standard/well-documented patterns (skip research-phase):
- **Phase 1 (Design system):** CSS custom properties + `next/font/local` + `next-themes` are well-documented with official guides and existing in-codebase patterns
- **Phase 2 (Realtime infrastructure):** Supabase `postgres_changes` with Next.js App Router has official documentation and proven in-codebase pattern to follow
- **Phase 4 (Fleet cards + briefing):** Orq.ai agent invocation, Inngest cron, and Supabase caching are established in-codebase patterns
- **Phase 5 (Kanban):** dnd-kit v2 has shadcn + Tailwind reference implementations; rollback pattern is standard optimistic UI

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All additions verified: npm package versions confirmed, official docs checked, React 19 compatibility verified. Fontshare EULA confirmed for commercial use. |
| Features | MEDIUM-HIGH | UI patterns verified against LangSmith, Langfuse, Datadog LLM Observability, AG-UI protocol. Existing codebase analyzed. Orq.ai trace data availability is MEDIUM. |
| Architecture | MEDIUM-HIGH | Supabase Realtime patterns verified via official docs. Existing codebase patterns confirmed. Orq.ai trace MCP tool names have LOW confidence. |
| Pitfalls | HIGH | All critical pitfalls verified against official docs, GitHub issues, and current codebase. Azure SSO linking behavior verified against Supabase docs and community discussions. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Orq.ai trace API availability:** The `list_traces` and `list_spans` MCP tool names are assumed from project requirements but unverified. Before Phase 3 planning, call `tools/list` on `https://my.orq.ai/v2/mcp` to enumerate available trace tools. If not available: fallback options are TypeScript SDK trace methods, OTEL collector export, or webhook approach. This single gap is the biggest risk to the Phase 3-6 feature set.
- **`swarm_jobs` population mechanism:** Jobs table must be seeded somehow. Initial plan is manual seeding or API endpoints that agents call via tool calls. Actual agent-to-job-creation integration is undesigned. Phase 5 planning should define the creation flow explicitly.
- **Supabase Realtime plan limits:** Channel limits vary by plan tier. With 5+ users and multiple tabs, connection limits could be hit. Verify current plan limits in Supabase Dashboard before Phase 2.

## Sources

### Primary (HIGH confidence)
- [Supabase Realtime with Next.js](https://supabase.com/docs/guides/realtime/realtime-with-nextjs) — postgres_changes pattern, App Router integration
- [Supabase Azure OAuth](https://supabase.com/docs/guides/auth/social-login/auth-azure) — Azure AD provider setup, single-tenant config
- [Supabase Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking) — OAuth vs SAML linking behavior, email verification requirement
- [Motion npm v12.38.0](https://www.npmjs.com/package/motion) — React 19 support, oklch color support confirmed
- [@dnd-kit/react npm v0.4.0](https://www.npmjs.com/package/@dnd-kit/react) — v2 rewrite API, active development confirmed
- [next-themes](https://github.com/pacocoursey/next-themes) — data-attribute mode, blocking script for zero FOUC
- [Fontshare EULA](https://www.fontshare.com/fonts/satoshi) — free commercial use confirmed, self-hosting permitted
- Current codebase: `broadcast-client.ts`, `broadcast.ts`, `swarm-graph.tsx`, `run-list-live.tsx`, `globals.css`, `middleware.ts`

### Secondary (MEDIUM confidence)
- [LangSmith Observability](https://www.langchain.com/langsmith/observability) — UI pattern reference for agent monitoring
- [Langfuse Observability](https://langfuse.com/docs/observability/overview) — span visualization patterns
- [Datadog LLM Observability](https://docs.datadoghq.com/llm_observability/) — dashboard pattern reference
- [AG-UI Protocol](https://www.marktechpost.com/2025/09/18/bringing-ai-agents-into-any-ui-the-ag-ui-protocol-for-real-time-structured-agent-frontend-streams/) — event taxonomy reference
- [dnd-kit + shadcn Kanban](https://github.com/Georgegriff/react-dnd-kit-tailwind-shadcn-ui) — reference implementation for stack
- [Supabase Realtime memory leak issue #1204](https://github.com/supabase/supabase-js/issues/1204) — ring buffer necessity confirmed

### Tertiary (LOW confidence — validate during implementation)
- Orq.ai MCP `list_traces`/`list_spans` tool availability — assumed from project requirements, must verify with `tools/list`
- Orq.ai OpenTelemetry endpoint `/v2/otel` — mentioned in Orq.ai docs but ingestion pipeline design unverified
- Orq.ai rate limits — not publicly documented, conservative caching approach assumed

---
*Research completed: 2026-04-15*
*Ready for roadmap: yes*
