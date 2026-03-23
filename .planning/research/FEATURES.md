# Feature Landscape

**Domain:** Browser Automation Builder -- AI-driven SOP-to-Playwright pipeline stage for no-API systems (V4.0)
**Researched:** 2026-03-23
**Confidence:** MEDIUM -- Skyvern SOP Upload, Browserless.io API, Inngest waitForEvent patterns, Claude Vision capabilities, and Playwright MCP verified via official docs and multiple sources; Orq.ai custom MCP tool attachment verified via docs.orq.ai; exact Browserless.io pricing tiers, Claude Vision token costs for screenshot batches, and Orq.ai MCP server hosting constraints not verified with live testing

---

## Context: What This Research Covers

This research answers: **what features does a browser automation builder pipeline stage need so that non-technical Moyne Roberts colleagues can go from an SOP document + screenshots to a working MCP tool that automates browser interactions on no-API systems like NXT, iController, and Intelly?**

The web pipeline already exists (V3.0): use case input, Inngest durable functions with step-per-stage execution, real-time Broadcast updates, and a progress dashboard. V4.0 adds a new stage type to this pipeline -- one that pauses for user input multiple times (SOP upload, annotation confirmation, test feedback) rather than running straight through.

Key constraints from PROJECT.md and existing codebase:
- 5-15 users, all Moyne Roberts employees, non-technical
- Existing pipeline uses `PIPELINE_STAGES` array with linear stage execution
- Each stage runs as `step.run()` inside a single Inngest function (`pipeline/execute`)
- Stage results stored in `pipeline_steps.result` JSONB column
- `pipeline_files` table already exists for run-level file attachments
- Pipeline prompts fetched from GitHub repo `.md` files at runtime
- Supabase Broadcast for real-time step updates to dashboard
- Key decision already made: **fixed deterministic scripts** over dynamic browser-use (dynamic already handled by existing Orq.ai MCP tools)
- Output target: MCP tool deployed to Orq.ai and attached to the agent

---

## Table Stakes

Features users expect. Missing any of these = the automation builder feels broken or unusable for non-technical colleagues.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| SOP document upload (PDF/Word/text) | Users have existing SOPs for NXT, iController, Intelly. They expect to upload what they already have, not re-create it. | Low | `pipeline_files` table already exists. Supabase Storage handles file uploads with RLS. Parse with gray-matter or pdf-parse. |
| Screenshot upload with drag-and-drop | Users need to show the AI what each screen looks like. Must be as easy as dragging files from a folder. | Low | Supabase Storage bucket for screenshots. Ordered upload with step numbering. Supabase UI library has a Dropzone component. |
| AI vision analysis of screenshots | The AI must "see" and describe what is on each screen -- buttons, fields, menus, navigation elements. Non-technical users cannot describe DOM structure. | Medium | Claude Vision accepts PNG/JPEG, returns structured descriptions. Send screenshots with SOP text as context. Token cost: ~1,600 tokens per 1080p image. |
| Step-by-step understanding presentation | AI must show the user "here is what I think you do on this screen" and let them confirm or correct. Users need to validate AI's interpretation before any code is generated. | Medium | Conversational annotation flow. AI presents numbered steps with screenshot references. Inngest `step.waitForEvent()` pauses pipeline until user confirms. |
| User confirmation/correction mechanism | Users must be able to say "yes, that's right" or "no, step 3 is wrong -- you click the dropdown first." Without this, AI guesses silently and produces wrong scripts. | Medium | In-app chat-like UI within the pipeline step. User edits AI's understanding. Corrected understanding fed back to script generator. |
| Playwright script generation | The system must produce a working Playwright script from the confirmed SOP understanding. This is the core value proposition -- SOP document becomes executable code. | High | Claude generates Playwright TypeScript from structured SOP + annotated screenshots. Page Object Model pattern for maintainability. Selectors based on accessibility tree + visual landmarks. |
| Script execution on Browserless.io | Generated scripts must actually run against the target system. Users need to see "it worked" or "it failed on step X." No local browser installation. | Medium | Browserless.io `connectOverCDP()` WebSocket endpoint. Execute via Vercel API route or separate worker. Return execution results + screenshots of each step. |
| Execution result display with screenshots | Users need visual proof the automation worked -- screenshots of each step the script performed, compared to their original SOP screenshots. | Medium | Browserless.io `/screenshot` API. Display side-by-side: "expected" (user's screenshot) vs "actual" (script's screenshot). |
| Iterative test-fix cycle | First attempt rarely works perfectly. Users need to report "step 5 failed" and have AI fix the script and re-run. This loop continues until the automation is reliable. | High | Inngest `step.waitForEvent()` for user feedback. AI diagnoses failure from error logs + failure screenshot. Generates patched script. Re-executes. Tracks iteration count. |
| MCP tool deployment | Working script must become an MCP tool attached to the Orq.ai agent. Users should not need to manually configure tool attachment. | Medium | Create MCP tool via Orq.ai API with server URL. Attach tool_id to agent. MCP server hosts the verified Playwright script. |
| Real-time progress updates | Consistent with V3.0 dashboard. Users expect to see "Analyzing screenshots..." / "Generating script..." / "Testing automation..." in real time. | Low | Existing `broadcastStepUpdate()` and `broadcastRunUpdate()` patterns. New step names for browser automation sub-steps. |
| Error messages in plain English | When something fails (script error, Browserless timeout, screenshot parsing issue), users need "The automation couldn't find the 'Save' button on step 3" not a stack trace. | Low | Existing `toPlainEnglish()` error formatter pattern. Extend for Playwright-specific errors (timeout, selector not found, navigation failed). |

