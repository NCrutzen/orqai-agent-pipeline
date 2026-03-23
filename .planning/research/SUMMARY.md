# Research Summary: V4.0 Browser Automation Builder

**Domain:** Browser automation builder pipeline stage -- SOP-to-MCP-tool conversion for no-API systems
**Researched:** 2026-03-23
**Overall confidence:** MEDIUM-HIGH

## Executive Summary

V4.0 adds a conditional pipeline stage that detects when designed agents need browser automation (for systems like NXT, iController, Intelly that lack APIs), guides the user through SOP document + screenshot upload, uses Claude vision to analyze the screenshots and parse the SOP into a step-by-step automation plan, generates Playwright scripts, tests them on Browserless.io, and deploys verified scripts as MCP tools attached to the Orq.ai agents. The entire flow integrates within the existing Inngest `executePipeline` function as conditional steps that activate only when the architect identifies no-API systems.

The architecture introduces three new patterns to the codebase: (1) `step.waitForEvent()` for HITL interactions (SOP upload, annotation review, test approval) -- this is the first use of waitForEvent in the pipeline; (2) Claude vision API calls with base64-encoded images through the existing Orq.ai router or direct Claude API; and (3) MCP tool hosting via `@vercel/mcp-adapter` (or `mcp-handler`) on the same Vercel deployment. The existing Inngest step pattern, Supabase data storage, and Broadcast real-time updates all extend naturally to the new stages.

