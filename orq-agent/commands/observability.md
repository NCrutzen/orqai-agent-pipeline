---
description: Instrument your LLM application for Orq.ai trace capture — detect framework, recommend integration mode, emit baseline verification, guide @traced decorators and identity attribution
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, WebFetch, mcp__orqai-mcp__list_traces
argument-hint: "[--mode <ai-router|otel|both>] [--framework <openai|anthropic|langchain|crewai|vercel-ai>]"
---

# Observability Setup

You are running the `/orq-agent:observability` command. This command walks users through instrumenting their LLM application for Orq.ai trace capture: framework detection, integration mode recommendation, baseline verification, trace enrichment, @traced decorator placement, and per-tenant identity attribution.

## Constraints

- **NEVER** auto-inject decorators into the user's codebase — emit code for user to paste.
- **NEVER** claim a framework is present without grep evidence — if ambiguous, `AskUserQuestion`.
- **NEVER** skip the baseline verification step — traces that don't appear silently are worse than no instrumentation.
- **NEVER** recommend "both" (AI Router + OTEL) without an explicit user ask — default AI Router when a supported SDK is detected.
- **ALWAYS** import instrumentors BEFORE SDK clients (OBSV-03 correctness requirement).
- **ALWAYS** run the PII scan (email/phone/SSN/credit-card seeds) against emitted trace bodies before declaring baseline green.
- **ALWAYS** recommend `/orq-agent:traces --identity <id>` as the retrieval surface for per-tenant filtering.

**Why these constraints:** Instrumentation-order bugs (importing the SDK client before the instrumentor monkey-patches it) are the #1 silent failure mode in LLM observability — the SDK runs, your code works, but no spans are emitted. Baseline verification is the Nyquist gate for Phase 38 downstream trace-failure analysis: if Phase 37 does not prove traces actually land with model+tokens+hierarchy+no-PII, then every downstream consumer (failure analysis, evaluator validation, cost aggregation) is built on sand.

## When to use

- New LLM project onboarding — no traces yet, need to go from zero to instrumented.
- Existing project without traces — app is running, but Orq.ai dashboard is empty.
- Adding per-tenant attribution to an already-traced project (wiring `customerId` / `tenantId` → `identity`).
- Verifying instrumentation after a framework upgrade (OpenAI SDK bump, LangChain minor, etc.).

## When NOT to use

- User wants aggregated analytics over existing traces → `/orq-agent:analytics`.
- User wants to inspect existing traces / search by status or identity → `/orq-agent:traces`.
- User wants to build evaluators on top of the tagged traces → Phase 38 `/orq-agent:analyze-failures` (forward link `TODO(TFAIL)`).

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- → `/orq-agent:traces` — once instrumented, this is how users inspect the resulting traces (especially with `--identity <id>` for per-tenant filtering).
- → Phase 38 trace-failure analysis (forward link `TODO(TFAIL)`) — consumes the tagged, enriched traces this skill produces.
- ← `/orq-agent:quickstart` — Step 6 (analyze traces) delegates here when instrumentation is missing.
- ← user invocation — new-project onboarding entry point.

## Done When

- [ ] Detection report rendered as a table (framework | version | existing instrumentation | confidence)
- [ ] Mode recommendation printed with written rationale tied to detection output
- [ ] Per-framework integration code emitted via delegation to `orq-agent/commands/observability/resources/<framework>.md`
- [ ] Baseline verification script spec emitted (TS or Python variant chosen from detection)
- [ ] `@traced` decorator examples printed for all 6 span types (agent/llm/tool/retrieval/embedding/function)
- [ ] Identity attribution example emitted with forward-reference to `/orq-agent:traces --identity <id>`

## Destructive Actions

- **None** — this command is read-only and emits code snippets; it never writes to the user's project without explicit paste by the user. The only file write performed is `verify-orq-traces.{ts,py}` in the user's cwd in Step 4, and only after the user has seen the proposed script.

## Step 1: Detect Framework (OBSV-01)

Emit the banner as the first line of runtime output:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► OBSERVABILITY                     setup flow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Use the `Grep` tool across the user's project (exclude `node_modules`, `.venv`, `dist`, `build`):

