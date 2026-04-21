---
description: Turn ~100 production traces into a 4-8 mode failure taxonomy via grounded-theory coding — mixed sampling, first-upstream-failure labeling, transition matrix, classification, handoff report (tier: deploy+)
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, WebFetch, mcp__orqai-mcp__list_traces, mcp__orqai-mcp__list_spans, mcp__orqai-mcp__get_span
argument-hint: "[--last <7d|30d>] [--limit <N>] [--deployment <key>] [--identity <id>]"
---

# Trace Failure Analysis

You are running the `/orq-agent:trace-failure-analysis` command. This command walks the user through turning a pile of production traces into a 4-8 mode failure taxonomy using grounded-theory methodology — mixed sampling, open/axial coding, first-upstream-failure labeling, transition matrix, mode classification, and a handoff-ready error-analysis report.

**Tier:** deploy+ (requires authenticated workspace with ≥50 traces). Core-tier users see: "Trace failure analysis requires traces — run `/orq-agent:observability` first and ensure your workspace has ≥50 traces."

## Constraints

- **NEVER** label downstream cascading effects — label ONLY the first upstream failure per trace (TFAIL-03).
- **NEVER** force more than 8 or fewer than 4 failure modes — grounded theory yields 4-8 non-overlapping categories (TFAIL-02).
- **NEVER** fabricate trace IDs or span sequences when MCP/REST fails — STOP and surface the raw error (matches Phase 36 discipline).
- **NEVER** skip the sampling plan — the 50% random / 30% failure-driven / 20% outlier split is recorded in the report so results are reproducible (TFAIL-01).
- **NEVER** classify a mode as more than one of the 4 categories — specification / generalization-code-checkable / generalization-subjective / trivial-bug are mutually exclusive (TFAIL-05).
- **ALWAYS** emit the final report to `error-analysis-YYYYMMDD-HHMM.md` with taxonomy + rates + example trace IDs + recommended handoff (TFAIL-06).
- **ALWAYS** call MCP `list_traces` first; fall back to REST `GET /v2/traces` with `$ORQ_API_KEY` on MCP failure.
- **ALWAYS** ask the user to confirm / merge / split axial-coding clusters via `AskUserQuestion` — the taxonomy is their taxonomy, the skill only proposes.

**Why these constraints:** The first-upstream-failure rule prevents cascade inflation — if one bad span poisons five downstream spans, counting all six inflates the error distribution and misleads the taxonomy. The 4-8 mode band is the grounded-theory signal sweet spot: fewer than 4 collapses distinct failure causes into noise, more than 8 produces overlapping modes that cannot cleanly hand off to a single fix. The 50/30/20 sampling split balances representativeness (random captures silent failures and "looks-ok-but-isn't" traces) with failure coverage (failure-driven guarantees enough error signal to code against) and long-tail discovery (outliers surface cost / latency failure modes that never throw). MCP-first with REST fallback preserves the Phase 36 never-fabricate invariant — when Orq.ai is unreachable, the skill STOPs rather than inventing traces, so downstream evaluators are never built on synthetic rubble.

## When to use

- Production traces have been piling up and there is no clear failure taxonomy yet — you need to know WHAT breaks, not just that something breaks.
- Onboarding a new deployment to incident triage — the team needs a shared vocabulary for failure modes before on-call rotation begins.
- Deciding whether the next fix is a prompt change, an evaluator / guardrail, or a developer patch — the classification step makes the handoff explicit.
- Post-incident retrospective — mapping a week of traces to modes reveals whether the incident was a known mode spiking or a new mode emerging.

## When NOT to use

