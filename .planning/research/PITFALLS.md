# Domain Pitfalls

**Domain:** V4.0 Browser Automation Builder -- Adding AI-driven SOP-to-Playwright-script pipeline stage with Browserless.io execution, MCP tool deployment, and non-technical user conversational annotation flow to an existing Inngest-based agent pipeline
**Researched:** 2026-03-23
**Confidence:** MEDIUM-HIGH (Browserless.io, Inngest, and Playwright pitfalls verified against official docs; AI vision coordinate accuracy and SOP quality pitfalls based on multiple credible sources and architectural reasoning)

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, security breaches, or fundamental architecture problems.

---

### Pitfall 1: AI Vision Hallucinates UI Elements and Coordinates from Screenshots

**What goes wrong:**
Claude's vision API analyzes SOP screenshots and reports UI elements that do not exist, misidentifies element types (reports a dropdown as a text field), or returns inaccurate coordinates for element positions. The generated Playwright script targets elements at wrong locations or with wrong selectors. The script fails silently (clicks on empty space) or clicks the wrong element entirely. In testing against Browserless.io, the script appears to work on one screen resolution but fails on another because the hallucinated coordinates were coincidentally close enough on the original resolution.

The deeper problem: Claude's vision is 34% more likely to express high confidence when generating incorrect information (MIT research, 2025). The system presents wrong UI element analysis with authoritative certainty, and the non-technical user confirming the annotation has no way to detect the error.

**Why it happens:**
Vision models are not pixel-precise coordinate detectors. They are trained to understand images semantically, not geometrically. When asked "what element is at position X,Y?" or "where is the Submit button?", the model generates plausible-sounding coordinates based on visual patterns, but these are approximations at best and hallucinations at worst. Testing has shown that the same image analyzed multiple times returns different coordinates each time. Only specialized computer vision models (CogVLM, Qwen-VL) consistently produce accurate bounding boxes -- general-purpose vision models like Claude do not.

**Consequences:**
- Generated Playwright scripts click wrong elements, enter data in wrong fields, or miss steps entirely
- Iterative testing loop tries to "fix" scripts based on AI analysis of failure screenshots, compounding the hallucination (hallucination debugging hallucination)
- Non-technical users confirm AI's analysis because it sounds authoritative, embedding errors into the automation
- Scripts that pass testing on one screen resolution break on another

**Prevention:**
1. Never use AI-reported coordinates as Playwright click targets. Use coordinates only for the annotation overlay (showing the user "I think this is the Submit button"), then generate Playwright selectors using semantic strategies: `getByRole()`, `getByLabel()`, `getByText()`, or `data-testid` attributes
2. Implement a two-pass analysis: first pass identifies elements semantically ("there is a Submit button in the lower right area"), second pass generates Playwright locators based on the element descriptions -- never based on pixel coordinates
3. For the annotation confirmation flow, show the user a numbered overlay on the screenshot ("1: Username field, 2: Password field, 3: Login button") and ask them to confirm each element's identity and purpose, not its coordinates
4. Build a selector validation step: after generating locators, run a quick Browserless.io session that navigates to the page and checks if each locator resolves to exactly one element. If a locator resolves to zero or multiple elements, flag it for human review before proceeding to script generation
5. Store selector alternatives: for each element, generate 3 locator strategies (role-based, text-based, CSS-based) and fall back through them during execution

**Detection:**
- AI reports element coordinates that change across repeated analyses of the same screenshot
- Generated selectors resolve to zero elements when tested against the live page
- User confirms annotation but testing reveals clicks on wrong elements
- Scripts work on screenshots but fail on the live application

**Phase to address:**
SOP Analysis & Annotation phase -- vision analysis architecture must be designed to produce selectors, not coordinates, from the beginning

**Confidence:** HIGH -- vision coordinate inaccuracy is well-documented across multiple sources; MIT confidence-inversion finding is peer-reviewed

---

### Pitfall 2: SOP Quality is Garbage In, Garbage Out -- Non-Technical Users Provide Incomplete SOPs

**What goes wrong:**
The system expects SOP documents that describe every click, every field, every decision point, with a screenshot per step. Non-technical Moyne Roberts employees provide SOPs that skip "obvious" steps (like logging in), show only the final result (not the journey), have screenshots of the wrong page, include hand-drawn annotations that confuse the AI, mix multiple workflows in one document, or use screenshots from different dates showing different UI versions. The AI tries to build an automation from this incomplete information, generates a script with gaps, the script fails, the iterative testing loop tries to fix it, but the missing information cannot be inferred -- leading to an infinite test-fix-fail cycle.

**Why it happens:**
People who perform tasks daily have expert blindness -- they do not notice the steps their muscle memory handles. When asked to document "how you process an invoice in NXT," they skip steps like "click on the Accounts module" because it is reflexive. Screenshots are captured ad hoc during busy workdays: wrong screen, partial view, different zoom levels, browser with distracting tabs visible. The SOP is written for human readers who share the same context, not for an AI that needs explicit, atomic instructions.

**Consequences:**
- AI generates scripts with gaps that cannot be filled without going back to the user
- Iterative testing loop runs indefinitely trying to fix unfixable gaps
- Users become frustrated: "I gave you the SOP, why doesn't it work?"
- Wasted Browserless.io credits on doomed test iterations
- Erosion of trust in the entire automation pipeline

**Prevention:**
1. Build a structured SOP intake wizard, not a file upload. Guide users step-by-step: "What is the first thing you do? Take a screenshot. What do you click next? Take a screenshot." Each step must have: action description, screenshot, and expected result
2. Implement SOP completeness scoring before entering the script generation phase. The AI reviews the uploaded SOP and rates completeness: "Missing: login step, no screenshot of the confirmation dialog, step 3 and step 5 reference different pages with no navigation in between." Block script generation until the score passes threshold
3. Provide a screenshot capture tool (browser extension or guided screen recorder) that captures each click, not just final states. Consider a Loom-style recording where the AI extracts frames at each interaction point
4. After AI analyzes the SOP, present a step-by-step confirmation flow: "I understand this workflow has 8 steps: [list]. Are any steps missing?" This gives users the chance to fill gaps conversationally before script generation begins
5. Build SOP templates for each target system (NXT, iController, Intelly) with pre-filled common steps (login, navigation to module) that users customize rather than create from scratch

