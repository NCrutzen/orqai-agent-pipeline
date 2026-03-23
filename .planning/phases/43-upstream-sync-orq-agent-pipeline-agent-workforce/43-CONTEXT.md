# Phase 43: Upstream Sync: orq-agent-pipeline → agent-workforce - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

The web pipeline automatically stays in sync with the orqai-agent-pipeline GitHub repo. A daily cron detects upstream changes (new/renamed/deleted agent files, structural prompt changes, new context requirements), classifies them by impact tier, and propagates updates. PIPELINE_STAGES becomes dynamic (driven by a version-controlled manifest), the architect stage receives systems registry context, and breaking changes block the pipeline until resolved. New agents added to the pipeline repo are surfaced and integrated without manual discovery.

</domain>

<decisions>
## Implementation Decisions

### Change detection method
- Vercel Cron (daily) — hits a Next.js API route that calls GitHub API to compare upstream state against the local manifest
- NOT Inngest — existing Inngest functions stay as-is for durable pipeline execution, but a simple periodic check doesn't need durable function infrastructure
- Daily frequency is sufficient — pipeline repo changes are infrequent in practice, team can wait until next morning
- Cron route fetches the `agents/` directory listing + content hashes from GitHub API, compares against `pipeline-manifest.json`

### Manifest & contract tracking
- Full structural contract tracked in `web/lib/pipeline/pipeline-manifest.json` (version-controlled in agent-workforce repo)
- Manifest tracks per agent: file path, content SHA, expected input XML tags, output format patterns, frontmatter fields (model, files_to_read)
- JSON file is the source of truth — diffable in PRs, easy to review
- Mismatches surfaced via BOTH: health dashboard (Pipeline Sync section on /settings/health) AND auto-created GitHub issue in agent-workforce repo
- Health dashboard shows green when in sync, amber for Tier 1-2 drift, red for Tier 3 breaking changes

### Impact tier classification
- **Tier 0 (Transparent):** Prompt content changes within existing structure — no manifest update needed, runtime fetch picks up automatically
- **Tier 1 (Monitor):** Changes to `references/`, `templates/`, `commands/`, docs — logged on health dashboard, no action required
- **Tier 2 (Review):** Changes to `agents/*.md` structure (new input tags, output format changes, frontmatter changes) — GitHub issue created, manifest update needed
- **Tier 3 (Breaking):** New/renamed/deleted agent files, new stages, new context requirements — pipeline blocked, GitHub issue created with impact analysis

### Auto-update behavior
- PIPELINE_STAGES becomes dynamic — reads from `pipeline-manifest.json` at startup instead of being hardcoded in `stages.ts`
- When cron detects new agents: auto-updates `pipeline-manifest.json` (commits to a branch, opens PR), creates GitHub issue for visibility. New agents available after PR merge
- Convention-based context mapping for new agents: new agents automatically receive `{useCase + all prior stage outputs}` as context. Manifest can optionally specify which prior stages to include
- Tier 3 breaking changes (agent renamed/deleted): pipeline blocks all new runs, health dashboard shows red, forces resolution before users hit 404 errors at runtime

### Systems.md passthrough
- Before calling architect stage, query the project's linked systems from DB and serialize to markdown matching `systems.md` format
- Pass serialized systems as a `<systems>` context tag in the user message — architect prompt works identically to CLI
- Systems can be linked in BOTH project settings AND at pipeline start time (with option to add new systems inline in both places)
- When architect detects a system from the use case that isn't in the registry: pipeline pauses at a HITL checkpoint via the terminal panel, user adds the system inline, pipeline resumes with updated context
- This follows the conversational terminal panel pattern from Phase 40 — the pipeline "asks" the user to add the missing system

