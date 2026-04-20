---
description: Manage IT systems registry -- list, add, or remove systems from systems.md
allowed-tools: Read, Write, Bash
argument-hint: [add "Name"|remove "Name"]
---

# Systems Registry Management

You are running the `/orq-agent:systems` command. This command manages the IT systems registry -- list, add, or remove systems from systems.md.

Follow these steps in order.

## Constraints

- **NEVER** add systems without documenting their integration method (MCP / REST / manual).
- **NEVER** remove systems that are referenced by existing swarms without `AskUserQuestion` confirmation.
- **ALWAYS** confirm via `AskUserQuestion` before editing `systems.md`.
- **ALWAYS** keep system entries alphabetical.

**Why these constraints:** Systems registry is consumed by architect and tool-resolver — silent edits break downstream blueprints. Alphabetical ordering minimizes merge conflicts.

## When to use

- User wants to list the registered IT systems for the current install.
- User wants to add a new system so architect / tool-resolver know about it.
- User wants to remove an outdated or example system.

## When NOT to use

- User wants to configure agents for a system that doesn't exist yet → run `/orq-agent` to design the swarm first; adding the system here is a pre-step.
- User wants to connect to an Orq.ai entity → use `/orq-agent:deploy` or `/orq-agent:kb`; this command only edits the local registry.

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- No subagent — this command edits `orq-agent/systems.md` directly.
- ← referenced by `architect`, `deployer`, `tool-resolver` subagents via `<files_to_read>`
- ← user invocation — local-only registry edit

## Done When

- [ ] List mode: every registered user system appears in the banner table with its integration method
- [ ] Add mode: new `### [System Name]` block appended to `systems.md` with required `**Integration method:**` bullet
- [ ] Remove mode: system block removed cleanly (no stray blank lines) and count of remaining systems displayed
- [ ] `systems.md` file unchanged on any STOP-before-write path

## Destructive Actions

The following actions MUST confirm via `AskUserQuestion` before proceeding:

- **Edit `orq-agent/systems.md`** — add or remove operations modify local config consumed by multiple skills; confirm before write.
- **Remove a user-added system** — the block and all its fields are dropped; confirm before removing since downstream blueprints may already reference it.

## Step 1: Locate systems.md

Read the systems registry file:

```bash
cat "$HOME/.claude/skills/orq-agent/systems.md" 2>/dev/null || echo "SYSTEMS_NOT_FOUND"
```

**If SYSTEMS_NOT_FOUND:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SYSTEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Install required. Run the orq-agent install script first.

  curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

**If file exists:** Store the file path as `SYSTEMS_PATH` (`$HOME/.claude/skills/orq-agent/systems.md`) and its content for later use. Proceed to Step 2.

## Step 2: Parse Arguments

Check `$ARGUMENTS` for a subcommand:

- **No argument (empty):** Go to Step 3 (list mode).
- **`add "System Name"`:** Go to Step 4a (add mode). Extract the quoted system name.
- **`remove "System Name"`:** Go to Step 4b (remove mode). Extract the quoted system name.
- **Anything else:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SYSTEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Unknown subcommand: "[argument]"

Usage:
  /orq-agent:systems                List all systems
  /orq-agent:systems add "Name"     Add a new system
  /orq-agent:systems remove "Name"  Remove a system
```

## Step 3: List Systems (no args)

Parse the systems.md content to find all `### ` headings under the `## Your Systems` section. For each heading, extract the system name and its integration method (from the `**Integration method:**` bullet).

Separate entries into two groups:
1. **Example entries** -- headings that start with `Example:` (e.g., `### Example: CRM System`)
2. **User entries** -- all other headings

**If user entries exist,** display them in a formatted banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SYSTEMS REGISTRY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  System Name              Integration
  ────────────────────     ──────────────
  [name]                   [method]
  [name]                   [method]
  ...

[N] system(s) registered.

Manage:
  /orq-agent:systems add "Name"     Add a system
  /orq-agent:systems remove "Name"  Remove a system