---

## Differentiators

Features that set the product apart from generic browser automation tools. Not expected, but highly valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Auto-detection of no-API systems | Pipeline architect stage automatically identifies when an agent needs browser automation (e.g., "interact with NXT" triggers the browser automation builder). User does not need to explicitly request it. | Medium | Extend architect prompt to flag `needs_browser_automation: true` with target system name. Conditional pipeline branching after architect stage. |
| Annotated screenshot overlay | AI draws visual annotations on user's screenshots -- "I'll click HERE" with numbered markers -- so users can visually verify the AI's plan before script generation. | Medium | Canvas overlay or SVG annotations on uploaded screenshots. Claude Vision identifies coordinates. Display annotated images in the confirmation flow. |
| Credential vault with session reuse | Store target system credentials securely. Reuse authenticated sessions across automation runs so the script doesn't need to log in every time. | High | Supabase Vault for encrypted credential storage. Browserless.io session persistence via `/reconnect` API. HITL approval before credential use. AES-256 encryption at rest. |
| Side-by-side expected vs actual comparison | After each test run, show the user's original SOP screenshots next to the automation's screenshots, step by step. Makes it obvious where the script diverged. | Low | Image grid component. Screenshots already captured by both user (upload) and script (Browserless). Align by step number. |
| Multi-flow automation per agent | One agent might need to automate multiple workflows on the same system (e.g., "create invoice" AND "check payment status" in NXT). Build multiple scripts, deploy as multiple MCP tools. | Medium | Allow multiple SOP uploads per agent. Each SOP becomes a separate MCP tool. Agent spec references multiple tool_ids. |
| Script version history | Track script iterations -- what changed between v1 and v5 after user feedback. Allows rollback if a later version regresses. | Low | Store each script version in `pipeline_steps.result` JSONB with version number. Display diff view. |
| Self-healing selector suggestions | When a script fails on a selector, AI suggests alternative selectors based on accessibility tree analysis rather than just failing. | Medium | Playwright's built-in locator strategies (role, text, testId). AI analyzes failure screenshot + DOM snapshot to suggest alternatives. Requires Browserless DOM access. |
| Dry-run mode with step preview | Before running on the real target system, show a step-by-step preview of what the script WILL do, with expected screenshots. User approves before execution touches the real system. | Low | Generate script execution plan without running. Display as numbered list with expected screenshots. User clicks "Execute for real" to proceed. |

---

## Anti-Features