**Detection:**
- AI analysis returns fewer than 3 steps for a workflow the user describes as "complex"
- Screenshots show the same page state (no progression through the workflow)
- Generated script has navigation gaps (jumps from page A to page C with no page B)
- First test execution fails at the login screen (login step was omitted from SOP)
- SOP references UI elements not visible in any provided screenshot

**Phase to address:**
SOP Upload & Intake phase -- the structured intake wizard must exist before script generation is attempted

**Confidence:** HIGH -- SOP quality issues are universally documented in process automation literature; expert blindness is well-studied

---

### Pitfall 3: Browserless.io Session and Timeout Mismanagement Burns Credits and Kills Long Workflows

**What goes wrong:**
Browserless.io charges in "units" -- each unit is 30 seconds of browser time. A typical NXT workflow (login, navigate, enter data, confirm) takes 2-5 minutes of automated browser time. With the Starter plan (180,000 units/month, 20 concurrent browsers), that is approximately 1,500 workflow executions per month. During iterative testing, each test-fix cycle consumes 4-10 units. If the testing loop runs 15 iterations on a script that never converges (because the SOP is incomplete -- see Pitfall 2), that is 60-150 units burned on a single failed automation.

The worse problem: Browserless.io's global timeout defaults to 15 minutes for usage-based plans. If a Playwright script hangs (waiting for a selector that does not exist), it burns units until the timeout kills it. Playwright's own action timeouts (30 seconds default) should catch this, but if the script uses `waitForSelector` with a custom long timeout or `networkidle` navigation, individual action timeouts are bypassed.

Additionally, Playwright does not expose a `disconnect()` method, making the "reconnect to existing session" pattern unreliable. If you need multi-step workflows that pause for user input between sections, you cannot disconnect and reconnect -- you must keep the session alive or use Browserless.io's Persisting State feature instead.

**Why it happens:**
Developers test against Browserless.io with simple scripts (navigate to Google, take a screenshot) that consume 1-2 units each. They extrapolate that cost to production workflows without accounting for iterative testing overhead, hung sessions, or login failures that require full restarts. The 30-second unit granularity is not obvious -- a 31-second session costs 2 units, not 1.

**Consequences:**
- Monthly unit budget exhausted mid-month, blocking all automation testing
- Hung sessions consume units silently until global timeout
- Cannot reconnect to sessions mid-workflow (Playwright limitation)
- 429 errors when concurrent test runs exceed plan concurrency limit
- Users see "automation unavailable" with no explanation

**Prevention:**
1. Set explicit Playwright timeouts on every action: `page.click(selector, { timeout: 10000 })`, `page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })`. Never use `networkidle` for navigation -- it waits for all network activity to stop, which may never happen on modern SPAs
2. Implement a unit budget per automation attempt: max 20 units (10 minutes) per test run, max 100 units (50 minutes) per iterative testing session. Kill the session and report failure if budget is exceeded
3. Track unit consumption in the database: log start time, end time, and calculated units for every Browserless.io session. Show users a "credits remaining" indicator in the UI
4. For iterative testing, implement a "test budget" concept: "This automation has used 45 of 100 allocated test units. 3 iterations remaining before budget exhausted."
5. Use `waitUntil: 'domcontentloaded'` for all navigation instead of `networkidle` unless specifically needed
6. Design workflows as atomic, complete scripts -- not multi-session reconnectable flows. Each test run starts from login and completes the full workflow. Use Playwright `storageState` to cache login sessions and skip re-authentication on subsequent test iterations
7. Queue test executions to stay within concurrency limits rather than returning 429 errors to users

**Detection:**
- Unit consumption spikes without corresponding successful automations
- Browserless.io dashboard shows sessions hitting the global timeout (15 min)
- 429 Too Many Requests errors in logs during peak testing periods
- Monthly unit usage exceeds 50% in the first week of the month

**Phase to address:**
Browserless.io Integration phase -- unit budgeting and timeout configuration must be established before any script testing begins

**Confidence:** HIGH -- Browserless.io timeout and session limitations verified against official documentation; unit pricing confirmed from pricing page

---

### Pitfall 4: Playwright Selectors Break When Target System UI Updates

**What goes wrong:**
Moyne Roberts target systems (NXT, iController, Intelly) are third-party applications that update independently. A Playwright script generated from screenshots taken in March 2026 uses selectors like `page.click('button.btn-primary-v3.submit-invoice')`. When NXT updates its UI in April 2026, the class changes to `button.btn-primary-v4.submit-invoice`. The automation silently breaks. Since these are fixed scripts deployed as MCP tools and running autonomously, there is no human watching them fail -- the agent simply reports "tool execution failed" and the business process stalls.

The deeper problem: scripts generated from SOP screenshots are inherently snapshot-based. They capture the UI at a point in time. Unlike test suites that developers maintain alongside code changes, these scripts have no coupling to the target system's release cycle. Nobody knows NXT updated until an automation breaks.

**Why it happens:**
AI-generated selectors from screenshots tend toward visual CSS-based selectors (class names, IDs visible in the HTML) because these are what the AI can infer from visual appearance. Role-based selectors (`getByRole('button', { name: 'Submit Invoice' })`) require understanding the accessibility tree, which is not visible in a screenshot. The AI takes the path of least resistance.

Third-party systems update on their own schedule. Enterprise accounting software (NXT) typically updates quarterly or biannually, but SaaS tools (Intelly) may update weekly. There is no notification to Moyne Roberts when these UIs change.

**Consequences:**
- Automations break silently after target system updates
- Agents report "tool execution failed" but root cause is unclear
- Business processes that depend on automation stall with no fallback
- Users must re-create SOPs and re-generate scripts after every target system update
- Trust erosion: "the automation used to work but keeps breaking"

