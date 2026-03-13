# Technology Stack

**Project:** Orq Agent Designer V3.0 -- Web UI & Dashboard
**Researched:** 2026-03-13
**Scope:** NEW stack additions for web app only. Does not cover existing CLI pipeline stack (Claude Code skills, Orq.ai SDK, MCP tools) -- those are validated and locked.

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js (App Router) | `^16.1` | Full-stack React framework | Turbopack stable in v16, server components for pipeline API routes, Vercel-native deployment. Already decided in PROJECT.md. |
| React | `^19.2` | UI library | Ships with Next.js 16. Server components for data fetching, client components for interactive dashboard. |
| TypeScript | `^5.7` | Type safety | Non-negotiable for a project with complex data flows (pipeline state, agent specs, approval queues). |

### Authentication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @supabase/supabase-js | `^2.99` | Supabase client (auth, DB, realtime) | Single client for all Supabase services. |
| @supabase/ssr | `^0.9` | Server-side auth for Next.js App Router | Replaces deprecated `@supabase/auth-helpers-nextjs`. Uses `createBrowserClient` and `createServerClient` for cookie-based auth in App Router. |

**Auth Strategy: Microsoft OAuth (not SAML)**

Use Supabase's built-in Microsoft OAuth provider with Azure AD tenant restriction -- NOT enterprise SAML SSO. Rationale:

1. **Simpler:** OAuth is a dashboard toggle + Azure App Registration. SAML requires Pro plan minimum and more complex IdP configuration.
2. **Tenant lockdown:** Set `Azure Tenant URL` to `https://login.microsoftonline.com/<moyne-roberts-tenant-id>` in Supabase dashboard. This restricts login to Moyne Roberts M365 accounts only -- no other Microsoft accounts can sign in.
3. **Free tier compatible:** Microsoft OAuth works on all Supabase plans. SAML requires Pro ($25/mo).
4. **Sufficient for 5-15 users:** SAML is overkill for this user count. If requirements grow (SCIM provisioning, group mapping), upgrade to SAML later -- it is an additive change.

**Configuration steps:**
1. Register app in Azure Portal (Entra ID) as single-tenant
2. Set redirect URI to `https://<project-ref>.supabase.co/auth/v1/callback`
3. In Supabase dashboard: enable Microsoft provider, add Client ID + Secret + Tenant URL
4. Use `supabase.auth.signInWithOAuth({ provider: 'azure' })` in frontend

**Known gotcha:** Single-tenant Azure AD apps fail with the `/common` endpoint. Supabase defaults to `/common`. You MUST configure the `Azure Tenant URL` field to `https://login.microsoftonline.com/<tenant-id>` to avoid "Application is not configured as a multi-tenant application" errors.

### Database & Realtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase (hosted Postgres) | managed | Pipeline runs, approval queue, user data, agent metadata | Already decided. RLS for row-level security, JSON columns for flexible agent spec storage. |
| Supabase Realtime (Postgres Changes) | managed | Live dashboard updates for run list, approval queue changes | Subscribe to INSERT/UPDATE on `pipeline_runs` and `approvals` tables. RLS-aware -- users only see their own data. |

**Note on Realtime architecture:** Supabase Realtime handles *data state changes* (new runs appear, approval status changes). Inngest Realtime handles *pipeline execution progress* (step-by-step streaming). Both are needed -- they serve different purposes. See Integration Points below.

### Background Pipeline Orchestration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| inngest | `^3.52` | Durable workflow orchestration for pipeline steps | Step functions survive failures, automatic retries, sleep between steps (wait for HITL approval), built-in realtime streaming to frontend. Vercel-native -- deploys as API route, no separate worker. |

