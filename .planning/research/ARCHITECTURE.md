# Architecture: Browser Automation Builder Pipeline Stage

**Domain:** V4.0 Browser Automation Builder -- adding SOP-to-MCP-tool pipeline stage to existing Inngest-orchestrated agent design pipeline
**Researched:** 2026-03-23
**Confidence:** MEDIUM-HIGH -- Inngest patterns verified via official docs and existing codebase; Browserless.io integration verified via official docs; Orq.ai MCP tool creation verified via API docs; Claude vision API verified via official docs; Vercel MCP hosting verified via official Vercel docs

## Executive Summary

The browser automation builder integrates as a **conditional sub-pipeline** within the existing Inngest `executePipeline` function. It activates after the spec-generator stage when the architect identifies agents that need browser automation for no-API systems. The sub-pipeline uses `step.waitForEvent()` for HITL interactions (SOP upload, annotation confirmation, test validation) -- a pattern not yet used in the codebase but native to Inngest. Browserless.io connects via WebSocket (`connectOverCDP`) within Inngest step.run() calls, with script execution fitting within Vercel's 300s Pro timeout. MCP tools deploy to a dedicated route in the existing Next.js app using `@vercel/mcp-adapter`, then register with Orq.ai via `POST /v2/tools`.

## Recommended Architecture

### High-Level Flow

```
Existing Pipeline                    New Sub-Pipeline (conditional)
=================                    ==============================

architect         ─┐
tool-resolver      │
researcher         │  (existing stages,
spec-generator    ─┘   unchanged)
        │
        ▼
[automation-detector]  ─── NO ──→  (continue to orchestration-generator)
        │
       YES
        ▼
[sop-upload]           ← step.waitForEvent("automation/sop.uploaded")
        │                  User uploads SOP doc + screenshots via UI
        ▼
[sop-analyzer]         ← Claude vision API (base64 images + SOP text)
        │                  Produces structured step list with selectors
        ▼
[annotation-review]    ← step.waitForEvent("automation/annotation.confirmed")
        │                  User confirms/corrects AI understanding
        ▼
[script-generator]     ← Claude API generates Playwright script
        │                  from confirmed annotations
        ▼
┌─[script-executor]    ← Browserless.io connectOverCDP
│       │                  runs Playwright against target system
│       ▼
│  [test-reviewer]     ← step.waitForEvent("automation/test.reviewed")
│       │                  User sees results, approves or requests changes
│       │
│      FAIL ──────────── loops back to script-generator (max 5 iterations)
│       │
└───── OK
        │
        ▼
[mcp-deployer]         ← Creates Orq.ai MCP tool via POST /v2/tools
        │                  Attaches to target agent via PUT /v2/agents
        ▼
orchestration-generator ─┐
dataset-generator        │  (existing stages,
readme-generator        ─┘   continue as before)
```

### Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|--------------|
| `automation-detector` | Analyzes architect blueprint + spec-gen output for no-API system indicators (NXT, iController, Intelly, or generic "no API" markers) | Reads `stageResults.architect` and `stageResults["spec-generator"]` | **NEW** Inngest step |
| `sop-upload-handler` | Accepts SOP document + screenshot files from UI, stores in Supabase Storage, records in `pipeline_files` + new `automation_tasks` table | Supabase Storage, `pipeline_files` table | **NEW** API route + UI component |
| `sop-analyzer` | Sends screenshots as base64 to Claude vision API with SOP text, produces structured step-by-step automation plan | Claude API (vision), Supabase (reads files, writes analysis) | **NEW** Inngest step + prompt adapter variant |
| `annotation-review-ui` | Displays AI-generated step list with annotated screenshots, allows user to confirm/edit/reject steps | Broadcasts via `run:{runId}`, receives via `automation/annotation.confirmed` event | **NEW** UI component |
| `script-generator` | Generates Playwright script from confirmed step annotations using Claude API | Claude API (text), reads confirmed annotations from Supabase | **NEW** Inngest step + prompt |
| `script-executor` | Connects to Browserless.io via `connectOverCDP`, runs generated Playwright script, captures results/screenshots | Browserless.io WebSocket, Supabase Storage (result screenshots) | **NEW** Inngest step |
| `test-review-ui` | Shows execution results (pass/fail, screenshots, error logs), lets user approve or request iteration | Broadcasts via `run:{runId}`, receives via `automation/test.reviewed` event | **NEW** UI component |
| `mcp-tool-route` | Hosts the verified Playwright script as a callable MCP tool endpoint | Receives requests from Orq.ai agent runtime, calls Browserless.io | **NEW** Next.js API route with `@vercel/mcp-adapter` |
| `mcp-deployer` | Registers MCP tool with Orq.ai via `POST /v2/tools`, attaches to agent via `PUT /v2/agents` | Orq.ai API | **NEW** Inngest step |
| `pipeline.ts` | Main Inngest function -- needs conditional branch after spec-generator | Orchestrates all steps | **MODIFIED** |
| `stages.ts` | Pipeline stage definitions -- needs automation stages added | Referenced by pipeline.ts and UI | **MODIFIED** |
| `events.ts` | Inngest event types -- needs new HITL events | Referenced by pipeline.ts and API routes | **MODIFIED** |
| `broadcast.ts` | Real-time update helpers -- needs automation-specific payloads | Called by new Inngest steps | **MODIFIED** (minor) |

### Data Flow

#### 1. Detection Flow (no user interaction)
```
architect output (blueprint)
  + spec-generator output (agent specs)
  → automation-detector step
  → scans for no-API keywords/tool references
  → writes automation_tasks[] to Supabase (agent_name, system_name, detected_reason)
  → returns { needsAutomation: true, tasks: [...] }
```

#### 2. Upload Flow (HITL)
```
UI receives broadcast: "automation needed for [agent] targeting [system]"
  → user navigates to upload view
  → uploads SOP document (PDF/DOCX) + screenshots (PNG/JPG)
  → files stored in Supabase Storage bucket: `automation-assets/{runId}/{taskId}/`
  → metadata recorded in pipeline_files table
  → UI sends event: inngest.send("automation/sop.uploaded", { runId, taskId, fileIds })
  → pipeline resumes from step.waitForEvent()
```

#### 3. Analysis Flow (AI + HITL)
```
sop-analyzer step receives file references
  → downloads SOP document from Supabase Storage
  → downloads screenshots from Supabase Storage
  → builds Claude API request:
      - system prompt: SOP analysis instructions (from GitHub .md file)
      - user message: SOP text content + base64-encoded screenshots
  → Claude returns structured step list:
      { steps: [{ order, action, target_element, expected_result, screenshot_ref }] }
  → stores analysis in automation_tasks.analysis_result (JSONB)
  → broadcasts: "annotation ready for review"
  → step.waitForEvent("automation/annotation.confirmed", { match: "data.taskId", timeout: "7d" })
  → user reviews, confirms/edits in UI
  → event received with confirmed_steps payload
```

#### 4. Script Generation + Test Loop (AI + Browserless + HITL)
```
script-generator step receives confirmed annotations
  → builds Claude API request:
      - system prompt: Playwright generation instructions
      - user message: confirmed step list + system URL + credentials pattern
  → Claude returns Playwright script as string
  → stores script in automation_tasks.current_script

script-executor step:
  → connects: playwright.chromium.connectOverCDP(browserlessWSUrl)
  → executes generated script
  → captures: screenshots at each step, final result, any errors
  → stores execution results in automation_tasks.test_results (JSONB)
  → stores result screenshots in Supabase Storage

test-reviewer (HITL):
  → broadcasts: "test results ready for review"
  → step.waitForEvent("automation/test.reviewed", { match: "data.taskId", timeout: "7d" })
  → if approved: proceed to mcp-deployer
  → if rejected: loop back with user feedback, regenerate script (max 5 iterations)
```