The primary technical risks are: (1) Claude vision generates incorrect Playwright selectors because it reads static images without DOM context -- mitigated by using Playwright's `getByRole`/`getByText` locators instead of CSS selectors and capturing the DOM accessibility tree on first execution for iteration; (2) Browserless.io script execution may exceed Vercel's 300s function timeout on slow on-premises target systems -- mitigated by Fluid Compute (800s) and splitting long flows; (3) the Orq.ai router may not pass multimodal content blocks -- must test early, with direct Claude API as fallback; (4) the Inngest `waitForEvent` race condition (GitHub #1433) can lose HITL events -- mitigated by the gate pattern and DB fallback.

The suggested build order prioritizes infrastructure verification (Browserless.io connection, Supabase Storage bucket, MCP adapter route) before any AI features, then validates the most uncertain component (Claude vision analysis) before building the full pipeline, and defers MCP deployment to last since it depends on everything working end-to-end.

## Key Findings

**Stack:** Existing V3.0 stack extends cleanly. New additions: `playwright-core` (types only, no browsers), Browserless.io (SaaS, no self-hosted infra), `@vercel/mcp-adapter` or `mcp-handler` (MCP hosting in same Next.js app), `mammoth` + `pdf-parse` (SOP document parsing). Total ~5 new npm packages.

**Architecture:** Conditional sub-pipeline within existing `executePipeline`. Automation stages run between spec-generator and orchestration-generator. Three `step.waitForEvent()` calls for HITL (upload, annotation review, test review). Scripts stored in Supabase, not Inngest state. MCP tools hosted as Next.js API routes.

**Critical pitfall:** Claude vision will generate plausible but incorrect CSS selectors from screenshots. Use logical action descriptions + Playwright's `getByRole`/`getByText` locators instead. Capture DOM accessibility tree on first execution attempt for informed iteration.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Infrastructure & Verification** - Set up Browserless.io account, Supabase Storage bucket, MCP adapter route, and new DB schema. Verify Browserless.io connectivity from Inngest step. Verify Orq.ai router multimodal passthrough. Verify MCP tool registration with Orq.ai API.
   - Addresses: Environment setup, integration verification
   - Avoids: Building features on unverified infrastructure, discovering passthrough issues late

2. **Automation Detection & SOP Upload** - Add the automation-detector Inngest step after spec-generator. Build SOP upload UI with Supabase Storage signed URLs. Implement document parsing (mammoth + pdf-parse). First use of `step.waitForEvent()` in the pipeline.
   - Addresses: No-API system detection, file upload flow
   - Avoids: waitForEvent race condition (use gate pattern from day one)

3. **AI Vision Analysis & Annotation Review** - Build Claude vision adapter (extend existing prompt adapter with image support). Screenshot analysis produces structured step lists. Build annotation review UI with guided confirmation flow. Second `step.waitForEvent()` for user confirmation.
   - Addresses: SOP + screenshot understanding, user confirmation flow
   - Avoids: Selector accuracy pitfall (use logical actions, not CSS selectors)

4. **Script Generation & Browserless Testing** - Generate Playwright scripts from confirmed annotations. Execute on Browserless.io via REST API or connectOverCDP. Build iterative test-review loop with third `step.waitForEvent()`. Capture DOM on failed execution for informed iteration.
   - Addresses: Script generation, testing, iteration loop
   - Avoids: Vercel timeout (configure maxDuration), state explosion (store scripts in DB not Inngest state)

5. **MCP Tool Deployment & Agent Attachment** - Deploy verified script as MCP tool endpoint. Register with Orq.ai via `POST /v2/tools`. Attach to target agent via `PUT /v2/agents`. End-to-end verification: agent calls tool, tool executes on Browserless.io, results returned.
   - Addresses: MCP hosting, Orq.ai integration, production tool execution
   - Avoids: Dynamic registration issues (test early), cold start latency (function warming)

**Phase ordering rationale:**
- Phase 1 first because infrastructure verification catches integration blockers (Orq.ai multimodal passthrough, Browserless connectivity) before any feature work
- Phase 2 before Phase 3 because the upload flow introduces `step.waitForEvent()` in a simple context before the more complex annotation review flow
- Phase 3 before Phase 4 because script generation quality depends on the annotation quality -- bad annotations produce bad scripts
- Phase 4 before Phase 5 because MCP deployment requires a verified, working script -- deploying untested scripts wastes Orq.ai tool slots
- Each phase is independently valuable and testable

**Research flags for phases:**
- Phase 1: Needs verification research -- test Orq.ai router multimodal passthrough before committing to vision adapter approach
- Phase 3: Needs deeper research on Claude vision prompt engineering for UI screenshot understanding -- optimal prompt structure for extracting actionable automation steps
- Phase 4: Needs research on Browserless.io /function REST API vs connectOverCDP tradeoffs for the specific execution pattern
- Phase 5: Needs research on Orq.ai MCP tool attachment API format -- exact payload structure for `/v2/tools` and agent attachment

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All new packages verified via npm and official docs. Browserless.io pricing and capabilities confirmed. MCP adapter officially supported by Vercel. |
| Features | MEDIUM-HIGH | Feature flow well-defined from PROJECT.md requirements. Claude vision capabilities verified for screenshot analysis. Exact prompt engineering for SOP analysis needs experimentation. |
| Architecture | MEDIUM-HIGH | Integration with existing Inngest pipeline is natural extension of proven patterns. step.waitForEvent is documented and officially supported. Conditional sub-pipeline within existing function is cleanest approach. |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls (state explosion, timeout, selector accuracy, waitForEvent race) verified via official docs and existing bug reports. Integration-specific pitfalls (Orq.ai multimodal passthrough) need live testing. |

## Gaps to Address

- **Orq.ai router multimodal passthrough:** Must test whether the Orq.ai chat completions router forwards image content blocks to Claude. If not, need direct Claude API calls for vision steps. This is the #1 verification item.
- **Browserless.io execution strategy:** REST `/function` API vs WebSocket `connectOverCDP` -- the parallel STACK.md researcher recommends /function REST for Inngest compatibility (stateless, no WebSocket). ARCHITECTURE.md recommends connectOverCDP for full programmatic control. **Resolution needed in Phase 1 verification.**
- **MCP dynamic tool registration:** Whether `mcp-handler`'s callback runs per-request (allowing DB-loaded tools) or once at startup (requiring static registration). Fallback: single "execute-automation" tool with dynamic dispatch.
- **Target system authentication:** How Playwright scripts authenticate with NXT/iController. Credential storage and rotation strategy needs detailed design during Phase 4.
- **Orq.ai MCP tool attachment format:** Exact API payload for registering an MCP tool and attaching it to an agent. Documentation shows the pattern but exact field names need verification.

## Sources

### Primary (HIGH confidence)
- [Inngest step.waitForEvent](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event) -- HITL patterns, match syntax
- [Inngest usage limits](https://www.inngest.com/docs/usage-limits/inngest) -- 32MB state, 4MB step output, 1000 steps max
- [Browserless.io connection URLs](https://docs.browserless.io/overview/connection-urls) -- WebSocket endpoint format
- [Browserless.io /function API](https://docs.browserless.io/rest-apis/function) -- REST API for custom code execution
- [Browserless.io pricing](https://www.browserless.io/pricing) -- Unit-based pricing, session limits
- [Vercel MCP deployment](https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel) -- @vercel/mcp-adapter setup
- [Claude Vision API](https://platform.claude.com/docs/en/build-with-claude/vision) -- base64 encoding, multi-image support
- [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration) -- 300s Pro, 800s Fluid

### Secondary (MEDIUM confidence)
- [Inngest waitForEvent race condition](https://github.com/inngest/inngest/issues/1433) -- confirmed bug, events in quick succession
- [Inngest AgentKit HITL](https://agentkit.inngest.com/advanced-patterns/human-in-the-loop) -- waitForEvent for AI workflows
- [Orq.ai tools documentation](https://docs.orq.ai/docs/agents/tools) -- MCP tool creation and attachment
- [Supabase Storage signed uploads](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) -- bypassing server action size limits
- [Vercel MCP adapter npm](https://www.npmjs.com/package/@vercel/mcp-adapter) -- package details and setup

---
*Research completed: 2026-03-23*
*Ready for roadmap: yes*
