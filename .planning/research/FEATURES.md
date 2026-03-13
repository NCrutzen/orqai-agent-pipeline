# Feature Landscape

**Domain:** Web-based AI Agent Pipeline UI with Real-time Dashboard, Node Graph Visualization, and HITL Approval Workflows (V3.0)
**Researched:** 2026-03-13
**Confidence:** MEDIUM -- React Flow, Supabase Realtime, and Next.js patterns verified via official docs and multiple sources; HITL approval UI patterns confirmed across LangGraph, Orkes, and StackAI references; non-technical UX patterns confirmed via Smashing Magazine, Microsoft Design, and UX Magazine; exact Supabase Realtime channel limits and React Flow Pro pricing not verified

---

## Context: What This Research Covers

This research answers: **what features does a web UI need so that non-technical Moyne Roberts colleagues can run the existing agent design pipeline from a browser -- with real-time visibility, node graph visualization, and in-app HITL approvals?**

The pipeline already exists as CLI-based markdown agents (V2.0/V2.1). V3.0 wraps this pipeline in a browser experience. The core pipeline logic does not change -- what changes is the interface, visibility, and approval mechanism.

Key constraints from PROJECT.md:
- 5-15 users, all Moyne Roberts employees
- M365 SSO (Azure AD) -- no separate accounts
- Next.js on Vercel, Supabase for auth/DB/Realtime
- Pipeline logic shared between CLI skill and web app from same GitHub repo
- Non-technical users must complete full pipeline without developer help

---

## Table Stakes

Features users expect. Missing any of these = product feels broken or unusable for non-technical colleagues.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| M365 SSO login | Colleagues expect to sign in with their work account. Separate credentials = immediate friction. | Medium | Supabase Auth supports Azure AD as SAML/OIDC provider. Config-level, not code-level. |
| Use case input form | The entire value prop starts here. A text area where users describe what they want agents to do. | Low | Single textarea with optional structured fields. Wizard pattern not needed for V1 -- input is freeform text. |
| Pipeline run trigger (one button) | "Design My Agents" button. Non-technical users cannot be expected to run CLI commands. | Low | POST to API route that spawns pipeline. Must feel instant (optimistic UI). |
| Run list / history | Users need to see their past runs and current run status. Without this, they cannot find their work. | Medium | Supabase table `pipeline_runs` with user_id, status, timestamps, results. Standard CRUD. |
| Real-time progress indicators | Pipeline takes minutes. Without live feedback, users assume it is broken and refresh/abandon. | High | Supabase Realtime postgres_changes subscriptions on pipeline step updates. Each step writes status to DB; frontend subscribes. |
| Log stream / activity feed | Users need to see what the pipeline is doing right now. "Researching domain...", "Generating agent specs...", etc. | Medium | Append-only log entries pushed via Supabase Realtime. Human-readable summaries, not raw LLM output. |
| Pipeline error handling with clear messages | When something fails, users need plain-English explanation and a retry button -- not stack traces. | Medium | Error boundary UI with "What happened" + "Try again" pattern. Graceful degradation per Smashing Magazine agentic UX patterns. |
| HITL approval for prompt changes | Already exists in CLI (V2.1). Users must approve/reject proposed prompt modifications before they are applied. This is the trust mechanism. | High | Approval queue with diff view, approve/reject buttons, optional comment. Blocks pipeline until resolved. |
| Output download / copy | Users need the generated agent specs in a usable format. Copy-paste ready or downloadable ZIP. | Low | Already generated as markdown files. Serve from pipeline output directory. |
| Responsive layout (desktop-first) | Office workers use laptops/desktops. Must work on standard screens. Mobile is not a priority for 5-15 internal users. | Low | Tailwind CSS responsive utilities. Desktop-first, tablet-acceptable, phone-ignore. |

---

## Differentiators

