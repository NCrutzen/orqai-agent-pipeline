---
description: Query and summarize Orq.ai production traces — errors first, full trace IDs, with deployment/status/duration/limit filters
allowed-tools: Bash, Read, mcp__orqai-mcp__list_traces, mcp__orqai-mcp__list_spans, mcp__orqai-mcp__search_entities
argument-hint: "[--deployment <key>] [--status <ok|error>] [--last <5m|1h|24h|7d|30d>] [--limit <N>] [--identity <id>]"
---

# Traces Query

You are running the `/orq-agent:traces` command. This command queries Orq.ai production traces and renders them errors first with full trace IDs for copy-paste debugging.

## Constraints

- **NEVER** mutate traces — this is a read-only query surface.
- **NEVER** truncate trace IDs — they are copy-paste targets for Studio / support.
- **NEVER** silently swallow MCP errors — surface them inline with the fallback attempt.
- **ALWAYS** sort errors first (status=error rows above status=ok rows).
- **ALWAYS** call MCP `list_traces` first; fall back to REST `GET /v2/traces` with `$ORQ_API_KEY` on MCP failure.

**Why these constraints:** Trace inspection is a debugging workflow (SKST-06) — truncated IDs or buried errors add friction exactly when the user is under pressure. MCP-first follows the PROJECT.md Key Decision (MCP > REST); surfacing errors (rather than silently fabricating or swallowing) matches the Anti-Pattern discipline from Phase 34.

## When to use

- Post-deploy spot-check: confirm the new deployment is producing `ok` traces, no regressions in error rate.
- Investigating a user-reported error: filter by deployment + status=error, copy the full trace ID into Studio span viewer.
- Tracking an error-rate trend vs. analytics: correlate spike timestamps with trace-level detail.
- Verifying model/deployment behavior after a snapshot pin change (Phase 35 MSEL-02) — look for model-field mismatches in recent traces.

## When NOT to use

- User wants aggregated stats (error rate, p95 latency, cost over time) → use `/orq-agent:analytics` (LCMD-03).
- User needs per-step span drill-down (tool calls, retrieval hits, reasoning tokens) → open the trace in the Studio span viewer via the Open-in-orq.ai link at the bottom of this command's output.
- User wants to react to trace events automatically → use `/orq-agent:automations` (LCMD-06).

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- → `/orq-agent:analytics` — when the user asks for aggregates, hand off rather than paginate traces.
- → Phase 38 trace-failure analysis skill (forward link `TODO(TFAIL)`) — once error rows surface here, that skill will consume the IDs for systematic failure triage.
- ← user invocation — post-deploy spot-check or incident response entry point.
- ← `/orq-agent:deploy` — users naturally run this right after deploying to confirm nothing broke.
- ← `/orq-agent:observability` — producer of identity-tagged traces; once that skill has attached `identity` attributes via `setIdentity()` / `set_identity()`, this command filters the resulting traces per-tenant.

## Done When

- [ ] Terminal shows the `ORQ ► TRACES` banner with the current `--last` window echoed on the banner sub-line.
- [ ] At least one row rendered — or an explicit `No traces matched the filter.` message — with full trace IDs (never truncated).
- [ ] Errors-first ordering observable when both `status=error` and `status=ok` classes are present.
- [ ] `MCP tools used:` footer lists `list_traces` (and `list_spans` if span detail was requested).
- [ ] `Open in orq.ai:` deep link rendered pointing at `https://my.orq.ai/traces`.
- [ ] If `--identity <id>` was passed, the filter was applied (MCP pass-through or client-side fallback), and result rows match the identity attribute; zero-match prints the helpful `No traces matched --identity <id>` hint.

## Destructive Actions

- **None** — this command is read-only (reads Orq.ai traces via MCP).

## Step 1: Parse Arguments

Parse `$ARGUMENTS` for the following long-form flags (no short flags — matches Phase 34 convention). Unknown flags STOP with a usage hint.

| Flag | Required | Default | Purpose |
|------|----------|---------|---------|
| `--deployment <key>` | optional | none | Filter to one deployment key (e.g. `customer-support-triage`). |
| `--status <ok\|error>` | optional | none | Filter by trace status. Accepts exactly `ok` or `error`. |
| `--last <5m\|1h\|24h\|7d\|30d>` | optional | `24h` | Time window. Map to `since=<timestamp>` in the MCP/REST call. |
| `--limit <N>` | optional | `20` | Integer row cap. |
| `--identity <id>` | optional | none | Filter to traces tagged with this per-tenant / per-customer identity attribute. Passed through to MCP `list_traces` as `identity=<id>`. |

Parse rules:

- Flags are long-form only (`--flag value`), matching `/orq-agent:systems` and Phase 34 lint convention.
- If `--last` is provided but not one of `5m|1h|24h|7d|30d`, STOP with: `--last must be one of 5m, 1h, 24h, 7d, 30d (got: <value>)`.
- If `--status` is provided but not `ok` or `error`, STOP with: `--status must be 'ok' or 'error' (got: <value>)`.
- If `--limit` is provided but not a positive integer, STOP with: `--limit must be a positive integer (got: <value>)`.
- If `--identity <id>` is provided, pass it through to the MCP `list_traces` tool as the `identity` parameter (see Step 2). If the MCP response does not expose an `identity` parameter, apply a client-side filter over the returned rows matching `trace.metadata.identity == <id>` OR `trace.attributes.identity == <id>` OR `trace.customer_id == <id>` (identity attribution surface can land on any of these per `/orq-agent:observability` Step 7). If zero rows remain after the client-side filter, print `No traces matched --identity <id> (did you attach identity via /orq-agent:observability?).`

