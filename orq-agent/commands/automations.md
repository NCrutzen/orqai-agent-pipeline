---
description: List or create Orq.ai Trace Automation rules — auto-kick-off an experiment when new traces match a filter
allowed-tools: Bash, Read, AskUserQuestion, mcp__orqai-mcp__search_entities, mcp__orqai-mcp__list_registry_keys
argument-hint: "[--create]"
---

# Trace Automations

You are running the `/orq-agent:automations` command. This command lists Orq.ai Trace Automation rules or creates a new one that auto-kicks-off an experiment when new traces match a filter.

Follow these steps in order.

## Constraints

- **NEVER** create an automation rule without `AskUserQuestion` confirmation — this writes to Orq.ai.
- **NEVER** fabricate a rule list when MCP errors — surface the error and the REST fallback inline.
- **NEVER** leave the `enabled` flag ambiguous in the rendered list — always show a boolean column.
- **ALWAYS** render the rule list with Name / Filter / Target Dataset / Target Experiment / Enabled columns.
- **ALWAYS** attempt MCP first; fall back to `curl -X {GET,POST} -H "Authorization: Bearer $ORQ_API_KEY" https://api.orq.ai/v2/trace-automations`.

**Why these constraints:** Creating an automation rule is a destructive write to the user's workspace (SKST-08 gate — a misconfigured rule will auto-kick-off experiments on every matching trace). MCP-first discipline keeps this command aligned with PROJECT.md's Key Decision that all Orq.ai data access flows through the MCP server; the REST fallback exists only because the Trace Automations tool catalog may lag, and users need the visible fallback surface to debug.

## When to use

- You want to stand up a production-monitoring loop — new traces matching a filter should auto-trigger a regression experiment (LCMD-06 headline use case).
- You want to re-verify an existing automation is still firing and enabled before a release cut.
- You just deployed a new agent and want to add a rule that kicks off your eval experiment on every error trace it emits.

## When NOT to use

- You want to inspect which traces an existing rule has matched — use `/orq-agent:traces` filtered by the automation's target experiment key instead.
- You want to edit an existing rule (rename, retune the filter, toggle enabled) — Phase 36 only lists + creates; open the Studio trace-automations page for edit/toggle.

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- → `/orq-agent:test` — inspect experiment shape before wiring one into an automation rule.
- → `/orq-agent:traces` — validate your trace-filter expression actually matches the traces you expect BEFORE `--create` wires it to an experiment.
- ← user invocation — entry point (no subagent; this command talks to MCP / REST directly).

## Done When

- [ ] List mode: rules table rendered (Name / Filter / Target Dataset / Target Experiment / Enabled columns) OR `No automations configured.` printed when the workspace has zero rules.
- [ ] Create mode: `AskUserQuestion` confirmation collected before any POST to Orq.ai (SKST-08 gate).
- [ ] Create mode success: new rule ID echoed in the output block.
- [ ] Create mode cancel: rule NOT written; banner prints `Cancelled — no automation created.`
- [ ] `MCP tools used:` footer present on every non-STOP exit path.

## Destructive Actions

The following actions MUST confirm via `AskUserQuestion` before proceeding:

- **Create a new Trace Automation rule** — writes a `POST /v2/trace-automations` request to Orq.ai; the rule will begin matching new traces immediately once enabled. The confirmation prompt renders the full rule summary (name, trace-filter, dataset, experiment) so the user sees exactly what will be written.

## Step 1: Parse Arguments

Read `$ARGUMENTS`:

- **Empty (no args):** Go to Step 2 (list mode).
- **`--create`:** Go to Step 3 (create mode).
- **Anything else:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► AUTOMATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Unknown argument: "[argument]"

Usage:
  /orq-agent:automations            List all Trace Automation rules
  /orq-agent:automations --create   Interactive create flow (AskUserQuestion-gated)
```

## Step 2: List Mode

Call the MCP tool `mcp__orqai-mcp__search_entities` with `type=trace_automation` to list all Trace Automation rules in the current workspace. On MCP error (tool missing / network fault / 4xx-5xx from the MCP server), fall back to REST:

```bash
curl -sS -H "Authorization: Bearer $ORQ_API_KEY" \
  https://api.orq.ai/v2/trace-automations
