---
description: List Orq.ai Model Garden models grouped by provider, broken out by type (chat / embedding / image / rerank / speech / completion)
allowed-tools: Bash, Read, mcp__orqai-mcp__list_models, mcp__orqai-mcp__search_entities
argument-hint: "[search-term]"
---

# Model Garden Lookup

You are running the `/orq-agent:models` command. This command lists Orq.ai Model Garden models — read-only via MCP, grouped by provider and broken out by type (chat / embedding / image / rerank / speech / completion), with an optional positional `[search-term]` filter applied as a case-insensitive substring match on the model id.

## Constraints

- **NEVER** mutate model activation state — this command is read-only (no POST/PATCH/DELETE calls, no Studio-side toggles).
- **NEVER** show deprecated model IDs without an explicit `(deprecated)` flag annotation on the row.
- **NEVER** print a floating alias (e.g., `claude-sonnet-latest`, `gpt-4o-latest`, `mistral-large-beta`) as an example model id; always use a dated snapshot such as `claude-sonnet-4-5-20250929` or `gpt-4o-2024-11-20` (Phase 35 MSEL-02).
- **ALWAYS** group output in the provider → type → model-row hierarchy.
- **ALWAYS** call `mcp__orqai-mcp__list_models` first; fall back to `mcp__orqai-mcp__search_entities type=model` or to the REST endpoint `GET /v2/models` only on MCP failure.

**Why these constraints:** This command is the main surface for checking Model Garden availability from Claude Code. Snapshot pinning (MSEL-02) prevents silent model drift in downstream specs — if a user copies a shown example model id into an agent spec, that id must already be a dated snapshot so the lint rule and the runtime behavior stay aligned. Provider → type grouping matches how Studio presents the Model Garden and how the reference doc `orq-agent/references/orqai-model-catalog.md` is organized, so the mental model transfers cleanly.

## When to use

- User is about to wire a model into an agent spec and wants to confirm the dated snapshot is available in the workspace before deploy.
- User wants to see which provider surfaces cover a specific use-case type (e.g., all rerank models across providers, or every embedding model available).
- Post-activation smoke check: user just enabled a model in Studio and wants to see it listed alongside its peers from the terminal.
- User is comparing two providers' chat snapshots side-by-side before choosing a primary and fallback.
- User wants to verify that a search term (e.g., `gpt-4o`, `claude-sonnet`, `embed-3`) has multiple current dated snapshots, not just the floating alias.

## When NOT to use

- User wants to **activate** a model (toggle it on/off) → go to Studio Model Garden (`https://my.orq.ai/model-garden`); this command is strictly read-only.
- User wants a **recommendation** for a specific use case (e.g., "which model should I pick for customer-support triage?") → run `/orq-agent:research` or invoke the researcher subagent; this command lists catalog state, not decisions.
- User wants the researcher's capable-tier lookup (Phase 35 MSEL-01 seed table) → read `orq-agent/references/orqai-model-catalog.md` §Capable Tier Lookup; that table is the prescriptive subset, this command is the catalog dump.

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- → `/orq-agent:research` for model recommendations (this command shows what's available; researcher decides what's appropriate).
- → `/orq-agent:workspace` for a broader workspace-scope overview (projects, deployments, models, knowledge bases together).
- → `orq-agent/agents/spec-generator.md` consumes dated snapshot ids when emitting the `model:` field of an agent spec (MSEL-02 enforcement point).
- ← user invocation — discovery-time lookup, no upstream caller.

## Done When

- [ ] Terminal shows the `ORQ ► MODELS` banner
- [ ] Output is grouped by provider (H3) then by type (H4) then by model rows (table)
- [ ] Search term (when provided) is echoed in the banner sub-line and actually filters the listing
- [ ] `MCP tools used:` footer lists `list_models` (and any fallback tool invoked)
- [ ] `Open in orq.ai:` block renders the `https://my.orq.ai/model-garden` link
- [ ] No floating-alias model ids appear in prose — every example uses a dated snapshot (MSEL-02 lint clean)

## Destructive Actions

- **None** — this command is read-only (reads Orq.ai Model Garden via MCP).

## Step 1: Parse Argument

Read `$ARGUMENTS` and treat the full trimmed string as the optional positional `[search-term]` filter.

- Empty or whitespace-only → unfiltered listing. Set `SEARCH_TERM=""`.
- Non-empty → `SEARCH_TERM="<trimmed-string>"`; match will be case-insensitive substring against each model's `id` / `model` / `name` field.