**Why Inngest (and not alternatives):**
- **vs. Vercel Serverless Functions alone:** No durable state. Pipeline steps (design, deploy, test, iterate) need to survive timeouts, wait for approvals, retry on failure. Vercel functions time out at 60s (Hobby) / 300s (Pro). Agent design pipelines routinely take 5-15 minutes.
- **vs. Trigger.dev:** Inngest has first-class Vercel Marketplace integration, built-in realtime streaming to browser, and simpler mental model (event-driven, no separate worker process to deploy).
- **vs. BullMQ/Redis:** Requires self-hosted infrastructure. Contradicts the "no self-hosted infra" constraint.
- **vs. Temporal:** Enterprise-grade, self-hosted. Massive overkill for 5-15 users.

**Use v3 stable, not v4 beta.** The TypeScript SDK v4 entered beta on 2026-03-04. Stay on v3 for production stability. Upgrade to v4 after it reaches stable.

**Inngest free tier:** 100K executions/month via Vercel Marketplace. For 5-15 users running agent design pipelines (each pipeline ~20-40 steps), this supports ~2,500-5,000 pipeline runs/month. More than sufficient.

**Inngest Realtime (built-in, not a separate package):**

Inngest includes a realtime streaming feature that publishes step progress to the browser via `useInngestSubscription()` React hook. This eliminates the need for custom WebSocket implementation for pipeline progress.

```typescript
// Server: publish progress from Inngest function
import { realtimeMiddleware } from "inngest";

const pipeline = inngest.createFunction(
  { id: "agent-pipeline" },
  { event: "pipeline/started" },
  async ({ step, publish }) => {
    await step.run("design-agents", async () => {
      publish({ step: "design", status: "running" });
      // ... design logic
      publish({ step: "design", status: "complete", agentCount: 3 });
    });
  }
);

// Client: subscribe to pipeline progress
const { data } = useInngestSubscription({ channel: `pipeline-${runId}` });
```

**HITL approval pattern with Inngest:**
```typescript
// Pipeline waits for human approval (up to 7 days)
const approval = await step.waitForEvent("approval.received", {
  event: "app/approval.completed",
  match: "data.run_id",
  timeout: "7d",
});
if (approval?.data.decision === "rejected") {
  // Handle rejection
}
```

**Inngest Realtime confidence note:** Realtime is labeled "developer preview" as of March 2026. The core step function and waitForEvent features are production-stable. If Realtime has issues, fallback is writing step status to Supabase and using Supabase Realtime for everything.

### Node Graph Visualization

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @xyflow/react | `^12.10` | Interactive agent swarm node graph | Industry standard for node-based UIs in React. 20K+ GitHub stars, actively maintained, TypeScript-first. MIT licensed for all features needed here. |

**Why @xyflow/react v12 (React Flow):**
- **Custom nodes:** Each agent becomes a node with status indicator, model info, tool count. Lights up during pipeline execution.
- **Custom edges:** Show data flow between agents with labels (tool calls, handoffs, agent-as-tool relationships).
- **Execution overlay:** Nodes change color/state as pipeline progresses (pending -> running -> complete/failed).
- **Layout:** Use dagre or elkjs for automatic hierarchical layout of agent swarms (orchestrator at top, sub-agents below).
- **Interaction:** Pan, zoom, click-to-inspect agent details. MiniMap plugin for orientation in larger swarms.
- **Performance:** Only re-renders changed nodes. Fine for swarms of 2-20 agents.
- **License:** MIT for core features. Pro subscription features (node resizer, helper lines) are NOT needed.

**Layout library addition:**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @dagrejs/dagre | `^1.1` | Automatic hierarchical graph layout | Positions agent nodes in a top-down tree. Orchestrator at top, sub-agents below. Deterministic layout from agent relationship data. |

**Do NOT use:** D3.js (too low-level, would need to build everything from scratch), vis.js (dated API, poor React integration), Cytoscape.js (academic focus, force-directed default wrong for pipelines), Mermaid.js (static rendering, no interaction or execution overlay).

