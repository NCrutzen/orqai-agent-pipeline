# Phase 11: Flag Conventions + Tech Debt Cleanup - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Align CLI flag conventions across all orq-agent commands and resolve carried-forward tech debt from v0.3. This includes 4 explicit success criteria items plus a full consistency audit of the orq-agent/ directory. No new capabilities — only fixes and alignment.

</domain>

<decisions>
## Implementation Decisions

### Flag convention (--agent)
- All commands that accept an agent-key argument must use `--agent agent-key` flag syntax exclusively
- Remove positional argument support from test.md and iterate.md (currently support both)
- Fix harden.md to use `--agent` flag instead of positional `[agent-key]`
- Remove all backward compatibility notes — clean removal, no migration notes (these are prompt files, not user-facing APIs)
- Update SKILL.md command table to reflect the `--agent` flag convention

### Step numbering (orq-agent.md)
- Renumber sequentially: Step 5.5 (Tool Resolver) → Step 5, Step 5 (Pipeline) → Step 6, Step 6 (Summary) → Step 7
- Internal references use plain "Step N" format (no parenthetical descriptions like "Step 5 (Tool Resolver)")
- Scan and update ALL cross-file references to step numbers (not just orq-agent.md)

### files_to_read completeness
- Add TOOLS.md to Wave 3 `files_to_read` for dataset-generator and readme-generator subagents
- Add agentic-patterns.md to orchestration-generator `files_to_read`
- Audit ALL subagent files_to_read lists for completeness (architect, researcher, spec-gen, orchestration-gen, dataset-gen, readme-gen, hardener)

### Consistency sweep scope
- Full audit of entire orq-agent/ directory: flag conventions, file references, step numbering, template usage, naming patterns
- Fix everything found in one pass — don't just log findings, fix them
- No separate findings report — research and fix integrated into execution

### Claude's Discretion
- Prioritization order when multiple issues found
- Whether minor stylistic inconsistencies warrant fixing
- Exact wording of updated command format descriptions

</decisions>

<specifics>
## Specific Ideas

No specific requirements — the success criteria are concrete and well-defined. The user wants a thorough single-pass cleanup, not a minimal fix.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- deploy.md: Reference implementation for `--agent` flag convention (flag-only, no positional)
- test.md/iterate.md: Show the dual-support pattern that needs to be removed

### Established Patterns
- Command format documented in a dedicated section near step that parses arguments
- `files_to_read` is a YAML-style frontmatter-adjacent block at top of each subagent file
- Step numbering follows `## Step N: Name` heading convention with internal cross-references

### Integration Points
- orq-agent.md orchestrator: References step numbers throughout Wave 1, Wave 2, Wave 3 pipeline
- SKILL.md: Index of all commands — must reflect flag convention changes
- Subagent files: Each has `files_to_read` block that feeds into Task tool spawning

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-flag-conventions-tech-debt*
*Context gathered: 2026-03-02*