Do NOT interpret the argument as a flag. There are no flags on this command — only one positional term. If the user passed something that looks like a flag (starts with `--`), surface a short usage hint and still run unfiltered (treat the literal string as the search term if it clearly isn't a known flag; otherwise default to unfiltered).

Echo the parsed term back to the user as a single line before proceeding:

```
Filter: {SEARCH_TERM or "(none — listing full catalog)"}
```

## Step 2: Fetch Model Catalog

Call the Orq.ai MCP `list_models` tool first:

```
mcp__orqai-mcp__list_models
```

If the MCP tool returns an error (not connected, tool missing, auth failure), try the alternate MCP path:

```
mcp__orqai-mcp__search_entities type=model
```

If both MCP paths fail, fall back to REST:

```bash
curl -sf -H "Authorization: Bearer $ORQ_API_KEY" "https://api.orq.ai/v2/models"
```

Record which tool(s) succeeded — this drives the `MCP tools used:` footer in Step 6. If REST was the only path that worked, surface that explicitly (`MCP tools used: (MCP unreachable — REST fallback only)`).

> **Warning (preserved from `orq-agent/references/orqai-model-catalog.md`):** `list_models` returns **all** catalog models across providers, not only models activated in the current workspace. Render the `activated` column honestly if the payload carries it; if the payload does not carry activation state, label the column header `Activated` and show `?` in each row rather than omitting the column — that keeps the user aware of the limitation.

## Step 3: Group Results

Bucket the returned model records by `provider` (top-level), then by `type` (second-level). Render types in this fixed order under each provider, omitting any type with zero models after filtering:

1. `chat`
2. `embedding`
3. `image`
4. `rerank`
5. `speech`
6. `completion`
7. `Other` — catch-all for any type key not in the list above (e.g., `audio-transcription`, `moderation`, future additions). Render these under a single H4 `Other` subsection rather than creating many rare-type H4s.

Within each type, sort models alphabetically by `id`. If two ids differ only by a trailing date snapshot (e.g., `gpt-4o-2024-08-06` vs `gpt-4o-2024-11-20`), the alphabetical sort will naturally place the newer snapshot last — that is the intended order.

## Step 4: Apply Filter (optional)

If `SEARCH_TERM` is non-empty, keep only models whose `id` (or `model`, depending on payload shape) **contains** `SEARCH_TERM` as a case-insensitive substring. After filtering:

- Drop any type subsection whose rows all got filtered out.
- Drop any provider whose type subsections all got filtered out.
- If the final result set is empty, display a single-line "no matches" message after the banner and skip the per-provider rendering:

```
No models match filter: "{SEARCH_TERM}".
```

Still print the footer (Step 6) with the Open-in link and MCP tools used so the user has the next action handy.

## Step 5: Render

Print the banner first. When a filter is active, surface it on the right side of the banner; otherwise leave the right-side slot blank.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► MODELS                         [filter {term}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Then, for each provider (alphabetical), emit a provider H3 and one H4 per present type. Suggested column shape (Claude's Discretion per Phase 36 CONTEXT — adjust per payload fields actually returned, but keep `Model ID` and `Activated` columns load-bearing):

```
### OpenAI

#### chat
| Model ID | Activated | Context | Cost (in/out per 1K) |
|---|---|---|---|
| gpt-4o-2024-11-20 | yes | 128K | $0.0025 / $0.010 |
| gpt-4o-mini-2024-07-18 | yes | 128K | $0.00015 / $0.0006 |

#### embedding
| Model ID | Activated | Dimensions | Cost (per 1K tokens) |
|---|---|---|---|
| text-embedding-3-large | yes | 3072 | $0.00013 |

### Anthropic

#### chat
| Model ID | Activated | Context | Cost (in/out per 1K) |
|---|---|---|---|
| claude-sonnet-4-5-20250929 | yes | 200K | $0.003 / $0.015 |
| claude-haiku-4-5-20251001 | yes | 200K | $0.001 / $0.005 |
```

Column-level guidance:

- **Model ID:** always the dated snapshot form when present in the payload; never substitute a floating alias for display.
- **Activated:** `yes` / `no` / `?` (unknown — payload did not carry activation state).
- **Context / Dimensions / Duration:** type-appropriate capacity column (chat → context window, embedding → dimensions, speech → max duration, image → max resolution). Omit the column entirely when no payload field maps to it cleanly.
- **Cost:** render as shown in the payload; if the payload does not carry pricing, omit the column rather than guess.
- **Deprecated flag:** if a row is deprecated, append ` (deprecated)` to the Model ID cell — never hide the row.

If the filter narrowed results to a single provider/type, still emit the H3 and H4 — one-row tables are preferable to squashing the hierarchy.

## Step 6: Print Open-in-orq.ai + MCP Footer

End the output with a two-block footer. Leave one blank line between the last provider's table and the footer, and one blank line between the two footer blocks.

```
Open in orq.ai:
  https://my.orq.ai/model-garden

MCP tools used: list_models
```

If the alternate MCP tool or REST fallback was used, extend the second line:

- Only `search_entities` succeeded: `MCP tools used: search_entities (type=model) — list_models unavailable`
- Only REST succeeded: `MCP tools used: (MCP unreachable — REST fallback GET /v2/models)`
- Both MCP tools used (e.g., `list_models` primary + `search_entities` for enrichment): `MCP tools used: list_models, search_entities`

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Printing `claude-sonnet-latest` or `gpt-4o-latest` as an example model id | Always use a dated snapshot such as `claude-sonnet-4-5-20250929` or `gpt-4o-2024-11-20` (MSEL-02 — floating aliases drift silently under the user) |
| Flattening the output into one big table without provider/type grouping | Users scan by provider first; preserve the provider H3 → type H4 → table hierarchy so the mental model matches Studio's Model Garden page |
| Omitting the `Activated` column because the payload did not carry it | Keep the column and show `?` — the user needs to see activation state is unknown, not assume it is "yes" |
| Hiding deprecated models silently because they are "noisy" | Render them with an explicit ` (deprecated)` annotation on the Model ID cell — users need to see which snapshots are expiring before they pin them into specs |
| Treating a flag-looking argument (e.g., `--chat`) as a real flag | This command takes only a single positional `[search-term]`; if the argument looks like a flag, surface a short usage hint and either run unfiltered or treat the literal string as a search term |

## Open in orq.ai

- **Model Garden:** https://my.orq.ai/model-garden
- **Agents:** https://my.orq.ai/agents

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`list_models`, `search_entities`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
