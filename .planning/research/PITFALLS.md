# Pitfalls Research

**Domain:** V3.0 Web UI & Dashboard -- Adding browser-based UI with real-time dashboard, node graph visualization, and HITL approval workflows to an existing CLI-based AI agent pipeline
**Researched:** 2026-03-13
**Confidence:** MEDIUM-HIGH (verified against official Supabase, Inngest, and React Flow documentation; some integration-specific pitfalls based on community reports and architectural reasoning)

---

## Critical Pitfalls

### Pitfall 1: Supabase Realtime Postgres Changes Bottleneck Kills Dashboard Updates

**What goes wrong:**
The natural first approach for real-time pipeline dashboard updates is Supabase Realtime Postgres Changes -- write pipeline state to a table, subscribe to changes, UI updates automatically. This works in development but breaks under load. Postgres Changes are processed on a single thread to maintain change order. Every change event must check RLS policies for each subscribed user. If 10 users watch the dashboard during a pipeline run that updates status every 2 seconds across 5 agents, that is 10 RLS checks per update x 5 agents x 30 updates/minute = 1,500 RLS checks per minute on a single thread. Updates lag, then time out.

**Why it happens:**
Postgres Changes feels like the "correct" approach because the data is already in the database. Supabase's own docs now recommend Broadcast for most use cases, but most tutorials still show Postgres Changes because it requires less code.

**How to avoid:**
Use Supabase Realtime Broadcast (not Postgres Changes) for pipeline progress updates. The pipeline orchestrator (Inngest function) writes state to the database for persistence AND sends a Broadcast message for real-time UI updates. The dashboard subscribes to Broadcast channels, not table changes. Reserve Postgres Changes only for data that genuinely needs RLS-filtered subscriptions (e.g., the run list showing only your own runs).

Pattern:
1. Inngest step completes -> writes to `pipeline_runs` table (persistence)
2. Inngest step completes -> sends Supabase Broadcast to channel `pipeline:{run_id}` (real-time UI)
3. Dashboard subscribes to Broadcast channel, not Postgres Changes
4. If user refreshes page mid-run, load current state from DB, then subscribe to Broadcast for live updates

**Warning signs:**
- Dashboard updates lag behind actual pipeline progress by more than 5 seconds
- Supabase Realtime reports show high "changes per second" but low "messages delivered per second"
- `TIMED_OUT` errors in Realtime connection logs

**Phase to address:**
Pipeline Dashboard phase -- must choose Broadcast architecture before building any real-time features

---

### Pitfall 2: Inngest step.waitForEvent Race Condition Drops Approval Events

**What goes wrong:**
The HITL approval workflow uses Inngest's `step.waitForEvent()` to pause a pipeline until a user approves or rejects. A documented bug (GitHub issue #1433) causes `step.waitForEvent` to miss events that arrive in quick succession. If the approval event fires before Inngest has fully registered the wait (a race window of milliseconds), the event is lost. The function waits indefinitely until timeout. The user clicked "Approve" but the pipeline stays stuck.

Additionally, `step.waitForEvent` returns `null` on timeout -- not an error. If the timeout handler is missing or treats `null` as "approved" (a common shortcut), the pipeline silently continues without actual approval.

**Why it happens:**
The race condition is an Inngest platform issue that exists when events are emitted immediately after a `waitForEvent` is registered. In HITL workflows, the approval UI button fires an event, but the Inngest function may not have fully persisted its wait state yet. The timeout-returns-null behavior is by design but catches developers who expect an exception.

**How to avoid:**
- Add a small delay (500ms-1s) between entering the wait state and enabling the approval UI button. The Inngest function should emit an event like `pipeline/approval.requested` that the UI listens for before showing the Approve/Reject buttons.
- Always handle `null` return from `waitForEvent` as an explicit timeout -- show "Approval timed out, please re-trigger" in the UI, never silently continue.
- Set reasonable timeouts: 7 days max (`"7d"`) for approvals (Inngest free plan limits sleep to 7 days; paid allows up to 1 year).
- Store approval state in the database as well: when user clicks Approve, write to `approvals` table AND send Inngest event. The Inngest function checks the DB as a fallback if the event was missed.

**Warning signs:**
- Users report clicking "Approve" but pipeline remains in "Waiting for approval" state
- Approval events appear in Inngest event logs but function shows "waiting"
- Pipeline proceeds without approval (null timeout treated as success)