```

Render the banner + a pipe-separated Markdown table:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► AUTOMATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Name | Filter | Target Dataset | Target Experiment | Enabled |
|------|--------|----------------|-------------------|---------|
| {name} | {filter} | {dataset_key} | {experiment_key} | {true/false} |
...

MCP tools used: search_entities (or REST fallback GET /v2/trace-automations)
Open in orq.ai: https://my.orq.ai/trace-automations  # TODO(LCMD-06) verify canonical path via live MCP
```

If the workspace returns zero rules, print instead:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► AUTOMATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No automations configured.

Create one with /orq-agent:automations --create

MCP tools used: search_entities (or REST fallback GET /v2/trace-automations)
Open in orq.ai: https://my.orq.ai/trace-automations  # TODO(LCMD-06) verify canonical path via live MCP
```

STOP after printing. List mode is read-only — no writes.

## Step 3: Create Mode — Collect Fields

Use `AskUserQuestion` four times, one per field, in this order:

1. **name** — short descriptive name, 3-80 characters. Example: `support-error-regression`.
2. **trace-filter** — a trace-filter expression in Orq.ai syntax. Prompt with inline examples:
   - `deployment_key=customer-support-agent AND status=error`
   - `tag=prod AND status=error`
   - `deployment_key=invoice-extractor AND tag=regression-candidate`
3. **target dataset** — existing dataset key OR the literal string `new` to signal you want to generate one.
   - If the user types `new`, STOP and print: `Stopping — run /orq-agent:datasets to generate the dataset first, then re-run /orq-agent:automations --create and reference the new dataset key.`
4. **experiment** — existing experiment key OR the literal string `new` to signal you want to generate one.
   - If the user types `new`, STOP and print: `Stopping — run /orq-agent:test to generate the experiment first, then re-run /orq-agent:automations --create and reference the new experiment key.`

After collecting all four fields, store them as `{name}`, `{trace-filter}`, `{dataset}`, `{experiment}` and proceed to Step 4.

## Step 4: Confirm

Render the summary block exactly:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► AUTOMATIONS ► CREATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Name:       {name}
 Filter:     {trace-filter}
 Dataset:    {dataset}
 Experiment: {experiment}
```

Then call `AskUserQuestion` with the question: `Create this Trace Automation rule?` and the options `yes` / `no`.

- On `no` → print `Cancelled — no automation created.` and STOP. Do NOT send any POST request.
- On `yes` → proceed to Step 5.

## Step 5: Write Rule

On confirmation, POST the rule. Try MCP first — if the tool `mcp__orqai-mcp__create_trace_automation` exists at invocation time (the MCP server may have added it by the time you run this), call it with the collected fields. Otherwise fall back to REST via curl:

```bash
curl -X POST \
  -H "Authorization: Bearer $ORQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"{name}","filter":"{trace-filter}","dataset_key":"{dataset}","experiment_key":"{experiment}","enabled":true}' \
  https://api.orq.ai/v2/trace-automations
```

On success, print:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► AUTOMATIONS ► CREATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Created automation rule: {rule_id}
  Name: {name}
  Enabled: yes

MCP tools used: search_entities (or REST fallback POST /v2/trace-automations)
Open in orq.ai: https://my.orq.ai/trace-automations  # TODO(LCMD-06) verify canonical path via live MCP
```

On failure (non-2xx response), surface the status code + response body verbatim, do NOT claim success, and recommend re-running after fixing the inputs or API key.

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| POSTing the rule without `AskUserQuestion` confirmation | Always gate the POST on the yes/no prompt in Step 4 — silent writes violate SKST-08 and can create rules the user did not intend |
| Rendering the rule list without the Enabled column | Always include the Enabled boolean — disabled rules look identical to enabled ones in a 4-column table and users act on stale info |
| Accepting `--create` with zero MCP connection and no fallback message | Fail fast with an explicit REST-fallback error that names the endpoint and the env var so the user can diagnose |
| Hiding the REST fallback when the MCP tool is missing from the catalog | Print `MCP tools used: (REST fallback — trace_automation MCP tool not in catalog)` so the user knows which API surface answered |
| Skipping the summary block in Step 4 | The summary is the pre-commit review — removing it leaves the user guessing what the confirmation prompt actually writes |

## Open in orq.ai

- **Trace Automations:** https://my.orq.ai/trace-automations  (TODO(LCMD-06) — confirm canonical path via live MCP; Phase 37 may refine)
- **Traces:** https://my.orq.ai/traces
- **Experiments:** https://my.orq.ai/experiments

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`search_entities`, trace-automations tool if present); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