- Under 50 traces in the window — use `/orq-agent:observability` to increase instrumentation first, then layer synthetic test cases via `/orq-agent:datasets` to exercise the pipeline.
- Single-trace debugging — use `/orq-agent:traces <id>` and open the trace in Studio span viewer; this skill is for distributional analysis, not one-off inspection.
- Evaluator regression triage on synthetic test cases — use `agents/failure-diagnoser.md` (V2.1), which diagnoses individual evaluator failures on known-good test inputs.

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- ← `/orq-agent:observability` — producer of instrumented + identity-tagged traces this skill consumes.
- ← `/orq-agent:traces` — upstream discovery surface; user typically runs traces first to see volume/error rate before launching systematic analysis.
- → `/orq-agent:harden` (evaluator + guardrail path, Phase 42 wires formally) — handoff target for `generalization-code-checkable` modes.
- → `/orq-agent:prompt` — handoff target for `specification` modes (prompt engineering fix).
- → `/orq-agent:iterate` — handoff target when an evaluator already exists and iteration is the fix.
- → No skill (developer fix) — `trivial-bug` classification exits the AI-platform loop and becomes a bug-ticket.

## Done When

- [ ] Banner `ORQ ► TRACE FAILURE ANALYSIS` printed with `--last` window on sub-line.
- [ ] Sampling plan table showing 50/30/20 split + actual trace IDs fetched in each bucket.
- [ ] Open-coding annotation table populated for each sampled trace.
- [ ] Axial-coding cluster table with 4-8 non-overlapping modes approved by the user.
- [ ] Every sampled trace tagged with its first upstream failure mode; cascade children carry `cascade-of: <parent_mode>`.
- [ ] Transition failure matrix rendered for multi-step pipelines (skipped with explicit note for single-step).
- [ ] Each mode classified as one of specification / generalization-code-checkable / generalization-subjective / trivial-bug.
- [ ] `error-analysis-YYYYMMDD-HHMM.md` written to cwd (or `./Agents/<swarm-name>/` if invoked inside a swarm dir).
- [ ] "MCP tools used:" footer + "Open in orq.ai:" deep link emitted.

## Destructive Actions

- **File writes only** — this command writes exactly one file: `error-analysis-YYYYMMDD-HHMM.md` in the user's cwd (or `./Agents/<swarm-name>/` if invoked from a swarm directory). It prompts via `AskUserQuestion` before overwriting an existing file with the same name. It never mutates Orq.ai entities.

## Step 1: Sample Traces (TFAIL-01)

Emit the banner as the first line of runtime output:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► TRACE FAILURE ANALYSIS            last ${LAST}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Parse `$ARGUMENTS` for the following long-form flags (no short flags — Phase 34 convention). Unknown flags STOP with a usage hint.

| Flag | Required | Default | Purpose |
|------|----------|---------|---------|
| `--last <7d\|30d>` | optional | `7d` | Time window for sampling. |
| `--limit <N>` | optional | `100` | Total target trace count across all three buckets. |
| `--deployment <key>` | optional | none | Filter to one deployment key. |
| `--identity <id>` | optional | none | Filter to one per-tenant identity attribute (OBSV-07). |

Validate `--last` against `7d|30d`; STOP with `--last must be one of 7d, 30d (got: <value>)` otherwise (shorter windows starve grounded-theory saturation).

Compute the mixed sampling split (TFAIL-01): **50% random** + **30% failure-driven** (status=error) + **20% outliers** (sort by latency desc OR cost desc, top 10%). For the default `--limit 100`, that is 50 random + 30 failure-driven + 20 outliers.

Fetch via MCP — **per-bucket calls**:

```
mcp__orqai-mcp__list_traces(since: <now - LAST>, limit: 50, deployment_key: $DEPLOYMENT, identity: $IDENTITY, sort: "random")
mcp__orqai-mcp__list_traces(since: <now - LAST>, limit: 30, deployment_key: $DEPLOYMENT, identity: $IDENTITY, status: "error")
mcp__orqai-mcp__list_traces(since: <now - LAST>, limit: 20, deployment_key: $DEPLOYMENT, identity: $IDENTITY, sort: "latency_desc")
```

REST fallback shape if MCP errors (surface the raw error inline, do NOT swallow):