### UI Components & Styling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| shadcn/ui | latest (CLI-installed) | Component library | Not a dependency -- copies components as local TypeScript files. No version lock-in, full code ownership. Tailwind v4 compatible. Dashboard needs: tables, cards, dialogs, badges, tabs, toast notifications, dropdown menus. |
| Tailwind CSS | `^4.0` | Utility-first CSS | Ships with Next.js 16 scaffolding. v4 uses CSS-first configuration (no `tailwind.config.js`), faster builds. |
| lucide-react | latest | Icons | Default icon set for shadcn/ui. Tree-shakeable. |

### Email Notifications (HITL Approvals)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| resend | `^6.9` | Email delivery API | Developer-focused, simple API, excellent deliverability. Free tier: 100 emails/day (3,000/month). For 5-15 users with occasional approval requests, this is far more than enough. |
| @react-email/components | `^0.0.34` | Email template components | Build approval notification emails with React components. Same mental model as the rest of the app. Maintained by Resend team. |

**Why Resend over alternatives:**
- **vs. SendGrid/Mailgun:** Simpler API, React Email integration, better DX. Those services are designed for high-volume marketing -- overkill.
- **vs. Nodemailer + SMTP:** Raw SMTP is fragile (deliverability, TLS config, rate limits). Resend handles all of this.
- **vs. Supabase Edge Functions + external SMTP:** Inngest already orchestrates the pipeline. Sending email from an Inngest step is cleaner than wiring up a separate Edge Function.

**Email flow:**
1. Pipeline reaches HITL approval step (iteration proposal, guardrail change)
2. Inngest function calls `step.run("send-notification", () => resend.emails.send(...))`
3. Email contains deep link: `https://app.example.com/approvals/{run_id}`
4. User clicks link, authenticates via M365 SSO, sees proposal in-app
5. User clicks approve/reject
6. Frontend sends Inngest event via API route -> `waitForEvent` resolves
7. Pipeline continues or stops based on decision

### Existing SDKs (DO NOT CHANGE -- already in project, pinned)

| Technology | Version | Purpose |
|------------|---------|---------|
| @orq-ai/node | `^3.14.45` | Orq.ai API client |
| @orq-ai/evaluatorq | `^1.1.0` | Evaluator support |
| @orq-ai/evaluators | `^1.1.0` | Evaluator types |

These are called from pipeline logic within Inngest steps via Next.js API routes. The web app wraps the existing pipeline -- it does not replace it.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Framework | Next.js 16 | Remix, SvelteKit | Already decided. Vercel-native, team familiarity. |
| Auth | Supabase Microsoft OAuth | Supabase SAML SSO | SAML requires Pro plan, more complex Azure config, unnecessary for 5-15 users. OAuth does tenant lockdown. |
| Auth | Supabase Auth | NextAuth.js / Auth.js | Extra dependency. Supabase Auth handles M365 natively and shares the same client as DB/Realtime. |
| Background jobs | Inngest | Trigger.dev | Less mature Vercel integration, no built-in realtime streaming to browser. |
| Background jobs | Inngest | Vercel Cron + Edge Functions | No durable state, no step functions, no HITL wait pattern, no automatic retries. |
| Node graph | @xyflow/react | react-force-graph | Force-directed layout is wrong for pipeline/swarm visualization. Need hierarchical/tree layout with explicit positioning. |
| Node graph | @xyflow/react | Mermaid.js | Static rendering only. No click interaction, no execution overlay, no dynamic state updates. |
| Email | Resend | Postmark | Both are good. Resend wins on React Email integration (same team) and simpler API surface. |
| UI | shadcn/ui | Chakra UI, MUI | shadcn/ui copies code locally (no version lock-in). MUI/Chakra add heavy runtime CSS-in-JS. |
| Realtime (progress) | Inngest Realtime | Socket.io / Pusher | Self-hosted (Socket.io) or extra service (Pusher). Inngest provides this built-in. |

## What NOT to Add

