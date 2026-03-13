# Architecture Research

**Domain:** V3.0 Web UI & Dashboard -- integrating browser-based pipeline execution with existing markdown-based CLI agent design pipeline
**Researched:** 2026-03-13
**Confidence:** MEDIUM -- Inngest/Supabase/Next.js patterns are HIGH from official docs; prompt adapter design is MEDIUM (novel integration, no prior art); Inngest Realtime is MEDIUM (developer preview, not GA)

## System Overview

```
                         V3.0 Architecture
                         =================

  +-----------+     +-------------------+     +------------------+
  | Browser   |     | Next.js on Vercel |     | External APIs    |
  | (React)   |     | (App Router)      |     |                  |
  +-----------+     +-------------------+     +------------------+
  | Dashboard |<--->| API Routes        |---->| Orq.ai REST API  |
  | Node Graph|     | Server Actions    |     | Claude API       |
  | HITL UI   |     | Auth Middleware    |     | (pipeline LLM)   |
  | Run List  |     +--------+----------+     +------------------+
  +-----+-----+              |
        |                    |
        | Supabase Realtime  | Inngest SDK
        | (WebSocket)        | (event-driven)
        |                    |
  +-----v-----+     +-------v---------+
  | Supabase  |     | Inngest         |
  |           |     | (Workflow Engine)|
  +-----------+     +-----------------+
  | Auth      |     | Pipeline Steps  |
  |  (M365    |     |  (step.run)     |
  |   SSO)    |     | HITL Pauses     |
  | Database  |     |  (waitForEvent) |
  |  (Postgres|     | Realtime Push   |
  |   + RLS)  |     |  (publish)      |
  | Realtime  |     | Retries/Durable |
  +-----------+     +-----------------+
```

### How V3.0 Relates to Existing Architecture

The existing system is a Claude Code skill where ALL pipeline logic lives in markdown prompt files. Claude Code reads these `.md` files, follows the instructions, spawns subagents via the `Task` tool, and produces output files. The web UI does NOT replace this architecture -- it wraps it.

**Key insight:** The markdown prompt files are the single source of truth for pipeline behavior. The web app translates them into server-side execution via Inngest, but never duplicates the logic.

### Component Responsibilities