```bash
# Python frameworks
grep -rlE '^(from|import)[[:space:]]+(openai|anthropic|langchain|crewai|llama_index)' --include='*.py' .

# TypeScript / JavaScript
grep -rlE "from ['\"]@?(openai|@anthropic-ai/sdk|langchain|@ai-sdk|openai-agents)" --include='*.ts' --include='*.js' --include='*.tsx' .

# Existing instrumentation (avoid double-instrumenting)
grep -rlE '(from[[:space:]]+traceloop|opentelemetry|@orq-ai/node|orq\.decorators)' --include='*.py' --include='*.ts' --include='*.js' .
```

Render results as a table:

```
| Framework      | Language   | Files Found                | Existing Instrumentation |
|----------------|------------|----------------------------|--------------------------|
| OpenAI SDK     | Python     | src/agents/*.py (3 files)  | none                     |
| Vercel AI SDK  | TypeScript | app/api/chat/route.ts      | traceloop (v0.18)        |
```

If zero frameworks are detected, use `AskUserQuestion` with choices: `OpenAI SDK` / `Anthropic SDK` / `LangChain` / `CrewAI` / `Vercel AI SDK` / `Other`.

## Step 2: Recommend Integration Mode (OBSV-02)

Execute this decision tree against the Step 1 detection table:

- Detected a supported SDK (OpenAI / Anthropic / Vercel AI) AND no existing OTEL → **AI Router** (zero-code; default).
- Detected heavy existing OTEL (Grafana/Tempo/Datadog pipelines, `opentelemetry-sdk` in deps) → **OTEL-only** (unified observability).
- User explicitly asked for cost routing AND aggregation → **Both** (rare — confirm before recommending).
- Otherwise (LangChain/CrewAI without OTEL) → **AI Router** with framework-specific instrumentor.

Print the recommendation with written rationale tied to Step 1 output (1–2 sentences). Example: "**Recommendation: AI Router.** Detected OpenAI SDK in 3 Python files with no existing OTEL pipeline; AI Router gives zero-code instrumentation via a drop-in base URL."

## Step 3: Emit Integration Code (OBSV-03 — delegates to Plan 02 resources)

Based on the detected framework + chosen mode, `Read` the matching resource file and emit its snippet verbatim into the user's output:

| Framework          | Resource File                                                      |
|--------------------|--------------------------------------------------------------------|
| OpenAI SDK         | `orq-agent/commands/observability/resources/openai-sdk.md`         |
| LangChain          | `orq-agent/commands/observability/resources/langchain.md`          |
| CrewAI             | `orq-agent/commands/observability/resources/crewai.md`             |
| Vercel AI SDK      | `orq-agent/commands/observability/resources/vercel-ai.md`          |
| OTEL-only / generic| `orq-agent/commands/observability/resources/generic-otel.md`       |

**Constraint reminder:** Instrumentors MUST be imported BEFORE SDK clients. Each resource file's snippet enforces this import order — do not reorder it when pasting into output.

## Step 4: Baseline Verification (OBSV-04)

Generate a verification test script (choose TS or Python based on Step 1 detected language). The script MUST:

1. Invoke the user's LLM once with a canned prompt containing test values (no real secrets).
2. Poll `mcp__orqai-mcp__list_traces` with `limit: 5, since: <now - 2m>` until the new trace appears (max 30s).
3. Assert `trace.model` is present and non-empty.
4. Assert `trace.usage.total_tokens > 0`.
5. Walk `trace.spans[]` and assert at least one parent-child link exists (span hierarchy sanity).
6. Run the PII scan regex suite over the serialized trace body:
   - **Email:** `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`
   - **US phone:** `\(?[2-9]\d{2}\)?[ .-]?\d{3}[ .-]?\d{4}`
   - **SSN:** `\d{3}-\d{2}-\d{4}`
   - **Credit-card-like:** `\b(?:\d[ -]*?){13,16}\b`

   Print **WARN** (not FAIL) for any match — the user decides whether it is test data or a real leak.

Emit the script to `verify-orq-traces.ts` (TypeScript projects) or `verify-orq-traces.py` (Python projects) in the user's cwd via `Write`, then instruct the user to run it and paste the output back into the session.

## Step 5: Enrich Traces (OBSV-05)

Emit a table of enrichment attributes + per-framework helper call:

| Attribute      | Purpose                                     | OpenAI SDK (Python)                    | Vercel AI SDK (TS)                 |
|----------------|---------------------------------------------|----------------------------------------|------------------------------------|
| `session_id`   | Group traces for one user session           | `set_session(session_id=...)`          | `setSession({ sessionId })`        |
| `user_id`      | End-user attribution                        | `set_user(user_id=...)`                | `setUser({ userId })`              |
| `customer_id`  | B2B tenant attribution                      | `set_customer(customer_id=...)`        | `setCustomer({ customerId })`      |
| `feature_tags` | Flag experiments / A/B arms                 | `set_tags(["checkout-v2"])`            | `setTags(['checkout-v2'])`         |