Features to explicitly NOT build. These look tempting but create maintenance burden, scope creep, or conflict with existing decisions.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Dynamic/exploratory browser-use agent | Already solved. Orq.ai has existing MCP tools for dynamic browser interaction. V4.0 is specifically for **deterministic, known-flow** automation. Building a second dynamic agent creates confusion and maintenance overhead. | Use existing Orq.ai browser-use MCP tools for exploratory tasks. V4.0 produces fixed Playwright scripts for known SOPs. |
| Visual no-code flow builder (drag-and-drop) | Non-technical users don't want to build automation visually -- they want to hand over an SOP and have AI build it. A visual builder implies the user understands automation steps. Skyvern and Bardeen do this; it's not our value proposition. | Conversational annotation flow where AI presents its understanding and user confirms/corrects in natural language. |
| Record-and-replay browser extension | Requires users to install browser extensions and perform the workflow manually while recording. Our users have SOPs and screenshots already -- the whole point is they don't have to demonstrate the workflow live. | SOP + screenshot upload as the primary input mechanism. AI vision replaces manual recording. |
| Direct VNC/remote desktop to target systems | Requires managing VM infrastructure, network access, VPN tunnels. Violates the "no self-hosted infrastructure" constraint. Browserless.io abstracts this. | Browserless.io cloud execution. Scripts connect via WebSocket. No infrastructure management. |
| CAPTCHA solving | NXT, iController, and Intelly are internal enterprise systems behind corporate auth. No CAPTCHAs. Adding CAPTCHA solving adds complexity for a non-existent problem. | Handle corporate SSO/login flows. If a target system adds CAPTCHA later, address then. |
| Scheduling/cron execution of automations | V4.0 scope is building the automation and attaching it to an agent. The agent decides WHEN to run the tool. Scheduling is the agent runtime's responsibility. | Orq.ai agent runtime handles tool invocation timing. MCP tool is available on-demand. |
| Multi-browser support (Firefox, Safari) | Enterprise internal systems run on Chromium. Playwright supports all browsers, but testing across browsers adds complexity with zero value for internal tools. | Chromium only via Browserless.io. Playwright scripts target Chromium. |
| Script editing by users | Non-technical users should never see or edit Playwright code. Exposing code creates fear and confusion. All fixes happen through natural language feedback. | User provides feedback in plain English ("step 5 clicks the wrong button"). AI modifies the script. User sees results, not code. |

---

## Feature Dependencies

```
SOP Upload ─────────────────┐
                             ├──> AI Vision Analysis ──> Step-by-Step Presentation ──> User Confirmation
Screenshot Upload ──────────┘                                                              │
                                                                                           v
                                                                        Playwright Script Generation
                                                                                           │
                                                                                           v
                                                                        Browserless.io Execution
                                                                                           │
                                                                                           v
                                                                        Result Display + Comparison
                                                                                           │
                                                                     ┌─── Pass ────────────┤
                                                                     │                     │
                                                                     v               Fail + Feedback
                                                            MCP Tool Deployment             │
                                                                     │                     v
                                                                     v            Script Iteration Loop
                                                            Agent Tool Attachment        (back to Script Generation)
```

### Dependency on Existing Pipeline Infrastructure

| Existing Component | V4.0 Dependency | Integration Point |
|-------------------|-----------------|-------------------|
| `PIPELINE_STAGES` array | New stages added conditionally (not for every run) | Conditional stage injection after architect detects `needs_browser_automation` |
| `step.run()` pattern | Each browser automation sub-step is an Inngest step | Same retry/memoization patterns as existing stages |
| `step.waitForEvent()` | **NEW** -- not yet used in pipeline | Required for SOP upload pause, confirmation pause, test feedback pause |
| `broadcastStepUpdate()` | Real-time updates for browser automation sub-steps | Same channel pattern (`run:{runId}`), new step names |
| `pipeline_files` table | SOP and screenshot storage | Already exists with run_id FK, mime_type, file_path |
| `pipeline_steps.result` JSONB | Store SOP analysis, generated scripts, test results | Larger payloads than existing stages (scripts + screenshots) |
| `runPromptAdapter()` | Claude API calls for vision analysis and script generation | Needs extension for **vision messages** (image content blocks) |
| Supabase Storage | File upload bucket for SOPs and screenshots | New bucket with RLS policies matching pipeline_files pattern |
| Orq.ai API | MCP tool creation and agent attachment | `/v2/tools` for MCP tool creation, `/v2/agents` for tool attachment |