**Phase to address:**
HITL Approval Flow phase -- must implement the dual-write pattern (DB + event) from day one

---

### Pitfall 3: Azure AD Tenant URL Not Configured -- Any Microsoft Account Can Log In

**What goes wrong:**
Supabase Auth with Microsoft/Azure defaults to the `common` tenant endpoint (`https://login.microsoftonline.com/common`), which allows ANY Microsoft account to sign in -- personal Outlook accounts, other organizations' accounts, not just Moyne Roberts employees. The app appears to work perfectly in testing (developer uses their M365 account, it works), but in production any Microsoft user can access the system.

**Why it happens:**
The Supabase dashboard's Azure provider configuration accepts a Client ID and Secret. If the Azure Tenant URL field is left empty or set to `common`, Supabase uses the multi-tenant endpoint. The Azure App Registration in Entra ID may be set to "My organization only," but Supabase Auth does not enforce this -- it only checks the token is valid, not which tenant issued it, unless the tenant-specific URL is configured.

**How to avoid:**
- In Supabase Auth provider settings, set Azure Tenant URL to `https://login.microsoftonline.com/{moyne-roberts-tenant-id}` -- not `common`, not blank.
- In Azure Entra ID, configure the App Registration as "Accounts in this organizational directory only (Single tenant)."
- Add a server-side middleware check: after Supabase session is established, verify `user.user_metadata.iss` contains the Moyne Roberts tenant ID. Reject sessions from other tenants.
- Test with a personal Microsoft account during QA. If it can log in, tenant restriction is broken.

**Warning signs:**
- Login works without being prompted for organization-specific MFA policies
- `user.user_metadata` shows a different tenant ID than expected
- No "admin consent" prompt appears during first login (should appear for single-tenant apps)

**Phase to address:**
Foundation & Auth phase -- must be the first thing verified, before any other features are built on top of auth

---

### Pitfall 4: Vercel Serverless 10-Second Timeout Kills AI Pipeline Steps

**What goes wrong:**
The existing CLI pipeline has steps that call Claude API and Orq.ai API, each taking 10-60+ seconds. Moving these to Next.js API routes on Vercel hits the serverless function timeout: 10 seconds on Hobby plan, 60 seconds on Pro (configurable up to 5 minutes). A single Claude API call for prompt generation can exceed 10 seconds. The API route times out, the response is lost, the UI shows an error, and the pipeline state is inconsistent (work was done but never recorded).

**Why it happens:**
Developers build the web pipeline by wrapping CLI logic in API routes. It works locally (no timeout), fails on Vercel. The Vercel Pro plan's 60-second default helps but is still too short for Claude calls that generate full agent specs (often 30-90 seconds).

**How to avoid:**
Never run AI pipeline steps in Next.js API routes directly. All pipeline work must go through Inngest:

1. API route receives request -> sends Inngest event -> returns 202 Accepted immediately (under 1 second)
2. Inngest function runs the pipeline step (Inngest has its own 2-hour step timeout, independent of Vercel)
3. Inngest step completes -> writes result to Supabase -> sends Broadcast for UI update
4. Break each pipeline phase (architect, researcher, spec generator, deployer, tester, iterator) into separate Inngest steps. Each step must complete within Inngest's per-step timeout.
5. For particularly long Claude API calls, use streaming where possible to keep the connection alive within a step.

**Warning signs:**
- "504 Gateway Timeout" errors in production but not locally
- Pipeline works for simple 1-agent swarms but fails for complex 5-agent swarms (longer generation time)
- Intermittent failures that correlate with response length (longer specs = more tokens = longer generation)

**Phase to address:**
Self-Service Pipeline phase -- pipeline orchestration architecture must use Inngest from the start, not API routes

---

### Pitfall 5: Pipeline State Machine Not Designed -- Partial Failures Leave Orphaned State

**What goes wrong:**
The CLI pipeline is linear: architect -> researcher -> spec generator -> deployer -> tester -> iterator. If it fails, the user re-runs from the CLI. In a web app, the pipeline runs in the background (Inngest). Failures need recovery: retry from failed step, not from scratch. Without an explicit state machine, a failure mid-pipeline leaves the run in a state that is neither "failed" nor "succeeded." The dashboard shows "In Progress" forever. The user cannot retry or cancel. Deployed agents exist on Orq.ai but the pipeline never recorded their IDs.

