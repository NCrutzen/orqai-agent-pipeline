---
description: Single-screen Orq.ai workspace overview — agents, deployments, prompts, datasets, experiments, projects, KBs, evaluators + analytics summary
allowed-tools: Bash, Read, mcp__orqai-mcp__search_entities, mcp__orqai-mcp__search_directories, mcp__orqai-mcp__get_analytics_overview, mcp__orqai-mcp__list_registry_keys
argument-hint: "[agents|deployments|prompts|datasets|experiments|projects|kb|evaluators|analytics]"
---

# Workspace Overview

You are running the `/orq-agent:workspace` command. This command prints a single-screen overview of the Orq.ai workspace — all entity types plus an analytics summary line.

## Constraints

- **NEVER** mutate Orq.ai entities — this is a read-only overview.
- **NEVER** fabricate entity counts, names, or IDs when an MCP tool returns an error — show the error inline and continue with the next section.
- **ALWAYS** call MCP tools first; fall back to REST via `curl` with `$ORQ_API_KEY` only when the matching MCP tool is unavailable.
- **ALWAYS** print the "MCP tools used:" footer listing every tool invoked, plus a `, REST fallback` suffix if any section used curl.

**Why these constraints:** The workspace overview is the first MCP surface new users hit after install — silently fabricating data poisons the mental model, and downstream commands (`/orq-agent:traces`, `/orq-agent:analytics`, `/orq-agent:models`) assume the user believes what this command prints. MCP-first is the project invariant (see PROJECT.md Key Decisions and SKST-06 MCP-first constraint); `curl` fallback preserves functionality when a specific MCP tool is missing without violating the invariant for the tools that are available.

## When to use

- A new user just completed `/orq-agent:update` install and wants to verify the MCP connection works end-to-end.
- A returning user needs a quick inventory snapshot before running `/orq-agent:deploy` or `/orq-agent:test` (how many agents, which deployments are active, are there pending experiments).
- A user is about to onboard a colleague and wants a single-screen overview of the workspace to share.
- Pre-deploy sanity check: confirm the workspace is the expected one (not a stale tenant) before mutating with `/orq-agent:deploy` or `/orq-agent:harden`.

## When NOT to use

- User needs per-trace detail (latency breakdown, span tree, token cost per step) → run `/orq-agent:traces` which supports `--deployment`, `--status`, `--last`, `--limit` filters.
- User needs the model inventory and capability tier breakdown → run `/orq-agent:models` which groups by chat / embedding / rerank.
- User needs cost trend lines or grouped analytics (by model, by deployment, by project) → run `/orq-agent:analytics --group-by {model|deployment|project}`.
- User needs to mutate (create, deploy, delete) any entity → use the purpose-built commands (`/orq-agent:deploy`, `/orq-agent:kb`, `/orq-agent:automations --create`).

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- → `/orq-agent:traces` — when the workspace table shows a deployment you want to drill into.
- → `/orq-agent:analytics` — when the analytics summary line surfaces a cost spike or error-rate bump worth investigating.
- → `/orq-agent:models` — when you want the full chat/embedding/rerank model catalog instead of just an entity count.
- ← user invocation — discovery-time entry point; no upstream skill calls `/orq-agent:workspace` automatically.

## Done When

- [ ] Terminal shows the `ORQ ► WORKSPACE` banner (or `ORQ ► WORKSPACE ► {SECTION}` in filtered mode).
- [ ] All 8 entity subsections rendered (agents, deployments, prompts, datasets, experiments, projects, knowledge bases, evaluators) — or only the single requested section in filtered mode.
- [ ] Analytics summary line present: `Requests: {N} | Cost: {USD} | Tokens: {N} | Error rate: {N}% (last 24h)`.
- [ ] "Open in orq.ai" deep-link block rendered with at least the `https://my.orq.ai/agents` link.
- [ ] "MCP tools used:" footer lists at least one tool actually invoked during this run.

## Destructive Actions

- **None** — this command is read-only (reads Orq.ai workspace data via MCP).

## Step 1: Parse Argument

Read `$ARGUMENTS`.

- **Empty (no argument):** full overview mode. Proceed to Step 2 with all 8 entity sections plus analytics.
- **One of `{agents|deployments|prompts|datasets|experiments|projects|kb|evaluators|analytics}`:** filtered mode. Proceed to Step 2 with only that section (plus the analytics summary line, which always renders).
- **Anything else:** STOP and print the following usage hint verbatim, then exit:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► WORKSPACE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Unknown section: "[argument]"

Usage:
  /orq-agent:workspace                Full overview (all 8 sections + analytics)
  /orq-agent:workspace agents         Agents only
  /orq-agent:workspace deployments    Deployments only
  /orq-agent:workspace prompts        Prompts only
  /orq-agent:workspace datasets       Datasets only
  /orq-agent:workspace experiments    Experiments only
  /orq-agent:workspace projects       Projects only
  /orq-agent:workspace kb             Knowledge bases only
  /orq-agent:workspace evaluators     Evaluators only
  /orq-agent:workspace analytics      Analytics summary only
