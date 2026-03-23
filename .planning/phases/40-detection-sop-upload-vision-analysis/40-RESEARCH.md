# Phase 40: Detection, SOP Upload & Vision Analysis - Research

**Researched:** 2026-03-23
**Domain:** No-API detection, SOP intake, AI vision screenshot analysis, terminal interaction panel, systems registry
**Confidence:** HIGH

## Summary

Phase 40 introduces three major subsystems: (1) a DB-backed systems registry that mirrors the CLI's `systems.md` as a global-with-project-linking pattern (same as Phase 39 credentials), enabling the pipeline to auto-detect when agents target no-API systems; (2) a terminal-style interaction panel that replaces the existing Sheet timeline drawer on the run detail page, providing a unified interaction model for all HITL pipeline interactions including file uploads, markdown previews, and annotation review; and (3) AI vision analysis via Orq.ai that analyzes uploaded screenshots using `image_url` content blocks in the OpenAI-compatible chat completions API, correlates SOP steps with UI elements, and presents results for user confirmation.

The key technical decisions are locked: SOPs are markdown (not PDF/Word), so no document parsing libraries are needed; the terminal panel is a card-based log with rich inline UI elements (not a dark terminal aesthetic); screenshot annotations render as CSS overlay elements in the browser (not server-side image processing); and the full-width overlay for side-by-side annotation review uses a Dialog/Portal approach that expands beyond the terminal panel's normal width.

**Primary recommendation:** Build the systems registry and terminal panel as foundational infrastructure first (they affect the Settings page and run detail page respectively), then layer the detection logic and vision analysis on top. The terminal panel is a paradigm shift -- existing Phase 37 approval interactions must migrate to it for consistency.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- DB-backed systems registry -- web equivalent of CLI's `systems.md` file
- Global systems with per-project linking -- same pattern as credentials in Phase 39
- Systems registry UI lives in the Settings page as a new "Systems" tab alongside Credentials and Health
- Each system has an integration method: `api`, `browser-automation`, `knowledge-base`, `manual`
- Automation detector step reads from the systems registry DB table, cross-references architect blueprint + agent specs
- When detection finds `browser-automation` systems, pipeline enters automation sub-pipeline
- Terminal-style command/response panel replaces the existing timeline Sheet drawer on the run detail page
- Clean card-based log visual style -- light background matching dashboard, each pipeline message is a card/entry with timestamp and status icon. NOT dark terminal aesthetic
- Applies to ALL pipeline interactions -- existing HITL approvals (Phase 37) migrate to this pattern too for consistency
- For complex interactions (annotation review with side-by-side layout), the terminal panel expands to a full-width overlay, then collapses back when done
- SOP input supports both: upload .md file OR paste markdown content directly
- SOPs are primarily AI-generated markdown -- no PDF/Word parsing needed (no mammoth/pdf-parse dependencies)
- After upload/paste, terminal renders a markdown preview so user can verify it's the right SOP. "Looks good" button to proceed
- Screenshots: free upload (PNG/JPG), any number. AI validates completeness against SOP steps and requests missing screens
- Side-by-side layout: original SOP text with highlights on left, matching screenshots on right
- AI's understanding shown as connecting lines between SOP steps and screenshot elements
- Per-step confirm/edit: each step has a confirm checkmark and edit button
- Editing opens inline text fields to adjust action description, target element, or expected result
- User must confirm all steps before pipeline proceeds to script generation
- Re-analysis after all edits: user makes all corrections, clicks "Finalize", AI does one re-analysis pass incorporating corrections for consistency
- AI analyzes uploaded screenshots and reports if key screens are missing based on SOP steps
- Prompts user to add missing screenshots: "You mentioned a login screen but I don't see one -- please add it"
- Not blocking -- user can proceed with incomplete screenshots if they choose, but AI warns

