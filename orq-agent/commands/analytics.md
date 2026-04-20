---
description: Orq.ai analytics summary — requests, cost, tokens, error rate — with optional group-by model / deployment / agent / status
allowed-tools: Bash, Read, mcp__orqai-mcp__get_analytics_overview, mcp__orqai-mcp__query_analytics
argument-hint: "[--last <5m|1h|24h|7d|30d>] [--group-by <model|deployment|agent|status>]"
---

# Analytics Summary

You are running the `/orq-agent:analytics` command. Report aggregate production metrics — requests, cost, tokens, error rate — for a time window, with optional grouping by model, deployment, agent, or status. Read-only; all data comes from the Orq.ai MCP server.

## Constraints

- **NEVER** mutate analytics config — this command only reads Orq.ai aggregates.
- **NEVER** omit the time window from the banner — the number is meaningless without a window.
- **NEVER** fabricate totals when an MCP tool errors — surface the error inline with the REST fallback command.
- **ALWAYS** call `get_analytics_overview` first for the flat summary; only call `query_analytics` when `--group-by` is present.
- **ALWAYS** echo the `$` USD currency symbol on the cost line; Orq.ai returns USD-normalized cost.

**Why these constraints:** Users act on these numbers — they drive model-mix changes, cost alerts, and post-deploy rollback decisions. Cost interpretation without a currency or window is wrong-by-construction; a fabricated group table after an MCP error is worse than no table at all.

## When to use

- Daily cost / usage check — confirm the last 24h stayed within budget.
- Model-mix analysis — `--group-by model` to see which snapshots are actually carrying the traffic.
- Deployment-level error-rate investigation after a release — `--group-by deployment` with `--last 1h` to localize spikes.
- Agent-level cost attribution — `--group-by agent` to find the expensive swarm member.
- Status-code breakdown — `--group-by status` to quantify 4xx vs 5xx share before opening traces.

## When NOT to use

- Need per-trace / per-span detail or a specific failure's stack → run `/orq-agent:traces` instead.
- Need a single entity list (agents, datasets, deployments) without metrics → run `/orq-agent:workspace` instead.
- Need chart rendering or CSV export — this command emits plain terminal text only; open the Open-in-orq.ai link for rich dashboards.

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- → `/orq-agent:traces` — when error rate spikes, drill into individual failing traces.
- → `/orq-agent:models` — when `--group-by model` shows an unexpected winner, inspect model snapshots and cascade candidates.
- ← user invocation — operations-time entry point.

## Done When

- [ ] Terminal shows the ORQ ► ANALYTICS banner with the resolved window (from `--last` or the `24h` default).
- [ ] Summary line present with all 4 metrics (requests, cost, tokens, error rate) and a USD symbol on cost.
- [ ] When `--group-by` is supplied, the group table has one row per group value with the same 4 metrics per row.
- [ ] `MCP tools used:` footer lists `get_analytics_overview` (plus `query_analytics` if `--group-by` was used).
- [ ] Open-in-orq.ai link resolves to `https://my.orq.ai/analytics`.

## Destructive Actions

- **None** — this command is read-only (reads Orq.ai analytics via MCP; no writes, no config mutations).

## Step 1: Parse Arguments

Parse `$ARGUMENTS` for two optional flags. Neither is positional.

1. **`--last <duration>`** — accepted values: `5m`, `1h`, `24h`, `7d`, `30d`. Default if omitted: `24h`. Store the resolved value as `LAST`.

2. **`--group-by <dim>`** — accepted values: `model`, `deployment`, `agent`, `status`. No default — when omitted, the command emits only the flat summary. Store as `GROUP_BY` (or unset).

**If `--last` is present with an unknown value,** STOP with:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ANALYTICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Invalid --last value: "[value]"

Accepted windows: 5m, 1h, 24h, 7d, 30d

Usage:
  /orq-agent:analytics                               Flat summary, last 24h
  /orq-agent:analytics --last 7d                     Flat summary, last 7 days
  /orq-agent:analytics --group-by model              Group by model, last 24h
  /orq-agent:analytics --last 1h --group-by status   Group by status, last 1h
```

**If `--group-by` is present with an unknown value,** STOP with:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ANALYTICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Invalid --group-by value: "[value]"

Accepted dimensions: model, deployment, agent, status

Usage:
  /orq-agent:analytics --group-by model
  /orq-agent:analytics --group-by deployment
  /orq-agent:analytics --group-by agent
  /orq-agent:analytics --group-by status
```