#### 5. MCP Deployment Flow
```
mcp-deployer step:
  → stores finalized script in Supabase (automation_tasks.final_script)
  → script becomes available at MCP endpoint: /api/mcp/[toolKey]/
  → registers with Orq.ai:
      POST /v2/tools { type: "mcp", mcp: { server_url, connection_type: "http" } }
  → attaches to target agent:
      PUT /v2/agents/{agentKey} { settings: { tools: [...existing, { tool_id }] } }
  → stores tool_id in automation_tasks.orq_tool_id
```

## Patterns to Follow

### Pattern 1: Conditional Sub-Pipeline via Inngest Steps

**What:** The automation stages execute as additional Inngest steps within the existing `executePipeline` function, gated by a conditional check.

**When:** After spec-generator completes, before orchestration-generator.

**Why this over a separate Inngest function:** The existing pipeline already loops through `PIPELINE_STAGES` and accumulates `stageResults`. A separate function would require `step.invoke()` and lose access to the accumulated context. Keeping it in the same function maintains the existing pattern and data flow.

**Example:**
```typescript
// In pipeline.ts, after the existing stage loop:
const automationNeeded = await step.run("automation-detector", async () => {
  // Analyze blueprint + specs for no-API indicators
  const blueprint = stageResults.architect || "";
  const specs = stageResults["spec-generator"] || "";
  return detectAutomationNeeds(blueprint, specs);
});

if (automationNeeded.tasks.length > 0) {
  for (const task of automationNeeded.tasks) {
    // Each automation task runs its own sub-sequence of steps
    await runAutomationSubPipeline(step, runId, task, stageResults);
  }
}

// Continue with existing stages: orchestration-generator, etc.
```

### Pattern 2: step.waitForEvent for HITL Interactions

**What:** Pause the durable function until a user action triggers a matching event. This is the standard Inngest pattern for human-in-the-loop workflows.

**When:** SOP upload, annotation review, test result approval.

**Why:** The existing pipeline has no HITL steps -- all stages run autonomously. The automation builder is the first stage requiring user interaction mid-pipeline. `step.waitForEvent()` is purpose-built for this: the function suspends (no compute cost), resumes when the matching event arrives, and times out gracefully.

**Example:**
```typescript
// Wait for user to upload SOP + screenshots
const uploadEvent = await step.waitForEvent("wait-for-sop-upload", {
  event: "automation/sop.uploaded",
  match: "data.taskId",  // Match on the specific automation task
  timeout: "7d",         // Give user 7 days to upload
});

if (!uploadEvent) {
  // Timeout -- mark task as skipped
  await markTaskSkipped(admin, task.id, "SOP upload timed out");
  return;
}

// Continue with SOP analysis using uploadEvent.data.fileIds
```

**Event sending from UI (Next.js Server Action):**
```typescript
export async function submitSOPUpload(taskId: string, runId: string, fileIds: string[]) {
  await inngest.send({
    name: "automation/sop.uploaded",
    data: { taskId, runId, fileIds },
  });
}
```

### Pattern 3: Vision-Augmented Prompt Adapter

**What:** Extend the existing `runPromptAdapter` to support Claude's vision API by including base64-encoded images in the messages array.

**When:** SOP analysis step, where screenshots need to be understood alongside text.

**Why:** The existing adapter only handles text-to-text (system prompt + XML-tagged user message). The SOP analyzer needs to send images. Rather than creating a completely separate path, extend the adapter with an optional `images` parameter.

**Example:**
```typescript
// New function alongside existing runPromptAdapter
export async function runVisionAdapter(
  stage: string,
  context: Record<string, string>,
  images: Array<{ base64: string; mediaType: string }>
): Promise<string> {
  // Build user content blocks: text + images
  const userContent: ContentBlock[] = [
    { type: "text", text: buildUserMessage(context) },
    ...images.map(img => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
    })),
  ];

  // Same Orq.ai router call, but with content blocks instead of string
  // ...
}
```

### Pattern 4: Browserless.io Execution Within Inngest Step

**What:** Run Playwright scripts on Browserless.io inside an Inngest `step.run()`, using `playwright-core` and `connectOverCDP`.