### Claude's Discretion
- Terminal panel component architecture and state management
- Systems registry DB schema details (table structure, indexes)
- Automation detector prompt engineering (how to analyze blueprint for no-API indicators)
- SOP markdown rendering library choice
- Screenshot annotation overlay implementation
- Full-width overlay animation and transition design
- How to migrate existing Phase 37 approval UI to the terminal pattern

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DETECT-01 | Pipeline auto-detects when a designed agent needs browser automation for a no-API system | Systems registry DB table + automation-detector Inngest step that cross-references architect blueprint with systems registry |
| DETECT-02 | User can upload SOP document (Word/PDF) describing the target process | OVERRIDDEN by CONTEXT.md: SOP is markdown only (.md file upload or paste). No Word/PDF parsing. Terminal panel provides upload dropzone and paste textarea |
| DETECT-03 | User can upload screenshots of the target system screens | Terminal panel screenshot dropzone with PNG/JPG acceptance, direct-to-Supabase-Storage upload via signed URLs to bypass Vercel 4.5MB limit |
| DETECT-04 | Structured intake wizard validates SOP completeness before script generation | AI completeness validation: vision analysis checks screenshots against SOP steps, reports missing screens, user can proceed with warning or add missing screenshots |
| DETECT-05 | Pipeline skips automation builder when target system has an API | Automation-detector step reads systems registry, only activates for `browser-automation` integration method systems |
| VISION-01 | AI analyzes screenshots via Orq.ai to identify UI elements and layout | Orq.ai chat completions with `image_url` content blocks (base64 data URI), `detail: "high"` for full-resolution analysis |
| VISION-02 | AI parses SOP document and correlates steps with screenshot elements | Combined prompt: SOP markdown text + all screenshots sent to Orq.ai, structured JSON output mapping each SOP step to screenshot elements |
| VISION-03 | AI presents annotated screenshots with highlighted elements back to user | Client-side CSS overlay annotations (absolute-positioned highlight boxes on screenshots in the browser), side-by-side layout in full-width overlay |
| VISION-04 | User can confirm or correct AI's interpretation of each automation step | Per-step confirm/edit UI in the annotation review overlay, inline text fields for corrections |
| VISION-05 | AI incorporates user corrections and updates its understanding | Re-analysis endpoint: user clicks "Finalize", corrections sent back to Orq.ai for one consistency pass, updated analysis replaces original |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js (App Router) | `^16.1` | Full-stack framework | Existing -- server components for data, client components for interactivity |
| @supabase/supabase-js | `^2.99` | DB, Storage, Realtime, Auth | Existing -- systems registry table, file storage, broadcast updates |
| inngest | `^3.52` | Durable pipeline orchestration | Existing -- step.waitForEvent() for HITL, automation-detector step |
| zod | `^4.3` | Schema validation | Existing -- systems registry forms, SOP upload validation |

### New Dependencies
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-markdown | `^10.1.0` | Render SOP markdown preview | SOP paste/upload preview in terminal panel |
| remark-gfm | `^4.0.1` | GitHub Flavored Markdown plugin | Tables, task lists, strikethrough in SOP previews |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-markdown | @mdx-js/react | MDX is overkill for rendering user-provided markdown; react-markdown is lighter and safer (no code execution) |
| react-markdown | dangerouslySetInnerHTML with marked | react-markdown is safe by default (no XSS), builds virtual DOM for React reconciliation |
| CSS overlay annotations | sharp server-side image compositing | Client-side overlays are interactive (hover, click), no server roundtrip, no native binary dependency |
| Supabase signed upload URLs | Direct Supabase client upload | Signed URLs bypass Vercel 4.5MB serverless limit; standard upload works for small files but fails for screenshot batches |

**Installation:**
```bash
cd web && npm install react-markdown remark-gfm
```

**Version verification:** react-markdown `10.1.0` (verified via npm registry 2026-03-23), remark-gfm `4.0.1` (verified via npm registry 2026-03-23).

## Architecture Patterns

### Recommended Project Structure
```
web/
  app/(dashboard)/
    settings/page.tsx              # MODIFIED: add "Systems" tab
    projects/[id]/runs/[runId]/
      run-detail-client.tsx        # MODIFIED: replace Sheet drawer with terminal panel
  components/
    terminal/                      # NEW: terminal interaction panel
      terminal-panel.tsx           # Main panel component (card-based log)
      terminal-entry.tsx           # Individual log entry (message card)
      terminal-input.tsx           # Rich input area (dropzone, buttons, textarea)
      terminal-sop-preview.tsx     # Markdown preview with "Looks good" button
      terminal-screenshot-upload.tsx # Screenshot dropzone with previews
      terminal-approval-entry.tsx  # Migrated approval UI as terminal entry
    annotation/                    # NEW: vision annotation review
      annotation-overlay.tsx       # Full-width overlay container
      annotation-side-by-side.tsx  # SOP left, screenshots right
      annotation-step-card.tsx     # Per-step confirm/edit card
      annotation-highlight.tsx     # CSS overlay highlight on screenshot
    systems/                       # NEW: systems registry
      system-list.tsx              # Systems table/cards
      create-system-modal.tsx      # Add system form
      system-project-linker.tsx    # Link system to project
  lib/
    pipeline/
      automation-detector.ts       # NEW: detection logic
      vision-adapter.ts            # NEW: Orq.ai vision API wrapper
    systems/
      types.ts                     # NEW: system registry types
      actions.ts                   # NEW: server actions for CRUD
  supabase/
    schema-systems.sql             # NEW: systems registry + automation_tasks tables
```

