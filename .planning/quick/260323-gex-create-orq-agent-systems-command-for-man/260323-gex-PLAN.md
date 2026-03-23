---
phase: quick-260323-gex
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - orq-agent/commands/systems.md
  - orq-agent/SKILL.md
  - orq-agent/commands/help.md
  - README.md
autonomous: true
requirements: [QUICK-260323-GEX]

must_haves:
  truths:
    - "Running /orq-agent:systems with no args lists all systems currently in systems.md"
    - "Running /orq-agent:systems add 'Name' interactively prompts for fields and appends a new system entry to systems.md"
    - "Running /orq-agent:systems remove 'Name' removes the matching system entry from systems.md"
    - "The command appears in help output, SKILL.md index, and README command table"
  artifacts:
    - path: "orq-agent/commands/systems.md"
      provides: "The /orq-agent:systems slash command"
      min_lines: 80
    - path: "orq-agent/SKILL.md"
      provides: "Updated skill index with systems command row"
      contains: "/orq-agent:systems"
    - path: "orq-agent/commands/help.md"
      provides: "Updated help output listing systems command"
      contains: "systems"
    - path: "README.md"
      provides: "Updated command table with systems command"
      contains: "/orq-agent:systems"
  key_links:
    - from: "orq-agent/commands/systems.md"
      to: "orq-agent/systems.md"
      via: "Read tool to parse and Write/Edit tool to modify"
      pattern: "systems\\.md"
---

<objective>
Create the `/orq-agent:systems` command -- an interactive CLI for managing the systems.md registry (list/add/remove IT systems) without manually editing the file.

Purpose: Users currently need to hand-edit systems.md to add/remove systems. This command provides a guided interface that follows the existing command pattern.
Output: New command file + updates to help, SKILL.md, and README.
</objective>

<execution_context>
@/Users/nickcrutzen/.claude/get-shit-done/workflows/execute-plan.md
@/Users/nickcrutzen/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@orq-agent/commands/set-profile.md (exemplar utility command pattern)
@orq-agent/systems.md (current systems registry structure)
@orq-agent/commands/help.md (to update with new command)
@orq-agent/SKILL.md (to update with new command)
@README.md (to update with new command)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create /orq-agent:systems command</name>
  <files>orq-agent/commands/systems.md</files>
  <action>
Create `orq-agent/commands/systems.md` following the exact frontmatter + step-based pattern from `set-profile.md`.

**Frontmatter:**
```yaml
---
description: Manage IT systems registry -- list, add, or remove systems from systems.md
allowed-tools: Read, Write, Bash
argument-hint: [add "Name"|remove "Name"]
---
```

Note: `allowed-tools` includes `Write` (unlike set-profile.md which only needs Read+Bash) because this command modifies systems.md content.

**Command structure (4 steps):**

**Step 1: Locate systems.md**

Read `$HOME/.claude/skills/orq-agent/systems.md`. If not found, display error banner (same ORQ banner style as set-profile.md) saying install is required, and STOP.

Store the file path as `SYSTEMS_PATH` and its content for later use.

**Step 2: Parse Arguments**

Check `$ARGUMENTS` for subcommand:

- **No argument (empty):** Go to Step 3 (list mode).
- **`add "System Name"`:** Go to Step 4a (add mode). Extract the quoted system name.
- **`remove "System Name"`:** Go to Step 4b (remove mode). Extract the quoted system name.
- **Anything else:** Display error banner with usage help and STOP:
  ```
  Unknown subcommand: "[argument]"

  Usage:
    /orq-agent:systems                List all systems
    /orq-agent:systems add "Name"     Add a new system
    /orq-agent:systems remove "Name"  Remove a system
  ```

**Step 3: List Systems (no args)**

Parse systems.md to find all `### ` headings under `## Your Systems`. For each, extract the system name and integration method.

Display as a formatted banner:
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

If no systems found (or only example systems), display:
```
No systems registered yet.

Add your first system:
  /orq-agent:systems add "Your CRM"
```

Note: Treat entries starting with "Example:" as example entries. List them separately with a note "(example -- remove with /orq-agent:systems remove "Example: ...")".

STOP after displaying.

**Step 4a: Add System (add "Name")**

Prompt the user interactively for each field, one at a time. Provide the valid options and sensible defaults:

1. **Integration method** -- ask user to choose: `api`, `browser-automation`, `knowledge-base`, `manual`, `none`. Explain what each means in one line.
2. **URL** -- the system URL. Can be left empty.
3. **API docs** -- only ask if integration method is `api`. Can be left empty.
4. **Auth** -- authentication method (e.g., OAuth2, API key, username/password, SSO, none). Can be left empty.
5. **Notes** -- what agents use this system for. Encourage a brief description.