**When:** Script testing step.

**Why:** Inngest steps retry on failure (3 retries configured) and have per-step timeout equal to the serverless function timeout (300s on Vercel Pro). Browserless.io sessions on the Prototyping plan allow up to 15 minutes, far exceeding the Vercel limit. The step handles the WebSocket connection, script execution, and cleanup within the serverless function lifecycle.

**Critical constraint:** Use `playwright-core` (not full `playwright`) because it is the library-only package without bundled browsers -- browsers are provided by Browserless.io. This keeps the Vercel deployment size manageable.

**Example:**
```typescript
import { chromium } from "playwright-core";

const result = await step.run(`execute-script-${task.id}`, async () => {
  const browser = await chromium.connectOverCDP(
    `wss://production-sfo.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`
  );
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Execute the generated script
    const execResult = await executeGeneratedScript(page, task.currentScript);

    // Capture result screenshots
    const screenshots = await captureStepScreenshots(page, task.steps);

    return { success: execResult.success, errors: execResult.errors, screenshots };
  } finally {
    await browser.close();
  }
});
```

### Pattern 5: MCP Tool Hosting on Same Vercel App

**What:** Host MCP tool endpoints as part of the existing Next.js app using `@vercel/mcp-adapter`, with each automation tool served from a dynamic route.

**When:** After script is verified and approved.

**Why:** Deploying a separate MCP server would add infrastructure complexity. Vercel natively supports MCP servers within Next.js apps via `@vercel/mcp-adapter`. The tool endpoint receives calls from Orq.ai's agent runtime, executes the Playwright script on Browserless.io, and returns results. This keeps everything in one deployment.

**Route structure:**
```
app/api/mcp/[transport]/route.ts  -- MCP adapter endpoint
```

**Example:**
```typescript
// app/api/mcp/[transport]/route.ts
import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";