**Prevention:**
1. Generate resilient selectors by default: prioritize `getByRole()`, `getByLabel()`, `getByText()`, `getByPlaceholder()` over CSS selectors. These survive class name changes as long as the visible text and ARIA roles remain stable
2. Implement a selector resilience tier system:
   - Tier 1 (preferred): `getByRole('button', { name: 'Submit' })` -- survives CSS changes
   - Tier 2 (fallback): `getByText('Submit Invoice')` -- survives structural changes
   - Tier 3 (last resort): `page.locator('button.submit-invoice')` -- brittle, flag as high-maintenance
3. Build a health check system: every deployed MCP tool runs a lightweight "canary" check daily (navigate to login page, verify key selectors still resolve). If the canary fails, alert the user and disable the tool until the script is updated
4. When generating selectors from screenshots, cross-validate by running the generated locators against the live page in Browserless.io before finalizing the script. If a locator does not resolve, try alternative strategies automatically
5. Store selector alternatives in the MCP tool metadata: if the primary selector fails at runtime, try the fallback chain before reporting failure
6. Track which selectors have failed historically -- if the same element breaks repeatedly, flag it as volatile and suggest the user add a `data-testid` attribute (if they have access) or use a more stable selector pattern

**Detection:**
- MCP tool execution starts failing on a specific date (correlates with target system update)
- Health check canaries report selector resolution failures
- Multiple automations for the same target system break simultaneously
- Error logs show "Timeout waiting for selector" on elements that previously resolved

**Phase to address:**
Playwright Script Generation phase -- selector strategy must be designed before the first script is generated; Health Check phase -- canary system must be deployed alongside MCP tools

**Confidence:** HIGH -- selector brittleness is universally documented in Playwright best practices; role-based selectors recommended by Playwright official docs

---

### Pitfall 5: Credential Storage for Target Systems Creates a Security Exposure Surface

**What goes wrong:**
To automate NXT/iController/Intelly, Playwright scripts need login credentials for those systems. The naive approach stores credentials in environment variables or database records alongside the automation scripts. Now the Agent Workforce system holds production credentials for Moyne Roberts' core business systems. A single security breach (Supabase database exposure, env var leak, Inngest event payload logging) exposes credentials to every target system simultaneously.

The compounding risk: MCP tools deployed to Orq.ai agents execute browser automations in Browserless.io. The credential must travel from storage through the Orq.ai agent runtime to the MCP tool to Browserless.io. Each hop is an exposure surface. Inngest event payloads are logged and visible in the Inngest dashboard. If credentials are passed in event data, they are visible to anyone with Inngest dashboard access.

**Why it happens:**
The automation requires credentials -- there is no way around it for systems without API access. Developers store credentials the same way they store other config: environment variables. This is fine for API keys that can be rotated, but NXT/iController login credentials are often shared accounts or service accounts that are difficult to rotate and have broad access.

**Consequences:**
- Breach of Agent Workforce exposes credentials for NXT, iController, Intelly
- Credentials in Inngest event logs visible to all team members with dashboard access
- Supabase database backup contains plaintext credentials
- Browserless.io session recordings (if enabled) capture login sequences with visible passwords
- Credential rotation in target systems requires updating all associated automations

**Prevention:**
1. Never store target system credentials in plaintext in the database or Inngest events. Use Supabase Vault (if available on the plan) or a dedicated secrets manager
2. Implement a credential proxy pattern: the MCP tool does not receive the actual password. Instead, it calls a credential resolution endpoint at execution time that returns a short-lived session token or injects credentials directly into the Browserless.io session without passing them through the agent runtime
3. Use Playwright `storageState` to cache authenticated sessions. After initial login, save the session cookies/tokens and reuse them for subsequent executions. This limits how often the actual credentials are used
4. Never include credentials in Inngest event payloads. Pass only a `credentialId` reference. The Inngest function resolves the actual credential from the secrets store at execution time
5. Implement credential access auditing: log every credential access (who, when, which system, from which automation) without logging the credential value itself
6. Design for credential rotation: each automation references a credential by ID, not by value. When NXT password changes, update the credential record once -- all automations pick up the new credential automatically
7. Encrypt credentials at rest with a key that is not stored alongside the encrypted values. Supabase database encryption at rest helps but is not sufficient if the application has plaintext access
8. Disable Browserless.io session recording for sessions that handle credentials, or configure recording to mask input fields

**Detection:**
- Credentials appear in Inngest event logs (search for password patterns in log viewer)
- Supabase database export contains credential values in plaintext columns
- Browser session recordings show login credential entry
- Multiple automations break simultaneously when a single credential is rotated (indicates direct credential embedding, not reference-based)

**Phase to address:**
Foundation phase -- credential management architecture must be designed before any target system automation is built

**Confidence:** HIGH -- credential security principles are well-established; Playwright storageState pattern verified against official docs; Inngest event logging behavior verified

---

### Pitfall 6: Inngest State Bloat from Conversational Annotation Flow Hits 32MB Limit

**What goes wrong:**
The V4.0 browser automation builder has a conversational flow: upload SOP -> AI analyzes -> user confirms/corrects -> AI refines -> user confirms -> generate script -> test -> user reviews results -> iterate. Each turn in this conversation is an Inngest step that returns data. Screenshot analysis results include base64-encoded annotated images, full step descriptions, selector candidates, and correction history. The existing V3.0 pipeline already stores stage results in step return values (visible in the current `pipeline.ts`). Adding a multi-turn conversation on top pushes state toward Inngest's 32MB function run state limit and 4MB per-step output limit.

The annotation flow is uniquely dangerous because it involves image data. A single annotated screenshot base64-encoded is 500KB-2MB. A 10-step SOP with annotation overlays generates 5-20MB of image data alone. If stored in Inngest step state, the function hits the 32MB limit before script generation even begins.

**Why it happens:**
The existing pipeline pattern (visible in `/web/lib/inngest/functions/pipeline.ts`) stores stage outputs in step return values and accumulates them in `stageResults`. This works for text-only stages (architect output, spec output). The V4.0 conversational flow naturally follows the same pattern, but the data is orders of magnitude larger because it includes images and iterative correction history.

