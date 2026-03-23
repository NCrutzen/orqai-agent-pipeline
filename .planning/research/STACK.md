# Technology Stack

**Project:** Orq Agent Designer V4.0 -- Browser Automation Builder Pipeline Stage
**Researched:** 2026-03-23
**Scope:** NEW stack additions for browser automation builder only. Does not re-research existing validated stack (Next.js 16, Supabase, Inngest, React Flow, Claude API, Orq.ai API, Vitest, TypeScript). See V3.0 STACK.md for those.

## Existing Stack (DO NOT CHANGE)

These are locked and validated. Listed here for integration context only.

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js (App Router) | `^16.1` | Full-stack framework on Vercel |
| @supabase/supabase-js | `^2.99` | Auth, DB, Realtime, **Storage** |
| inngest | `^3.52` | Durable pipeline orchestration with step.run(), step.waitForEvent() |
| @xyflow/react | `^12.10` | Node graph visualization |
| Claude API (via Orq.ai router) | anthropic/claude-sonnet-4-6 | Pipeline prompts via messages.create() |
| Vitest | `^4.1` | Testing |
| zod | `^4.3` | Schema validation |
| TypeScript | `^5` | Type safety |

## New Stack Additions for V4.0

### 1. Browser Automation Execution -- Browserless.io API (no SDK)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Browserless.io REST API | v2 (managed) | Execute Playwright scripts in the cloud | No SDK needed -- plain HTTP fetch to REST endpoints. Runs generated scripts without managing infrastructure. Free tier: 1K units (each unit = 30s of browser time). |
| playwright-core | `^1.58` | Script generation templates + type definitions | Use `playwright-core` (not `playwright`) because it does NOT download browser binaries. We only need it for TypeScript types during script generation and for `connectOverCDP()` if we do live debugging. Browserless.io provides the actual browsers. |

**Integration pattern -- /function REST API (not WebSocket):**

For V4.0's use case (run a generated Playwright script, get results), the Browserless `/function` REST API is the right choice over WebSocket `connectOverCDP()`. Rationale:

1. **Simpler:** POST the script code as JSON, get results back. No WebSocket connection management.
2. **Stateless:** Each execution is isolated. Script runs, browser closes. Perfect for testing generated automations.
3. **Inngest-compatible:** REST calls work naturally inside Inngest `step.run()` (30-60s per step). WebSocket connections are incompatible with Inngest's step-based execution model.
4. **Session cleanup:** `/function` automatically closes the browser session after execution. No leaked sessions.

```typescript
// Execute generated Playwright script on Browserless.io via REST API
async function executeOnBrowserless(scriptCode: string, context: Record<string, string>): Promise<BrowserlessResult> {
  const response = await fetch(
    `https://production-sfo.browserless.io/function?token=${process.env.BROWSERLESS_API_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: scriptCode,
        context: context,
      }),
    }
  );
  return response.json();
}
```

**Why NOT connectOverCDP / WebSocket:**
- WebSocket connections cannot survive Inngest step boundaries (each step is a separate HTTP invocation).
- CDP connections require version matching with the remote browser -- the `/function` API abstracts this away.
- Live browser sessions require persistent connections -- incompatible with Vercel serverless (60s timeout).

**Browserless.io pricing context:**
- Free: 1K units/month (1 unit = 30s). A single script test run ~1-3 units. Sufficient for development.
- Starter ($50/mo): 10K units. Supports ~3,000-10,000 script executions/month. Right for production with 5-15 users.
- No self-hosted infrastructure needed -- aligns with project constraints.

### 2. AI Vision for Screenshot Analysis -- Claude Vision (already in stack)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Claude Vision API | via Orq.ai router | Analyze uploaded screenshots, identify UI elements, annotate steps | NO new dependency. Claude Sonnet already supports vision via messages.create() with base64 image content blocks. Route through existing Orq.ai router. |

**Integration pattern -- extend existing adapter:**

The current `runPromptAdapter()` in `web/lib/pipeline/adapter.ts` sends text-only messages. For V4.0, extend it to support image content blocks:

```typescript
// Current: text-only messages
messages: [
  { role: "system", content: systemPrompt },
  { role: "user", content: userMessage },  // string
]