### Pattern 1: Systems Registry (Global with Project Linking)
**What:** DB-backed systems registry mirroring CLI's `systems.md`, using the same global-with-project-linking pattern established by credentials in Phase 39.
**When to use:** Settings page "Systems" tab, automation-detector step.
**Example:**
```typescript
// DB schema follows credentials pattern exactly
// systems table: global registry
// system_project_links table: many-to-many with projects

interface System {
  id: string; // UUID
  name: string; // "NXT", "iController", etc.
  integration_method: "api" | "browser-automation" | "knowledge-base" | "manual";
  url?: string;
  auth_notes?: string;
  notes?: string;
  created_by: string; // auth.uid()
  created_at: string;
  updated_at: string;
}

interface SystemProjectLink {
  system_id: string;
  project_id: string;
  linked_at: string;
}
```

### Pattern 2: Terminal Interaction Panel (Card-Based Log)
**What:** A scrollable panel of card entries that replaces the Sheet timeline drawer. Each pipeline event renders as a card with timestamp, status icon, and optional rich UI elements (buttons, dropzones, text inputs).
**When to use:** All pipeline HITL interactions -- step status updates, approval requests, SOP upload prompts, annotation review.
**Example:**
```typescript
// Terminal panel state management
interface TerminalEntry {
  id: string;
  type: "status" | "prompt" | "upload" | "approval" | "annotation-review" | "user-input";
  timestamp: string;
  stepName?: string;
  status?: StepStatus;
  content: string; // Human-readable message
  metadata?: Record<string, unknown>; // Type-specific data
}

// The panel subscribes to broadcast events and appends entries
// Rich UI elements (dropzones, buttons) render inline within entries
// For complex interactions, a full-width overlay opens on top
```

### Pattern 3: Orq.ai Vision via Chat Completions
**What:** Send screenshots as base64 `image_url` content blocks to Orq.ai's OpenAI-compatible chat completions endpoint. The existing `runPromptAdapter` is extended to support multimodal content.
**When to use:** SOP analysis step, screenshot completeness validation.
**Source:** [Orq.ai Vision Docs](https://docs.orq.ai/docs/ai-gateway-vision)
**Example:**
```typescript
// Extend the existing adapter pattern for vision
async function runVisionAdapter(
  systemPrompt: string,
  textContext: string,
  images: Array<{ base64: string; mediaType: string }>
): Promise<string> {
  const userContent = [
    { type: "text", text: textContext },
    ...images.map(img => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mediaType};base64,${img.base64}`,
        detail: "high" as const,
      },
    })),
  ];

  const result = await fetch(ORQ_ROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ORQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  const json = await result.json();
  return json.choices?.[0]?.message?.content ?? "";
}
```

### Pattern 4: Direct-to-Storage Upload via Signed URLs
**What:** Bypass Vercel's 4.5MB serverless function limit by uploading files directly from the browser to Supabase Storage using signed upload URLs.
**When to use:** All file uploads in the terminal panel (SOP documents, screenshots).
**Source:** [Supabase Signed Upload URLs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)
**Example:**
```typescript
// Server action: generate signed upload URL
"use server";
export async function createUploadUrl(bucket: string, path: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUploadUrl(path);
  if (error) throw error;
  return { signedUrl: data.signedUrl, path: data.path, token: data.token };
}

// Client: upload directly to Supabase Storage
const { signedUrl, token } = await createUploadUrl(
  "automation-assets",
  `${runId}/${taskId}/screenshots/${filename}`
);
await supabase.storage
  .from("automation-assets")
  .uploadToSignedUrl(path, token, file);
```

### Pattern 5: CSS Overlay Annotations on Screenshots
**What:** Render AI-identified UI element highlights as absolutely-positioned div overlays on top of screenshot images in the browser. No server-side image processing needed.
**When to use:** Annotation review overlay showing AI's understanding of each SOP step.
**Example:**
```typescript
// Annotation data structure from AI analysis
interface ElementAnnotation {
  stepNumber: number;
  elementType: string; // "button", "input", "dropdown", etc.
  label: string; // "Login button", "Username field"
  boundingBox: { x: number; y: number; width: number; height: number }; // % of image
  confidence: number;
}