### Critical New Dependency: Inngest `step.waitForEvent()`

The browser automation builder is fundamentally different from existing pipeline stages because it **pauses for human input multiple times**:

1. **Pause 1:** After architect detects need -- wait for user to upload SOP + screenshots
2. **Pause 2:** After AI analysis -- wait for user to confirm/correct understanding
3. **Pause 3:** After script execution -- wait for user to approve result or provide feedback
4. (Pause 3 repeats on each iteration until user approves)

Inngest's `step.waitForEvent()` supports this pattern natively:
- Returns the event payload or `null` on timeout
- Matches events by data field (e.g., `data.runId`)
- Configurable timeout (recommend 7 days for human interaction)
- Integrates with Inngest Realtime for live UI updates

This represents the biggest architectural shift from V3.0's linear pipeline to V4.0's **interactive pipeline**.

---

## Complexity Assessment by Phase

| Feature Group | Estimated Complexity | Rationale |
|--------------|---------------------|-----------|
| File upload infrastructure (SOP + screenshots) | Low | Supabase Storage exists, `pipeline_files` table exists, Dropzone component available |
| AI vision analysis of screenshots | Medium | Claude Vision API is straightforward, but prompt engineering for consistent SOP-to-step extraction needs iteration. Token costs scale with screenshot count. |
| Conversational annotation flow (present + confirm) | High | First use of `step.waitForEvent()` in the pipeline. New UI pattern (chat-like within pipeline step). Multiple pause/resume cycles. |
| Playwright script generation | High | Prompt engineering for reliable Playwright code generation. Must handle diverse internal systems (NXT, iController, Intelly). Selector strategy critical for resilience. |
| Browserless.io integration | Medium | API is well-documented. `connectOverCDP()` pattern is standard. Challenge is error handling and timeout management in serverless context (Vercel function timeouts). |
| Iterative test-fix loop | High | Combines `step.waitForEvent()`, script diffing, failure diagnosis, and re-execution. Most complex feature -- essentially the iterate pipeline from V2.1 adapted for browser scripts. |
| MCP tool deployment | Medium | Orq.ai API for tool creation is documented. Need MCP server to host Playwright scripts. Server URL must be reachable from Orq.ai runtime. |
| Auto-detection in architect | Low | Prompt engineering addition to existing architect `.md` file. No infrastructure change. |

---

## MVP Recommendation

### Phase 1: Upload + Analysis Foundation
Prioritize:
1. **SOP document upload** -- Supabase Storage bucket, file parsing, `pipeline_files` integration
2. **Screenshot upload with ordering** -- Drag-and-drop, step numbering, preview
3. **AI vision analysis** -- Claude Vision reads screenshots, correlates with SOP text
4. **Step-by-step presentation** -- Display AI's understanding for user review

**Rationale:** This phase validates the core hypothesis: can AI reliably interpret SOP + screenshots into a structured step sequence? If not, the rest of the feature set is moot. No Browserless.io dependency. No MCP deployment. Just: upload, analyze, present.

### Phase 2: Conversational Confirmation + Script Generation
Prioritize:
1. **`step.waitForEvent()` integration** -- Pause/resume pipeline for user input
2. **User confirmation/correction flow** -- Approve or edit AI's understanding
3. **Playwright script generation** -- Generate from confirmed understanding
4. **Script execution on Browserless.io** -- Run and capture results

**Rationale:** This phase introduces the two hardest architectural changes: interactive pipeline (waitForEvent) and Playwright code generation. Get these right before adding the iteration loop.