// V4.0: mixed content with images
messages: [
  { role: "system", content: systemPrompt },
  { role: "user", content: [
    { type: "text", text: "Analyze this screenshot of the NXT login page..." },
    { type: "image", source: { type: "base64", media_type: "image/png", data: base64Screenshot } },
  ]},
]
```

**Key constraints:**
- Max image size: 8000x8000px (internally resized to 1568px longest side). Resize before upload to save bandwidth.
- Supported formats: JPEG, PNG, GIF, WebP. Use **PNG for screenshots** (lossless).
- Up to 100 images per API request. SOP flows typically have 5-20 screenshots -- well within limits.
- The Orq.ai router passes through multimodal content to Claude. Verify this works with a test -- if it does not, call the Claude API directly for vision steps (ANTHROPIC_API_KEY is already in env).

**Why NOT a separate vision service:**
- No need for Google Vision, AWS Rekognition, or GPT-4V. Claude's vision is best-in-class for UI understanding and already in the stack.
- Claude can simultaneously read the screenshot AND generate Playwright selectors for the elements it identifies -- one model call, not a vision call + a separate code generation call.

### 3. SOP Document Parsing -- mammoth + pdf-parse

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| mammoth | `^1.8` | Extract text from .docx SOP documents | Lightweight (~200KB), zero native deps, works in serverless. `extractRawText()` gives clean text with paragraph breaks. No need for HTML conversion -- we want plain text for Claude to process. |
| pdf-parse | `^2.4` | Extract text from .pdf SOP documents | Pure TypeScript, cross-platform, works on Vercel serverless. v2 API with class-based `PDFParse` interface. Supports Node.js 20+. |

**Integration pattern:**

```typescript
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

async function parseSopDocument(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (mimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    return parser.getText();
  }
  throw new Error(`Unsupported document type: ${mimeType}`);
}
```

**Why these libraries specifically:**
- **mammoth over docx4js/docxtemplater:** mammoth is purpose-built for text extraction. Others focus on document creation/manipulation -- wrong tool.
- **pdf-parse v2 over pdf.js-extract/unpdf:** Pure TypeScript with zero native dependencies. Works on Vercel without binary compilation issues. v2's class-based API is cleaner than v1's callback pattern.
- **Both libraries over Unstructured.io/LlamaParse:** External API services add latency, cost, and another dependency. SOP docs are simple text documents, not complex multi-column layouts. Local extraction is sufficient and free.

**Supported SOP formats:**
- `.docx` (Word) -- primary, most Moyne Roberts SOPs are Word documents
- `.pdf` -- secondary, for exported/shared versions
- `.txt` / `.md` -- pass through directly, no parsing needed

### 4. File Upload Handling -- Supabase Storage (already in stack)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase Storage | managed | Store SOP documents + screenshots uploaded by users | Already in the stack via @supabase/supabase-js. No new dependency. Create a `browser-automation` bucket with proper RLS policies. |

**Integration pattern:**

```typescript
// Upload SOP document to Supabase Storage
const { data, error } = await supabase.storage
  .from("browser-automation")
  .upload(`${runId}/sop/${filename}`, file, {
    contentType: mimeType,
    upsert: false,
  });

// Upload screenshot
const { data, error } = await supabase.storage
  .from("browser-automation")
  .upload(`${runId}/screenshots/${stepNumber}-${filename}`, file, {
    contentType: "image/png",
    upsert: false,
  });

// Retrieve for processing (server-side, service role key)
const { data } = await adminClient.storage
  .from("browser-automation")
  .download(`${runId}/sop/${filename}`);
```

**File size handling:**
- Standard upload (supabase-js): up to 6MB per file. Fine for documents.
- For larger screenshots/PDFs: use signed upload URLs with TUS resumable protocol.
- Resize screenshots client-side before upload (canvas API -> max 1568px longest side, matching Claude's internal resize). Saves storage and bandwidth.

**Storage bucket design:**
```
browser-automation/
  {runId}/
    sop/
      process-document.docx
      process-document.pdf
    screenshots/
      01-login-page.png
      02-dashboard.png
      03-invoice-form.png
    scripts/
      automation-v1.ts
      automation-v2.ts  (after iteration)
    annotations/
      01-login-page-annotated.json  (element positions, selectors)