### Claude's Discretion
- Manifest JSON schema design (exact field names and structure)
- GitHub API pagination and rate limiting strategy
- Health dashboard UI layout for Pipeline Sync section
- GitHub issue template format and labeling
- PR branch naming convention for auto-updates
- Convention-based context mapping implementation (how to determine which prior stages to include by default)
- System serialization format details (matching systems.md markdown structure)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline integration (primary modification targets)
- `web/lib/pipeline/stages.ts` — Current hardcoded PIPELINE_STAGES array and STAGE_CONTEXT_MAP. Will be refactored to read from manifest
- `web/lib/pipeline/adapter.ts` — Prompt adapter that fetches .md files and builds context. Needs systems context injection
- `web/lib/inngest/functions/pipeline.ts` — Main pipeline function with STAGE_CONTEXT_MAP (lines 29-60). Context building needs to support dynamic stages + systems passthrough
- `web/lib/pipeline/graph-mapper.ts` — Parses architect output for graph visualization. Output format contract must be tracked in manifest

### Health dashboard (extend existing)
- `web/components/health/health-dashboard.tsx` — Existing health dashboard from Phase 39. Add Pipeline Sync section
- `web/app/(dashboard)/settings/page.tsx` — Settings page with tabs (Credentials, Systems, Health)

### Upstream repo structure
- `https://github.com/NCrutzen/orqai-agent-pipeline` — Source repo. `orq-agent/agents/*.md` are the files we track
- `orq-agent/SKILL.md` — Directory structure reference for understanding which files matter
- `orq-agent/systems.md` — Systems registry template (markdown format our serialization must match)
- `orq-agent/agents/architect.md` — Contains `<systems_awareness>` section showing how architect uses systems data

### Phase 40 context (systems registry)
- `.planning/phases/40-detection-sop-upload-vision-analysis/40-CONTEXT.md` — DB-backed systems registry, terminal panel interaction model, HITL checkpoint pattern

### Phase 39 context (health dashboard)
- `.planning/phases/39-infrastructure-credential-foundation/39-CONTEXT.md` — Health dashboard pattern, credential vault with global-with-project-linking

### Requirements
- `.planning/REQUIREMENTS.md` — Existing pipeline and dashboard requirements for context

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/components/health/health-dashboard.tsx`: Health dashboard component — extend with Pipeline Sync section
- `web/lib/supabase/broadcast.ts`: Broadcast utilities — reuse for real-time sync status updates
- `web/app/api/inngest/route.ts`: Existing API route pattern — reference for Vercel Cron API route
- `web/lib/pipeline/errors.ts`: Error classification and mapping — extend with sync-related error codes
- `web/components/ui/*`: Full shadcn/ui library

### Established Patterns
- Vercel API routes for server-side operations
- Supabase admin client for server-side mutations
- Settings page tabs pattern (Credentials, Systems, Health) — add Pipeline Sync or extend Health
- Global-with-project-linking for systems (Phase 40) — systems passthrough builds on this
- Terminal panel HITL checkpoints (Phase 40) — new system detection uses this pattern

### Integration Points
- `web/lib/pipeline/stages.ts` — Refactor from hardcoded array to manifest-driven
- `web/lib/inngest/functions/pipeline.ts` — Add systems context to STAGE_CONTEXT_MAP, support dynamic stages
- `web/lib/pipeline/adapter.ts` — Inject systems context before calling architect
- `vercel.json` — Add cron job configuration
- New API route for cron endpoint (e.g., `web/app/api/cron/upstream-sync/route.ts`)
- Health dashboard — Add Pipeline Sync section

</code_context>

<specifics>
## Specific Ideas

- The manifest approach means PIPELINE_STAGES is no longer a hardcoded TypeScript array — it becomes data-driven. This is the key architectural shift that enables future agents to be added without code changes
- Systems passthrough closes the gap between CLI and web: CLI reads systems.md as a file, web serializes DB records to the same format. Architect prompt doesn't know the difference
- The HITL checkpoint for unknown systems follows the Phase 40 terminal panel pattern — the pipeline "talks" to the user: "I detected System X in your use case but it's not in the registry. Want to add it now?"
- Daily cron is pragmatic — the pipeline repo had 20 commits today but that was an unusual burst. In steady state, changes are infrequent
- The user mentioned that the whole pipeline flow should be a "conversational list of things that need to be done" — this phase's HITL for system detection fits that vision

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 43-upstream-sync-orq-agent-pipeline-agent-workforce*
*Context gathered: 2026-03-23*