The harder version: the deployer partially succeeds -- deploys 3 of 5 agents before failing on agent 4. The pipeline has no record of which agents were deployed. Re-running deploys duplicates of agents 1-3. Orq.ai now has 8 agents instead of 5.

**Why it happens:**
CLI tools can be re-run idempotently because the user manages state (they know what happened). Web pipelines run asynchronously -- the system must manage state. Most teams treat state management as a "later" concern and focus on the happy path first.

**How to avoid:**
Design the pipeline state machine before writing any pipeline code:

- Define explicit states: `queued`, `running:{phase}`, `awaiting_approval`, `failed:{phase}`, `completed`, `cancelled`
- Each Inngest step writes its state transition to the DB before doing work and after completing work
- Record per-agent deployment status: `{ agent_key: "invoice-processor", deployed: true, orqai_id: "..." }`
- Implement idempotency: deployer checks if agent already exists on Orq.ai (by key) before creating a new one
- Implement cancellation: `step.waitForEvent("pipeline/cancel")` checked between each major phase
- Failed runs show a "Retry from [failed step]" button, not just "Start Over"

**Warning signs:**
- Runs stuck in "In Progress" state with no recent log entries
- Duplicate agents appearing on Orq.ai after pipeline retries
- Users asking "what happened to my run?" with no way to investigate

**Phase to address:**
Self-Service Pipeline phase -- state machine design must precede pipeline implementation

---

### Pitfall 6: CLI-to-Web Translation Loses the HITL Approval Context

**What goes wrong:**
The existing CLI pipeline's HITL approval (V2.0/V2.1) works because the developer sees the full terminal context: the agent spec, the proposed prompt changes, the diff. They approve with full understanding. In the web app, the approval flow sends a notification ("Agent X needs approval"), the user opens the approval page, but sees only a summary or raw diff without context. Non-technical users cannot evaluate whether a prompt change is good. They either rubber-stamp everything (defeating HITL) or reject everything they do not understand (blocking the pipeline).

**Why it happens:**
Engineers build the approval UI as a simple approve/reject form because the data model is straightforward. The hard part is not the button -- it is presenting the approval context in a way non-technical users can evaluate. The CLI's full-context view is taken for granted.

**How to avoid:**
- Design the approval view as a first-class feature, not an afterthought. Each approval type needs its own context display:
  - Architecture approval: show the proposed agent graph with roles and data flow
  - Prompt change approval: show before/after with highlighted changes AND a plain-English summary of what changed and why
  - Deployment approval: show which agents will be created/updated on Orq.ai and what they do
- Add an AI-generated summary for each approval: "This change improves the agent's handling of edge cases in invoice parsing by adding explicit instructions for multi-currency formats"
- Include a "What happens if I reject?" explanation so users understand consequences
- Track approval patterns: if a user approves everything within 2 seconds, surface a warning ("Are you sure? This changes how the agent handles X")

**Warning signs:**
- Approval response times under 5 seconds consistently (rubber-stamping)
- Non-technical users asking developers "should I approve this?"
- Rejection rates near 0% or near 100% (neither is healthy)