**Consequences:**
- Function run state exceeds 32MB limit, causing Inngest runtime failure
- Per-step output exceeds 4MB limit, causing individual step failure
- Functions slow down as state grows (serialization/deserialization overhead)
- Cannot add more conversation turns after state limit is reached
- User loses all conversation progress on state overflow failure

**Prevention:**
1. Store all image data and annotation results in Supabase Storage, not in Inngest step state. Step return values should contain only references (Supabase Storage URLs or record IDs)
2. Apply the same pattern the existing pipeline uses for large outputs (the comment "Return a reference, NOT the full output (Pitfall 6)" in the existing code is a direct precedent) -- extend this rigorously to all V4.0 steps
3. Design the conversational flow as a series of Inngest functions chained by events, not as one function with many steps. Each conversation turn is a separate function invocation triggered by user input events:
   - `browser-automation/sop.uploaded` -> SOP analysis function
   - `browser-automation/annotation.confirmed` -> Refinement function
   - `browser-automation/script.generated` -> Test execution function
   - `browser-automation/test.reviewed` -> Iteration function
4. Keep the Inngest function state under 1MB as a soft limit (the existing code already follows this pattern). Any data larger than 10KB goes to Supabase
5. Implement state size monitoring: log the serialized size of each step's return value. Alert if any step returns more than 100KB

**Detection:**
- Inngest dashboard shows function state size growing with each conversation turn
- "State too large" errors in Inngest function logs
- Functions take progressively longer to start each step (serialization overhead)
- Annotation flow works for simple 3-step SOPs but fails for complex 10+ step SOPs

**Phase to address:**
Pipeline Architecture phase -- the conversational flow must be designed as chained functions from the beginning, not as a single function with accumulated state

**Confidence:** HIGH -- Inngest 32MB state limit and 4MB step output limit verified against official documentation; existing pipeline code confirms the reference-only pattern is already established

---

### Pitfall 7: Iterative Testing Loop Runs Indefinitely Without Convergence

**What goes wrong:**
The V4.0 flow includes an iterative testing loop: generate script -> test on Browserless.io -> AI analyzes failure -> AI fixes script -> test again -> repeat. Without proper stopping conditions, this loop runs indefinitely. The AI "fixes" a script by changing a selector, the new selector fails differently, the AI changes it again, and the cycle continues. Each iteration consumes Browserless.io units, Claude API tokens, and time. The user sees "Testing iteration 14 of ???" and has no way to know if the automation is converging or thrashing.

The worse variant: the AI's fix introduces a new bug while fixing the original one. Iteration N fixes step 3 but breaks step 5. Iteration N+1 fixes step 5 but breaks step 3. The loop oscillates between two broken states forever.

**Why it happens:**
AI agents lack implicit memory of their action history within a single task. Each iteration uses context from the conversation, but the model does not inherently know it already tried a particular fix unless that information is explicitly in the prompt. Without explicit tracking of "we already tried selector X and it failed because Y," the AI may re-try the same failed approach.

The system was designed for the V2.0/V2.1 prompt iteration loop (HITL-approved, 5 stop conditions). But browser automation testing has more failure modes than prompt iteration. A prompt either works or it does not. A Playwright script can fail in dozens of ways: wrong selector, timing issue, navigation race condition, authentication expiry, network timeout, element not interactable, iframe boundary, popup blocker -- each requiring different fixes.

**Consequences:**
- Browserless.io unit budget exhausted on non-converging test loops
- Claude API costs accumulate without progress
- User waits indefinitely for "Automation testing in progress..."
- User trust destroyed when loop is finally killed after 20+ failed iterations
- No diagnostic insight into why the automation cannot be fixed

**Prevention:**
1. Implement hard iteration limits: maximum 5 iterations per testing session. After 5 failures, stop and present the user with a diagnostic summary: "This automation failed 5 times. The recurring issue is [X]. Recommended action: [improve SOP / add missing step / contact admin]"
2. Track iteration history explicitly: maintain a list of attempted fixes and their outcomes. Pass this history to the AI on each iteration: "Previous attempts: 1) Changed selector from X to Y -- failed because Z. 2) Added wait before click -- failed because W. Do not repeat these approaches."
3. Implement convergence detection: if the same step fails with the same error type on 3 consecutive iterations, stop the loop -- the AI is thrashing
4. Implement regression detection: if iteration N+1 breaks a step that iteration N fixed, stop the loop -- the AI is oscillating
5. Budget-gate each iteration: before starting iteration N+1, check remaining unit budget. If fewer than 10 units remain, stop and report
6. Show users real-time iteration progress: "Iteration 3/5: Step 4 failed (selector not found). AI is generating fix..." -- not just a spinner
7. After loop failure, present actionable diagnostics: "Steps 1-3 work reliably. Step 4 fails because the 'Process Invoice' button could not be found. This may be because: (a) the button text changed, (b) it requires scrolling, (c) it is inside an iframe. Please update the SOP with a screenshot showing this button."

**Detection:**
- Same step fails across 3+ consecutive iterations
- Test loop exceeds 5 iterations without full workflow completion
- Unit consumption per automation exceeds 100 units without a successful run
- AI generates the same fix (or a semantically equivalent one) twice

**Phase to address:**
Iterative Testing phase -- stopping conditions and convergence detection must be built into the loop from the first implementation

**Confidence:** HIGH -- infinite loop patterns in AI agents well-documented; stopping condition strategies verified across multiple sources; the existing V2.0/V2.1 iteration loop (5 stop conditions) provides a proven internal precedent

---

## Moderate Pitfalls

Mistakes that cause significant rework, poor UX, or operational issues, but do not require full architecture changes to fix.

---

### Pitfall 8: Vercel 4.5MB Upload Limit Blocks SOP Screenshot Uploads

**What goes wrong:**
Users upload SOP documents (PDF, Word) with embedded screenshots, plus additional standalone screenshot files. A typical SOP with 10 screenshots is 15-30MB. The Vercel serverless function body limit is 4.5MB. The upload silently fails or returns a cryptic 413 error. The user tries again, gets the same error, assumes the system is broken.