| Component | Responsibility | New vs Existing |
|-----------|----------------|-----------------|
| Next.js App Router | Frontend pages, API routes, server actions | NEW |
| Supabase Auth | M365 SSO via SAML 2.0, session management, RLS | NEW |
| Supabase Database | Pipeline runs, agent specs, approval queue, audit log | NEW |
| Supabase Realtime | Push pipeline progress to browser clients | NEW |
| Inngest | Durable pipeline execution, step orchestration, HITL pauses | NEW |
| Prompt Adapter | Translates markdown pipeline prompts to Inngest step functions | NEW (critical bridge) |
| Claude API | LLM execution engine (replaces Claude Code's local LLM calls) | NEW integration point |
| Orq.ai REST API | Agent CRUD, dataset ops, experiment execution | EXISTING (same endpoints) |
| Markdown Prompt Files | Pipeline logic, subagent instructions, templates | EXISTING (unchanged, read-only) |
| GitHub Repo | Distribution for CLI skill + auto-deploy for web app | EXISTING (expanded role) |

## Recommended Project Structure

```
web/                            # NEW -- Next.js app (separate from orq-agent/)
  src/
    app/                        # Next.js App Router
      (auth)/                   # Auth-gated layout group
        login/page.tsx          # M365 SSO login
      (dashboard)/              # Dashboard layout group
        page.tsx                # Run list (home)
        runs/[id]/page.tsx      # Single run detail + live log
        graph/[id]/page.tsx     # Node graph for a swarm
        approvals/page.tsx      # HITL approval queue
      api/
        inngest/route.ts        # Inngest webhook handler
        auth/callback/route.ts  # Supabase auth callback
        token/route.ts          # Inngest Realtime subscription token
    lib/
      supabase/
        client.ts               # Browser Supabase client
        server.ts               # Server Supabase client
        middleware.ts           # Auth middleware
      inngest/
        client.ts               # Inngest client instance
        functions/
          pipeline.ts           # Main pipeline Inngest function
          deploy.ts             # Deploy pipeline function
          test.ts               # Test pipeline function
          iterate.ts            # Iterate pipeline function
      prompt-adapter/
        adapter.ts              # Core: markdown prompt -> Claude API call
        parser.ts               # Parse markdown prompt files into structured sections
        context.ts              # Build Claude message context from pipeline state
        orqai-bridge.ts         # Translate MCP tool calls to Orq.ai REST API calls
      claude/
        client.ts               # Anthropic SDK wrapper
        streaming.ts            # SSE streaming for long-running calls
    components/
      dashboard/
        RunList.tsx              # Pipeline run list with status
        RunDetail.tsx            # Single run progress view
        LogStream.tsx            # Real-time log output
      graph/
        SwarmGraph.tsx           # React Flow node graph
        AgentNode.tsx            # Custom node: agent with status overlay
        EdgeFlow.tsx             # Custom edge: data flow with animation
      approvals/
        ApprovalCard.tsx         # Single approval item
        ApprovalQueue.tsx        # List of pending approvals
        DiffViewer.tsx           # Prompt change diff display
      pipeline/
        UseCaseInput.tsx         # Use case description form
        PipelineWizard.tsx       # Step-by-step pipeline config
    hooks/
      useRealtimePipeline.ts    # Inngest Realtime subscription hook
      useSupabaseRealtime.ts    # Supabase Realtime subscription hook
    types/
      pipeline.ts               # Pipeline run types
      approval.ts               # HITL approval types
      graph.ts                  # Node graph types
  supabase/
    migrations/                 # Database migrations
    seed.sql                    # Development seed data
  inngest/                      # Inngest dev server config

orq-agent/                      # EXISTING -- unchanged
  commands/                     # Pipeline orchestration prompts
  agents/                       # Subagent instruction prompts
  templates/                    # Output templates
  references/                   # Reference data
  SKILL.md                      # Skill index
```

### Structure Rationale

- **`web/` separate from `orq-agent/`:** The web app is a consumer of the markdown pipeline, not a replacement. Keeping them separate means the CLI skill continues to work exactly as-is. The web app reads from `orq-agent/` at build time or runtime.
- **`lib/prompt-adapter/`:** The critical bridge component. Isolated because it has the highest complexity and most novel design.
- **`lib/inngest/functions/`:** One Inngest function per pipeline command. Maps directly to existing `commands/` structure.
- **`components/` by domain:** Dashboard, graph, approvals, and pipeline are the four UI domains matching the V3.0 feature set.

## Architectural Patterns

### Pattern 1: Prompt Adapter (Markdown-to-API Bridge)

**What:** The prompt adapter reads existing markdown pipeline files (`commands/*.md`, `agents/*.md`) and translates them into Claude API calls with structured message contexts. It replaces Claude Code's role of "reading a markdown file and following instructions" with server-side programmatic execution.

**When to use:** Every pipeline execution from the web UI. This is the core integration pattern.

**Trade-offs:**
- PRO: Pipeline logic stays in markdown files (single source of truth, shared with CLI)
- PRO: No need to rewrite 10K+ lines of pipeline prompts as code
- CON: Requires parsing markdown structure (sections, steps, substeps) into API parameters
- CON: Subagent spawning (`Task` tool in CLI) must be reimplemented as nested Inngest steps

**How it works:**

```
1. User submits use case via browser
2. Inngest function triggers
3. Prompt adapter reads commands/orq-agent.md
4. Parser extracts: role, pipeline steps, files_to_read, subagent references
5. For each pipeline step:
   a. Build Claude API message with step instructions + accumulated context
   b. Call Claude API (streaming for long steps)
   c. Parse structured output
   d. Write progress to Supabase + publish to Inngest Realtime
   e. If step spawns a subagent: read that agent's .md file, recurse
6. Tool calls (MCP in CLI) -> Orq.ai REST API calls (in web)
```

**Critical design decisions:**

The adapter does NOT execute markdown instructions verbatim. It:
1. **Parses step structure** from markdown into a step DAG
2. **Translates CLI-specific patterns** (file reads, bash commands, MCP tool calls) into web equivalents (database reads, API calls, REST endpoints)
3. **Maps subagent spawning** (`Task` tool) to nested Inngest steps with their own Claude API calls
4. **Strips interactive elements** (user prompts, checkpoints) and replaces them with HITL events or pre-configured choices

```typescript
// Simplified prompt adapter flow
interface PipelineStep {
  id: string;
  instructions: string;      // Extracted from markdown
  subagentRef?: string;       // e.g., "agents/architect.md"
  toolCalls?: ToolMapping[];  // MCP -> REST translations
  checkpoint?: boolean;       // Requires HITL approval
}

async function executePipelineStep(
  step: PipelineStep,
  context: PipelineContext,
  inngestStep: InngestStep
) {
  // Each pipeline step becomes an Inngest step.run()
  const result = await inngestStep.run(`step-${step.id}`, async () => {
    const messages = buildMessages(step, context);
    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      messages,
      max_tokens: 8192,
    });
    return parseStructuredOutput(response);
  });

  // Publish progress for dashboard
  await inngestStep.run(`publish-${step.id}`, async () => {
    await publish(channel, { step: step.id, status: "complete", result });
  });

  // If subagent, recurse
  if (step.subagentRef) {
    const subSteps = parseMarkdownFile(step.subagentRef);
    for (const sub of subSteps) {
      await executePipelineStep(sub, { ...context, ...result }, inngestStep);
    }
  }
}
```

### Pattern 2: Inngest Durable Pipeline Orchestration

**What:** Each CLI command (`orq-agent`, `deploy`, `test`, `iterate`) becomes an Inngest function with `step.run()` for each pipeline phase and `step.waitForEvent()` for HITL approvals.

**When to use:** All pipeline execution from the web UI.

**Trade-offs:**
- PRO: Automatic retries on failures (each step is independently retriable)
- PRO: Pipeline survives Vercel function timeouts (Inngest manages state across invocations)
- PRO: Built-in Realtime for pushing progress to browser
- PRO: `waitForEvent` maps perfectly to HITL approval patterns
- CON: Inngest Cloud dependency (managed service)
- CON: Step granularity decisions affect both reliability and latency

**Example: Main Pipeline as Inngest Function**

```typescript
const pipelineFunction = inngest.createFunction(
  { id: "orq-agent-pipeline", name: "Orq Agent Pipeline" },
  { event: "pipeline/start" },
  async ({ event, step, publish }) => {
    const { useCase, userId, runId } = event.data;

    // Step 1: Run architect
    const blueprint = await step.run("architect", async () => {
      const prompt = readPromptFile("agents/architect.md");
      return callClaude(prompt, { useCase });
    });

    await publish(channel(runId), {
      type: "step-complete", step: "architect", data: blueprint
    });

    // Step 2: Blueprint review (HITL)
    const approval = await step.waitForEvent("blueprint-approval", {
      event: "pipeline/blueprint-approved",
      match: "data.runId",
      timeout: "24h",
    });

    if (!approval) {
      return { status: "timeout", step: "blueprint-review" };
    }

    // Step 3: Tool resolver
    const tools = await step.run("tool-resolver", async () => {
      const prompt = readPromptFile("agents/tool-resolver.md");
      return callClaude(prompt, { blueprint });
    });

    // Step 4: Research (conditional)
    // Step 5: Spec generation (parallel via step.run with Promise.all)
    // ... etc
  }
);
```

### Pattern 3: Dual Realtime Channels (Inngest + Supabase)

**What:** Use Inngest Realtime for ephemeral pipeline progress streaming (fast, low-latency) and Supabase Realtime for persistent state changes (database-backed, survives reconnect).

**When to use:** Dashboard and run detail views.

**Trade-offs:**
- PRO: Inngest Realtime is optimized for workflow progress (built-in, no extra infra)
- PRO: Supabase Realtime gives guaranteed delivery via database triggers
- CON: Two subscription systems to manage in client components

**Division of responsibility:**

| Data Type | Channel | Why |
|-----------|---------|-----|
| Step progress, log lines, partial outputs | Inngest Realtime | Ephemeral, high-frequency, lost on reconnect is OK |
| Run status changes (pending -> running -> complete) | Supabase Realtime | Must persist, must survive reconnect, drives run list |
| Approval state changes | Supabase Realtime | Must persist, triggers email notifications |
| Node graph execution overlay | Inngest Realtime | Real-time animation of which agent is active |

```typescript
// Client-side: dual subscription
function RunDetail({ runId }: { runId: string }) {
  // Inngest Realtime for live log stream
  const { data: liveLog } = useInngestSubscription({
    channel: `pipeline-${runId}`,
    topic: "progress",
    tokenFetcher: () => fetch("/api/token").then(r => r.json()),
  });

  // Supabase Realtime for persistent state
  useEffect(() => {
    const sub = supabase
      .channel(`run-${runId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "pipeline_runs",
        filter: `id=eq.${runId}`,
      }, (payload) => setRunState(payload.new))
      .subscribe();
    return () => sub.unsubscribe();
  }, [runId]);
}
```

### Pattern 4: HITL Approval via Inngest waitForEvent

**What:** Pipeline checkpoints (blueprint review, prompt iteration approval) pause execution using `step.waitForEvent()`. The browser sends approval events via an API route that calls `inngest.send()`.

**When to use:** Blueprint review (Step 4 in orq-agent.md), prompt change approval (failure-diagnoser HITL), and any future HITL gates.

**Trade-offs:**
- PRO: Pipeline genuinely pauses with zero resource consumption
- PRO: Approval can come hours/days later (configurable timeout)
- PRO: Approval state persists in Supabase for audit trail
- CON: Must handle timeout gracefully (24h default, then auto-reject or escalate)

**Flow:**

```
Pipeline running in Inngest
    |
    v