// Render as CSS overlay
function AnnotationHighlight({ annotation, imageRef }: Props) {
  const { x, y, width, height } = annotation.boundingBox;
  return (
    <div
      className="absolute border-2 border-blue-500 bg-blue-500/10 rounded pointer-events-none"
      style={{
        left: `${x}%`, top: `${y}%`,
        width: `${width}%`, height: `${height}%`,
      }}
    >
      <span className="absolute -top-5 left-0 bg-blue-500 text-white text-xs px-1 rounded">
        {annotation.stepNumber}. {annotation.label}
      </span>
    </div>
  );
}
```

### Pattern 6: Automation Detector as Inngest Step
**What:** A new Inngest step that runs after the spec-generator stage, reads the systems registry, and cross-references with the architect blueprint to determine if any agents target browser-automation systems.
**When to use:** Conditional branch point in the pipeline.
**Example:**
```typescript
// In pipeline.ts, after the existing stage loop completes spec-generator
const automationNeeded = await step.run("automation-detector", async () => {
  const admin = createAdminClient();

  // Get project-linked systems with browser-automation method
  const { data: browserSystems } = await admin
    .from("system_project_links")
    .select("systems(id, name, integration_method, url)")
    .eq("project_id", projectId)
    .eq("systems.integration_method", "browser-automation");

  if (!browserSystems?.length) return { tasks: [] };

  // Cross-reference with architect blueprint for matching system mentions
  const blueprint = stageResults.architect || "";
  const specs = stageResults["spec-generator"] || "";
  const detectedTasks = detectAutomationNeeds(blueprint, specs, browserSystems);

  // Write automation_tasks to DB
  for (const task of detectedTasks) {
    await admin.from("automation_tasks").insert({
      run_id: runId,
      agent_name: task.agentName,
      system_name: task.systemName,
      detected_reason: task.reason,
      status: "pending",
    });
  }

  return { tasks: detectedTasks };
});