**Prevention:**
1. Upload files directly from the browser to Supabase Storage using signed upload URLs -- bypass the Vercel serverless function entirely
2. The API route generates a Supabase signed upload URL (small request, under 4.5MB limit), returns it to the client, and the client uploads directly to Supabase Storage
3. Supabase signed upload URLs expire after 2 hours and are single-use
4. For large SOPs, consider client-side image extraction: extract screenshots from the PDF on the client side and upload individually
5. Set a client-side file size limit (50MB per file, 100MB total) with a clear error message before the upload even starts
6. Support resumable uploads for large files using Supabase Storage's resumable upload feature (TUS protocol, 24-hour URL validity)

**Detection:**
- 413 FUNCTION_PAYLOAD_TOO_LARGE errors in Vercel logs
- Users report "upload failed" with no useful error message
- Uploads work for small files (1-2 screenshots) but fail for complete SOPs

**Phase to address:**
SOP Upload phase -- file upload architecture must use direct-to-storage pattern from the start

**Confidence:** HIGH -- Vercel 4.5MB limit verified against official documentation; Supabase signed upload URLs verified against official docs

---

### Pitfall 9: MCP Tool Deployment Has Authentication and Observability Gaps

**What goes wrong:**
The verified Playwright script is packaged as an MCP tool and attached to an Orq.ai agent. In production, the MCP tool needs to: (a) authenticate with Browserless.io, (b) resolve target system credentials, (c) handle execution timeouts, (d) report success/failure back to the agent. If any of these fail, the agent's tool call fails and the agent may retry indefinitely or give up without useful error information. MCP tool failures are opaque -- the agent sees "tool execution failed" with no detail about whether it was an authentication error, a timeout, a selector failure, or a Browserless.io outage.

Additionally, MCP's biggest production pain points in 2026 are auth management and observability. Token expiry, OAuth scope mismatches, and session invalidation under load are the most common failure modes. There is no standard audit trail for what a client requested and what a server did.

**Prevention:**
1. Implement structured error responses from MCP tools: not just "failed" but `{ status: "failed", phase: "login", error: "selector_not_found", selector: "getByRole('button', { name: 'Sign In' })", suggestion: "Login page UI may have changed" }`. The calling agent can then provide useful context to the user
2. Build an MCP tool health dashboard: show last execution time, success rate, average duration, and last error for each deployed tool
3. Implement MCP tool-level timeouts separate from Browserless.io session timeouts: if the tool does not complete within 3 minutes, kill the session and return a timeout error
4. Store execution logs for every MCP tool invocation: input parameters, Browserless.io session ID, step-by-step execution trace, screenshots at failure points, final result. These logs are essential for debugging production failures
5. Handle Browserless.io authentication at the MCP server level using environment variables, not passed through the agent. The agent sends "run automation X" and the MCP server handles all infrastructure authentication internally
6. Implement circuit breaker pattern: if an MCP tool fails 3 times in a row, disable it temporarily and alert the automation owner rather than letting the agent retry indefinitely

**Detection:**
- Agent reports "tool execution failed" with no actionable detail
- MCP tool success rate drops below 90% without corresponding alert
- Tool execution times increase gradually (indicates selector timing issues)
- No execution logs available when investigating a reported failure

**Phase to address:**
MCP Tool Deployment phase -- structured error responses and execution logging must be built into the MCP tool wrapper from the start

**Confidence:** MEDIUM-HIGH -- MCP production pain points verified against 2026 roadmap and The New Stack reporting; specific tool-level implementation patterns based on architectural reasoning

---

### Pitfall 10: Non-Technical Users Cannot Evaluate AI Annotation Quality

**What goes wrong:**
The annotation confirmation flow shows users: "I identified 8 steps in your SOP. Step 3: Click the 'Process' button in the Action menu." The user sees this and thinks "yes, there is a Process button." But the AI may have misidentified which Process button (there are two), misunderstood the navigation context (the button is on a different page than the AI thinks), or conflated two steps into one. The user confirms because the description sounds right, not because they verified the AI's precise understanding.

This is distinct from Pitfall 2 (incomplete SOPs). Here the SOP is complete, but the AI's interpretation is wrong and the user cannot catch the error because the confirmation interface does not expose enough detail for validation.

**Prevention:**
1. Show annotated screenshots with numbered overlays, not just text descriptions. The user must see the AI's understanding overlaid on their own screenshots: "I will click HERE [highlighted on screenshot]. Is this correct?"
2. For each step, show the AI's expected result: "After clicking Process, I expect to see [description]. Is that what happens?" This forces the user to think about the next state, not just the current action
3. Include a "dry run" preview: before running the full script, show a slideshow of expected screenshots at each step: "Step 1: I see this. Step 2: I see this." The user validates the visual journey, not just individual steps
4. Use plain language, not technical terms: "Click the blue button that says 'Process' in the top-right corner" not "Click element matching getByRole('button', { name: 'Process' })"
5. Add a "This doesn't look right" escape hatch at every step, with guided follow-up: "What's wrong? (a) Wrong element, (b) Missing step, (c) Wrong order, (d) Something else"
6. After confirmation, run a quick validation: navigate to the page in Browserless.io and show the user a real screenshot of the live page alongside their SOP screenshot. Ask "Does this look like the same page?"

**Detection:**
- Users confirm all annotations in under 30 seconds per step (rubber-stamping)
- First test execution fails on a step the user confirmed as correct
- Annotations reference elements that do not exist on the live page
- Users report "I confirmed it but it's doing the wrong thing"

**Phase to address:**
Annotation Confirmation UX phase -- the visual overlay and validation approach must be designed before the text-only confirmation is built

**Confidence:** MEDIUM-HIGH -- non-technical user evaluation challenges based on UX research and architectural reasoning; expert blindness patterns well-documented

---

### Pitfall 11: Login Session Expiry Causes Mid-Workflow Failures

**What goes wrong:**
Target systems (NXT, iController, Intelly) have session timeouts. A Playwright script logs in at step 1, performs work through steps 2-8, but if steps 3-7 take too long (network latency, slow page loads, waiting for async operations), the session expires before step 8. The script fails with an opaque error (redirect to login page, "Session expired" popup, or a 403 response) that the AI misinterprets as a selector failure.

