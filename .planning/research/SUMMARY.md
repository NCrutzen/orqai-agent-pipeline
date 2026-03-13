# Project Research Summary

**Project:** Orq Agent Designer V3.0 -- Web UI & Dashboard
**Domain:** Browser-based AI agent pipeline UI with real-time dashboard, node graph visualization, and HITL approval workflows
**Researched:** 2026-03-13
**Confidence:** MEDIUM-HIGH

## Executive Summary

V3.0 wraps an existing CLI-based AI agent design pipeline in a browser experience so non-technical Moyne Roberts colleagues (5-15 users) can run the full pipeline without developer help. The recommended approach uses Next.js 16 (App Router) on Vercel, Supabase for auth/database/realtime, Inngest for durable pipeline orchestration, and React Flow for agent swarm visualization. The core architectural challenge is the **prompt adapter** -- a novel bridge that reads existing markdown pipeline files and translates them into Claude API calls via Inngest step functions, preserving the CLI pipeline as single source of truth without duplicating logic in TypeScript.

The stack is well-validated: every major technology (Next.js 16, Supabase, Inngest v3, React Flow v12, Resend) has official documentation, production stability, and free-tier capacity sufficient for this user count. Authentication uses Supabase's Microsoft OAuth with Azure AD tenant restriction -- simpler than SAML, free-tier compatible, and sufficient for 5-15 internal users. The dual-channel realtime architecture (Inngest Realtime for ephemeral pipeline progress, Supabase Broadcast for persistent state changes) avoids the documented Postgres Changes bottleneck that kills dashboard updates under load.

The primary risks are: (1) the prompt adapter is novel engineering with no prior art -- it must be built and validated early before UI work begins; (2) Inngest's `waitForEvent` has a documented race condition where approval events can be lost if fired before the wait is fully registered; (3) Azure AD tenant misconfiguration silently allows any Microsoft account to log in; and (4) non-technical users need rich approval context (not raw diffs) to make meaningful HITL decisions. All four risks have concrete mitigation strategies documented in the research, but the prompt adapter risk is structural -- if it fails, the V3.0 architecture needs fundamental rethinking.

## Key Findings

### Recommended Stack

The stack splits cleanly into "already decided" (Next.js 16, Supabase, existing Orq.ai SDKs) and "new additions" (Inngest, React Flow, Resend, shadcn/ui). All new additions are production-stable with free tiers that exceed the 5-15 user requirement by wide margins.

**Core technologies:**
- **Next.js 16 (App Router)** -- Full-stack framework. Turbopack stable, server components for data fetching, Vercel-native deployment.
- **Supabase (Auth + Postgres + Realtime)** -- Single platform for M365 OAuth, database with RLS, and real-time subscriptions. Pro plan ($25/mo) recommended for production reliability.
- **Inngest v3** -- Durable workflow orchestration. Step functions survive Vercel timeouts, `waitForEvent` for HITL pauses, built-in realtime streaming, 100K free executions/month.
- **@xyflow/react v12 (React Flow)** -- Interactive node graph for agent swarm visualization. Custom nodes, execution overlay, dagre layout. MIT licensed.
- **Resend + React Email** -- Email notifications for HITL approvals. 100 emails/day free tier. React component templates.
- **shadcn/ui + Tailwind v4** -- UI components copied locally (no version lock-in). Dashboard tables, cards, dialogs, badges.

**Critical version note:** Use Inngest v3 stable, NOT v4 beta. Inngest Realtime is "developer preview" -- fallback is writing step status to Supabase if issues arise.

### Expected Features

**Must have (table stakes):**
- M365 SSO login (Azure AD tenant-restricted)
- Use case input form with "Design My Agents" button
- Pipeline run list / history with real-time status
- Live progress indicators and log stream (vertical timeline, not progress bar)
- HITL approval for prompt changes with diff view
- Pipeline error handling with plain-English messages and retry
- Output download / copy of generated specs

**Should have (differentiators):**
- Interactive node graph of agent swarm with execution overlay
- Agent performance scores overlaid on graph nodes
- Email notifications for pending approvals
- Approval history with audit trail
- Pipeline comparison (before/after iteration scores)

**Defer (v2+):**
- Keyboard shortcuts for approvals
- Before/after iteration comparison view
- Auto-scroll log with step anchors
- ZIP export of output files
- Drag-and-drop pipeline builder (anti-feature -- never build)
- Chat-based interface (anti-feature -- creates false expectations)
- Mobile optimization (anti-feature for 5-15 desktop users)