Guide the user to set these from their auth middleware / request context (e.g. a FastAPI dependency, a Next.js middleware, an Express handler), **never hardcoded** in source — hardcoding leaks tenants across requests.

## Step 6: @traced Decorator Placement (OBSV-06)

Emit concrete Python + TypeScript examples for all 6 canonical span types.

**Python:**

```python
from orq.decorators import traced

@traced(span_type="agent")
def triage_agent(query: str) -> str: ...

@traced(span_type="llm")
def call_model(prompt: str) -> str: ...

@traced(span_type="tool")
def db_lookup(key: str) -> dict: ...

@traced(span_type="retrieval")
def search_kb(query: str) -> list[dict]: ...

@traced(span_type="embedding")
def embed_text(text: str) -> list[float]: ...

@traced(span_type="function")
def compute_rollup(rows: list) -> dict: ...
```

**TypeScript:**

```ts
import { traced } from '@orq-ai/node';

export const triageAgent   = traced({ spanType: 'agent' },     async (query: string) => { /* ... */ });
export const callModel     = traced({ spanType: 'llm' },       async (prompt: string) => { /* ... */ });
export const dbLookup      = traced({ spanType: 'tool' },      async (key: string) => { /* ... */ });
export const searchKb      = traced({ spanType: 'retrieval' }, async (q: string) => { /* ... */ });
export const embedText     = traced({ spanType: 'embedding' }, async (t: string) => { /* ... */ });
export const computeRollup = traced({ spanType: 'function' },  async (rows: any[]) => { /* ... */ });
```

Guidance:

- One decorator per span boundary — never nest `llm` inside `llm`.
- Use `function` for pure utilities only; reach for it last.
- Use `agent` for the outermost orchestration call (the thing the user's request hits first).
- `tool` vs `retrieval`: `retrieval` is for KB / vector / semantic lookup; `tool` is for deterministic side-effect calls (DB writes, external API mutations, file ops).
- `embedding` always wraps the embed call itself, not the downstream store/compare step.

## Step 7: Identity Attribution (OBSV-07)

Attach per-tenant identity attributes so downstream per-tenant filtering works.

**TypeScript:**

```ts
import { setIdentity } from '@orq-ai/node';
setIdentity({ customerId: 'acme-corp', tenantId: 'eu-1' });
```

**Python:**

```python
from orq import set_identity
set_identity(customer_id='acme-corp', tenant_id='eu-1')
```

Set `setIdentity` / `set_identity` from the same auth-middleware layer where `customer_id` is resolved — typically right after JWT decode, before any LLM call. Once identity attributes are attached, filter traces per-tenant via `/orq-agent:traces --identity acme-corp` (wired live in Phase 37 Plan 03). The `--identity` flag becomes the retrieval surface for every downstream per-tenant workflow: cost attribution, failure triage, evaluator regression slices.

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Importing the SDK client before the instrumentor | Instrumentors MUST be imported first — they monkey-patch the client at import time. Reordering silently breaks span emission while appearing to work. |
| Using a floating model alias (`claude-sonnet-4-5-latest`) in traced calls | Pin dated snapshots per Phase 35 MSEL-02 (e.g. `claude-sonnet-4-5-20250929`) so trace `model` fields are diff-able across runs. |
| Hardcoding `customer_id` in source | Set from auth middleware / request context. Hardcoding leaks tenants across requests and poisons per-tenant cost reports. |
| Skipping baseline verification "because it looked right" | If traces don't appear, they don't exist. The PII scan + hierarchy check + model+tokens assertion is the Nyquist gate for every downstream phase. |
| Wrapping every function in `@traced(span_type="function")` | Span noise drowns signal — decorate span BOUNDARIES (agent/llm/tool/retrieval), not every internal helper. |
| Treating `identity` as optional for B2B apps | Per-tenant attribution is the billing-margin signal; without it, cost reports aggregate across customers and margin-per-tenant becomes uncomputable. |

## Open in orq.ai

- **Traces:** https://my.orq.ai/traces
- **AI Router:** https://my.orq.ai/ai-router
- **Agent Studio:** https://my.orq.ai/agents

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`list_traces`, `search_entities`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