step.waitForEvent("blueprint-approval", { timeout: "24h" })
    |                                         ^
    | (paused)                                |
    |                                         |
    |    User clicks "Approve" in browser     |
    |         |                               |
    |         v                               |
    |    POST /api/approvals/{runId}/approve   |
    |         |                               |
    |         v                               |
    |    inngest.send("pipeline/blueprint-approved", { runId })
    |                                         |
    v  <--------------------------------------+
Pipeline resumes with approval data
```

## Data Flow

### Primary Pipeline Flow (Web UI)

```
User (Browser)
    |
    | 1. Submit use case description
    v
Next.js Server Action
    |
    | 2. Create pipeline_run in Supabase (status: "pending")
    | 3. inngest.send("pipeline/start", { runId, useCase, userId })
    v
Inngest Function: orq-agent-pipeline
    |
    | 4. For each pipeline step:
    |    a. Read markdown prompt from orq-agent/ directory
    |    b. prompt-adapter: parse -> build messages -> call Claude API
    |    c. Parse Claude response for structured output
    |    d. If tool calls needed: translate MCP -> Orq.ai REST API
    |    e. Publish progress via Inngest Realtime
    |    f. Update pipeline_run in Supabase
    |    g. If HITL checkpoint: step.waitForEvent()
    v