### Architecture Approach

The architecture centers on the **prompt adapter pattern**: the web app reads existing markdown pipeline files (`commands/*.md`, `agents/*.md`) and translates them into Claude API calls executed within Inngest step functions. This preserves the CLI pipeline as single source of truth. Each CLI command becomes a separate Inngest function. Subagent spawning (CLI's `Task` tool) becomes nested `step.run()` calls. MCP tool calls become REST API calls via `orqai-bridge.ts`. File I/O redirects to Supabase DB/Storage. Interactive prompts become `step.waitForEvent()` HITL pauses.

**Major components:**
1. **Prompt Adapter** (`lib/prompt-adapter/`) -- Parses markdown prompts, builds Claude API messages, translates MCP to REST. The highest-risk, most novel component.
2. **Inngest Pipeline Functions** (`lib/inngest/functions/`) -- One function per command (pipeline, deploy, test, iterate). Durable execution with step-level retries and HITL pauses.
3. **Dual Realtime System** -- Inngest Realtime for ephemeral pipeline progress streaming; Supabase Broadcast for persistent state changes (run status, approval queue).
4. **React Flow Graph** (`components/graph/`) -- Agent swarm visualization with custom AgentNode components, dagre layout, and live execution overlay.
5. **HITL Approval System** (`components/approvals/`) -- Approval queue, diff viewer, email notifications via Resend. Dual-write pattern (DB + Inngest event) to prevent race conditions.

### Critical Pitfalls

1. **Supabase Realtime Postgres Changes bottleneck** -- Use Broadcast for pipeline progress, NOT Postgres Changes. Postgres Changes processes on a single thread with RLS checks per subscriber. At 10 concurrent viewers, updates lag and time out. Use Broadcast from day one.
2. **Inngest `waitForEvent` race condition** -- Approval events can be lost if fired before the wait is registered. Mitigation: emit `approval.requested` event before showing Approve button; dual-write approval to DB and Inngest event; always treat `null` return as explicit timeout.
3. **Azure AD tenant misconfiguration** -- Default `common` endpoint allows ANY Microsoft account. Must set tenant-specific URL in Supabase and verify with middleware. Test with a personal Microsoft account during QA.
4. **Vercel serverless timeout kills pipeline steps** -- Never run AI pipeline steps in API routes. All pipeline work through Inngest (2-hour step timeout vs Vercel's 10-60 second limit).
5. **Pipeline state machine not designed** -- Partial failures leave orphaned state (deployed agents without recorded IDs, stuck "In Progress" runs). Design explicit state machine with per-agent deployment tracking and idempotent operations before writing pipeline code.
6. **Poor HITL approval context** -- Non-technical users cannot evaluate raw diffs. Each approval type needs its own context view with plain-English summaries and "what happens if I reject?" explanations.

## Implications for Roadmap

Based on research, suggested phase structure (8 phases):

### Phase 1: Foundation and Auth
**Rationale:** All features depend on authentication. Azure AD tenant configuration is a known pitfall that must be verified first.
**Delivers:** Next.js 16 app shell, Supabase project setup, M365 SSO login, auth middleware with tenant verification.
**Addresses:** M365 SSO login (table stakes), responsive layout shell.
**Avoids:** Pitfall 3 (tenant misconfiguration) -- verify with personal Microsoft account during this phase.

### Phase 2: Database Schema and State Machine
**Rationale:** All pipeline and dashboard features write to the database. The state machine design (Pitfall 5) must precede pipeline implementation.
**Delivers:** Supabase migrations for `pipeline_runs`, `pipeline_steps`, `agent_specs`, `approvals` tables. RLS policies. Explicit state machine with transition rules.
**Addresses:** Run list / history data model, approval audit trail data model.
**Avoids:** Pitfall 5 (orphaned state from partial failures).

### Phase 3: Prompt Adapter (Core Bridge)
**Rationale:** Highest-risk, most novel component. Must validate that markdown-to-API translation works before building UI on top. If this fails, the entire architecture needs rethinking.
**Delivers:** Markdown parser, Claude API message builder, MCP-to-REST translation (`orqai-bridge.ts`), single subagent end-to-end test (architect).
**Uses:** Claude API (Anthropic SDK), Orq.ai REST API, existing markdown prompt files.
**Avoids:** Anti-pattern of duplicating pipeline logic in TypeScript.

### Phase 4: Inngest Pipeline Orchestration
**Rationale:** Validates the full execution path (browser -> Inngest -> Claude API -> Orq.ai REST -> Supabase) before any UI work. Proof-of-concept for the entire V3.0 architecture.
**Delivers:** Main pipeline as Inngest function, step-level state persistence, auto-approve mode (no HITL yet), Inngest Realtime publish.
**Addresses:** Pipeline run trigger (table stakes), pipeline error handling.
**Avoids:** Pitfall 4 (Vercel timeout) by using Inngest from the start.

### Phase 5: Dashboard (Run List, Run Detail, Log Stream)
**Rationale:** First user-visible feature beyond login. Provides debugging visibility for all subsequent development. Validates dual-realtime architecture.
**Delivers:** Run list page with status, run detail with live progress, log stream with human-readable summaries, error display with retry.
**Addresses:** Run list / history, real-time progress indicators, log stream, error handling (all table stakes).
**Avoids:** Pitfall 1 (Postgres Changes bottleneck) by using Broadcast for pipeline updates.

### Phase 6: HITL Approval Flow
**Rationale:** Depends on both the pipeline (to pause) and the dashboard (to display approvals). The approval context design (Pitfall 6) must happen alongside the mechanism.
**Delivers:** Approval queue page, diff viewer with plain-English summaries, approve/reject with comments, `waitForEvent` integration, email notifications via Resend, audit trail.
**Addresses:** HITL approval (table stakes), email notifications (differentiator), approval history (differentiator).
**Avoids:** Pitfall 2 (waitForEvent race) via dual-write pattern; Pitfall 6 (poor context) via approval-type-specific views.

### Phase 7: Node Graph Visualization
**Rationale:** Visually impressive but has fewer dependencies on other web components. Reads data from completed pipeline runs. Can be developed somewhat independently.
**Delivers:** React Flow agent swarm graph, custom AgentNode components, dagre layout, execution overlay connected to Inngest Realtime, performance scores on nodes.
**Addresses:** Interactive node graph (differentiator), execution overlay (differentiator), agent scores on graph (differentiator).

### Phase 8: Remaining Pipeline Functions and Polish
**Rationale:** Main pipeline validates all patterns in Phase 4. Deploy, test, and iterate follow identical adapter + Inngest + Realtime patterns. Polish features have minimal dependencies.
**Delivers:** Deploy, test, iterate as separate Inngest functions. Pipeline comparison view. Output download. Discussion wizard for pre-pipeline inputs.
**Addresses:** Before/after comparison (differentiator), output download (table stakes), remaining pipeline commands.

### Phase Ordering Rationale

- **Phases 1-2 are foundation:** Auth and database are dependencies for everything. Pitfall 3 (auth) and Pitfall 5 (state machine) must be addressed before any pipeline code runs.
- **Phase 3 before Phase 4:** The prompt adapter is the highest-risk component. If it does not work, the architecture must change. Build and validate it before wiring it into Inngest.
- **Phase 4 before Phase 5:** The pipeline must produce data before the dashboard can display it. Phase 4 is the end-to-end proof-of-concept.
- **Phase 5 before Phase 6:** HITL approval needs a dashboard to display in. The dashboard's realtime infrastructure (Broadcast channels, subscription hooks) is reused by the approval queue.
- **Phase 7 is independent:** Node graph reads pipeline output data. It can be developed in parallel with Phase 6 if resources allow.
- **Phase 8 is deferred:** The main pipeline validates ALL integration patterns. Remaining commands are mechanical repetition of the same pattern.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Prompt Adapter):** Novel engineering with no prior art. Needs detailed research into markdown parsing strategy, subagent recursion depth handling, and Claude API message context limits.
- **Phase 6 (HITL Approval):** Inngest `waitForEvent` race condition (GitHub issue #1433) needs testing. Approval context UX for non-technical users needs design research.
- **Phase 7 (Node Graph):** React Flow performance with live execution overlay needs profiling. Dagre layout configuration for varying swarm sizes needs experimentation.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation/Auth):** Well-documented Supabase + Azure AD OAuth setup. Follow official docs.
- **Phase 2 (Database):** Standard Supabase migrations and RLS policies. Established patterns.
- **Phase 5 (Dashboard):** Standard Next.js dashboard with Supabase Realtime. Many tutorials and reference implementations.
- **Phase 8 (Remaining Pipelines):** Mechanical repetition of Phase 3-4 patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified via official docs, npm, and changelogs. Versions confirmed stable. Free tier limits validated against 5-15 user requirement. |
| Features | MEDIUM-HIGH | Table stakes and differentiators well-defined from domain research. UX patterns confirmed by multiple design sources. Exact Supabase Realtime channel limits and React Flow Pro pricing not verified. |
| Architecture | MEDIUM | Core patterns (Inngest orchestration, Supabase Realtime, React Flow) are HIGH from official docs. Prompt adapter design is MEDIUM -- novel integration with no prior art. Inngest Realtime is MEDIUM -- developer preview. |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls verified against official docs and confirmed bug reports. Integration gotchas sourced from community reports with corroboration. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Prompt adapter feasibility:** No prior art for translating Claude Code markdown skills into API calls. Needs a spike/prototype in Phase 3 before committing to full implementation. Fallback: rewrite pipeline steps as TypeScript (loses single source of truth).
- **Inngest Realtime stability:** Labeled "developer preview." If it has issues in production, fallback is writing step status to Supabase and using Supabase Broadcast for everything. Adds latency but is fully proven.
- **Inngest `waitForEvent` multi-day waits:** Documented as supported (7d on free plan), but production validation needed for approval workflows where users may not respond for days.
- **Claude API rate limits at concurrency:** Each pipeline run makes 10-20+ API calls. At 15 concurrent users, that is 150-300 parallel requests. Need to validate rate limits and implement queuing if needed.
- **Discussion step translation:** CLI has an interactive Q&A discussion (4-8 questions with conditional branches). Architecture recommends a pre-pipeline wizard, but the exact question flow needs extraction from `commands/orq-agent.md` during Phase 3.

## Sources

### Primary (HIGH confidence)
- [Next.js 16 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-16) -- v16 stable with Turbopack
- [Supabase Auth: Azure Login](https://supabase.com/docs/guides/auth/social-login/auth-azure) -- tenant URL configuration
- [Supabase Realtime Benchmarks](https://supabase.com/docs/guides/realtime/benchmarks) -- single-thread Postgres Changes, RLS overhead
- [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast) -- recommended over Postgres Changes
- [Inngest Steps & Workflows](https://www.inngest.com/docs/features/inngest-functions/steps-workflows) -- step.run, step.waitForEvent
- [Inngest Wait for Event Reference](https://www.inngest.com/docs/reference/functions/step-wait-for-event) -- timeout returns null, 7d free plan max
- [Inngest Usage Limits](https://www.inngest.com/docs/usage-limits/inngest) -- 2-hour step timeout, 32MB state, 4MB step output
- [Inngest Vercel Marketplace](https://vercel.com/marketplace/inngest) -- integration pattern
- [React Flow Documentation](https://reactflow.dev) -- node-based UI, custom nodes, performance guide
- [Resend npm](https://www.npmjs.com/package/resend) -- v6.9 stable, email delivery API
- [Vercel Serverless Timeout](https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out) -- 10s Hobby, 60s Pro

### Secondary (MEDIUM confidence)
- [Inngest waitForEvent race condition](https://github.com/inngest/inngest/issues/1433) -- events in quick succession not resolved
- [Inngest Realtime Docs](https://www.inngest.com/docs/features/realtime) -- developer preview, publish/subscribe pattern
- [AgentKit HITL Patterns](https://agentkit.inngest.com/advanced-patterns/human-in-the-loop) -- waitForEvent for approvals
- [Supabase Azure AD single-tenant discussion](https://github.com/orgs/supabase/discussions/1071) -- tenant URL override required
- [Smashing Magazine: Agentic AI UX Patterns (Feb 2026)](https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/) -- transparency, control patterns
- [Microsoft Design: UX for Agents](https://microsoft.design/articles/ux-design-for-agents/) -- explainability patterns

### Tertiary (LOW confidence)
- [DEV Community: Supabase Realtime in Next.js 15](https://dev.to/lra8dev/building-real-time-magic-supabase-subscriptions-in-nextjs-15-2kmp) -- implementation patterns
- [Medium: AI Agent Interfaces with React Flow](https://damiandabrowski.medium.com/day-90-of-100-days-agentic-engineer-challenge-ai-agent-interfaces-with-react-flow-21538a35d098) -- visualization patterns

---
*Research completed: 2026-03-13*
*Ready for roadmap: yes*