if (automationNeeded.tasks.length === 0) {
  // No browser automation needed -- continue to orchestration-generator
} else {
  // Enter automation sub-pipeline (Phase 40 HITL steps)
}
```

### Anti-Patterns to Avoid
- **Building a separate Inngest function for automation:** Keep automation steps within the existing `executePipeline` function to maintain access to `stageResults` context. A separate function would lose accumulated context.
- **Storing screenshot base64 in Inngest step state:** Screenshots are 500KB-2MB each. Store in Supabase Storage, pass only references through Inngest steps. The 4MB per-step and 32MB total state limits would be exceeded quickly.
- **Using mammoth/pdf-parse for SOP documents:** CONTEXT.md explicitly states SOPs are markdown -- no document conversion libraries needed. This was a locked decision.
- **Server-side image annotation with sharp/canvas:** Annotations are interactive (hover, click to edit). Render as CSS overlays in the browser. No native binary dependencies needed.
- **Dark terminal aesthetic:** CONTEXT.md explicitly requires clean card-based log visual style with light background matching the dashboard.
- **Routing file uploads through Vercel serverless functions:** Files must go directly to Supabase Storage via signed upload URLs to bypass the 4.5MB limit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown rendering | Custom markdown parser | react-markdown + remark-gfm | Safe by default, React virtual DOM, extensible with plugins, handles GFM tables/lists |
| File upload with size limits | Custom upload through API routes | Supabase Storage signed upload URLs | Bypasses Vercel 4.5MB limit, direct browser-to-storage, single-use tokens |
| Image content blocks for AI | Custom image encoding pipeline | Orq.ai `image_url` content blocks | OpenAI-compatible format, base64 data URI, `detail: "high"` for full resolution |
| Real-time pipeline updates | WebSocket server or polling | Supabase Broadcast (existing) | Already established pattern, `useBroadcast` hook, admin client emission |
| HITL event matching | Custom event correlation | Inngest `step.waitForEvent` with `match` | Built-in pattern, supports CEL expressions, 7-day timeout, dual-write gate |
| Image resize before upload | Server-side sharp processing | Client-side Canvas API resize | No server dependency, runs in browser, max 1568px for Claude's internal limit |

**Key insight:** This phase's complexity is primarily in UI/UX architecture (terminal panel, annotation overlay) and pipeline orchestration (detection, HITL flow), not in external library integration. The only new dependency is react-markdown for SOP previews.

## Common Pitfalls

### Pitfall 1: Vercel 4.5MB Upload Limit Blocks Screenshot Uploads
**What goes wrong:** Users upload multiple screenshots (1-5MB each). The upload routes through a Vercel serverless function, hits the 4.5MB body limit, returns a cryptic 413 error.
**Why it happens:** Default Next.js server action body limit is 1MB, Vercel serverless limit is 4.5MB. Screenshot batches easily exceed both.
**How to avoid:** Use Supabase Storage signed upload URLs for ALL file uploads. Server action generates the signed URL (tiny request), client uploads directly to Supabase Storage.
**Warning signs:** 413 errors in Vercel logs, uploads work for single small files but fail for batches.

### Pitfall 2: AI Vision Hallucinates UI Element Coordinates
**What goes wrong:** Claude's vision returns bounding box coordinates for UI elements that don't match the actual positions. Annotations appear in wrong places on screenshots.
**Why it happens:** Vision models are semantically strong but geometrically approximate. Coordinates are approximations, not pixel-precise.
**How to avoid:** Use coordinates ONLY for visual annotation overlays (showing user "I think this is here"). Generate Playwright selectors using semantic strategies (getByRole, getByText, getByLabel) in Phase 41, never from pixel coordinates. Show numbered overlays with generous padding.
**Warning signs:** Same screenshot analyzed twice returns different coordinates. Highlights appear on empty space or wrong elements.

### Pitfall 3: SOP Quality Determines Automation Success
**What goes wrong:** Users provide incomplete SOPs missing "obvious" steps (login, navigation). AI generates incomplete automation plans. Downstream script generation (Phase 41) fails repeatedly.
**Why it happens:** Expert blindness -- people who perform tasks daily skip steps their muscle memory handles.
**How to avoid:** AI completeness validation after screenshot upload: check each SOP step has a matching screenshot, report missing screens, warn (but don't block) on incomplete submissions. Clear prompts in the terminal panel guide users.
**Warning signs:** AI analysis returns fewer than 3 steps for a "complex" workflow. Screenshots show same page state (no progression).

### Pitfall 4: Inngest State Bloat from Image Data
**What goes wrong:** Vision analysis results include base64 screenshots or large annotation payloads stored in Inngest step return values. Function state approaches the 32MB limit.
**Why it happens:** Following the existing pipeline pattern of returning output from `step.run()`, but image data is orders of magnitude larger than text.
**How to avoid:** Store ALL image data and analysis results in Supabase (automation_tasks table + Storage). Step return values contain ONLY references (task IDs, storage paths). This follows the existing pipeline's "Return a reference, NOT the full output (Pitfall 6)" comment.
**Warning signs:** Inngest dashboard shows growing state size. Functions slow with serialization overhead.

### Pitfall 5: Terminal Panel State Synchronization
**What goes wrong:** Terminal entries get out of sync between broadcast events and local state. User sees stale entries, duplicate entries, or missing entries after network reconnection.
**Why it happens:** Broadcast is fire-and-forget. If the client misses a broadcast (network blip), it has no way to catch up. The existing approval flow has the same issue but it's less visible because approvals are rare events.
**How to avoid:** On mount, fetch current terminal state from DB (pipeline_steps + automation_tasks). Use broadcast for real-time updates but treat DB as source of truth. Implement a "catch-up" fetch on reconnection or visibility change.
**Warning signs:** Terminal shows fewer entries than expected. Refreshing the page shows entries that weren't visible before.

### Pitfall 6: Full-Width Overlay Blocks Navigation
**What goes wrong:** The annotation review overlay expands to full-width but user can't navigate away, close the overlay with Escape, or access browser controls.
**Why it happens:** Full-screen overlays without proper escape hatches trap users.
**How to avoid:** Use shadcn Dialog component (which handles Escape key, click-outside, and focus trap correctly). Add a clear "Close" button and "Save progress" mechanism. Don't use a raw div overlay.
**Warning signs:** Users report being "stuck" in the annotation view.

## Code Examples

Verified patterns from official sources and existing codebase:

### Systems Registry DB Schema
```sql
-- Follows the exact same pattern as credentials (Phase 39)
-- Source: supabase/schema-credentials.sql pattern

CREATE TABLE systems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  integration_method TEXT NOT NULL
    CHECK (integration_method IN ('api', 'browser-automation', 'knowledge-base', 'manual')),
  url TEXT,
  auth_notes TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE system_project_links (
  system_id UUID REFERENCES systems(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (system_id, project_id)
);

-- automation_tasks: tracks each detected automation need per pipeline run
CREATE TABLE automation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE NOT NULL,
  agent_name TEXT NOT NULL,
  system_name TEXT NOT NULL,
  system_id UUID REFERENCES systems(id),
  detected_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploading', 'analyzing', 'reviewing',
                      'confirmed', 'failed', 'skipped')),
  sop_text TEXT,                    -- Markdown content of the SOP
  analysis_result JSONB,            -- Structured step list from AI vision
  confirmed_steps JSONB,            -- User-confirmed/edited step list
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_systems_created_by ON systems(created_by);
CREATE INDEX idx_system_project_links_project ON system_project_links(project_id);
CREATE INDEX idx_automation_tasks_run_id ON automation_tasks(run_id);
CREATE INDEX idx_automation_tasks_status ON automation_tasks(status)
  WHERE status NOT IN ('confirmed', 'skipped');