```

**RLS policy:** Users can only access files within runs they own (`auth.uid() = pipeline_runs.user_id`).

### 5. MCP Tool Hosting -- mcp-handler + @modelcontextprotocol/sdk on Vercel

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| mcp-handler | latest | Vercel adapter for MCP servers in Next.js | Official Vercel package. Creates MCP server endpoints from Next.js API routes. Handles Streamable HTTP transport, session management, and tool registration. |
| @modelcontextprotocol/sdk | `^1.27` | MCP protocol implementation | Official TypeScript SDK. Defines tool schemas, handles protocol negotiation. Required peer dependency of mcp-handler. Use v1.x (stable) -- v2 is still pre-release as of March 2026. |

**Integration pattern -- MCP tools as Next.js API routes:**

The generated Playwright scripts become MCP tools hosted on the same Vercel deployment. Each verified automation is registered as a tool that Orq.ai agents can call.

```typescript
// app/api/mcp/[transport]/route.ts
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

const handler = createMcpHandler(
  async (server) => {
    // Dynamically register tools from database
    const tools = await loadVerifiedAutomations();

    for (const tool of tools) {
      server.tool(
        tool.name,  // e.g., "nxt-create-invoice"
        tool.description,
        tool.inputSchema,  // zod schema
        async (params) => {
          // Execute the Playwright script on Browserless.io
          const result = await executeOnBrowserless(tool.scriptCode, params);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
      );
    }
  },
  {
    basePath: "/api/mcp",
    maxDuration: 120,  // Browserless execution can take up to 2 minutes
    verboseLogs: process.env.NODE_ENV === "development",
  }
);

export { handler as GET, handler as POST, handler as DELETE };
```

**Why mcp-handler over raw @modelcontextprotocol/sdk:**
- Handles Vercel-specific concerns: routing, Streamable HTTP transport setup, session management.
- One-line setup vs. manual transport configuration.
- Maintained by Vercel -- guaranteed to work on their platform.

**Why host MCP tools on our Vercel deployment (not a separate server):**
- No additional infrastructure. Tools are API routes in the same Next.js app.
- Shared authentication context. Tools can verify the calling agent belongs to the right tenant.
- Shared database access. Tools can log execution results, update status, trigger alerts.
- Auto-deploys with the rest of the app. No separate CI/CD pipeline.

**Orq.ai agent attachment:**
After a script is verified, the pipeline stage registers the MCP server URL with the Orq.ai agent:

```typescript
// Attach MCP tool to agent via Orq.ai API
await orqClient.agents.update(agentId, {
  tools: [
    ...existingTools,
    {
      type: "mcp",
      server_url: `https://${process.env.VERCEL_URL}/api/mcp`,
      tool_name: "nxt-create-invoice",
    },
  ],
});
```

### 6. Image Processing (Optional) -- sharp

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| sharp | `^0.33` | Resize screenshots before upload + annotated image generation | Fast native image processing. Resize to max 1568px (Claude's internal limit) before storing. Composite overlay for visual annotations. Works on Vercel with `@img/sharp-linux-x64` layer. |

**Why sharp is OPTIONAL and can be deferred:**
- Screenshot resizing CAN be done client-side with Canvas API (simpler, no server dependency).
- Visual annotation overlays CAN be returned as JSON coordinates + rendered in the browser with React (no server-side image generation needed).
- Only add sharp if we need server-side annotated image generation (e.g., emailing annotated screenshots to users).

**If added, Vercel compatibility note:**
Sharp requires native binaries. On Vercel, use `@img/sharp-linux-x64` or set `SHARP_IGNORE_GLOBAL_LIBVIPS=1` in env. The `next/image` component already bundles sharp for image optimization -- check if the existing Next.js install includes it before adding separately.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Browser execution | Browserless.io /function REST | Browserless.io connectOverCDP | WebSocket incompatible with Inngest steps. CDP requires version matching. REST is stateless and simpler. |
| Browser execution | Browserless.io | BrowserBase, Apify, self-hosted Playwright | Browserless has the simplest API, best Playwright support, free tier for dev. No VPS needed. |
| Browser execution | Browserless.io /function | Puppeteer via Browserless | Playwright has better API (auto-wait, locators), cross-browser support. PROJECT.md specifies Playwright. |
| Screenshot analysis | Claude Vision (Orq.ai router) | GPT-4V, Google Vision, AWS Rekognition | Claude already in stack. Vision is built into Sonnet. Can analyze UI AND generate code in one call. |
| Screenshot analysis | Claude Vision (Orq.ai router) | Claude Vision (direct API) | Prefer Orq.ai router for unified billing. Fall back to direct API only if router cannot pass image blocks. |
| DOCX parsing | mammoth | docx4js, officegen, libreoffice-convert | mammoth is purpose-built for extraction. Others focus on creation. Zero native deps = serverless-safe. |
| PDF parsing | pdf-parse v2 | unpdf, pdf.js-extract, LlamaParse | Pure TypeScript, v2 API is clean, works on Vercel without binary issues. LlamaParse is external service -- unnecessary for simple SOPs. |
| File storage | Supabase Storage | Vercel Blob, S3, Cloudflare R2 | Already in stack. Same client, same auth, same RLS. No reason to add another storage service. |
| MCP hosting | mcp-handler on Vercel | Separate MCP server (EC2, Fly.io) | No additional infra. Auto-deploys. Shared auth/DB. Vercel-native transport handling. |
| MCP hosting | mcp-handler | Raw @modelcontextprotocol/sdk | mcp-handler handles Vercel transport plumbing. Less boilerplate. |
| Image processing | sharp (deferred) | Jimp, canvas (node-canvas) | sharp is fastest. But client-side resize is simpler for V4.0 MVP. Defer sharp unless server-side annotation is needed. |

## What NOT to Add

| Technology | Why Tempting | Why Wrong for V4.0 |
|------------|-------------|---------------------|
| playwright (full package) | "We need Playwright" | Full `playwright` downloads browser binaries (~400MB). Use `playwright-core` for types only. Browserless.io provides browsers. |
| Puppeteer | Alternative to Playwright | PROJECT.md specifies Playwright. Playwright has better auto-wait, locators, and API design. |
| browser-use / Stagehand | "AI browser automation" | These are for dynamic/exploratory browsing. V4.0 generates **deterministic Playwright scripts** for known SOP flows. Dynamic browser-use is already handled by existing Orq.ai MCP tools (see PROJECT.md Out of Scope). |
| LlamaParse / Unstructured.io | "Better document parsing" | External API services. SOP documents are simple text -- mammoth + pdf-parse handle them perfectly. No complex layout parsing needed. |
| Tesseract.js / OCR libraries | "Read text from screenshots" | Claude Vision reads screenshot text natively AND understands UI layout. OCR gives you raw text without context -- useless for generating selectors. |
| Canvas/Fabric.js (server-side) | "Annotate images server-side" | Annotations are coordinates + labels. Render them in the browser with React components over the screenshot image. No server-side canvas needed. |
| Puppeteer Recorder / Playwright Codegen | "Record user interactions" | We are generating scripts from SOP + screenshots, not recording live browser sessions. Different approach entirely. |
| Redis / BullMQ | "Queue browser automation jobs" | Inngest already handles job queuing, retries, and durable execution. Adding Redis violates the "no self-hosted infra" constraint. |
| WebSocket library (ws, socket.io) | "Real-time script execution output" | Use existing Inngest Realtime + Supabase Realtime for progress updates. No new real-time channel needed. |

## Installation

```bash
# Document parsing (SOP Word + PDF)
npm install mammoth pdf-parse

# Browser automation types (NO browser binaries)
npm install playwright-core

# MCP tool hosting
npm install mcp-handler @modelcontextprotocol/sdk

# Optional: server-side image processing (DEFER unless needed)
# npm install sharp
```

**Dev dependencies:** None needed beyond what V3.0 already has (Vitest, testing-library, TypeScript).

**Environment variables (NEW for V4.0):**
```env
# Browserless.io
BROWSERLESS_API_TOKEN=<api-token>
BROWSERLESS_REGION=sfo  # or us-east-1, eu-west-1 -- choose closest to target systems

# All other env vars unchanged from V3.0 (Supabase, Inngest, Orq.ai, Claude)
```

## Integration Points with Existing Pipeline

### How V4.0 Fits into the Inngest Pipeline

The browser automation builder is a **new pipeline stage** (or set of stages) that runs AFTER the architect detects a no-API system need. It integrates with the existing `executePipeline` function pattern.

```
Existing pipeline:
  architect -> tool-resolver -> researcher -> spec-generator -> ...
                    |
                    v
          Detects agent needs browser automation for NXT/iController/Intelly
                    |
                    v
V4.0 stages (new Inngest steps):
  sop-upload (waitForEvent -- user uploads SOP + screenshots)
    -> sop-parse (extract text from document)
    -> screenshot-analysis (Claude Vision -- analyze each screenshot)
    -> annotation-review (waitForEvent -- user confirms/corrects AI understanding)
    -> script-generation (Claude -- generate Playwright script from SOP + annotations)
    -> script-test (Browserless.io /function API -- execute script)
    -> test-review (waitForEvent -- user reports success/failure)
    -> script-iterate (loop back to generation if failed, max 3 iterations)
    -> mcp-deploy (register verified script as MCP tool)
    -> agent-attach (attach MCP tool to Orq.ai agent)
                    |
                    v
Continues existing pipeline:
  ... -> dataset-generator -> readme-generator -> complete
```

### Key Inngest Patterns for V4.0

```typescript
// 1. Wait for user file upload
const uploadEvent = await step.waitForEvent("sop-upload-received", {
  event: "automation/sop.uploaded",
  match: "data.runId",
  timeout: "24h",
});

// 2. Parse document inside step.run()
const sopText = await step.run("parse-sop-document", async () => {
  const admin = createAdminClient();
  const { data } = await admin.storage.from("browser-automation").download(uploadEvent.data.filePath);
  return parseSopDocument(Buffer.from(await data.arrayBuffer()), uploadEvent.data.mimeType);
});

// 3. Vision analysis inside step.run() (each screenshot = separate step for retry isolation)
for (const screenshot of uploadEvent.data.screenshots) {
  await step.run(`analyze-screenshot-${screenshot.stepNumber}`, async () => {
    const imageBuffer = await downloadScreenshot(screenshot.path);
    const base64 = imageBuffer.toString("base64");
    const analysis = await runVisionAdapter("screenshot-analyzer", {
      sopText,
      screenshot: { base64, mediaType: "image/png" },
      stepNumber: screenshot.stepNumber,
    });
    await saveAnnotation(runId, screenshot.stepNumber, analysis);
    return analysis;
  });
}

// 4. Wait for user confirmation of annotations
const confirmation = await step.waitForEvent("annotation-confirmed", {
  event: "automation/annotations.confirmed",
  match: "data.runId",
  timeout: "7d",
});

// 5. Generate and test script (with iteration loop)
let scriptWorking = false;
let iteration = 0;
while (!scriptWorking && iteration < 3) {
  const script = await step.run(`generate-script-v${iteration + 1}`, async () => {
    // Claude generates Playwright script from SOP + annotations + previous failure
    return runPromptAdapter("script-generator", { sopText, annotations, previousError });
  });

  const testResult = await step.run(`test-script-v${iteration + 1}`, async () => {
    // Execute on Browserless.io
    return executeOnBrowserless(script, { targetUrl: "https://nxt.example.com" });
  });

  // Wait for user to verify script worked correctly
  const review = await step.waitForEvent(`script-review-v${iteration + 1}`, {
    event: "automation/script.reviewed",
    match: "data.runId",
    timeout: "7d",
  });

  scriptWorking = review.data.approved;
  iteration++;
}

// 6. Deploy as MCP tool
await step.run("deploy-mcp-tool", async () => {
  // Store verified script in DB
  // Register MCP tool metadata
  // Attach to Orq.ai agent
});
```

### Vercel Timeout Considerations

Each V4.0 pipeline step must complete within Vercel's function timeout:
- **Hobby plan:** 10s -- TOO SHORT for Browserless execution.
- **Pro plan ($20/mo):** 60s default, 300s with `maxDuration`. Sufficient for most script executions.
- **Fluid Compute (Pro):** up to 800s. For complex multi-page automations.

Inngest splits each step into a separate HTTP invocation, so only individual steps need to fit within the timeout. The total pipeline can run for hours (across HITL waits).

**Recommendation:** Ensure the Vercel project is on Pro plan (likely already is for V3.0). Set `maxDuration: 120` for Browserless execution steps.

### Data Flow Through Supabase

```
New tables needed:
  browser_automations
    id, run_id, agent_id, target_system, status
    sop_file_path, created_at, updated_at

  automation_screenshots
    id, automation_id, step_number, file_path, annotation_json
    analysis_text, confirmed_by_user (boolean)

  automation_scripts
    id, automation_id, version, script_code, test_result
    browserless_response, status (draft/testing/verified/failed)

  mcp_tools
    id, automation_id, agent_id, tool_name, tool_description
    input_schema (jsonb), script_id (FK to automation_scripts)
    deployed_at, status (active/inactive)
```

## Confidence Assessment

| Component | Confidence | Basis |
|-----------|------------|-------|
| Browserless.io /function REST API | HIGH | Official docs describe /function endpoint. JSON POST with code + context. Production-proven service. |
| Browserless.io + Inngest integration | MEDIUM | Pattern is straightforward (HTTP fetch inside step.run()), but Browserless execution times may exceed Vercel step timeout for complex automations. Need maxDuration config. |
| Claude Vision via Orq.ai router | MEDIUM | Claude Vision is HIGH confidence. The Orq.ai router passing through multimodal content blocks needs VERIFICATION. May need direct Claude API call as fallback. |
| mammoth for DOCX parsing | HIGH | Mature library, 4.8K GitHub stars, well-documented extractRawText() API. Works in serverless. |
| pdf-parse v2 for PDF parsing | HIGH | Pure TypeScript, v2 stable (2.4.5), explicit Vercel/serverless support documented. |
| Supabase Storage for file upload | HIGH | Already in stack. Standard upload API. Signed URLs for larger files. |
| mcp-handler for MCP tool hosting | MEDIUM | Official Vercel package, documented examples. But dynamic tool registration (loading tools from DB at request time) needs validation -- most examples show static tool definitions. |
| @modelcontextprotocol/sdk v1.x | HIGH | v1.27 stable. v2 pre-release -- stay on v1.x for production. Required peer dep of mcp-handler. |
| playwright-core for types only | HIGH | Widely used pattern. playwright-core is the no-browsers package. 1.58.2 current. |
| sharp for image processing | HIGH (if needed) | Industry standard. But DEFERRED -- client-side resize is simpler for MVP. |
| Inngest step.waitForEvent for HITL | HIGH | Documented pattern, already used in V3.0 for approval flows. Multi-day timeouts supported. |

## Open Questions (Resolve During Implementation)

1. **Orq.ai router multimodal passthrough:** Does the Orq.ai chat completions router forward image content blocks to Claude? Test with a simple vision request. If not, call Claude API directly for vision steps.

2. **Browserless /function timeout:** What is the maximum execution time for a single /function call? If a complex multi-step SOP automation exceeds it, we may need to split script execution across multiple Browserless calls.

3. **MCP tool dynamic registration:** Can mcp-handler load tools from a database at request time (not just at server startup)? If tools are static, we need a deployment strategy for adding new automation tools.

4. **Orq.ai MCP server attachment:** What is the exact API for attaching a remote MCP server to an Orq.ai agent? The docs mention MCP support but the specific `/v2/agents` payload format for MCP tools needs verification.

5. **Vercel Pro plan confirmation:** Is the Vercel deployment on Pro plan? Hobby plan's 10s timeout is insufficient for Browserless execution steps. Pro's 60-300s is needed.

## Sources

- [Browserless.io Function API](https://docs.browserless.io/rest-apis/function) -- /function endpoint for running custom code
- [Browserless.io Playwright Quick Start](https://docs.browserless.io/libraries/playwright) -- connection patterns and version support
- [Browserless.io Connection URLs](https://docs.browserless.io/overview/connection-urls) -- regional endpoints and auth
- [Browserless.io Pricing](https://www.browserless.io/pricing) -- unit-based pricing, free tier details
- [Claude Vision API Docs](https://platform.claude.com/docs/en/build-with-claude/vision) -- base64 image format, limits, best practices
- [mammoth npm](https://www.npmjs.com/package/mammoth) -- DOCX text extraction
- [pdf-parse npm](https://www.npmjs.com/package/pdf-parse) -- v2 TypeScript API
- [pdf-parse GitHub](https://github.com/mehmet-kozan/pdf-parse) -- cross-platform support, Vercel compatibility
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) -- v1.27 stable, TypeScript SDK
- [MCP TypeScript SDK Server Docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) -- tool registration
- [mcp-handler npm / GitHub](https://github.com/vercel/mcp-handler) -- Vercel MCP adapter for Next.js
- [Vercel MCP Server Deployment](https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel) -- Streamable HTTP transport on Vercel
- [Vercel MCP Server Template](https://vercel.com/templates/next.js/model-context-protocol-mcp-with-next-js) -- Next.js example
- [Supabase Storage Upload Docs](https://supabase.com/docs/reference/javascript/storage-from-upload) -- standard upload API
- [Supabase Standard Uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads) -- TUS for large files
- [Inngest waitForEvent Docs](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event) -- HITL pattern
- [Inngest Long-Running on Vercel](https://www.inngest.com/blog/vercel-long-running-background-functions) -- timeout workarounds
- [Orq.ai Tools Documentation](https://docs.orq.ai/docs/agents/tools) -- MCP and function tools for agents
- [playwright-core npm](https://www.npmjs.com/package/playwright-core) -- v1.58.2, no browser binaries