```

If example entries also exist, append after the manage section:

```
Example entries (remove with /orq-agent:systems remove "Example: ..."):
  - [example name]
  - [example name]
```

**If no user entries exist but example entries exist,** display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SYSTEMS REGISTRY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No systems registered yet.

Example entries are present (remove with /orq-agent:systems remove "Example: ..."):
  - [example name]
  - [example name]

Add your first system:
  /orq-agent:systems add "Your CRM"
```

**If no entries exist at all,** display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SYSTEMS REGISTRY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No systems registered yet.

Add your first system:
  /orq-agent:systems add "Your CRM"
```

STOP after displaying.

## Step 4a: Add System (add "Name")

Prompt the user interactively for each field, one at a time. Display the banner first:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SYSTEMS ► ADD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Adding system: [System Name]
```

Then ask for each field one at a time:

1. **Integration method** -- ask the user to choose one of: `api`, `browser-automation`, `knowledge-base`, `manual`, `none`.
   Explain each option briefly:
   - `api` -- System has a REST/GraphQL API you can call programmatically
   - `browser-automation` -- No API; agents interact via browser (Playwright/Browserless)
   - `knowledge-base` -- Content uploaded to Orq.ai Knowledge Base for retrieval
   - `manual` -- Requires human action; agent generates a request for staff
   - `none` -- Reference only; no agent integration planned yet

2. **URL** -- the system URL. Can be left empty.

3. **API docs** -- only ask this if the integration method is `api`. URL to API documentation. Can be left empty.

4. **Auth** -- authentication method (e.g., OAuth2, API key, username/password, SSO, none). Can be left empty.

5. **Notes** -- what agents use this system for. Encourage a brief description. Can be left empty.

After collecting all fields, construct the markdown block:

```markdown

### [System Name]
- **Integration method:** [method]
- **URL:** [url]
- **API docs:** [api_docs]
- **Auth:** [auth]
- **Notes:** [notes]
```

Rules for the block:
- Always include **Integration method** (it is required).
- Omit **URL** if the user left it empty.
- Omit **API docs** if the method is not `api`, or if the user left it empty.
- Omit **Auth** if the user left it empty.
- Omit **Notes** if the user left it empty.

Read the current content of `SYSTEMS_PATH`, append the new block to the end of the file, and write it back using the Write tool.

Then count the total number of user entries (non-example `### ` headings under `## Your Systems`) in the updated file.

Display success:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SYSTEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Added: [System Name]
  Integration: [method]
  URL: [url]

[N] system(s) now registered.
```

Only show the URL line if the user provided one.

STOP.

## Step 4b: Remove System (remove "Name")

Search the systems.md content for a `### ` heading whose name matches the provided name (case-insensitive comparison). A system entry spans from its `### ` heading to the next `### ` heading or end of file.

**If NOT found,** list the available system names and display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SYSTEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

System not found: "[Name]"

Registered systems:
  - [list current system names]
```

STOP.

**If found,** remove the entire system block: the `### ` heading line and all lines until the next `### ` heading or end of file. Also remove any extra blank lines left between entries (collapse to a single blank line between entries). Read the current content of `SYSTEMS_PATH`, remove the matching block, and write the result back using the Write tool.

Count the remaining entries (all `### ` headings under `## Your Systems`).

Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SYSTEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Removed: [System Name]

[N] system(s) remaining.
```

STOP.

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Adding a system without an integration method | Always record MCP / REST / manual — downstream subagents depend on the method field |
| Removing an example entry silently to "clean up" | The example entries are discoverable documentation; remove only if the user explicitly asks |
| Editing `systems.md` by hand without going through this command | Loses the validation, ordering, and confirm step; use the command |
| Listing systems without user entries and showing an empty screen | Always surface the example entries + next-step hint when no user entries exist |

## Open in orq.ai

- **N/A** — this skill manages local configuration only (no Orq.ai entities involved)

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`search_entities`, `get_agent`, `models-list`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