With Playwright `storageState` caching, the problem is even more subtle: the cached session may have expired since the last execution. The script skips login (using cached cookies), navigates to the first page, and gets redirected to login. The AI sees the login page when it expected the dashboard and diagnoses it as "wrong page loaded" rather than "session expired."

**Prevention:**
1. Implement session-aware error detection: before each major step, check if the current URL is the login page. If so, re-authenticate and retry the step
2. Set `storageState` cache TTL shorter than the target system's session timeout: if NXT sessions last 30 minutes, cache sessions for 20 minutes maximum
3. Include a "session health check" at the start of every execution: navigate to a known authenticated page. If redirected to login, clear cached state and re-authenticate
4. Classify errors properly: "redirected to login page" is an auth error, not a navigation error. The AI must not try to fix auth errors by changing selectors
5. For long-running workflows, add periodic session refresh points: at the midpoint of a 10-step workflow, check session validity

**Detection:**
- Scripts fail at different steps each time (because session expiry is timing-dependent)
- Failure screenshots show the login page instead of the expected workflow page
- AI's fix attempts change selectors on the login page (misdiagnosis)
- Scripts work reliably when run immediately after login but fail when run from cached sessions

**Phase to address:**
Playwright Script Generation phase -- session management must be a built-in script pattern, not an afterthought

**Confidence:** HIGH -- session expiry in web automation is universally documented; Playwright storageState behavior verified against official docs

---

## Minor Pitfalls

Issues that cause friction but have straightforward fixes.

---

### Pitfall 12: Browserless.io Playwright Version Mismatch

**What goes wrong:**
Browserless.io's shared fleet runs specific Playwright versions. If local development or script generation assumes a different Playwright version, scripts may use APIs that do not exist on the Browserless.io fleet, or behavior may differ between versions.

**Prevention:**
1. Pin the Playwright version in the project to match Browserless.io's shared fleet version
2. Check Browserless.io's version documentation before upgrading Playwright locally
3. Test scripts against Browserless.io's fleet (not just local headless Chrome) during development

**Confidence:** MEDIUM -- version documentation exists but specific version alignment needs verification at implementation time

---

### Pitfall 13: iFrame Boundaries in Target Systems Break Selectors

**What goes wrong:**
Enterprise systems like NXT frequently use iFrames for embedded modules. Playwright selectors cannot cross iFrame boundaries by default. A selector that works when targeting the main page fails silently when the element is inside an iFrame. The AI analyzing screenshots cannot see iFrame boundaries -- they are invisible in screenshots.

**Prevention:**
1. During SOP analysis, explicitly check for iFrame boundaries by inspecting the page DOM in Browserless.io (not just the screenshot)
2. Generate scripts that use `page.frameLocator()` for elements inside iFrames
3. Include an iFrame detection step in the validation pipeline: after generating selectors, test each one and check if the element exists in the main frame or a child frame

**Confidence:** MEDIUM -- iFrame usage in enterprise systems is common but NXT-specific behavior needs verification during implementation

---

### Pitfall 14: Popup and Modal Dialogs Break Linear Script Flow

**What goes wrong:**
Target systems show confirmation dialogs, error modals, cookie consent banners, or session timeout popups that are not captured in the SOP screenshots. The Playwright script does not handle them, causing the next action to fail because the popup is blocking the page.

**Prevention:**
1. Implement a global popup handler in every generated script: before each action, check for and dismiss known modal types (confirm dialogs, cookie banners, session warnings)
2. During the first successful test run, record any popups/modals that appeared. Add handlers for them to the script automatically
3. Include popup handling in the SOP intake checklist: "Does this workflow show any confirmation dialogs or popups? If so, please include screenshots of them."

**Confidence:** MEDIUM -- popup handling is a known Playwright pattern; specific popup types in NXT/iController need verification

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| SOP Upload & Intake | Pitfall 2: Incomplete SOPs from non-technical users | Build structured intake wizard with completeness scoring before allowing script generation |
| SOP Upload & Intake | Pitfall 8: Vercel 4.5MB upload limit | Use Supabase Storage signed upload URLs for direct browser-to-storage uploads |
| SOP Analysis & Annotation | Pitfall 1: AI hallucinates UI elements/coordinates | Generate selectors (not coordinates); validate against live page; user confirms visual overlays |
| SOP Analysis & Annotation | Pitfall 10: Users cannot evaluate annotation quality | Show annotated screenshots with overlays; include dry-run preview; add "this doesn't look right" escape hatch |
| Playwright Script Generation | Pitfall 4: Brittle selectors break on UI updates | Use role-based and text-based selectors; implement selector fallback chains; build health check canaries |
| Playwright Script Generation | Pitfall 11: Login session expiry mid-workflow | Build session-aware error detection and auto-re-authentication into every script template |
| Browserless.io Integration | Pitfall 3: Session/timeout mismanagement burns credits | Set explicit action timeouts; implement unit budgets per testing session; use domcontentloaded not networkidle |
| Iterative Testing | Pitfall 7: Testing loop runs indefinitely | Hard iteration limit (5); convergence detection; regression detection; iteration history tracking |
| MCP Tool Deployment | Pitfall 9: Opaque tool failures | Structured error responses; execution logging; health dashboard; circuit breaker pattern |
| Pipeline Architecture | Pitfall 6: Inngest state bloat from conversational flow | Chain separate Inngest functions via events; store all image data in Supabase Storage; reference-only step returns |
| Credential Management | Pitfall 5: Credentials exposed across multiple systems | Credential proxy pattern; Supabase Vault or secrets manager; never in event payloads; storageState caching |

## Integration Gotchas with Existing Inngest Pipeline