| Technology | Why Tempting | Why Wrong for This Project |
|------------|-------------|---------------------------|
| Prisma / Drizzle ORM | Type-safe DB queries | Supabase client handles queries with TypeScript codegen (`supabase gen types typescript`). Adding an ORM creates a second data layer, migration conflicts, and connection pooling issues on serverless. |
| Redis / Upstash | Caching, rate limiting | No self-hosted infra constraint. Inngest replaces queue need. For 5-15 users, caching is premature. |
| tRPC | Type-safe API layer | Next.js Server Actions + Supabase client cover the API surface. tRPC adds boilerplate for a small user base. |
| Zustand / Redux / Jotai | Global state management | React 19 `use()` hook + Server Components + React Context sufficient at this scale. Dashboard state is mostly server-fetched. |
| Clerk / Auth0 / Kinde | Auth provider | Supabase Auth is already in the stack. Adding another auth provider splits identity and doubles session management. |
| Playwright (in web app) | E2E testing | V5.0 concern (browser automation for legacy systems). Not relevant to V3.0 web app. |
| GraphQL / Apollo | API layer | REST via Supabase client is simpler. No schema stitching needed. GraphQL adds complexity without benefit at this scale. |
| Vercel KV / Blob | Key-value store, file storage | Supabase covers both (Postgres for KV patterns, Storage for files). No need for a second data service. |

## Installation

```bash
# Create Next.js 16 project
npx create-next-app@latest orq-agent-web --typescript --tailwind --app --src-dir

# Supabase (auth, DB, realtime)
npm install @supabase/supabase-js @supabase/ssr

# Background pipeline orchestration
npm install inngest

# Node graph visualization + layout
npm install @xyflow/react @dagrejs/dagre

# Email notifications for HITL approvals
npm install resend @react-email/components

# Dev dependencies
npm install -D supabase  # CLI for migrations, type generation, local dev

# shadcn/ui setup (copies components locally, not an npm dependency)
npx shadcn@latest init
npx shadcn@latest add button card dialog table badge tabs avatar \
  dropdown-menu toast sheet separator scroll-area alert progress
```

**Environment variables needed:**
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>  # Server-side only

# Inngest
INNGEST_EVENT_KEY=<event-key>
INNGEST_SIGNING_KEY=<signing-key>

# Resend
RESEND_API_KEY=<api-key>

# Orq.ai (existing)
ORQ_API_KEY=<api-key>

# Claude API (for pipeline prompts)
ANTHROPIC_API_KEY=<api-key>
```

## Integration Points

### Pipeline Execution Flow

```
Browser -> Next.js API Route -> inngest.send("pipeline/started") -> Inngest Function
                                                                        |
                                                      Step 1: Design (Claude API)
                                                      Step 2: Deploy (Orq.ai API)
                                                      Step 3: Test (Orq.ai API)
                                                      Step 4: HITL Wait (waitForEvent)
                                                          |-> Resend email notification
                                                          |<- User approves in browser
                                                      Step 5: Iterate (Claude + Orq.ai)
                                                      Step 6: Harden (Orq.ai API)
                                                                        |
                                              Each step: publish() -> Inngest Realtime -> Browser
                                              Each step: Supabase DB write -> Realtime -> Dashboard
```

### Realtime Dual-Channel Architecture

| Channel | Technology | Data | Consumer |
|---------|-----------|------|----------|
| Pipeline execution progress | Inngest Realtime | Step status, logs, intermediate results | Active pipeline view (user watching their own run) |
| Dashboard data state | Supabase Realtime (Postgres Changes) | Run list updates, approval queue changes, final scores | Dashboard (all runs list), approval queue, score history |

This separation is intentional:
- **Inngest Realtime** = ephemeral streaming during pipeline execution. Disappears when pipeline completes.
- **Supabase Realtime** = persistent data changes. New runs appear in run list for all users. Approval status changes update queue.

**Fallback if Inngest Realtime has issues:** Write step status to a `pipeline_steps` table in Supabase. Subscribe to that table via Supabase Realtime instead. Slightly more latency, but fully production-proven.

### Node Graph Data Flow

```
Pipeline spec (from design step)
  -> Extract agents + relationships
  -> Convert to @xyflow/react nodes + edges
  -> dagre layout (hierarchical, top-down)
  -> Render graph with custom AgentNode component
  -> During execution: update node status via Inngest Realtime subscription
