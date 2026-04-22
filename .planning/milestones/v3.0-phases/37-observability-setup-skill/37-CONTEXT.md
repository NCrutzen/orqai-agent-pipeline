# Phase 37: Observability Setup Skill - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship a single new skill `orq-agent/commands/observability.md` (user-invoked as `/orq-agent:observability`) that walks a user through instrumenting their LLM application for Orq.ai trace capture. The skill must address all 7 OBSV requirements:
- OBSV-01: Framework detection (OpenAI, LangChain, CrewAI, Vercel AI, etc.)
- OBSV-02: Mode recommendation (AI Router / OTEL-only / both)
- OBSV-03: Framework-specific integration code with correct import order
- OBSV-04: Baseline trace verification (traces appear, model/tokens captured, span hierarchy, no PII)
- OBSV-05: Trace enrichment (session_id, user_id, feature tags, customer_id)
- OBSV-06: `@traced` decorator placement for custom span types (agent/llm/tool/retrieval/embedding/function)
- OBSV-07: Per-tenant `identity` attribution + filter via `/orq-agent:traces --identity`

Phase 37 also **replaces the `--identity` TODO stub in `orq-agent/commands/traces.md`** (added in Phase 36 as a forward-reference) with a working pass-through that filters traces by `identity` attribute.

</domain>

<decisions>
## Implementation Decisions

### File structure
- Primary: `orq-agent/commands/observability.md` — the user-invoked skill.
- Optional subagent: If the framework detection + code emission step grows large, extract a subagent at `orq-agent/agents/observability-setup.md`. Defer to Claude's Discretion — skill-only is preferred for Phase 37 if feasible.
- Framework-specific integration snippets live in `orq-agent/commands/observability/resources/` (per-skill resources per Phase 34 SKST-02 policy for single-consumer docs). Expected files: `openai-sdk.md`, `langchain.md`, `crewai.md`, `vercel-ai.md`, `generic-otel.md`.

### Detection strategy
- Grep for provider-specific imports in user codebase (`from openai import`, `import anthropic`, `from langchain`, `from crewai`, `import { createOpenAI } from '@ai-sdk/openai'`, etc.).
- Check for existing instrumentation (`from traceloop`, `OpenTelemetry SDK`, existing `@orqai` decorators) to avoid double-instrumenting.
- Report findings as a table before recommending mode.

### Mode recommendation (OBSV-02)
- Default: **AI Router** if the user already uses one of Orq.ai's supported SDKs (OpenAI, Anthropic, Vercel AI) — zero code change required.
- **OTEL-only** if the user has heavy existing OTEL infrastructure (Grafana/Tempo/Datadog) and wants unified observability.
- **Both** when the user needs AI Router cost/routing features AND OTEL aggregation. Rare; only recommend after explicit ask.

### Baseline verification (OBSV-04)
- Skill emits a short test script the user runs (`npx tsx verify-orq-traces.ts` or `python verify_orq_traces.py`) that performs: (1) invoke their LLM once; (2) query `/v2/traces` via MCP to confirm trace appeared; (3) check model + tokens captured; (4) scan trace body for common PII patterns (emails, phone numbers) and warn.
- Skill does NOT upload test scripts to production — generates locally, user runs, pastes result back.

### Enrichment (OBSV-05, OBSV-06)
- Walk the user through adding `session_id` / `user_id` / `customer_id` via framework-specific helpers.
- Generate `@traced` decorator examples per span type: `agent`, `llm`, `tool`, `retrieval`, `embedding`, `function` (the 6 canonical types).

### Identity attribution (OBSV-07)
- Document how to attach `identity` attributes (per-customer / per-tenant).
- Wire `/orq-agent:traces --identity <id>` to pass `identity` as a filter param to the MCP `list_traces` tool (or REST equivalent). This requires editing `orq-agent/commands/traces.md` to replace its Phase 36 TODO stub.

### Tier
- **core** tier (per ROADMAP). Guidance-only for most cases; no required Orq.ai API writes.

### Claude's Discretion
- Whether to split into skill + subagent (single file preferred if legibility allows; subagent required if file exceeds ~400 lines).
- Exact framework code-snippet wording for each `resources/<framework>.md` file — must be syntactically correct and runnable.
- How to present detection results (table vs prose).
- PII scan regex list — start with email, phone (US), SSN, credit-card-like 16-digit; user can customize.
- Fallback behavior when framework can't be auto-detected — offer a short multiple-choice via AskUserQuestion.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `orq-agent/commands/systems.md` — list/mutate pattern template.
- `orq-agent/commands/help.md` — minimal command template.
- Phase 36 established `mcp__orqai-mcp__*` tool usage and REST fallback convention.
- `orq-agent/commands/traces.md` (Phase 36) — has `--identity` stub with `TODO(OBSV-07)`. Phase 37 removes the TODO and wires filtering.

### Established Patterns
- Slash command skill files follow the 9-SKST-section contract (Phase 34).
- Banner: `ORQ ► OBSERVABILITY`.
- Frontmatter `allowed-tools:` includes `Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, WebFetch` at minimum (needs Grep for detection, Write for emitting code + test script).

### Integration Points
- SKILL.md directory listing adds `observability.md` + `observability/resources/*` rows.
- `help.md` pipeline-order list gets `/orq-agent:observability` inserted near onboarding (alongside `quickstart`).
- `traces.md` edit removes the `TODO(OBSV-07)` marker and documents the live `--identity` behavior.

</code_context>

<specifics>
## Specific Ideas

- Example `@traced` decorator block per span type (Python): 
  ```python
  from orq.decorators import traced
  
  @traced(span_type="agent")
  def my_agent(query: str) -> str: ...
  
  @traced(span_type="llm")
  def call_model(prompt: str) -> str: ...
  
  @traced(span_type="tool")
  def db_lookup(key: str) -> dict: ...
  ```
- Example identity attribution (TS):
  ```ts
  import { setIdentity } from '@orq-ai/node';
  setIdentity({ customerId: 'acme-corp', tenantId: 'eu-1' });
  ```
- PII scan regex seed list:
  - Email: `[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}`
  - US phone: `\(?[2-9]\d{2}\)?[ .-]?\d{3}[ .-]?\d{4}`
  - SSN: `\d{3}-\d{2}-\d{4}`
  - Credit-card-like: `\b(?:\d[ -]*?){13,16}\b`

</specifics>

<deferred>
## Deferred Ideas

- Automated code-fix (auto-inject decorators) — too invasive; Phase 37 emits code for user to paste. Auto-fix could be a future phase.
- Live PII scrubbing at trace-capture time — that's a platform feature, not this skill. Phase 37 only warns.
- Dashboard generation from trace data — out of scope; `/orq-agent:analytics` (Phase 36) handles reporting.

</deferred>