**Phase to address:**
HITL Approval Flow phase -- approval context design must happen alongside the approval mechanism, not after

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using Postgres Changes instead of Broadcast for all real-time | Less code, automatic from DB writes | Single-thread bottleneck, RLS overhead, delayed updates | Never -- switch to Broadcast for pipeline updates from day one |
| Storing pipeline state only in Inngest (not DB) | No DB schema needed for runs | Cannot query run history, no dashboard data, no retry from failed step | Never -- always dual-write to DB |
| Polling API routes instead of WebSocket subscriptions | Simpler implementation, works everywhere | Unnecessary server load, delayed updates, poor UX | Only for initial prototype, replace within same phase |
| Embedding pipeline logic in API routes | Quick to build, familiar pattern | Cannot retry individual steps, no observability, timeout issues | Never -- use Inngest from the start |
| Single Inngest function for entire pipeline | Simpler orchestration, one function to debug | Cannot retry individual steps, state blob grows, hits 32MB state limit | Only for MVP if pipeline has fewer than 5 steps |
| Hard-coding Moyne Roberts tenant ID in client code | Quick auth setup | Exposed in browser JS, harder to change tenants later | Never -- use environment variables server-side |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase Auth + Azure AD | Using `common` tenant endpoint, allowing any Microsoft account | Set tenant-specific URL: `https://login.microsoftonline.com/{tenant-id}` |
| Supabase Auth + Azure AD | Not requesting `offline_access` scope | Include `offline_access` in scopes to get `provider_refresh_token` for long sessions |
| Supabase Auth + Azure AD | Relying on Supabase session only, not checking tenant | Add server-side middleware to verify `user.user_metadata.iss` matches expected tenant |
| Supabase Auth + Next.js | Using client-side auth check only (checking in browser) | Use Next.js middleware + server-side session validation; client can be spoofed |
| Supabase Realtime | Subscribing to Postgres Changes with RLS on high-frequency tables | Use Broadcast for pipeline updates; Postgres Changes only for low-frequency, user-scoped data |
| Supabase Realtime | Not handling reconnection after browser sleep/background tab | Implement reconnection logic: on visibility change, check subscription status, re-subscribe if dropped |
| Inngest + Vercel | Not configuring `maxDuration` in `vercel.json` | Set `maxDuration: 300` (5 min) for the Inngest serve endpoint; individual steps still managed by Inngest |
| Inngest + Supabase | Inngest function cannot access Supabase with user's auth context | Pass user ID in Inngest event payload; use Supabase service role key in Inngest functions with manual RLS bypass for that user |
| Inngest `waitForEvent` | Sending approval event before wait is registered (race condition) | Emit `approval.requested` event first; UI waits for this event before showing Approve button |
| Inngest `waitForEvent` | Treating `null` return (timeout) as approval | Always handle `null` as explicit timeout; show "Approval expired" in UI |
| Orq.ai API + Inngest | Calling Orq.ai API directly from Next.js API route | Route through Inngest step; Orq.ai calls can take 30-300 seconds, exceeding Vercel timeouts |
| React Flow | Storing node/edge state in React useState | Use Zustand store (React Flow's recommended approach) to avoid re-render cascades |
| React Flow | Rendering all nodes with complex styles at once | Memoize custom node components with React.memo; simplify styles for nodes outside viewport |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Postgres Changes with RLS for dashboard | Updates lag 5-10 seconds behind actual state | Use Broadcast for pipeline progress, Postgres Changes only for run list | More than 5 concurrent users watching dashboards |
| Full pipeline log streaming to client | Browser tab memory grows, page becomes unresponsive | Send only last N log lines via Broadcast; full log available on-demand from DB | Pipeline with more than 500 log entries (typical for 5-agent swarm) |
| React Flow re-renders on every pipeline status update | Node graph stutters or freezes during pipeline execution | Update only the specific node's `data` prop, not the entire nodes array; use `onNodesChange` selectively | Graphs with more than 20 nodes (unlikely for V3.0 scope but possible) |
| Inngest function state growing with accumulated step outputs | Function slows, eventually hits 32MB state limit | Return only essential data from each step; store full results in Supabase | Pipeline with iteration loops (each iteration adds state) |
| Supabase Realtime connections not cleaned up on page navigation | Connection pool exhaustion, "max connections" errors | Unsubscribe from channels in React useEffect cleanup; use a single channel manager | After 200 cumulative page navigations without cleanup (free plan limit: 200 connections) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Azure tenant URL set to `common` | Any Microsoft user worldwide can access the system and trigger pipeline runs | Set tenant-specific URL; verify in middleware; test with external Microsoft account |
| API keys (Claude, Orq.ai) in client-side environment variables | Keys exposed in browser, anyone can use them | All API keys in server-side env vars only (no `NEXT_PUBLIC_` prefix); all API calls through Inngest or API routes |
| Inngest event payload containing API keys or secrets | Inngest logs show event payloads; secrets visible in dashboard | Never include secrets in events; use env vars in Inngest functions; pass only IDs and references |
| Supabase service role key used in client-side code | Full database access without RLS | Service role key only in server-side code (Inngest functions, API routes); client uses anon key with RLS |
| No authorization check on pipeline actions (start, cancel, approve) | Any authenticated user can approve or cancel another user's pipeline run | Add ownership check: `pipeline_runs.user_id === session.user.id` on all mutation endpoints |
| HITL approval endpoint without CSRF protection | Approval can be triggered by cross-site request | Use Supabase auth tokens (not cookies) for API auth; or add CSRF tokens to approval forms |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No progress indication during long AI generation steps (30-90 sec) | User thinks the app is frozen, refreshes page, starts duplicate run | Show step-level progress with estimated time; "Claude is generating agent specs... (usually takes 30-60 seconds)" |
| Raw error messages from Claude/Orq.ai API shown to user | Non-technical user sees "Error: 429 Too Many Requests" and has no idea what to do | Map API errors to user-friendly messages with suggested actions: "The AI service is temporarily busy. Your pipeline will automatically retry in 30 seconds." |
| Approval notification via email only | User misses email, pipeline waits for days, timeout expires | In-app notification badge + email; dashboard shows pending approvals prominently; consider browser push notifications |
| Node graph shows technical identifiers (agent keys) | Non-technical user sees `invoice-matcher-agent` instead of understanding what it does | Show agent role/description as primary label; key as secondary/tooltip; color-code by function (research, processing, validation) |
| Pipeline failure shows "Step 4 failed" | User has no context about what step 4 is or what to do | Show human-readable phase names: "Testing failed: The coherence evaluator scored below threshold. You can adjust the agent's instructions and retry." |
| "Start Pipeline" with no preview of what will happen | User submits use case, pipeline runs for 10 minutes, result is not what they expected | Show a preview step after architecture: "We will create 3 agents: [descriptions]. Proceed?" before starting deployment |

## "Looks Done But Isn't" Checklist

- [ ] **Auth:** Login works -- but test with a non-Moyne-Roberts Microsoft account. If they can log in, tenant restriction is missing.
- [ ] **Auth:** Session persists -- but check what happens after 1 hour. Azure tokens expire; Supabase must refresh. Test idle session survival.
- [ ] **Real-time updates:** Dashboard updates during pipeline run -- but close laptop lid for 2 minutes and reopen. Do updates resume, or is the connection dead?
- [ ] **Real-time updates:** Progress shows in one browser tab -- but open a second tab. Both should show updates. If they do not, channel subscription is tab-specific.
- [ ] **HITL approval:** Approve button works -- but what happens if two users both try to approve the same item? Race condition on approval state.
- [ ] **HITL approval:** Approval email sent -- but check if the link in the email works when the user is not already logged in. Does it redirect to login then back to approval?
- [ ] **Node graph:** Graph renders -- but resize the browser window. Does the layout adapt? Test on a 13" laptop screen, not just a 27" monitor.
- [ ] **Node graph:** Execution overlay updates -- but does it update correctly when the pipeline retries a failed step? The node should flash red then return to "running."
- [ ] **Pipeline state:** Run completes successfully -- but check the database. Are all per-agent deployment IDs recorded? Can the run be replayed from the dashboard?
- [ ] **Pipeline retry:** "Retry from failed step" works -- but does it skip already-deployed agents? Check Orq.ai for duplicates after retry.
- [ ] **Inngest:** Pipeline function runs -- but check Inngest dashboard for step output sizes. If any step returns more than 1MB, it will fail at scale.
- [ ] **Backward compat:** Web pipeline works -- but does `/orq-agent` CLI skill still work? Shared pipeline logic must not break the CLI path.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Postgres Changes bottleneck (Pitfall 1) | MEDIUM | Refactor subscriptions to Broadcast; add Broadcast emit to Inngest steps; update all dashboard components |
| waitForEvent race condition (Pitfall 2) | LOW | Add approval-requested event gate; add DB fallback check; update UI to wait for gate event |
| Azure tenant misconfiguration (Pitfall 3) | LOW | Update Supabase Auth settings with tenant URL; add middleware check; revoke any unauthorized sessions |
| Vercel timeout (Pitfall 4) | HIGH | Must restructure all pipeline logic from API routes into Inngest functions; cannot be patched incrementally |
| No state machine (Pitfall 5) | HIGH | Requires DB schema for run states, Inngest function refactoring for state transitions, dashboard updates; fundamental architecture change |
| Poor approval context (Pitfall 6) | MEDIUM | Design and build context views for each approval type; add AI summary generation; UI-only changes but significant design work |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Realtime bottleneck (1) | Pipeline Dashboard | Load test with 5 concurrent dashboard viewers during pipeline run; verify Broadcast, not Postgres Changes, used for updates |
| waitForEvent race (2) | HITL Approval Flow | Automated test: fire approval event within 100ms of waitForEvent registration; verify it is received |
| Azure tenant auth (3) | Foundation & Auth | Test login with personal Microsoft account; must be rejected. Test with Moyne Roberts account; must succeed. |
| Vercel timeout (4) | Self-Service Pipeline | No pipeline step runs in an API route; all pipeline logic in Inngest functions; verify with Vercel function logs |
| Pipeline state machine (5) | Self-Service Pipeline | Simulate failure at each pipeline phase; verify dashboard shows correct state; verify "retry from failed step" works |
| Approval context (6) | HITL Approval Flow | User test with non-technical colleague: can they understand and evaluate an approval request without developer help? |
| React Flow re-renders (Integration) | Node Graph | Profile React renders during pipeline execution; verify only updating nodes re-render, not the entire graph |
| Inngest state growth (Performance) | Self-Service Pipeline | Run pipeline for 5-agent swarm with 3 iteration loops; check Inngest function state size stays under 4MB |
| Connection cleanup (Performance) | Pipeline Dashboard | Navigate between pages 50 times; verify Supabase Realtime connection count stays stable via Realtime reports |
| API keys exposure (Security) | Foundation & Auth | Audit all `NEXT_PUBLIC_` env vars; none should contain API keys. Check browser network tab for leaked credentials. |
| Pipeline ownership (Security) | Foundation & Auth | Attempt to approve/cancel another user's pipeline run; must be rejected with 403 |

## Sources

- [Supabase Realtime Benchmarks](https://supabase.com/docs/guides/realtime/benchmarks) -- single-thread processing for Postgres Changes, RLS overhead per subscriber (HIGH confidence, official docs)
- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits) -- 200 peak connections on free plan, 1MB message limit (HIGH confidence, official docs)
- [Supabase Broadcast documentation](https://supabase.com/docs/guides/realtime/broadcast) -- recommended over Postgres Changes for scale (HIGH confidence, official docs)
- [Supabase Auth Azure login](https://supabase.com/docs/guides/auth/social-login/auth-azure) -- tenant URL configuration, scope requirements (HIGH confidence, official docs)
- [Supabase Auth PKCE Flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow) -- code validity 5 minutes, one-time exchange (HIGH confidence, official docs)
- [Azure AD single-tenant discussion](https://github.com/orgs/supabase/discussions/1071) -- confirms single-tenant requires tenant URL override (MEDIUM confidence, community)
- [Inngest waitForEvent docs](https://www.inngest.com/docs/reference/functions/step-wait-for-event) -- timeout returns null, maximum sleep 7 days on free plan (HIGH confidence, official docs)
- [Inngest waitForEvent race condition](https://github.com/inngest/inngest/issues/1433) -- events in quick succession not resolved (MEDIUM confidence, confirmed bug report)
- [Inngest stuck function after waitForEvent](https://github.com/inngest/inngest/issues/1290) -- function stuck when step.run fails after waitForEvent (MEDIUM confidence, confirmed bug report)
- [Inngest usage limits](https://www.inngest.com/docs/usage-limits/inngest) -- 2-hour max step duration, 32MB state limit, 1000 steps max, 4MB step output (HIGH confidence, official docs)
- [Inngest long-running on Vercel](https://www.inngest.com/blog/vercel-long-running-background-functions) -- break into steps within timeout, each step is separate HTTP request (HIGH confidence, official blog)
- [Vercel serverless timeout](https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out) -- 10s Hobby, 60s Pro default, 5 min max (HIGH confidence, official docs)
- [React Flow Performance guide](https://reactflow.dev/learn/advanced-use/performance) -- avoid unnecessary re-renders, memoize custom nodes, use Zustand (HIGH confidence, official docs)
- [React Flow large graph discussion](https://github.com/xyflow/xyflow/discussions/4975) -- state management pitfalls, CSS performance impact (MEDIUM confidence, community)
- [Supabase Realtime troubleshooting](https://supabase.com/docs/guides/realtime/troubleshooting) -- TIMED_OUT errors, reconnection guidance (HIGH confidence, official docs)
- [AI SDK Human-in-the-Loop cookbook](https://ai-sdk.dev/cookbook/next/human-in-the-loop) -- needsApproval pattern for tool execution gates (MEDIUM confidence, official cookbook)

---
*Pitfalls research for: V3.0 Web UI & Dashboard (Orq Agent Designer)*
*Researched: 2026-03-13*