| Integration Point | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| Adding browser automation as a pipeline stage | Treating it as another `step.run()` in the existing `executePipeline` function | Create a separate Inngest function (`browser-automation/build`) triggered by an event from the main pipeline. The main pipeline emits `browser-automation/needed` and waits with `step.waitForEvent('browser-automation/complete')` |
| Conversational annotation flow | Running the multi-turn conversation as steps within a single Inngest function | Chain separate functions via events: each user response triggers a new function invocation. This keeps state small and allows unlimited conversation turns |
| Image data in step results | Following the existing pattern of returning output from `step.run()` for annotation/screenshot data | Break the pattern for image data: store in Supabase Storage, return only the storage URL from `step.run()`. The existing pipeline already notes this risk (Pitfall 6 comment in code) |
| HITL approval during annotation | Using `step.waitForEvent` for each annotation confirmation step | Use the dual-write pattern (V3.0 Pitfall 2 still applies): write confirmation state to DB AND send Inngest event. Show confirmation UI only after the wait is registered |
| Iterative testing loop | Using a `for` loop with `step.run()` inside the pipeline function | Implement as a separate function that triggers itself recursively via events: `browser-automation/test.iteration.complete` triggers the next iteration function. This avoids step count accumulation (1000 step limit) |
| Browserless.io calls from Inngest steps | Connecting to Browserless.io within a `step.run()` where Inngest may invoke the step multiple times on retry | Make Browserless.io calls idempotent: check if a test result already exists for this iteration before starting a new browser session. Inngest retries re-invoke the step from scratch |
| Linking MCP tool output back to the agent pipeline | Deploying the MCP tool and then manually updating the agent spec | The browser-automation function should emit a `browser-automation/tool.deployed` event containing the MCP tool ID. The main pipeline's spec-generator or a post-processing step picks this up and attaches the tool to the Orq.ai agent automatically |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Storing annotated screenshots in Inngest state | Function slows, state overflow errors | Store in Supabase Storage, reference by URL in step return | SOPs with more than 5 screenshots (typical for any real workflow) |
| Using `networkidle` for all Browserless.io navigations | Sessions burn extra units waiting for idle; some SPAs never reach idle | Use `domcontentloaded` by default; only use `networkidle` when explicitly needed for specific pages | Any SPA-based target system |
| Running Browserless.io test iterations sequentially within one Inngest function | Step count grows linearly; hits 1000 step limit after ~200 iterations (each iteration = 5 steps) | Use event-driven iteration: each iteration is a separate function invocation | Testing sessions with more than 10 iterations |
| Full SOP document processing in a single Claude API call | Token limit exceeded for large SOPs; response truncated; high cost per call | Process SOP page-by-page or section-by-section in separate steps | SOPs longer than 10 pages |
| Synchronous screenshot analysis (one at a time) | SOP with 10 screenshots takes 10x the analysis time | Process screenshots in parallel where possible (each as a separate step); aggregate results afterward | SOPs with more than 5 screenshots |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing target system credentials in Supabase database plaintext | Database breach exposes NXT/iController/Intelly login credentials | Use encrypted credential storage (Supabase Vault or custom encryption with separate key management) |
| Passing credentials in Inngest event payloads | Credentials visible in Inngest dashboard event logs to all team members | Pass only `credentialId` in events; resolve actual credentials inside the Inngest function from secure storage |
| Embedding credentials in Playwright scripts | Script source code contains plaintext passwords; visible in version control, logs, debugging tools | Inject credentials at runtime from environment variables or secrets manager; never in script source |
| Caching Playwright `storageState` without TTL | Cached session tokens stored indefinitely; stolen cache provides permanent access to target systems | Set TTL on cached sessions shorter than target system session timeout; encrypt cached state at rest |
| Browserless.io session recordings capturing login | Session recordings contain visible password entry; recordings stored on Browserless.io infrastructure | Disable session recording for credential-sensitive sessions; or mask all input fields in recordings |
| MCP tool API key for Browserless.io passed through agent | Browserless.io API key exposed to Orq.ai agent runtime and logs | MCP server holds Browserless.io credentials internally; agent has no access to infrastructure secrets |

## "Looks Done But Isn't" Checklist

- [ ] **SOP upload:** Upload works with small file -- but try a 20MB PDF with 15 embedded screenshots. Does it hit the 4.5MB Vercel limit?
- [ ] **Vision analysis:** AI identifies elements correctly on a clean screenshot -- but try a screenshot with multiple similar buttons (two "Process" buttons on the same page). Does it identify the right one?
- [ ] **Annotation confirmation:** User confirms all steps -- but ask them to explain step 3 in their own words. If they cannot, the confirmation was rubber-stamped
- [ ] **Playwright selectors:** Script works today -- but simulate a CSS class change on one element. Does the fallback selector work?
- [ ] **Browserless.io timeout:** Simple script completes -- but try a workflow that takes 5 minutes with slow page loads. Does it complete within the timeout budget?
- [ ] **Iterative testing:** Script passes after 2 iterations -- but deliberately introduce a failure that cannot be fixed by selector changes (missing page, authentication failure). Does the loop stop at the iteration limit?
- [ ] **Credential handling:** Automation works -- but search the Inngest event logs for credential values. Are they visible?
- [ ] **MCP tool failure:** Tool works when Browserless.io is healthy -- but simulate a Browserless.io outage (return 503). Does the agent get a useful error or just "tool failed"?
- [ ] **Session expiry:** Automation completes -- but wait for the target system session timeout (usually 30 min) and run again with cached storageState. Does it re-authenticate?
- [ ] **Health check:** Automation has been running for a month -- but the target system updated its UI. Does the health check canary detect the breakage before a user reports it?
- [ ] **Long SOP:** 3-step SOP works -- but try a 15-step SOP with complex branching. Does the Inngest function state stay under limits?
- [ ] **Concurrent users:** One user running tests -- but 3 users start testing simultaneously. Do they exceed the Browserless.io concurrency limit?

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| AI vision hallucination (Pitfall 1) | MEDIUM | Refactor from coordinate-based to selector-based approach; add selector validation step; rebuild annotation overlay UI |
| Incomplete SOPs (Pitfall 2) | HIGH | Build SOP intake wizard (new feature, not a fix); create per-system templates; implement completeness scoring |
| Browserless.io credit burn (Pitfall 3) | LOW | Add timeout configuration and budget tracking; immediate impact; no architecture change |
| Brittle selectors (Pitfall 4) | MEDIUM | Refactor selector generation to prioritize role-based; add fallback chains; deploy health check canaries (new infrastructure) |
| Credential exposure (Pitfall 5) | HIGH | Requires credential migration to secure storage; audit and rotate all exposed credentials; redesign credential flow |
| Inngest state bloat (Pitfall 6) | HIGH | Requires refactoring from single-function to chained-function architecture; cannot be patched incrementally |
| Infinite test loop (Pitfall 7) | LOW | Add iteration limits and convergence detection; can be patched into existing loop without architecture change |
| Upload size limit (Pitfall 8) | LOW | Switch to signed upload URLs; straightforward client-side change |
| MCP tool opacity (Pitfall 9) | MEDIUM | Add structured error responses and logging; requires changes to MCP tool wrapper and potentially a new monitoring dashboard |
| User evaluation failure (Pitfall 10) | MEDIUM | Redesign annotation confirmation UX with visual overlays; UI-heavy work but no backend architecture change |
| Session expiry (Pitfall 11) | LOW | Add session health check to script template; can be added to all scripts via template update |