After collecting all fields, construct the markdown block:
```markdown

### [System Name]
- **Integration method:** [method]
- **URL:** [url]
- **API docs:** [api_docs]  (only if method is api AND user provided value)
- **Auth:** [auth]
- **Notes:** [notes]
```

Omit fields the user left empty (except Integration method which is required). Append the block to the end of systems.md using the Write tool (read current content first, append the new block, write back).

Display success banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SYSTEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Added: [System Name]
  Integration: [method]
  URL: [url]

[N] system(s) now registered.
```

STOP.

**Step 4b: Remove System (remove "Name")**

Search systems.md for a `### ` heading that matches the provided name (case-insensitive). A system entry spans from its `### ` heading to the next `### ` heading (or end of file).

If NOT found, display error:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SYSTEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

System not found: "[Name]"

Registered systems:
  - [list current system names]
```
STOP.

If found, remove the entire system block (heading + all bullet points until next heading or EOF). Also remove any blank line that was left between entries. Write the updated content back to systems.md using the Write tool.

Display success:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SYSTEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Removed: [System Name]

[N] system(s) remaining.
```
STOP.
  </action>
  <verify>
    <automated>test -f orq-agent/commands/systems.md && grep -q "allowed-tools" orq-agent/commands/systems.md && grep -q "Step 1" orq-agent/commands/systems.md && grep -q "Step 2" orq-agent/commands/systems.md && grep -q "Step 3" orq-agent/commands/systems.md && grep -q "Step 4" orq-agent/commands/systems.md && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>
    - systems.md command file exists at orq-agent/commands/systems.md
    - Has correct frontmatter (description, allowed-tools including Write, argument-hint)
    - Implements list mode (no args) with formatted table output
    - Implements add mode with interactive field-by-field prompts
    - Implements remove mode with case-insensitive matching
    - All display output uses the ORQ banner style consistent with set-profile.md
    - References $HOME/.claude/skills/orq-agent/systems.md as the file path
  </done>
</task>

<task type="auto">
  <name>Task 2: Register command in help, SKILL.md, and README</name>
  <files>orq-agent/commands/help.md, orq-agent/SKILL.md, README.md</files>
  <action>
Update three files to register the new /orq-agent:systems command.

**1. orq-agent/commands/help.md**

In the Commands list (Step 2), add the systems command line. Insert it in the Utility section, between `/orq-agent:set-profile` and `/orq-agent:update`:
```
  /orq-agent:systems           Manage IT systems registry
```

Keep the column alignment consistent with existing entries (command left-padded with 2 spaces, description aligned at the same column as other entries).

**2. orq-agent/SKILL.md**

In the `## Commands` section, under the `### V2.0 Commands (Phase 5+)` table, add a new row for the systems command. Place it after the `/orq-agent:set-profile` row:

```
| `/orq-agent:systems` | `commands/systems.md` | any | Manage IT systems registry (list, add, remove) |
```

Also in the `## User Configuration` section at the bottom, the `systems.md` row already exists. No change needed there.

**3. README.md**

In the `### All commands` section, under the **Utility** table, add the systems command row after set-profile:

```
| `/orq-agent:systems` | Manage IT systems registry (list, add, remove entries) |
```

Also update the "When to use which" bullets. Add:
```
- Need to register IT systems? `/orq-agent:systems`
```
Place it before the "Ready to ship" bullet.
  </action>
  <verify>
    <automated>grep -q "systems" orq-agent/commands/help.md && grep -q "orq-agent:systems" orq-agent/SKILL.md && grep -q "orq-agent:systems" README.md && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>
    - help.md lists /orq-agent:systems in the Commands section
    - SKILL.md has a row for /orq-agent:systems in the V2.0 Commands table
    - README.md has /orq-agent:systems in the Utility commands table and the "when to use which" section
    - All formatting is consistent with existing entries in each file
  </done>
</task>

</tasks>

<verification>
- `orq-agent/commands/systems.md` exists and follows the set-profile.md pattern (frontmatter + numbered steps)
- All three registration files (help.md, SKILL.md, README.md) reference /orq-agent:systems
- The command file references the correct systems.md path ($HOME/.claude/skills/orq-agent/systems.md)
- The command handles all three modes: list (no args), add, remove
</verification>

<success_criteria>
- New command file is complete with list/add/remove functionality
- Command is discoverable via /orq-agent:help output
- Command appears in SKILL.md index and README command tables
- All files pass their automated verification checks
</success_criteria>

<output>
After completion, create `.planning/quick/260323-gex-create-orq-agent-systems-command-for-man/260323-gex-SUMMARY.md`
</output>