```bash
curl -sS -H "Authorization: Bearer $ORQ_API_KEY" \
  "https://api.orq.ai/v2/traces?limit=50&since=${SINCE}&deployment_key=${DEPLOYMENT}&identity=${IDENTITY}&sort=random"
```

(Repeat per bucket; omit query params whose variables are empty.) If the REST fallback also fails, STOP — never fabricate trace rows.

Dedupe by `trace_id` across the three buckets (a high-latency trace may also be an error trace; keep one row, tag it with both buckets for reporting). If total unique trace count < 50 after dedupe, STOP with: `Trace failure analysis requires ≥50 traces — run /orq-agent:observability to increase volume.`

Render a **Sampling plan** table with actual trace IDs inlined:

```
| Bucket           | Target | Actual fetched | Filter                         | Trace IDs (full) |
|------------------|--------|----------------|--------------------------------|------------------|
| Random (50)      | 50     | 48             | since=now-${LAST}, random      | <tid>, <tid>, ... |
| Failure-driven   | 30     | 30             | status=error                   | <tid>, <tid>, ... |
| Outlier (20)     | 20     | 20             | sort=latency_desc top 10%      | <tid>, <tid>, ... |
```

Store the full trace-ID list as `$SAMPLED_TRACES` for Steps 2-7.

## Step 2: Open Coding (TFAIL-02)

Grounded-theory **open coding** is the one-sentence freeform annotation per trace describing **WHAT** went wrong — not yet WHY, not yet which category. Reference `orq-agent/commands/trace-failure-analysis/resources/grounded-theory-methodology.md` for the full methodology (open coding, axial coding, saturation criteria, first-upstream-failure decision rules).

Batch traces **10 at a time**. For each batch:

1. For each trace in the batch, fetch span hierarchy via `mcp__orqai-mcp__list_spans(trace_id)` and display: `trace_id`, status, input preview, output preview, any `error` message field.
2. The skill-LLM drafts an annotation (one sentence, WHAT went wrong) from the span content.
3. Use `AskUserQuestion` with a free-text answer field per trace: "Annotation for trace `<id>`?" — user confirms the drafted annotation or edits it.

**Saturation heuristic (stop condition):** stop open coding when two consecutive batches produce no new annotation themes. The user can override this — explicitly ask via `AskUserQuestion` whether to continue when the heuristic triggers.

Emit the annotation table:

```
| Trace ID | Bucket            | Status | Annotation                                   |
|----------|-------------------|--------|----------------------------------------------|
| <tid>    | random            | error  | Agent hallucinated a non-existent API tool   |
| <tid>    | failure-driven    | error  | JSON schema rejected: missing 'amount' field |
| <tid>    | outlier (latency) | ok     | 38s spent re-prompting after first bad output|
```

## Step 3: Axial Coding (TFAIL-02)

Grounded-theory **axial coding** clusters open-coding annotations into categories (the failure modes). Reference `orq-agent/commands/trace-failure-analysis/resources/grounded-theory-methodology.md`.

The skill-LLM proposes 4-8 candidate modes by clustering the annotation table from Step 2. Render the cluster table:

```
| Mode                        | Traces | Representative annotation                         |
|-----------------------------|--------|---------------------------------------------------|
| tool-hallucination          | 12     | Agent hallucinated a non-existent API tool        |
| schema-violation            | 18     | JSON schema rejected: missing 'amount' field      |
| reprompt-loop               | 9      | 38s spent re-prompting after first bad output     |
| auth-misconfig              | 6      | 401 from upstream API, missing bearer token       |
| ambiguous-instruction       | 14     | Agent picked wrong intent between two valid paths |
```

Use `AskUserQuestion` to confirm / merge / split clusters. **ENFORCE:** final mode count MUST be between 4 and 8 inclusive. If the user converges on >8, ask them to merge; if <4, ask them to split further or broaden sampling.

**NEVER-OVERLAP rule:** every trace belongs to exactly one mode (no multi-labeling). If a trace arguably fits two modes, the first-upstream-failure rule in Step 4 breaks the tie — whichever mode describes the earliest failing span wins.