Features that make this feel like a polished internal tool rather than a raw pipeline wrapper. Not expected, but create delight and trust.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Interactive node graph of agent swarm | Visual representation of agent relationships, data flow, and tool connections. Non-technical users "get it" immediately when they see a graph vs reading spec files. | High | React Flow (xyflow) -- the dominant library for node-based UIs in React. Supports custom node types, edge animations, and status overlays. |
| Execution overlay on node graph | Nodes light up as pipeline progresses. Running = animated border, complete = green, failed = red, waiting = gray. Shows pipeline progress spatially, not just temporally. | Medium | React Flow NodeStatusIndicator component with "overlay" loadingVariant. Subscribe to pipeline step status via Supabase Realtime and update node states. |
| Agent performance scores on graph | After pipeline completes, overlay experiment scores on each agent node. Users see which agents are strong/weak at a glance. | Medium | Badge/chip on each node showing median score and pass/fail status from test-results.json. |
| HITL approval queue with email notifications | When pipeline needs approval, user gets an email notification. They click through to the approval screen. Pipeline waits. | Medium | Supabase Edge Function sends email via SendGrid/Resend when approval is needed. Deep link to approval page. |
| Approval history with audit trail | Every approve/reject decision is logged with timestamp, user, and optional comment. Accountability for production changes. | Low | Append-only `approvals` table in Supabase. Standard audit pattern. |
| Pipeline comparison (before/after iteration) | Side-by-side view of agent scores before and after prompt iteration. Shows improvement trajectory. | Medium | Already computed in results-analyzer. Surface the delta table in the UI. |
| Auto-scroll log with step anchors | Log stream auto-scrolls but users can click step names to jump to that section. Keeps context without losing live updates. | Low | Standard intersection observer pattern with anchor links. |
| Keyboard shortcuts for approvals | Power users (the 2-3 people who use it daily) get `A` for approve, `R` for reject, `N` for next. | Low | Event listener on approval page. Low effort, high polish signal. |

---

## Anti-Features

Features to explicitly NOT build. These waste time, add complexity, or conflict with the product's actual use.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Drag-and-drop pipeline builder | Users are not designing pipelines -- the pipeline is fixed. They describe a use case and the pipeline runs. A visual pipeline editor implies customization that does not exist and confuses non-technical users. | Fixed pipeline visualization that shows progress, not a builder. |
| Chat-based interface | Chat UIs imply open-ended conversation. This is a structured pipeline with a clear input (use case description) and clear output (deployed agents). Chat creates false expectations about what users can ask. | Form input with structured output display. Chat can exist as a secondary help/support channel, not as the primary interface. |
| Real-time agent monitoring / observability | Orq.ai handles agent monitoring natively. Rebuilding it duplicates effort and creates a stale secondary view. | Link to Orq.ai dashboard for live agent monitoring. Show test-time metrics only. |
| User management / RBAC beyond SSO | 5-15 users, all colleagues, all equal. Building role-based access control is premature optimization for an internal tool this small. | All authenticated users have equal access. If needed later, add a simple "admin" boolean. |
| Multi-tenant workspace separation | Single company, single team. No need for workspace/org boundaries. | Single workspace. All runs visible to all authenticated users. |
| Custom evaluator configuration UI | Evaluators are chosen by the pipeline based on agent role. Users do not need to configure them -- they need to see the results. | Show evaluator names and scores in results. Pipeline selects evaluators automatically. |
| Mobile-optimized interface | 5-15 internal users on office desktops/laptops. Mobile optimization is wasted effort for this audience. | Desktop-first responsive. Gracefully degrade on tablet. Ignore phone. |
| Offline support / PWA | Internal tool, always-connected office environment. | Standard web app. Require network connection. |
| Generative UI (AI-generated interface) | Cutting-edge pattern that adds unpredictability. Non-technical users need consistency -- the same UI every time they visit. | Fixed, predictable UI layout. AI powers the pipeline, not the interface. |

---

## Feature Dependencies

```
M365 SSO ──→ All features (auth gate)
                │
Use case input form ──→ Pipeline trigger ──→ Pipeline run record
                                                    │
                                                    ├──→ Real-time progress (Supabase Realtime subscription)
                                                    │         │
                                                    │         ├──→ Log stream / activity feed
                                                    │         └──→ Node graph execution overlay
                                                    │
                                                    ├──→ HITL approval queue (pipeline pauses here)
                                                    │         │
                                                    │         ├──→ Email notification
                                                    │         └──→ Approval history / audit trail
                                                    │
                                                    └──→ Results display
                                                              │
                                                              ├──→ Agent scores on graph nodes
                                                              ├──→ Before/after comparison
                                                              └──→ Output download / copy
```

**Key dependency:** Real-time progress and HITL approval both depend on the same mechanism -- Supabase Realtime subscriptions on pipeline state changes. Build the Realtime infrastructure once; both features consume it.

**Node graph depends on pipeline metadata:** The graph needs to know agent names, relationships, and tool connections. This metadata comes from the architect/spec-gen pipeline output. The graph is generated from pipeline output, not hand-drawn.

---

## Feature Groupings by Implementation Phase

### Group 1: Foundation (must ship first)
- M365 SSO login
- Use case input form
- Pipeline trigger
- Run list / history
- Basic pipeline status (polling, not Realtime -- simpler to build first)

### Group 2: Real-time Experience
- Supabase Realtime subscriptions
- Live progress indicators
- Log stream / activity feed
- Error handling with retry