const handler = createMcpHandler(
  (server) => {
    // Dynamically register tools from database
    // Each verified automation script becomes a callable tool
    server.tool(
      "nxt-create-invoice",
      "Create an invoice in the NXT system",
      { invoiceData: z.object({ /* schema from automation task */ }) },
      async ({ invoiceData }) => {
        // Load script from Supabase, execute on Browserless.io
        const result = await executeBrowserAutomation("nxt-create-invoice", invoiceData);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    );
  },
  { basePath: "/api/mcp", maxDuration: 300 }
);

export { handler as GET, handler as POST, handler as DELETE };
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Separate Inngest Function for Automation

**What:** Creating a new `inngest.createFunction()` for the automation sub-pipeline and invoking it via `step.invoke()`.

**Why bad:** Loses access to `stageResults` context from the main pipeline. Adds complexity for error handling (the onFailure handler in the main function wouldn't cover it). The automation sub-pipeline's results need to feed back into the main pipeline (e.g., the MCP tool reference needs to appear in the orchestration spec).

**Instead:** Keep automation steps as conditional steps within the existing `executePipeline` function. The function already supports up to 1000 steps per run (Inngest limit), and the automation sub-pipeline adds at most ~30 steps (5 tasks x 6 steps each).

### Anti-Pattern 2: Streaming Claude API in Inngest Steps

**What:** Using Claude's streaming API for the vision analysis to reduce perceived latency.

**Why bad:** Already documented in the existing pipeline.ts comments: "Non-streaming Claude API calls (streaming incompatible with Inngest steps)." Inngest steps must return a serializable value. Streaming responses cannot be accumulated within `step.run()` because the function may be re-invoked at any point.

**Instead:** Use non-streaming API calls. Broadcast progress updates between steps to keep the UI responsive.

### Anti-Pattern 3: Storing Playwright Scripts in Inngest State

**What:** Passing generated Playwright script strings through Inngest step return values.

**Why bad:** Inngest function run state cannot exceed 32MB, and each step return value is stored in state. Playwright scripts can be large, especially with embedded selectors and multi-step flows. Combined with base64 screenshot data, this could blow the state limit.

**Instead:** Store scripts in Supabase (`automation_tasks.current_script`) and pass only references (task IDs) through Inngest step returns. This follows the existing pattern in pipeline.ts where "Large outputs stored in Supabase, only references returned from step.run()."

### Anti-Pattern 4: Dynamic Tool Registration on Every MCP Request

**What:** Loading all automation tools from the database on every MCP endpoint request.

**Why bad:** Each MCP request would hit Supabase to list tools, adding latency and database load. Vercel cold starts already add 1-3 seconds.

**Instead:** Cache tool definitions using Next.js `unstable_cache` or a simple in-memory cache with TTL. Tools change infrequently (only when new automations are deployed), so a 5-minute cache is safe.

## New Database Schema

### automation_tasks Table

```sql
CREATE TABLE automation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE NOT NULL,
  agent_name TEXT NOT NULL,           -- Which agent needs this automation
  system_name TEXT NOT NULL,          -- Target system (NXT, iController, etc.)
  detected_reason TEXT,               -- Why automation was flagged
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploading', 'analyzing', 'reviewing',
                      'generating', 'testing', 'deploying', 'complete',
                      'failed', 'skipped')),

  -- SOP analysis
  sop_text TEXT,                      -- Extracted text from SOP document
  analysis_result JSONB,              -- Structured step list from Claude vision
  confirmed_steps JSONB,              -- User-confirmed/edited step list

  -- Script generation + testing
  current_script TEXT,                -- Latest generated Playwright script
  iteration_count INTEGER DEFAULT 0,  -- How many generate-test cycles
  test_results JSONB,                 -- Latest test execution results
  user_feedback TEXT,                 -- Feedback from user on failed tests

  -- MCP deployment
  final_script TEXT,                  -- Verified, approved script
  mcp_tool_key TEXT,                  -- Orq.ai tool key (e.g., "nxt-create-invoice")
  mcp_tool_id TEXT,                   -- Orq.ai tool ID after registration
  mcp_endpoint_url TEXT,              -- Full URL of MCP endpoint

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_automation_tasks_run_id ON automation_tasks(run_id);
CREATE INDEX idx_automation_tasks_status ON automation_tasks(status);
```

### Supabase Storage Bucket

```
Bucket: automation-assets (private)
Structure:
  {runId}/{taskId}/sop/         -- SOP document (PDF/DOCX)
  {runId}/{taskId}/screenshots/  -- User-uploaded screenshots
  {runId}/{taskId}/results/      -- Execution result screenshots
```

## New Inngest Events

```typescript
// Added to events.ts
export type Events = {
  // Existing
  "pipeline/run.started": { data: { runId, projectId, useCase, userId, resumeFromStep? } };

  // New: automation HITL events
  "automation/sop.uploaded": {
    data: {
      runId: string;
      taskId: string;
      fileIds: string[];          // References to pipeline_files records
    };
  };
  "automation/annotation.confirmed": {
    data: {
      runId: string;
      taskId: string;
      confirmedSteps: AutomationStep[];  // User-confirmed step list
    };
  };
  "automation/test.reviewed": {
    data: {
      runId: string;
      taskId: string;
      approved: boolean;
      feedback?: string;           // User feedback if rejected
    };
  };
};
```

## Modified Pipeline Stage Definitions

```typescript
// stages.ts additions -- automation stages are CONDITIONAL
// They don't appear in PIPELINE_STAGES (which drives the for-loop)
// Instead, they're defined separately for UI rendering

export const AUTOMATION_STAGES: PipelineStage[] = [
  { name: "automation-detector", mdFile: "...", displayName: "Detecting automation needs", stepOrder: 100 },
  { name: "sop-upload", mdFile: "...", displayName: "Waiting for SOP upload", stepOrder: 101 },
  { name: "sop-analyzer", mdFile: "...", displayName: "Analyzing SOP and screenshots", stepOrder: 102 },
  { name: "annotation-review", mdFile: "...", displayName: "Reviewing automation steps", stepOrder: 103 },
  { name: "script-generator", mdFile: "...", displayName: "Generating Playwright script", stepOrder: 104 },
  { name: "script-executor", mdFile: "...", displayName: "Testing automation script", stepOrder: 105 },
  { name: "test-review", mdFile: "...", displayName: "Reviewing test results", stepOrder: 106 },
  { name: "mcp-deployer", mdFile: "...", displayName: "Deploying MCP tool", stepOrder: 107 },
];
```

## Scalability Considerations

| Concern | At 5 users (current) | At 15 users (target) | At 50+ users (future) |
|---------|---------------------|---------------------|----------------------|
| Browserless.io concurrency | Free plan (1 concurrent) is fine for development; Prototyping plan (3 concurrent) sufficient for sequential runs | Starter plan (20 concurrent) handles parallel runs | Scale plan (50 concurrent) or self-hosted Browserless Docker |
| MCP endpoint load | Negligible -- agents call tools infrequently | Still low -- each agent call triggers one Browserless session | May need connection pooling or queue; Vercel auto-scales the endpoint |
| Supabase Storage | Well under free tier limits | ~100MB for screenshots across all runs | May need storage lifecycle policies (auto-delete old run assets) |
| Inngest step count | ~15 steps per run (7 existing + ~8 automation) | Same per-run, but more concurrent runs | Well within 1000-step limit per function |
| Vercel function timeout | 300s Pro plan sufficient for single Browserless execution | Same -- each step.run() is independent | Consider Fluid Compute (800s) if scripts grow complex |

## Integration Points Summary

| Integration | Type | Direction | Authentication |
|-------------|------|-----------|----------------|
| Browserless.io | WebSocket (CDP) | Outbound from Inngest step | Token in query string (`?token=...`) |
| Claude Vision API | HTTP POST (via Orq.ai router) | Outbound from Inngest step | Bearer token (ORQ_API_KEY) |
| Supabase Storage | HTTP REST | Bidirectional (upload from UI, download from Inngest) | Signed URLs (upload), service role key (download) |
| Orq.ai Tools API | HTTP REST | Outbound from Inngest step | Bearer token (ORQ_API_KEY) |
| MCP endpoint | HTTP POST | Inbound from Orq.ai agent runtime | Vercel MCP adapter handles auth |
| Inngest events (HITL) | HTTP POST | Outbound from Next.js server actions | Inngest event key |
| Supabase Broadcast | WebSocket | Outbound from Inngest steps, inbound to UI | Supabase anon key (client), service role (server) |

## Sources

- [Inngest step.waitForEvent documentation](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event) -- HITL patterns, match syntax, timeout configuration
- [Inngest step.invoke documentation](https://www.inngest.com/docs/reference/functions/step-invoke) -- child function patterns (considered and rejected)
- [Inngest usage limits](https://www.inngest.com/docs/usage-limits/inngest) -- 4MB step return, 32MB state, 1000 steps/function
- [Browserless.io connection URLs](https://docs.browserless.io/overview/connection-urls) -- WebSocket endpoint format, token auth
- [Browserless.io /function API](https://docs.browserless.io/rest-apis/function) -- REST API for custom script execution
- [Browserless.io pricing](https://www.browserless.io/pricing) -- Unit-based pricing, concurrency limits, session timeouts
- [Vercel MCP adapter](https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel) -- @vercel/mcp-adapter, route structure, SSE transport
- [Vercel function duration limits](https://vercel.com/docs/functions/configuring-functions/duration) -- 300s Pro, 800s Fluid Compute
- [Claude Vision API](https://platform.claude.com/docs/en/build-with-claude/vision) -- base64 image encoding, multi-image support
- [Orq.ai Tools API](https://docs.orq.ai/docs/agents/tools) -- MCP tool creation, agent tool attachment
- [Supabase Storage signed URLs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) -- secure upload pattern
- [Inngest AgentKit HITL](https://agentkit.inngest.com/advanced-patterns/human-in-the-loop) -- waitForEvent patterns for AI workflows