## Step 4: First-Upstream-Failure Labeling (TFAIL-03)

For every trace in `$SAMPLED_TRACES`, fetch the span hierarchy via `mcp__orqai-mcp__list_spans(trace_id)`. Walk the DAG in **topological order** (parents before children). Label ONLY the **first span** whose status is `error` OR whose output fails the mode's criterion (e.g. schema rejection, tool-not-found, wrong intent).

Downstream spans that errored because the upstream already failed get `cascade-of: <parent_mode>` — **NOT** a new mode assignment. For deep span introspection (single-span detail), use `mcp__orqai-mcp__get_span(span_id)`.

**Anti-pattern callout:** "If span B errored because it received bad input from span A, B is a cascade — label A, mark B `cascade-of: <mode-of-A>`. Counting B as its own failure double-counts the root cause and inflates the distribution."

**Single-span traces:** the whole trace IS the first upstream failure — label it directly, no cascade annotation needed.

Render the labeling result per trace:

```
| Trace ID | Mode (first upstream) | Cascade children (span_id → cascade-of) |
|----------|-----------------------|------------------------------------------|
| <tid>    | tool-hallucination    | span_7f → cascade-of: tool-hallucination |
| <tid>    | schema-violation      | (none — single-span trace)               |
```

## Step 5: Transition Failure Matrix (TFAIL-04)

Determine if the pipeline is **multi-step**: `max_depth = MAX(depth(spans)) across $SAMPLED_TRACES`. If `max_depth > 1`, build the transition failure matrix. If `max_depth == 1`, emit:

```
Skipping transition matrix — all sampled traces are single-step (max depth = 1).
```

For multi-step pipelines, compose:

- **Rows** = last successful span name (or `<origin>` if the very first span failed).
- **Columns** = first failure mode (from Step 4).
- **Cell value** = count of traces with that `(last_success → first_failure)` transition.

Render as a Markdown table:

```
| last_success \ first_failure | tool-hallucination | schema-violation | reprompt-loop | auth-misconfig | ambiguous-instruction |
|------------------------------|--------------------|------------------|---------------|----------------|------------------------|
| <origin>                     | 0                  | 0                | 0             | 6              | 3                      |
| retrieve_context             | 12                 | 2                | 0             | 0              | 4                      |
| plan_tool_call               | 0                  | 16               | 9             | 0              | 7                      |
```

Include a **Transition hotspots** paragraph calling out the top 3 cells by count, e.g. "Top hotspots: `plan_tool_call → schema-violation` (16), `retrieve_context → tool-hallucination` (12), `plan_tool_call → reprompt-loop` (9). The `plan_tool_call` row accounts for 32 of 59 failures — start hardening there."

## Step 6: Mode Classification (TFAIL-05)

For each of the 4-8 modes, classify as **exactly ONE** of:

- **specification** — prompt / instruction issue (ambiguous, conflicting, missing constraint). Fix: prompt engineering.
- **generalization-code-checkable** — output is wrong in a way verifiable by code (schema invalid, wrong tool called, typed field mismatch). Fix: build evaluator + guardrail.
- **generalization-subjective** — output is wrong in a way requiring human judgement (tone, reasoning quality, misinterpreted intent). Fix: LLM-judge evaluator + human labels.
- **trivial-bug** — plumbing / infra failure (auth error, env var missing, network timeout). Fix: developer patch, no AI-platform skill.

Reference `orq-agent/commands/trace-failure-analysis/resources/failure-mode-classification.md` for the full decision rules (including the tie-breaker: "if the prompt fix eliminates the need for the evaluator, classify as specification").

Use **one** `AskUserQuestion` call with **N questions**, one per mode, to confirm the proposed classification. Store the result as:

```
| Mode                  | Count | Rate %  | Classification                  |
|-----------------------|-------|---------|---------------------------------|
| tool-hallucination    | 12    | 12.0%   | generalization-code-checkable   |
| schema-violation      | 18    | 18.0%   | generalization-code-checkable   |
| reprompt-loop         | 9     | 9.0%    | generalization-subjective       |
| auth-misconfig        | 6     | 6.0%    | trivial-bug                     |
| ambiguous-instruction | 14    | 14.0%   | specification                   |
```

## Step 7: Generate Error-Analysis Report (TFAIL-06)

Compose `error-analysis-YYYYMMDD-HHMM.md` with the following sections:

1. **Sampling plan** — the table from Step 1 (bucket, target, actual fetched, filter, trace IDs).
2. **Taxonomy** — the table from Step 3 + Step 6 (mode, count, rate %, classification).
3. **Per-mode detail** — for each mode: 3 example trace IDs + representative annotation + span name of the first upstream failure.
4. **Transition matrix** — the table from Step 5, or `N/A — single-step pipeline`.
5. **Recommended handoffs** — one row per mode, driven by `orq-agent/commands/trace-failure-analysis/resources/handoff-matrix.md`:

   | Classification                  | Recommended next skill                          | Rationale                                  |
   |---------------------------------|-------------------------------------------------|--------------------------------------------|
   | specification                   | `/orq-agent:prompt`                             | Prompt engineering fix                     |
   | generalization-code-checkable   | `/orq-agent:harden`                             | Build evaluator + guardrail                |
   | generalization-subjective       | `/orq-agent:harden` + human annotation queue    | LLM-judge + human labels                   |
   | trivial-bug                     | (none — developer fix)                          | Out of AI-platform scope                   |

6. **Footer** — generated-at timestamp + MCP tools used.

**Output path resolution:** if cwd contains a `./Agents/<name>/` subdirectory, write the report into that subdirectory; otherwise write to cwd. Before overwriting an existing file with the same name, use `AskUserQuestion` to confirm (choices: `overwrite` / `rename with -v2 suffix` / `cancel`).

Then print to terminal:

```
Report written: error-analysis-YYYYMMDD-HHMM.md

Open in orq.ai:
  https://my.orq.ai/traces

MCP tools used: list_traces, list_spans, get_span
```

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Labeling every errored span in a cascade as its own mode | Label ONLY the first upstream failure (TFAIL-03); downstream spans get `cascade-of: <parent_mode>`. Counting cascade children inflates the distribution and misleads the fix priority. |
| Forcing 3 or 12 modes "because the data says so" | Re-sample or merge — grounded theory's signal band is 4-8 non-overlapping modes. Fewer than 4 collapses distinct causes; more than 8 produces overlapping modes that cannot hand off to a single fix. |
| Sampling only errored traces ("failure-driven is enough") | Random 50% captures silent-failure patterns and "looks-ok-but-isn't" traces; failure-driven alone overfits to loud failures and misses the long tail. The 20% outlier bucket catches cost / latency failures that never throw. |
| Classifying the same mode as both specification AND generalization | Mutually exclusive categories (TFAIL-05). If the prompt is ambiguous AND the output is code-checkable, the SPEC fix eliminates the need for the evaluator — classify as specification. |
| Skipping the transition matrix on multi-step pipelines | Transition hotspots reveal which handoffs are brittle — the matrix IS the diagnostic for pipeline design bugs. Without it, you fix the loudest symptom rather than the upstream cause. |
| Writing a report without example trace IDs | Without IDs the report is un-verifiable — downstream handoffs (`/orq-agent:harden`, `/orq-agent:prompt`) need to pull the exact traces to build evaluators and reproduce prompts. |
| Fabricating trace rows when MCP + REST both fail | STOP with the raw error — never invent trace IDs or timestamps. Synthetic rubble poisons every downstream evaluator built on top of this taxonomy. |

## Open in orq.ai

- **Traces:** https://my.orq.ai/traces
- **Experiments:** https://my.orq.ai/experiments
- **Agent Studio:** https://my.orq.ai/agents

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`list_traces`, `list_spans`, `get_span`, `search_entities`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