### Group 3: Node Graph Visualization
- React Flow integration
- Agent swarm graph rendering from spec output
- Execution overlay (status per node)
- Agent scores on nodes after completion

### Group 4: HITL Approval Flow
- Approval queue page
- Diff view for proposed prompt changes
- Approve/reject with optional comment
- Pipeline pause/resume on approval
- Email notifications
- Approval history / audit trail

### Group 5: Polish
- Keyboard shortcuts
- Before/after iteration comparison
- Auto-scroll log with anchors
- Output download / ZIP export

---

## MVP Recommendation

**Prioritize:**
1. M365 SSO + use case input + pipeline trigger (without this, nothing works)
2. Run list with basic status polling (users can see their runs exist)
3. Real-time progress via Supabase Realtime (transforms "is it working?" anxiety into confidence)
4. HITL approval flow (already required by V2.1 pipeline -- web UI must support it or pipeline cannot complete)
5. Node graph with execution overlay (the visual "wow" that makes this feel like a real product)

**Defer:**
- Email notifications: Nice but not needed for 5-15 users who are likely watching the browser tab. Add in a polish phase.
- Before/after comparison: Data already exists from results-analyzer. Surface it after core flow works.
- Keyboard shortcuts: Last-mile polish. Add after core approval flow is validated.
- Output download as ZIP: Agents deploy to Orq.ai automatically. Download is a fallback, not primary output.

---

## UX Patterns for Non-Technical Users

### Wizard vs. Single Page

Do NOT use a multi-step wizard. The input is a single text field (use case description). A wizard implies multiple complex steps that the user must navigate. Instead: single page with a prominent textarea, a "Design My Agents" button, and the dashboard below/beside it showing progress.

Confidence: HIGH -- Wizard pattern is for multi-field forms with dependent steps. A freeform text input with optional fields does not benefit from wizard overhead. Validated by Eleken wizard UI pattern guidance.

### Transparency Pattern (Visible Pipeline)

Show what the AI is doing at each step in plain English. "Analyzing your use case...", "Researching tools for invoice processing...", "Designing 3 agents for your workflow...". This is the single most important UX pattern for AI tools used by non-technical people.

Confidence: HIGH -- Confirmed by Microsoft Design agentic UX guidelines, Smashing Magazine agentic AI patterns (Feb 2026), and UX Magazine patterns for human-agent interaction.

### Approval UI Pattern

Present proposed changes as a side-by-side diff with "Before" and "After" panels. Include a plain-English explanation of what changed and why. Approve and Reject buttons must be equally prominent (no dark pattern pushing toward Approve). Optional comment field for reject reasoning.

Confidence: HIGH -- Confirmed by LangGraph HITL patterns, Permit.io HITL best practices, and Orkes human-in-the-loop implementation guides. All recommend explicit approve/reject with context.

### Progress Indication Pattern

Use a vertical timeline/stepper for pipeline steps, not a horizontal progress bar. Horizontal bars imply percentage complete, which is misleading for multi-step pipelines where steps have variable duration. A vertical timeline shows completed, current, and upcoming steps with clear state indicators.

Confidence: MEDIUM -- Based on dashboard UX best practices. Horizontal progress bars mislead when steps are non-uniform in duration.

---

## Node Graph Specifics

### Library Choice: React Flow (xyflow)

React Flow is the clear choice. It has:
- 25k+ GitHub stars, actively maintained
- Built-in NodeStatusIndicator with `overlay` and `border` loading variants
- Custom node types (for different agent roles)
- Animated edges (for data flow during execution)
- Minimap, controls, background components out of the box
- React Flow UI component library for polished defaults
- Next.js / SSR support in v12+

Alternatives considered and rejected:
- **Reagraph (WebGL):** Overkill for 3-15 node graphs. WebGL adds complexity without benefit at this scale.
- **D3.js:** Too low-level. React Flow provides the abstractions needed without building graph layout from scratch.
- **Mermaid:** Static rendering only. No interactivity, no execution overlay.

### Node Types Needed

| Node Type | Represents | Visual Treatment |
|-----------|-----------|-----------------|
| Input Node | Use case description entry point | Rounded rectangle, blue accent |
| Agent Node | Individual agent (architect, researcher, spec-gen, etc.) | Card with agent name, role badge, status indicator |
| Tool Node | External tools/APIs (Orq.ai, domain APIs) | Smaller hexagon or pill shape |
| Approval Node | HITL checkpoint | Diamond shape with approve/reject state |
| Output Node | Final deployed agent specs | Rounded rectangle, green accent |

### Edge Types