## Step 2: Fetch Totals

Call the MCP tool for the flat overview:

```
mcp__orqai-mcp__get_analytics_overview(window=$LAST)
```

Expected fields on the response: `requests`, `cost_usd`, `tokens`, `error_rate` (as a fraction or percentage — normalize to percentage with one decimal before rendering).

**On MCP error** (tool not registered, server unreachable, auth failure), fall back to the REST endpoint and render the fallback command verbatim in the banner so the user can retry out-of-band:

```bash
curl -sS -H "Authorization: Bearer $ORQ_API_KEY" \
  "https://api.orq.ai/v2/analytics/overview?window=$LAST"
```

Never fabricate values. If both MCP and REST fail, surface the error text inline under the banner and STOP.

Store the overview result as `TOTALS`.

## Step 3: Fetch Group-By (optional)

**Only execute this step if `GROUP_BY` is set.** Call:

```
mcp__orqai-mcp__query_analytics(window=$LAST, group_by=$GROUP_BY)
```

Expected response: an array of rows, each with `name`, `requests`, `cost_usd`, `tokens`, `error_rate`. `name` holds the group value (e.g., the model snapshot, deployment key, agent key, or HTTP status code).

**On MCP error,** fall back to:

```bash
curl -sS -H "Authorization: Bearer $ORQ_API_KEY" \
  "https://api.orq.ai/v2/analytics/query?window=$LAST&group_by=$GROUP_BY"
```

Never fabricate a group table. If both MCP and REST fail, surface the error text under the breakdown heading and omit the table.

Store the row array as `GROUPS`.

## Step 4: Render

Print the banner first, substituting `$LAST`:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ANALYTICS                      window {LAST}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Always follow with the flat summary line from `TOTALS`:

```
Requests: {N} | Cost: ${USD} | Tokens: {N} | Error rate: {N}%
```

- Render `Requests` and `Tokens` with thousands separators.
- Render `Cost` with a leading `$` and exactly 2 decimal places (USD is the only currency Orq.ai emits).
- Render `Error rate` with a `%` suffix and 1 decimal place.

**If `GROUP_BY` is set,** append an H3 and a pipe-separated Markdown table. The first column header is the capitalized dimension name (e.g., `Model`, `Deployment`, `Agent`, `Status`). Rows use the same number formatting as the flat line.

```
### Breakdown by {GROUP_BY}

| {Dim}         | Requests | Cost    | Tokens   | Error Rate |
|---------------|---------:|--------:|---------:|-----------:|
| {name-1}      | {N}      | ${USD}  | {N}      | {N}%       |
| {name-2}      | {N}      | ${USD}  | {N}      | {N}%       |
| ...           | ...      | ...     | ...      | ...        |
```

Sort rows by `requests` descending unless the user asked otherwise. If `GROUPS` is empty, print a single line `No activity for the selected window.` instead of an empty table.

## Step 5: Print Open-in-orq.ai + MCP Footer

After the summary (and optional breakdown table), print the deep link and the MCP-tools footer verbatim:

```
Open in orq.ai:
  https://my.orq.ai/analytics

MCP tools used: get_analytics_overview[, query_analytics]
```

- Include `, query_analytics` only when `GROUP_BY` was set and Step 3 ran.
- If a REST fallback was used for either call, append ` (REST fallback)` to that tool's entry, e.g. `get_analytics_overview (REST fallback)`.

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Rendering cost without a currency symbol | Always prefix with `$` — Orq.ai returns USD-normalized cost; a bare number invites unit confusion |
| Omitting the window from the banner | Metrics are meaningless without a window — `1,204 requests` over 5m vs 30d is three orders of magnitude different |
| Accepting arbitrary `--group-by` values (e.g., `--group-by region`) | Restrict to the 4 documented dimensions — unknown values STOP with the accepted-values list |
| Fabricating a group table when MCP errors | Surface the error text and the REST fallback `curl` command inline — a made-up table is worse than no table |
| Using `get_analytics_overview` for grouped output | Flat totals and grouped totals are separate MCP tools — use `query_analytics` whenever `--group-by` is set |

## Open in orq.ai

- **Analytics:** https://my.orq.ai/analytics
- **Traces:** https://my.orq.ai/traces
- **Deployments:** https://my.orq.ai/deployments

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`get_analytics_overview`, `query_analytics`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