### Phase 3: Iteration Loop + Deployment
Prioritize:
1. **Result display with side-by-side comparison** -- Visual proof of success/failure
2. **Iterative test-fix cycle** -- User feedback, AI diagnosis, script patch, re-run
3. **MCP tool deployment** -- Verified script becomes MCP tool
4. **Agent tool attachment** -- MCP tool attached to Orq.ai agent

**Rationale:** Iteration is the quality gate. Users keep providing feedback until the automation is reliable. Only then does it deploy as an MCP tool. This mirrors V2.1's iterate pipeline pattern.

### Defer to Later
- **Credential vault with session reuse** -- Useful but not required for MVP. Can pass credentials as Inngest event data initially.
- **Auto-detection in architect** -- Nice to have. MVP can trigger browser automation manually via UI toggle.
- **Multi-flow per agent** -- Build one flow reliably first. Multiple flows are additive.
- **Self-healing selectors** -- Optimization after core loop works.
- **Annotated screenshot overlay** -- Polish feature after core confirmation flow works.

---

## User Experience Expectations for Non-Technical Audience

Research on non-technical RPA user expectations confirms these critical UX patterns:

1. **Transparency over magic** -- Users must see what the AI understood, not just the end result. The "present understanding, get confirmation" pattern is essential for trust. Users are reserved when actions happen in the background without their knowledge.

2. **Plain English throughout** -- No code visible. No technical jargon. "Step 3: Click the 'New Invoice' button in the top-right corner" not "page.locator('#btn-new-invoice').click()".

3. **Visual verification** -- Screenshots are the lingua franca. Users can compare "what I showed you" vs "what you did" through images, not logs.

4. **Gradual commitment** -- Upload first (low risk). Review AI's understanding (medium commitment). Run the script (higher commitment, but on Browserless.io, not production). Deploy only after explicit approval (highest commitment).

5. **Escape hatches** -- Users must be able to stop, go back, re-upload, or abandon at any point without losing progress. The pipeline cannot feel like a one-way conveyor belt.

6. **Proactive status communication** -- "I'm analyzing your 8 screenshots, this takes about 30 seconds" rather than a spinning loader. Follows existing Broadcast update patterns.

---

## Sources

- [Skyvern AI Browser Automation -- SOP Upload Feature](https://www.skyvern.com/) -- MEDIUM confidence
- [Stagehand v3 Browser Automation Framework](https://www.stagehand.dev/) -- MEDIUM confidence
- [Browserless.io Cloud Automation](https://www.browserless.io/automation) -- MEDIUM confidence
- [Browserless.io State of AI Browser Automation 2026](https://www.browserless.io/blog/state-of-ai-browser-automation-2026) -- MEDIUM confidence
- [Claude Vision API Documentation](https://platform.claude.com/docs/en/build-with-claude/vision) -- HIGH confidence
- [Inngest step.waitForEvent Documentation](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event) -- HIGH confidence
- [Inngest Human-in-the-Loop Pattern](https://agentkit.inngest.com/advanced-patterns/human-in-the-loop) -- HIGH confidence
- [Orq.ai Agent API Documentation](https://docs.orq.ai/docs/agents/agent-api) -- HIGH confidence
- [Playwright MCP Server (Microsoft)](https://github.com/microsoft/playwright-mcp) -- HIGH confidence
- [1Password: Credential Risk for AI Browser Agents](https://blog.1password.com/closing-the-credential-risk-gap-for-browser-use-ai-agents/) -- MEDIUM confidence
- [QA Wolf: Self-Healing Test Automation Types](https://www.qawolf.com/blog/self-healing-test-automation-types) -- MEDIUM confidence
- [Workflow Use: Deterministic Self-Healing Browser Automation](https://news.ycombinator.com/item?id=44007065) -- LOW confidence
- [Skyvern: Browser Automation Security Best Practices](https://www.skyvern.com/blog/browser-automation-security-best-practices/) -- MEDIUM confidence
- [Microsoft: Conversational Design Recommendations](https://learn.microsoft.com/en-us/power-platform/well-architected/experience-optimization/conversation-design) -- HIGH confidence
- [Supabase File Upload with Next.js](https://supalaunch.com/blog/file-upload-nextjs-supabase) -- MEDIUM confidence