-- RLS: same pattern as credentials
ALTER TABLE systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_project_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own systems" ON systems
  FOR SELECT USING (created_by = (SELECT auth.uid()));
CREATE POLICY "Users create systems" ON systems
  FOR INSERT WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "System owners see links" ON system_project_links
  FOR SELECT USING (
    system_id IN (SELECT id FROM systems WHERE created_by = (SELECT auth.uid()))
    OR project_id IN (SELECT project_id FROM project_members WHERE user_id = (SELECT auth.uid()))
  );
CREATE POLICY "System owners create links" ON system_project_links
  FOR INSERT WITH CHECK (
    system_id IN (SELECT id FROM systems WHERE created_by = (SELECT auth.uid()))
  );

-- automation_tasks: visible to run owners via pipeline_runs join
CREATE POLICY "Run owners see automation tasks" ON automation_tasks
  FOR SELECT USING (
    run_id IN (SELECT id FROM pipeline_runs WHERE created_by = (SELECT auth.uid()))
  );
```

### Terminal Panel Entry Rendering (Card-Based)
```typescript
// Source: existing StepLogPanel pattern + CONTEXT.md specifications
interface TerminalEntry {
  id: string;
  type: "status" | "prompt" | "upload" | "approval" | "annotation-review" | "user-input";
  timestamp: string;
  stepName?: string;
  displayName?: string;
  status?: StepStatus;
  content: string;
  metadata?: Record<string, unknown>;
}