- Unknown flag → STOP and print:

  ```
  Unknown flag: <flag>

  Usage:
    /orq-agent:traces
    /orq-agent:traces --deployment <key>
    /orq-agent:traces --status <ok|error> --last 1h
    /orq-agent:traces --deployment <key> --last 24h --limit 50
  ```

Store the parsed values as `DEPLOYMENT`, `STATUS`, `LAST`, `LIMIT`, `IDENTITY` for use in Step 2.

## Step 2: Fetch Traces

Call the Orq.ai MCP server first. Map `$LAST` to a `since=<ISO-8601 timestamp>` by subtracting the window from now. Build the tool call:

```
mcp__orqai-mcp__list_traces(
  since: <now - LAST, ISO-8601>,
  limit: $LIMIT,
  deployment_key: $DEPLOYMENT,      # omit if unset
  status: $STATUS,                  # omit if unset
  identity: $IDENTITY                # omit if unset -- per-tenant filter (OBSV-07)
)
```

If the MCP tool errors (tool unavailable, auth failure, network timeout), surface the raw error inline (do NOT swallow it) and fall back to REST:

```bash
curl -sS -H "Authorization: Bearer $ORQ_API_KEY" \
  "https://api.orq.ai/v2/traces?limit=${LIMIT}&since=${SINCE}&deployment_key=${DEPLOYMENT}&status=${STATUS}&identity=${IDENTITY}"
```

Omit any query param whose variable is empty. If the REST fallback also fails, STOP and print the error — do NOT fabricate trace rows.

When the MCP tool accepts `identity` natively, rely on server-side filtering. When it does not (older MCP versions), apply the client-side filter documented in Step 1 after fetch — never fabricate trace rows, and never silently drop the filter.

## Step 3: Sort Errors First

Apply a stable sort over the fetched rows:

1. Primary key: `status` — `error` rows come **before** `ok` rows.
2. Secondary key: `started_at` descending (most recent first within each status group).

This ordering is non-negotiable per LCMD-02: errors must be visible without scrolling, even when `ok` rows outnumber them.

## Step 4: Render

Emit the banner. Echo the `--last` window on the sub-line so the user can see at a glance which window is in view:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► TRACES                         last ${LAST}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Then a pipe-separated Markdown table with full trace IDs:

```
| Trace ID | Deployment | Status | Started | Duration | Model |
|----------|------------|--------|---------|----------|-------|
| <full-trace-id> | <deployment-key> | error | 2026-04-20T15:03:11Z | 842ms | claude-sonnet-4-5-20250929 |
| <full-trace-id> | <deployment-key> | ok    | 2026-04-20T15:02:47Z | 611ms | claude-sonnet-4-5-20250929 |
```

Rules for rendering:

- Full trace IDs only — do NOT truncate, do NOT ellipsize, do NOT abbreviate. Let the table overflow horizontally.
- Errors-first rows appear **above** the `ok` rows — observable when both classes are present.
- If the `model` field on a row is not a dated snapshot (Phase 35 MSEL-02), render it verbatim anyway — this command reports what Orq.ai returned; model-pinning enforcement lives in spec-generator / lint, not here.
- If zero rows were fetched, print `No traces matched the filter.` and STOP gracefully (still render the banner + the footer in Step 5).

## Step 5: Print Open-in-orq.ai + MCP Footer

Emit the deep link + MCP-tools footer so the user can one-click into Studio and also see which MCP surface was used:

```
Open in orq.ai:
  https://my.orq.ai/traces

MCP tools used: list_traces
```

If span detail was fetched (e.g. a follow-up `mcp__orqai-mcp__list_spans` call was needed to enrich a row's model/duration), append `, list_spans` to the footer list.

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Truncating trace IDs to save horizontal space | Full IDs are copy-paste targets for Studio / support — let tables overflow; terminal scroll is free, debugging context is not |
| Sorting by timestamp only (errors buried below successes) | Errors-first is non-negotiable per LCMD-02 — stable-sort by status (error before ok), then by timestamp desc |
| Silently dropping `--identity` when MCP does not expose it natively | Fall back to client-side filtering over `trace.metadata.identity` / `trace.attributes.identity` / `trace.customer_id` — never return unfiltered rows when the user asked for a tenant-scoped view |
| Fabricating trace rows when MCP errors | Surface the raw MCP error + the REST fallback attempt inline; never invent trace IDs or timestamps |
| Silently swallowing `--last` parse errors and defaulting | STOP with a helpful usage hint — the user wrote a typo they want to know about |
| Using short flags (`-d`, `-s`) to "save keystrokes" | Long-form only matches Phase 34 convention and keeps help text greppable |

## Open in orq.ai

- **Traces:** https://my.orq.ai/traces
- **Deployments:** https://my.orq.ai/deployments
- **Studio span viewer:** https://my.orq.ai/traces (click any trace row to drill into spans)

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`list_traces`, `list_spans`, `search_entities`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