Pipeline Complete
    |
    | 5. Update pipeline_run status to "complete"
    | 6. Store generated artifacts in Supabase DB
    v
User sees results in Dashboard
```

### CLI Pipeline Flow (Unchanged)

```
User (Terminal)
    |
    | 1. /orq-agent "description"
    v
Claude Code reads commands/orq-agent.md
    |
    | 2. Follows markdown instructions step-by-step
    | 3. Spawns subagents via Task tool
    | 4. Uses MCP tools for Orq.ai operations
    | 5. Writes output to local filesystem
    v
User sees results in terminal + Agents/ directory
```

Both flows use the SAME markdown prompt files. The web flow adds persistence (Supabase), durability (Inngest), and real-time visibility (Realtime channels). The CLI flow is completely unaffected.

### Data Model (Supabase)

```sql
-- Core tables
pipeline_runs (
  id uuid PK DEFAULT gen_random_uuid(),
  user_id uuid FK -> auth.users NOT NULL,
  use_case text NOT NULL,
  status text CHECK (status IN
    ('pending', 'running', 'paused_for_approval', 'complete', 'failed'))
    DEFAULT 'pending',
  swarm_name text,
  inngest_run_id text,          -- Link to Inngest run for debugging
  config jsonb DEFAULT '{}',    -- Pipeline configuration choices
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

pipeline_steps (
  id uuid PK DEFAULT gen_random_uuid(),
  run_id uuid FK -> pipeline_runs NOT NULL,
  step_name text NOT NULL,      -- "architect", "tool-resolver", "spec-gen-agent-1"
  status text CHECK (status IN
    ('pending', 'running', 'complete', 'failed', 'skipped'))
    DEFAULT 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  output_summary text,          -- Brief result for dashboard display
  output_data jsonb             -- Full structured output
);

agent_specs (
  id uuid PK DEFAULT gen_random_uuid(),
  run_id uuid FK -> pipeline_runs NOT NULL,
  agent_key text NOT NULL,
  spec_content text,            -- Full markdown spec content
  orqai_id text,                -- After deployment
  orqai_version text,
  deployed_at timestamptz
);

approvals (
  id uuid PK DEFAULT gen_random_uuid(),
  run_id uuid FK -> pipeline_runs NOT NULL,
  step_name text NOT NULL,      -- Which step needs approval
  approval_type text CHECK (approval_type IN
    ('blueprint_review', 'prompt_change', 'guardrail')) NOT NULL,
  status text CHECK (status IN
    ('pending', 'approved', 'rejected', 'timeout'))
    DEFAULT 'pending',
  payload jsonb NOT NULL,       -- What is being approved (blueprint, diff, etc.)
  decided_by uuid FK -> auth.users,
  decided_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- RLS policies
-- pipeline_runs: users see only their own runs
-- pipeline_steps: inherited from pipeline_runs via run_id
-- agent_specs: inherited from pipeline_runs via run_id
-- approvals: visible to ALL authenticated users (team workflow)
```

### MCP-to-REST Translation Layer

The existing pipeline uses MCP tools (via Claude Code) for Orq.ai operations. The web app cannot use MCP -- it must use REST API directly. The `orqai-bridge.ts` component handles this translation:

```
CLI (Claude Code)                  Web (Inngest + Claude API)
-----------------                  --------------------------
mcp__orqai__agents-create    -->   POST /v2/agents
mcp__orqai__agents-update    -->   PATCH /v2/agents/{id}
mcp__orqai__agents-retrieve  -->   GET /v2/agents/{key}
mcp__orqai__tools-create     -->   POST /v2/tools
mcp__orqai__tools-update     -->   PATCH /v2/tools/{id}
mcp__orqai__models-list      -->   GET /v2/models
create_dataset               -->   POST /v2/datasets
create_datapoints            -->   POST /v2/datasets/{id}/rows
create_experiment            -->   POST /v2/experiments
list_experiment_runs         -->   GET /v2/experiments/{id}/results
```

This means the web pipeline ALWAYS uses REST API (no MCP). The prompt adapter strips MCP-specific instructions from markdown prompts and injects REST API calling context instead.

## Key Integration Points

### 1. Prompt File Reading

| Context | How Prompts Are Read |
|---------|---------------------|
| CLI (Claude Code) | Claude reads `.md` files from `~/.claude/skills/orq-agent/` |
| Web (Inngest) | Node.js `fs.readFileSync()` from repo checkout on Vercel |

**Recommendation:** Bundle `orq-agent/` directory into the Next.js build. Vercel deploys the full repo, so the files are available at `process.cwd() + '/orq-agent/'`. No GitHub API fetch needed at runtime. Pipeline logic auto-deploys on every `git push`.

### 2. Subagent Spawning

| Context | How Subagents Run |
|---------|-------------------|
| CLI | `Task` tool spawns a new Claude Code session with the subagent's `.md` file as instructions |
| Web | Nested `step.run()` in Inngest, each calling Claude API with the subagent's `.md` content as system prompt |

**Key difference:** In CLI, subagent spawning is implicit (Claude reads "spawn the architect" and uses the Task tool). In web, it is explicit -- the prompt adapter identifies subagent references in the markdown, pre-parses them, and wires them as Inngest steps.

### 3. File I/O

| Context | How Files Are Written |
|---------|----------------------|
| CLI | Claude writes files to local filesystem (`Agents/[swarm-name]/`) |
| Web | Pipeline writes to Supabase DB (structured data) + Supabase Storage (downloadable artifacts) |

The prompt adapter intercepts file write instructions in Claude's responses and redirects them to Supabase.

### 4. Tool Call Translation

| Context | How Orq.ai Operations Execute |
|---------|-------------------------------|
| CLI | MCP tools (when available) or REST API fallback |
| Web | REST API always (MCP not available in server environment) |

### 5. Interactive Prompts / HITL

| Context | How User Interaction Works |
|---------|--------------------------|
| CLI | Claude asks questions in terminal, user types responses |
| Web | `step.waitForEvent()` pauses pipeline; browser UI sends approval event |

### 6. Discussion Step (Step 2 in orq-agent.md)

| Context | How Discussion Works |
|---------|---------------------|
| CLI | Interactive Q&A in terminal (gray areas, KB discussion) |
| Web | Pre-pipeline wizard UI collects all discussion inputs upfront; passed as config to Inngest function |

**Why a wizard, not live chat:** The CLI discussion step involves 4-8 sequential questions with conditional branching (KB detection, area selection). In a browser, this maps to a multi-step form (wizard) that collects all inputs before pipeline launch. The pipeline then runs with pre-populated discussion decisions -- no mid-pipeline user interaction needed for the discussion phase.

## Node Graph Architecture

### React Flow Integration

The node graph uses `@xyflow/react` (React Flow v12+) with custom node and edge components. It serves two purposes:

1. **Static view:** Show the agent swarm topology (agents as nodes, data flow as edges) after pipeline completes
2. **Live view:** During pipeline execution, overlay real-time status on nodes (pending/running/complete/failed)

**Data source:** The architect subagent produces a blueprint with agent roles, orchestration pattern, and agent-as-tool assignments. This translates directly to a graph:

```typescript
// Blueprint -> Graph nodes/edges
function blueprintToGraph(blueprint: Blueprint): { nodes: Node[], edges: Edge[] } {
  const nodes = blueprint.agents.map(agent => ({
    id: agent.key,
    type: "agent",                    // Custom AgentNode component
    data: {
      label: agent.key,
      role: agent.role,
      model: agent.model,
      status: "pending",              // Updated via Realtime
    },
    position: layoutEngine(agent),    // Auto-layout via dagre/elk
  }));

  const edges = blueprint.orchestration.tools.map(tool => ({
    id: `${tool.caller}-${tool.callee}`,
    source: tool.caller,
    target: tool.callee,
    type: "dataFlow",                 // Custom EdgeFlow component
    animated: false,                  // Set to true when active
  }));

  return { nodes, edges };
}
```

**Live status overlay:** Subscribe to Inngest Realtime `step-complete` events. When a step completes for a specific agent, update that node's status and animate the corresponding edges.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 5-15 users (target) | Current architecture is sufficient. Single Supabase project, Inngest free/starter tier, Vercel hobby/pro. No optimization needed. |
| 50-100 users | Add Supabase connection pooling (PgBouncer). Monitor Inngest concurrent function limits. Consider caching compiled prompt files. |
| 100+ users | Unlikely for this internal tool. If reached: dedicated Supabase instance, Inngest enterprise tier, edge caching for static prompt files. |

### Scaling Priorities

1. **First bottleneck:** Claude API rate limits. Each pipeline run makes 10-20+ Claude API calls. At 15 concurrent users, that is 150-300 parallel requests. Solution: queue pipeline starts, batch where possible, use `claude-sonnet-4-20250514` for speed on non-critical steps.
2. **Second bottleneck:** Inngest concurrent function limits. Free tier allows 5 concurrent functions. Starter tier allows more. For 15 users, starter tier is sufficient.

## Anti-Patterns

### Anti-Pattern 1: Duplicating Pipeline Logic in TypeScript

**What people do:** Rewrite the markdown pipeline steps as TypeScript code, abandoning the markdown prompts.
**Why it is wrong:** Creates two sources of truth. CLI and web diverge immediately. Every pipeline change requires updating both codebases. The markdown prompts encode 10K+ lines of carefully tuned logic.
**Do this instead:** Use the prompt adapter to read and execute markdown prompts programmatically. The TypeScript code is plumbing, not logic.

### Anti-Pattern 2: Running Claude Code on the Server

**What people do:** Try to invoke `claude` CLI binary from the web server to run pipeline commands directly.
**Why it is wrong:** Claude Code requires an interactive terminal, authentication state, and local filesystem access. It cannot run in a serverless environment (Vercel). It also cannot provide real-time streaming to a browser client.
**Do this instead:** Use the Anthropic SDK (`@anthropic-ai/sdk`) to call Claude API directly. The prompt adapter translates markdown instructions into API call parameters.

### Anti-Pattern 3: Single Monolithic Inngest Function

**What people do:** Put the entire pipeline (design + deploy + test + iterate) into one Inngest function with 50+ steps.
**Why it is wrong:** Inngest functions have execution time limits. A single function spanning hours (with HITL waits) is fragile. Debugging is impossible. State accumulation across steps becomes unwieldy.
**Do this instead:** One Inngest function per command (`pipeline`, `deploy`, `test`, `iterate`). Chain them with events: pipeline completion can trigger deploy, deploy completion can trigger test, etc. Each function is independently retriable and debuggable.

### Anti-Pattern 4: Storing Full Agent Specs in Realtime Payloads

**What people do:** Broadcast entire agent spec content (multi-KB markdown) through Realtime channels.
**Why it is wrong:** Realtime channels have message size limits. Broadcasting full specs floods the WebSocket. Clients do not need full content for progress display.
**Do this instead:** Broadcast progress summaries (step name, status, one-line result). Store full content in Supabase DB. Client fetches full content only when user navigates to detail view.

### Anti-Pattern 5: Building the Discussion Step as Live Chat

**What people do:** Implement the CLI's interactive discussion (gray areas, KB detection) as a real-time chat interface between the user and Claude in the browser.
**Why it is wrong:** The discussion step involves 4-8 sequential questions with conditional branches. Implementing this as live chat requires maintaining a stateful conversation server-side, handling reconnects, and managing partial state. It also delays pipeline start until the chat completes.
**Do this instead:** Build a multi-step wizard/form that collects all discussion inputs upfront. Pass the completed form data as the pipeline's `config` parameter. The prompt adapter includes these decisions as context when building the Claude API messages for the architect and downstream steps.

## External Service Integration

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Supabase Auth | SAML 2.0 SSO with Azure AD (M365) | Pro plan required for enterprise SSO. Configure via Supabase dashboard. Domain restriction to `@moyneroberts.com`. |
| Supabase Database | Postgres with Row Level Security | RLS policies filter by `auth.uid()`. Approvals table uses team-level access (any authenticated user can view/approve). |
| Supabase Realtime | Postgres Changes + Broadcast | Subscribe to `pipeline_runs` and `approvals` table changes via `postgres_changes`. Use Broadcast channel for ephemeral notifications. |
| Inngest Cloud | Vercel Marketplace integration | Install via Vercel Marketplace. Serve endpoint at `/api/inngest`. Auto-discovers functions from `lib/inngest/functions/`. |
| Inngest Realtime | WebSocket via `useInngestSubscription` React hook | Developer preview (released May 2025). Publish from Inngest functions via `publish()`. Subscribe from React components. Token-based auth via `/api/token` route. |
| Claude API | Anthropic SDK (`@anthropic-ai/sdk`) | Direct API calls from within Inngest `step.run()` functions. Streaming for long-running steps. API key stored in Vercel environment variables. |
| Orq.ai REST API | HTTP `fetch()` via `orqai-bridge.ts` | All operations via REST (no MCP in server context). API key stored in Vercel environment variables. Bearer token auth. Endpoints documented in `orq-agent/references/orqai-api-endpoints.md`. |
| React Flow | `@xyflow/react` (v12+) | Node graph visualization. Custom node components (`AgentNode`) for agents. Real-time status overlay via Inngest Realtime subscription updating node `data.status`. |

## Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Browser <-> Next.js | Server Actions + API Routes | Server Actions for mutations (start pipeline, approve). API Routes for Inngest webhook + auth callback + Inngest token. |
| Next.js <-> Inngest | `inngest.send()` events | Fire-and-forget event dispatch. Inngest handles execution durably. |
| Inngest <-> Supabase | Server-side Supabase client (`@supabase/ssr`) | Inngest functions write pipeline state to Supabase DB using service role key (bypasses RLS for writes). |
| Inngest <-> Claude API | Anthropic SDK within `step.run()` | Each pipeline step is a Claude API call. Step retries handle transient API failures automatically. |
| Inngest <-> Orq.ai | REST API via `orqai-bridge.ts` | Tool call translation layer. All Orq.ai operations are REST. |
| Prompt Adapter <-> Markdown Files | `fs.readFileSync()` | Reads from bundled `orq-agent/` directory. Files are part of the Vercel build artifact. |
| CLI Skill <-> Web App | None (independent) | Both read from same `orq-agent/` prompt files in the Git repo. No runtime communication between CLI and web. |

## Suggested Build Order

Based on dependency analysis, the V3.0 web features should be built in this order:

| Phase | Component | Depends On | Rationale |
|-------|-----------|------------|-----------|
| 1 | Next.js app shell + Supabase Auth (M365 SSO) | Nothing | Foundation. Cannot build anything user-facing without auth. Validates Supabase SAML 2.0 + Azure AD early -- this is a configuration-heavy step that can fail in unexpected ways. |
| 2 | Database schema + RLS policies | Phase 1 | Tables, RLS policies, migrations. All subsequent features write to the DB. Must be solid before any pipeline code runs. |
| 3 | Prompt Adapter (core) | Phases 1-2 | The hardest and most novel component. Parse markdown, build Claude API messages, handle tool call translation. Test with a single subagent (architect) end-to-end before expanding. |
| 4 | Inngest pipeline function (main pipeline only) | Phase 3 | Wire prompt adapter into Inngest steps. Execute the `orq-agent` command end-to-end via web. No HITL yet -- auto-approve everything in initial version. |
| 5 | Dashboard: Run List + Run Detail + Log Stream | Phases 2, 4 | First visible UI beyond login. Shows pipeline runs with real-time progress and log output. Uses both Inngest Realtime and Supabase Realtime. |
| 6 | HITL Approval Flow | Phases 4, 5 | Add `step.waitForEvent()` for blueprint review and prompt changes. Build approval UI (queue, approval card, diff viewer). Wire email notifications via Supabase edge functions or Inngest. |
| 7 | Node Graph Visualization | Phases 2, 5 | React Flow graph of agent swarm. Reads swarm structure from pipeline output. Execution overlay connects to Inngest Realtime for live status animation. |
| 8 | Deploy, Test, Iterate pipeline functions | Phases 3, 4, 6 | Remaining pipeline commands as separate Inngest functions. Triggered automatically after main pipeline or manually from dashboard. Reuses prompt adapter and orqai-bridge patterns from Phase 3-4. |

### Build Order Rationale

- **Phase 3 (prompt adapter) is the highest-risk, highest-novelty component.** Build it early so integration issues surface before the UI is built on top. If the adapter does not work, the entire V3.0 architecture needs rethinking.
- **Phase 4 (Inngest pipeline) validates the full execution path** (browser -> Inngest -> Claude API -> Orq.ai REST -> Supabase) before any UI work begins. This is the critical proof-of-concept.
- **Phase 5 (dashboard) is the first user-visible feature** and provides debugging visibility for all subsequent development.
- **Phase 6 (HITL) depends on both the pipeline (to pause) and the dashboard (to display approvals).** Cannot build in isolation.
- **Phase 7 (node graph) is visually impressive but has the fewest dependencies** on other web components -- it mostly reads data that already exists from completed pipeline runs.
- **Phase 8 (remaining pipelines) is deferred** because the main pipeline (`orq-agent`) validates all patterns. Deploy, test, and iterate follow the same adapter + Inngest + Realtime patterns.

## Sources

- [Inngest Documentation -- Steps & Workflows](https://www.inngest.com/docs/features/inngest-functions/steps-workflows) -- `step.run()`, `step.waitForEvent()`, durable function patterns. HIGH confidence.
- [Inngest Realtime -- React Hooks](https://www.inngest.com/docs/features/realtime/react-hooks) -- `useInngestSubscription()` hook for streaming updates to browser. MEDIUM confidence (developer preview, released May 2025).
- [Inngest for Vercel Marketplace](https://vercel.com/marketplace/inngest) -- Marketplace integration, deployment pattern. HIGH confidence.
- [Inngest Blog -- Background Jobs with Realtime in Next.js](https://www.inngest.com/blog/background-jobs-realtime-nextjs) -- Combined Inngest + realtime update pattern. HIGH confidence.
- [Inngest -- Wait for Event Reference](https://www.inngest.com/docs/reference/functions/step-wait-for-event) -- `step.waitForEvent()` API, timeout, matching conditions. HIGH confidence.
- [AgentKit by Inngest -- Human-in-the-Loop](https://agentkit.inngest.com/advanced-patterns/human-in-the-loop) -- HITL approval pattern with `waitForEvent`. MEDIUM confidence.
- [Supabase -- Using Realtime with Next.js](https://supabase.com/docs/guides/realtime/realtime-with-nextjs) -- Realtime subscription patterns in Next.js. HIGH confidence.
- [Supabase -- Enterprise SSO with SAML 2.0](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml) -- SAML 2.0 configuration, Pro plan requirement. HIGH confidence.
- [Supabase -- Azure AD SSO Setup](https://supabase.com/docs/guides/platform/sso/azure) -- Azure AD-specific configuration steps. HIGH confidence.
- [Supabase -- Azure Social Login](https://supabase.com/docs/guides/auth/social-login/auth-azure) -- OAuth alternative to SAML for Azure AD. MEDIUM confidence (SAML preferred for enterprise).
- [React Flow (xyflow)](https://reactflow.dev) -- Node-based UI library for graph visualization. HIGH confidence.
- [Inngest Realtime Changelog](https://www.inngest.com/changelog/2025-05-19-realtime) -- Realtime feature announcement, developer preview status confirmed. MEDIUM confidence.
- [Building AI Agent Interfaces with React Flow](https://damiandabrowski.medium.com/day-90-of-100-days-agentic-engineer-challenge-ai-agent-interfaces-with-react-flow-21538a35d098) -- React Flow for AI agent visualization patterns. LOW confidence (blog post).

---
*Architecture research for: V3.0 Web UI & Dashboard -- integration with existing markdown-based pipeline*
*Researched: 2026-03-13*