function TerminalEntryCard({ entry }: { entry: TerminalEntry }) {
  return (
    <Card className="mb-3">
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          {/* Status icon */}
          <StatusIcon status={entry.status} type={entry.type} />
          <div className="flex-1 min-w-0">
            {/* Timestamp + step name */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatTime(entry.timestamp)}</span>
              {entry.displayName && <span className="font-medium">{entry.displayName}</span>}
              {entry.status && <StepStatusBadge status={entry.status} />}
            </div>
            {/* Message content */}
            <p className="mt-1 text-sm">{entry.content}</p>
            {/* Rich inline UI (dropzone, buttons, etc.) rendered by type */}
            <EntryInteraction entry={entry} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

### SOP Markdown Preview
```typescript
// Source: react-markdown docs + CONTEXT.md specification
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function SOPPreview({ markdown, onConfirm }: { markdown: string; onConfirm: () => void }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <h4 className="text-sm font-medium mb-3">SOP Preview</h4>
      <div className="prose prose-sm max-w-none max-h-96 overflow-y-auto">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {markdown}
        </ReactMarkdown>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={onConfirm}>Looks good</Button>
      </div>
    </div>
  );
}
```

### Orq.ai Vision API Call for Screenshot Analysis
```typescript
// Source: Orq.ai vision docs (https://docs.orq.ai/docs/ai-gateway-vision)
// + existing adapter.ts pattern

const ORQ_ROUTER_URL = "https://api.orq.ai/v2/router/chat/completions";

async function analyzeScreenshots(
  sopText: string,
  screenshots: Array<{ base64: string; label: string }>
): Promise<AnalysisResult> {
  const userContent = [
    {
      type: "text" as const,
      text: `<sop>\n${sopText}\n</sop>\n\nAnalyze the following screenshots and map each SOP step to the corresponding UI elements. For each step, identify: the action (click, type, select), the target element (description and approximate visual location), and the expected result after the action.`,
    },
    ...screenshots.map((img, i) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:image/png;base64,${img.base64}`,
        detail: "high" as const,
      },
    })),
  ];

  const result = await fetch(ORQ_ROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ORQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [
        { role: "system", content: VISION_ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  const json = await result.json();
  const text = json.choices?.[0]?.message?.content ?? "";
  return parseAnalysisResult(text); // Parse structured JSON from response
}
```

### New Inngest Events for Automation HITL
```typescript
// Source: existing events.ts pattern + ARCHITECTURE.md
export type Events = {
  // Existing events (unchanged)
  "pipeline/run.started": { data: { runId: string; projectId: string; useCase: string; userId: string; resumeFromStep?: string } };
  "pipeline/approval.decided": { data: { approvalId: string; runId: string; decision: "approved" | "rejected"; decidedBy: string; comment: string | null } };
  "infrastructure/health-check.requested": { data: { requestedBy: string } };

  // NEW: automation HITL events
  "automation/sop.uploaded": {
    data: {
      runId: string;
      taskId: string;
      sopText: string;          // Markdown content (small, safe for event payload)
      screenshotPaths: string[]; // Supabase Storage paths (NOT base64)
    };
  };
  "automation/annotation.confirmed": {
    data: {
      runId: string;
      taskId: string;
      confirmedSteps: Array<{
        stepNumber: number;
        action: string;
        targetElement: string;
        expectedResult: string;
        screenshotRef: string;
        confirmed: boolean;
        userCorrection?: string;
      }>;
    };
  };
};
```

### Automation Stages (Conditional, Not in Main PIPELINE_STAGES)
```typescript
// Source: existing stages.ts pattern + ARCHITECTURE.md
// These stages are CONDITIONAL and render in the terminal panel
// They don't appear in PIPELINE_STAGES (which drives the main for-loop)

export const AUTOMATION_STAGES = [
  { name: "automation-detector", displayName: "Detecting automation needs", stepOrder: 100 },
  { name: "sop-upload", displayName: "Waiting for SOP upload", stepOrder: 101 },
  { name: "sop-analyzer", displayName: "Analyzing SOP and screenshots", stepOrder: 102 },
  { name: "annotation-review", displayName: "Reviewing automation steps", stepOrder: 103 },
] as const;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sheet drawer for timeline | Terminal interaction panel | Phase 40 | Unified HITL model for all pipeline interactions |
| CLI systems.md file | DB-backed systems registry | Phase 40 | Web UI management, pipeline auto-detection |
| Text-only prompt adapter | Multimodal vision adapter | Phase 40 | Screenshots analyzed alongside SOP text |
| Upload through API routes | Signed URL direct-to-storage | Phase 40 | Bypasses Vercel 4.5MB limit |
| PDF/Word SOP parsing | Markdown-only SOPs | Phase 40 decision | No mammoth/pdf-parse needed, simpler pipeline |

**Deprecated/outdated (within this project):**
- Sheet timeline drawer: Being replaced by terminal panel. The `Sheet` component in `run-detail-client.tsx` and the `StepLogPanel` component will be evolved.
- `approval/` components: Will be migrated to render as terminal entries instead of standalone panels within the Sheet drawer.

## Open Questions

1. **Orq.ai Vision with Claude Sonnet**
   - What we know: Orq.ai supports `image_url` content blocks in chat completions. Phase 39 CONTEXT.md confirmed it works.
   - What's unclear: Exact token costs for multi-screenshot analysis. Whether Claude Sonnet provides sufficiently precise bounding box coordinates for annotation overlays.
   - Recommendation: Test with a real screenshot during implementation. If coordinates are too imprecise, use numbered labels on screenshots without precise bounding boxes (user still sees "Step 1: Login button" text, just without a box drawn on the image).

2. **Phase 37 Approval Migration Scope**
   - What we know: Existing approval UI (ApprovalPanel, DiffViewer) must work within terminal entries.
   - What's unclear: Whether to rewrite approval components or wrap them in terminal entry cards.
   - Recommendation: Wrap existing components in terminal entry cards. The ApprovalPanel already renders diff viewer and approve/reject buttons -- just embed it within a `TerminalEntryCard` of type "approval". Minimal code change.

3. **Terminal Panel Persistence**
   - What we know: Entries come from broadcast events (real-time) and DB state (on mount).
   - What's unclear: Whether to store terminal entries as a separate table or derive them from pipeline_steps + automation_tasks.
   - Recommendation: Derive from existing tables. Pipeline steps already have status, display_name, log, and timestamps. Automation tasks add SOP and annotation data. No new "terminal_entries" table needed.

4. **Client-Side Image Resize Before Upload**
   - What we know: Claude internally resizes to max 1568px longest side. Supabase Storage has a standard upload limit of 6MB per file.
   - What's unclear: Whether users will upload screenshots larger than 6MB (e.g., 4K retina screenshots from Mac).
   - Recommendation: Implement client-side Canvas API resize to max 1568px before upload. Saves storage, bandwidth, and ensures Claude processes at optimal resolution. Fall back to signed upload URL for any file that exceeds 6MB after resize.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.0 |
| Config file | web/vitest.config.ts (if exists, or see Wave 0) |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DETECT-01 | Automation detector identifies browser-automation systems from blueprint | unit | `npx vitest run web/lib/pipeline/__tests__/automation-detector.test.ts -t "detects"` | Wave 0 |
| DETECT-02 | SOP markdown upload/paste accepted in terminal panel | integration | Manual -- UI interaction test | Manual |
| DETECT-03 | Screenshot upload via signed URLs to Supabase Storage | unit | `npx vitest run web/lib/systems/__tests__/upload.test.ts` | Wave 0 |
| DETECT-04 | AI validates screenshot completeness against SOP steps | unit | `npx vitest run web/lib/pipeline/__tests__/vision-adapter.test.ts -t "completeness"` | Wave 0 |
| DETECT-05 | Detector skips when all systems have API integration method | unit | `npx vitest run web/lib/pipeline/__tests__/automation-detector.test.ts -t "skips"` | Wave 0 |
| VISION-01 | Vision adapter sends correct image_url content blocks to Orq.ai | unit | `npx vitest run web/lib/pipeline/__tests__/vision-adapter.test.ts -t "image_url"` | Wave 0 |
| VISION-02 | Analysis result correctly maps SOP steps to screenshots | unit | `npx vitest run web/lib/pipeline/__tests__/vision-adapter.test.ts -t "maps"` | Wave 0 |
| VISION-03 | Annotation overlay renders highlights at correct positions | unit | `npx vitest run web/components/annotation/__tests__/annotation-highlight.test.tsx` | Wave 0 |
| VISION-04 | User can confirm and edit individual steps | integration | Manual -- UI interaction test | Manual |
| VISION-05 | Re-analysis incorporates user corrections | unit | `npx vitest run web/lib/pipeline/__tests__/vision-adapter.test.ts -t "corrections"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd web && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/lib/pipeline/__tests__/automation-detector.test.ts` -- covers DETECT-01, DETECT-05
- [ ] `web/lib/pipeline/__tests__/vision-adapter.test.ts` -- covers DETECT-04, VISION-01, VISION-02, VISION-05
- [ ] `web/components/annotation/__tests__/annotation-highlight.test.tsx` -- covers VISION-03
- [ ] `web/lib/systems/__tests__/upload.test.ts` -- covers DETECT-03

## Sources

### Primary (HIGH confidence)
- [Orq.ai Vision API](https://docs.orq.ai/docs/ai-gateway-vision) -- image_url content blocks, base64 and URL support, detail parameter, format/size limits
- [Orq.ai Vision SDK Examples](https://docs.orq.ai/docs/vision-models-with-orqai-sdks) -- TypeScript code examples for multimodal chat completions
- [Supabase Signed Upload URLs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) -- createSignedUploadUrl API, token-based upload
- [Inngest waitForEvent](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event) -- HITL pattern, match syntax, timeout
- [Inngest waitForEvent Race Condition #1433](https://github.com/inngest/inngest/issues/1433) -- dual-write gate pattern needed
- Existing codebase: `web/lib/inngest/functions/pipeline.ts` -- step.waitForEvent pattern already used for approvals
- Existing codebase: `web/lib/pipeline/adapter.ts` -- Orq.ai router integration pattern
- Existing codebase: `web/lib/supabase/broadcast.ts` -- broadcast helpers and useBroadcast hook
- Existing codebase: `supabase/schema-credentials.sql` -- global-with-project-linking schema pattern
- CLI source: `orqai-agent-pipeline/orq-agent/systems.md` -- systems registry template with integration methods

### Secondary (MEDIUM confidence)
- [react-markdown GitHub](https://github.com/remarkjs/react-markdown) -- v10.1.0, safe markdown rendering, React virtual DOM
- [Vercel 4.5MB Body Size Limit](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions) -- serverless function payload limit
- `.planning/research/ARCHITECTURE.md` -- sub-pipeline flow, automation_tasks schema, HITL event patterns
- `.planning/research/PITFALLS.md` -- vision hallucination, SOP quality, state bloat, upload limits
- `.planning/research/STACK.md` -- technology decisions, Browserless.io integration patterns

### Tertiary (LOW confidence)
- Client-side Canvas API resize -- well-documented pattern but specific React implementation needs validation during development
- CSS overlay annotation positioning with percentage-based coordinates -- depends on AI's ability to return consistent bounding boxes

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- only new dep is react-markdown (mature, verified); all other tech already in project
- Architecture: HIGH -- patterns follow existing codebase conventions (credentials pattern for systems, broadcast for updates, Inngest steps for pipeline)
- Pitfalls: HIGH -- well-documented in existing PITFALLS.md research; upload limits verified against official docs
- Vision integration: MEDIUM -- Orq.ai vision API format verified, but precise bounding box quality from Claude Sonnet needs implementation-time validation
- Terminal panel UX: MEDIUM -- architecture is sound but the migration of existing approval UI and the full-width overlay interaction need careful implementation

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable domain -- no rapidly changing dependencies)