| Edge Type | Represents | Visual |
|-----------|-----------|--------|
| Data flow | Information passing between agents | Solid arrow, animated during active transfer |
| Tool connection | Agent-to-tool relationship | Dashed line |
| Approval gate | Pipeline pause point | Dotted line with lock icon |

---

## HITL Approval Flow Specifics

### Pipeline Pause Mechanism

The existing CLI pipeline uses HITL approval in iterate.md (prompt changes require human approval). In the web UI:

1. Pipeline writes an `approval_request` record to Supabase with:
   - `run_id`, `step`, `agent_key`, `proposed_changes` (diff), `reasoning`, `status: "pending"`
2. Supabase Realtime pushes this to the frontend
3. Frontend renders the approval UI with diff view
4. User clicks Approve or Reject
5. Frontend updates `approval_request.status` to "approved" or "rejected" (with optional comment)
6. Pipeline backend polls or subscribes to approval status; resumes on resolution

### Timeout Handling

Approvals should not block indefinitely. Options:
- 24-hour timeout with email reminder at 4 hours and 12 hours
- Auto-reject after timeout with notification
- For 5-15 internal users, a Slack/Teams notification is likely more effective than email

### Approval Scope

V3.0 approvals cover the same scope as V2.1 CLI approvals:
- Prompt section modifications during iteration
- New tool additions to agent specs
- NOT: initial spec generation (pipeline runs autonomously until iteration)

---

## Performance Scores Display

### What to Show Non-Technical Users

Do NOT show raw statistical output (median, variance, 95% CI). Instead:

| Metric | User-Facing Label | Visual |
|--------|-------------------|--------|
| Median score across 3 runs | "Performance Score" | Percentage with color (green >80%, yellow 60-80%, red <60%) |
| Pass/fail per evaluator | "Quality Checks" | Checkmark/X list with plain names ("Follows instructions", "Response quality", "Safety") |
| Category breakdown | "How it handles different scenarios" | Bar chart: happy path, edge cases, adversarial |
| Worst cases | "Areas for improvement" | Expandable list of 3 worst-performing test inputs |

### Iteration Improvement

When iteration completes, show:
- "Before: 72% -> After: 89%" with green arrow
- Per-evaluator delta
- Number of iterations taken

---

## Sources

- [React Flow Official Docs](https://reactflow.dev) -- Node-based UI library with NodeStatusIndicator, custom nodes, SSR support. HIGH confidence.
- [React Flow NodeStatusIndicator](https://reactflow.dev/ui/components/node-status-indicator) -- Overlay and border loading variants for execution status. HIGH confidence.
- [xyflow GitHub](https://github.com/xyflow/xyflow) -- 25k+ stars, actively maintained. HIGH confidence.
- [Supabase Realtime with Next.js](https://supabase.com/docs/guides/realtime/realtime-with-nextjs) -- postgres_changes subscriptions for live updates. HIGH confidence.
- [Supabase Getting Started with Realtime](https://supabase.com/docs/guides/realtime/getting_started) -- Channel subscriptions, INSERT/UPDATE/DELETE events. HIGH confidence.
- [Smashing Magazine: Designing for Agentic AI (Feb 2026)](https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/) -- Control, consent, accountability patterns. MEDIUM confidence.
- [Microsoft Design: UX Design for Agents](https://microsoft.design/articles/ux-design-for-agents/) -- Transparency and explainability patterns. MEDIUM confidence.
- [Permit.io: HITL Best Practices](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo) -- Approve/reject patterns, permission delegation. MEDIUM confidence.
- [Orkes: Human-in-the-Loop](https://orkes.io/blog/human-in-the-loop/) -- HITL workflow patterns with approval gates. MEDIUM confidence.
- [StackAI: 2026 Guide to Agentic Workflow Architectures](https://www.stackai.com/blog/the-2026-guide-to-agentic-workflow-architectures) -- Approval gates, audit logs as standard. MEDIUM confidence.
- [Eleken: Wizard UI Pattern](https://www.eleken.co/blog-posts/wizard-ui-pattern-explained) -- When to use and when not to use wizard flows. MEDIUM confidence.
- [LangGraph HITL Patterns](https://docs.langchain.com/oss/python/langchain/human-in-the-loop) -- Interrupt/resume pattern for approval workflows. MEDIUM confidence.
- [DEV Community: Supabase Realtime in Next.js 15](https://dev.to/lra8dev/building-real-time-magic-supabase-subscriptions-in-nextjs-15-2kmp) -- Implementation patterns for real-time subscriptions. LOW confidence (community source).

---

*Features research for: V3.0 Web UI & Dashboard*
*Researched: 2026-03-13*