## Sources

- [BrowserStack: Playwright Selector Best Practices 2026](https://www.browserstack.com/guide/playwright-selectors-best-practices) -- role-based selectors survive layout shifts, CSS selectors break on DOM changes (HIGH confidence)
- [Playwright Official: Locators](https://playwright.dev/docs/locators) -- getByRole, getByLabel, getByText recommended over CSS selectors (HIGH confidence)
- [Better Stack: Avoiding Flaky Playwright Tests](https://betterstack.com/community/guides/testing/avoid-flaky-playwright-tests/) -- networkidle unreliable for SPAs, timing-based assertions flaky (HIGH confidence)
- [Browserless.io: Timeout Issues](https://docs.browserless.io/baas/troubleshooting/timeouts) -- 15-minute global timeout, action timeouts, session management (HIGH confidence, official docs)
- [Browserless.io: Best Practices](https://docs.browserless.io/baas/troubleshooting/best-practices) -- domcontentloaded over networkidle, explicit timeouts (HIGH confidence, official docs)
- [Browserless.io: Session Management](https://docs.browserless.io/baas/session-management/standard-sessions) -- Playwright does not support disconnect(), use Persisting State instead (HIGH confidence, official docs)
- [Browserless.io: Pricing](https://www.browserless.io/pricing) -- unit system (30 seconds per unit), concurrency limits by plan tier (HIGH confidence, official)
- [Claude Vision API Docs](https://platform.claude.com/docs/en/build-with-claude/vision) -- supports image analysis including UI screenshots (HIGH confidence, official docs)
- [Roboflow: Claude 3 Opus Vision Analysis](https://blog.roboflow.com/claude-3-opus-multimodal/) -- coordinate/bounding box accuracy varies between runs; CogVLM and Qwen-VL more accurate for precise location (MEDIUM confidence)
- [MIT research on AI confidence](https://mitsloanedtech.mit.edu/ai/basics/addressing-ai-hallucinations-and-bias/) -- models 34% more likely to use confident language when generating incorrect information (HIGH confidence, peer-reviewed research)
- [Suprmind: AI Hallucination Rates 2026](https://suprmind.ai/hub/ai-hallucination-rates-and-benchmarks/) -- hallucination rates declining but inherent to architecture per 2025 mathematical proof (MEDIUM confidence)
- [Inngest: Usage Limits](https://www.inngest.com/docs/usage-limits/inngest) -- 32MB state limit, 4MB step output, 1000 steps max (HIGH confidence, official docs)
- [Inngest: Wait for Event](https://www.inngest.com/docs/reference/functions/step-wait-for-event) -- timeout returns null, supports CEL matching, does not count against concurrency (HIGH confidence, official docs)
- [Inngest: Human in the Loop - AgentKit](https://agentkit.inngest.com/advanced-patterns/human-in-the-loop) -- waitForEvent pattern for approval flows (HIGH confidence, official docs)
- [Inngest: waitForEvent race condition (issue #1433)](https://github.com/inngest/inngest/issues/1433) -- events in quick succession not resolved (MEDIUM confidence, confirmed bug)
- [Vercel: 4.5MB body size limit](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions) -- 4.5MB payload limit for serverless functions (HIGH confidence, official docs)
- [Supabase: Signed Upload URLs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) -- single-use URLs, 2-hour expiry (HIGH confidence, official docs)
- [Supabase: Resumable Uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads) -- TUS protocol, 24-hour URL validity (HIGH confidence, official docs)
- [Playwright: Authentication](https://playwright.dev/docs/auth) -- storageState for session reuse, separate state per role (HIGH confidence, official docs)
- [Secure Credential Management in Playwright](https://medium.com/@sajith-dilshan/secure-credential-management-in-playwright-0cf75c4e2ff4) -- environment variables, never hardcode credentials (MEDIUM confidence)
- [The New Stack: MCP Production Pain Points](https://thenewstack.io/model-context-protocol-roadmap-2026/) -- auth failures most common, observability gaps, scaling challenges (MEDIUM confidence)
- [MCP 2026 Roadmap](https://modelcontextprotocol.io/development/roadmap) -- audit trails, auth management, gateway patterns as enterprise gaps (HIGH confidence, official)
- [Browserless.io: State of AI Browser Automation 2026](https://www.browserless.io/blog/state-of-ai-browser-automation-2026) -- fixed scripts for known flows, agents for exploration; domain-specific reasoning limitations (MEDIUM confidence)
- [PKC India: SOP Documentation Mistakes](https://pkcindia.com/blogs/sop-documentation-mistakes/) -- 26 common SOP errors including incomplete procedures, ambiguous steps (MEDIUM confidence)
- [Markaicode: Stop AI Agent Loops](https://markaicode.com/fix-ai-agent-looping-autonomous-coding/) -- iteration limits, convergence detection, circuit breakers (MEDIUM confidence)
- [TestDino: Playwright AI Ecosystem 2026](https://testdino.com/blog/playwright-ai-ecosystem/) -- self-healing tests, MCP integration, accessibility-tree-first execution (MEDIUM confidence)

---
*Pitfalls research for: V4.0 Browser Automation Builder (Orq Agent Designer)*
*Researched: 2026-03-23*