```

## Step 2: Fetch Workspace Data

For each requested section (all 8 in full mode, or just the filtered one), call the matching MCP tool. Record every tool invocation — the list is printed verbatim in the Step 5 footer.

| Section             | MCP tool (primary)                            | MCP arguments                          | REST fallback (if MCP unavailable)                              |
| ------------------- | --------------------------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| agents              | `mcp__orqai-mcp__search_entities`             | `type=agent`                           | `curl -H "Authorization: Bearer $ORQ_API_KEY" https://api.orq.ai/v2/agents` |
| deployments         | `mcp__orqai-mcp__search_entities`             | `type=deployment`                      | `curl ... https://api.orq.ai/v2/deployments`                    |
| prompts             | `mcp__orqai-mcp__search_entities`             | `type=prompt`                          | `curl ... https://api.orq.ai/v2/prompts`                        |
| datasets            | `mcp__orqai-mcp__search_entities`             | `type=dataset`                         | `curl ... https://api.orq.ai/v2/datasets`                       |
| experiments         | `mcp__orqai-mcp__search_entities`             | `type=experiment`                      | `curl ... https://api.orq.ai/v2/experiments`                    |
| projects            | `mcp__orqai-mcp__search_directories`          | (no filter — lists workspace projects) | `curl ... https://api.orq.ai/v2/projects`                       |
| knowledge bases     | `mcp__orqai-mcp__search_entities`             | `type=knowledge_base`                  | `curl ... https://api.orq.ai/v2/knowledge-bases`                |
| evaluators          | `mcp__orqai-mcp__search_entities`             | `type=evaluator`                       | `curl ... https://api.orq.ai/v2/evaluators`                     |
| analytics           | `mcp__orqai-mcp__get_analytics_overview`      | window = 24h                           | `curl ... https://api.orq.ai/v2/analytics/overview?window=24h`  |

**On MCP error for a section:** capture the error string (e.g., `tool not found`, `rate limited`, `401 unauthorized`). If the error is a transient failure (timeout, 5xx), retry once; otherwise attempt the REST fallback with `$ORQ_API_KEY`. If the REST fallback also fails, render the section H3 with the error message inline (`Agents: ERROR — <message>`) and continue with the next section. **Never fabricate data to paper over the error.**

## Step 3: Render Banner + Sections

Print the banner. In full-overview mode:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► WORKSPACE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

In filtered mode (e.g., `agents`):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► WORKSPACE ► AGENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Then for each section fetched in Step 2, render an H3 heading with the entity count and a pipe-separated Markdown table. The table column ordering is at Claude's discretion per the 36-CONTEXT.md "Claude's Discretion" note; the reasonable default is `Name | Key | Status | Updated` — swap columns (e.g., use `Model | Version` instead of `Status` for prompts) when the entity type has a more informative field.

Example H3 + table for agents:

```markdown
### Agents (N)

| Name                     | Key                          | Status | Updated     |
| ------------------------ | ---------------------------- | ------ | ----------- |
| Support Triage           | support-triage-agent         | active | 2 days ago  |
| Invoice Processor        | invoice-processor-agent      | draft  | 1 week ago  |
```

Render one H3 per fetched section. Order the sections in full mode: Agents → Deployments → Prompts → Datasets → Experiments → Projects → Knowledge bases → Evaluators.

If a section returned zero entities, still render the H3 with `(0)` and a single-row table containing `| — | — | — | — |`, so the reader can distinguish "empty section" from "section omitted by filter".

## Step 4: Render Analytics Summary Line

After the entity sections (in both full and filtered mode), print the analytics summary line on its own line:

```
Requests: {N} | Cost: ${USD} | Tokens: {N} | Error rate: {N}% (last 24h)
```

Values come from `mcp__orqai-mcp__get_analytics_overview` with `window=24h`. If the tool returned an error, print:

```
Analytics: ERROR — <message>
```

The analytics window is fixed at 24h for this command — no `--last` flag is accepted. For longer windows or drill-down (group by model, deployment, project), point the user to `/orq-agent:analytics --last 7d --group-by deployment`.

## Step 5: Print Open-in-orq.ai + MCP Footer

Emit exactly the following block as the final output (substitute the real tool list for the ones actually invoked during this run):

```
Open in orq.ai:
  https://my.orq.ai/agents

MCP tools used: search_entities, search_directories, get_analytics_overview
```

- The `Open in orq.ai` line always uses `https://my.orq.ai/agents` as the primary deep link in this command's footer. The fuller per-entity deep-link table lives in the `## Open in orq.ai` section below and is NOT printed as part of the command output (it is documentation for the skill reader).
- `MCP tools used:` lists only the tools actually invoked this run (deduplicated). If any section fell back to REST via `curl`, append `, REST fallback` after the MCP tool names.

## Anti-Patterns

| Pattern                                                              | Do Instead                                                                                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Mutating entities (create, update, delete) to "make the table nicer" | This command is strictly read-only — route mutations to the purpose-built commands (`/orq-agent:deploy`, `/orq-agent:automations`) |
| Fabricating entity counts when an MCP tool returns an error          | Render the section H3 with the error string inline (`ERROR — <message>`) — never make up numbers                                   |
| Collapsing all 8 entity sections into a single flat table            | Each entity type has different salient columns; keep one H3 subheading + one table per type                                        |
| Printing the full 8 sections when a filter was passed                | Honor the positional argument — filtered mode prints only the requested section + the analytics line                               |
| Omitting the MCP tools used footer                                   | The footer is the transparency contract — always list every tool invoked (plus `, REST fallback` if any curl calls happened)       |
| Emitting a non-dated model ID in prose examples                      | When an example model ID appears in this file, use a dated snapshot (e.g., `claude-sonnet-4-5-20250929`) per Phase 35 MSEL-02      |

## Open in orq.ai

- **Agents:** https://my.orq.ai/agents
- **Deployments:** https://my.orq.ai/deployments
- **Experiments:** https://my.orq.ai/experiments
- **Traces:** https://my.orq.ai/traces

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`search_entities`, `search_directories`, `get_analytics_overview`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