```

### Supabase Plan Requirement

**Pro plan ($25/mo) recommended** -- not for SAML (using OAuth instead) but for:
- 8GB database (vs 500MB on Free)
- No project pausing after 1 week inactivity
- Daily backups
- Email support
- 100K monthly active users (vs 50K on Free -- irrelevant at 5-15 users, but good headroom)

The Free tier technically works for MVP but the 500MB database limit and auto-pause make it unsuitable for a production tool colleagues depend on.

## Confidence Assessment

| Component | Confidence | Basis |
|-----------|------------|-------|
| Next.js 16 + App Router | HIGH | Official docs confirm v16 stable with Turbopack, Feb 2026 |
| Supabase Auth (Microsoft OAuth + tenant lock) | HIGH | Official docs confirm tenant-restricted OAuth. Known gotcha with `/common` endpoint documented. |
| @supabase/ssr for App Router | HIGH | Official replacement for deprecated auth helpers. v0.9 published 2 days ago. |
| Supabase Realtime (Postgres Changes) | HIGH | v2 stable, well-documented, RLS-aware |
| Inngest v3 (durable workflows) | HIGH | v3.52 stable, Vercel Marketplace, 100K free executions |
| Inngest waitForEvent (HITL) | MEDIUM | Documented pattern, but multi-day waits (7d timeout for approvals) need validation in production |
| Inngest Realtime (streaming) | MEDIUM | Feature exists and is documented, but labeled "developer preview" -- may have edge cases |
| @xyflow/react v12 | HIGH | 20K+ stars, v12 stable, TypeScript-first, MIT licensed |
| shadcn/ui + Tailwind v4 | HIGH | Industry standard combo for Next.js in 2026 |
| Resend + React Email | HIGH | v6.9 stable, 1.3M weekly npm downloads, free tier sufficient |
| @dagrejs/dagre | HIGH | Mature library, standard for hierarchical graph layout |

## Sources

- [Next.js 16 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js App Router Docs](https://nextjs.org/docs/app)
- [Supabase Auth: Login with Azure](https://supabase.com/docs/guides/auth/social-login/auth-azure)
- [Supabase SAML SSO for Projects](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml)
- [Supabase SSR Package (npm)](https://www.npmjs.com/package/@supabase/ssr)
- [Supabase Realtime Docs](https://supabase.com/docs/guides/realtime)
- [Azure AD single-tenant OAuth discussion](https://github.com/orgs/supabase/discussions/1071)
- [Supabase Pricing](https://supabase.com/pricing)
- [Inngest npm](https://www.npmjs.com/package/inngest)
- [Inngest Realtime Docs](https://www.inngest.com/docs/features/realtime)
- [Inngest React Hooks for Realtime](https://www.inngest.com/docs/features/realtime/react-hooks)
- [Inngest Background Jobs Guide](https://www.inngest.com/docs/guides/background-jobs)
- [Inngest Vercel Marketplace](https://vercel.com/marketplace/inngest)
- [Inngest Pricing](https://www.inngest.com/pricing)
- [@xyflow/react npm](https://www.npmjs.com/package/@xyflow/react)
- [React Flow Documentation](https://reactflow.dev)
- [Resend npm](https://www.npmjs.com/package/resend)
- [React Email Documentation](https://react.email/docs/introduction)
- [shadcn/ui Next.js Installation](https://ui.shadcn.com/docs/installation/next)
- [shadcn/ui + Next.js 16 (2026)](https://adminlte.io/blog/nextjs-admin-dashboards-shadcn/)
