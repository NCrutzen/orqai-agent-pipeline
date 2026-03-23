# Phase 43: Upstream Sync: orq-agent-pipeline -> agent-workforce - Research

**Researched:** 2026-03-23
**Domain:** GitHub API change detection, Vercel Cron, manifest-driven pipeline, systems context passthrough
**Confidence:** HIGH

## Summary

This phase transforms the pipeline from hardcoded stages to a manifest-driven architecture, adds daily change detection against the upstream GitHub repo, and injects systems registry context into the architect stage. The codebase is well-structured for these changes: `stages.ts` has a clean `PIPELINE_STAGES` array and `PipelineStage` interface, `adapter.ts` builds context as XML-tagged key-value pairs, and the health dashboard component follows a reusable card pattern that can be extended.

The upstream repo (`NCrutzen/orqai-agent-pipeline`) contains 17 agent files in `orq-agent/agents/`, of which only 7 are currently used by the web pipeline. The GitHub Contents API returns file SHAs (git blob hashes) that serve as natural content hashes for change detection. The GitHub Trees API (`/git/trees/main?recursive=1`) provides the most efficient single-request listing of all files with SHAs.

Vercel Cron is the right tool for daily checks -- it requires only a `vercel.json` crons config and a secured API route. No additional dependencies needed. The `CRON_SECRET` environment variable pattern is the official Vercel approach for securing cron endpoints.

**Primary recommendation:** Build the manifest as a JSON file that mirrors the upstream repo structure, use GitHub Trees API for efficient comparison, and refactor `PIPELINE_STAGES` to read from the manifest at import time. Systems context injection is a straightforward addition to the adapter's context-building logic.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Change detection method:** Vercel Cron (daily) hitting a Next.js API route that calls GitHub API to compare upstream state against local manifest. NOT Inngest.
- **Manifest location:** `web/lib/pipeline/pipeline-manifest.json` (version-controlled in agent-workforce repo)
- **Manifest tracks per agent:** file path, content SHA, expected input XML tags, output format patterns, frontmatter fields (model, files_to_read)
- **Mismatches surfaced via:** health dashboard (Pipeline Sync section on /settings/health) AND auto-created GitHub issue in agent-workforce repo
- **Impact tier classification:** Tier 0 (transparent, prompt content changes), Tier 1 (monitor, references/templates/commands/docs), Tier 2 (review, agent structure changes), Tier 3 (breaking, new/renamed/deleted agents)
- **PIPELINE_STAGES becomes dynamic:** reads from `pipeline-manifest.json` at startup instead of hardcoded `stages.ts`
- **Auto-update for new agents:** commits to a branch, opens PR, creates GitHub issue
- **Convention-based context mapping:** new agents automatically receive `{useCase + all prior stage outputs}`, manifest can optionally specify which prior stages to include
- **Tier 3 breaking changes:** pipeline blocks all new runs, health dashboard shows red
- **Systems.md passthrough:** query project-linked systems from DB, serialize to markdown matching systems.md format, pass as `<systems>` tag to architect
- **Systems HITL checkpoint:** pipeline pauses when architect detects unknown system, user adds inline via terminal panel, pipeline resumes

### Claude's Discretion
- Manifest JSON schema design (exact field names and structure)
- GitHub API pagination and rate limiting strategy
- Health dashboard UI layout for Pipeline Sync section
- GitHub issue template format and labeling
- PR branch naming convention for auto-updates
- Convention-based context mapping implementation
- System serialization format details

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REQ-1 | Pipeline manifest tracking expected file paths, input context tags, and output format contracts | Manifest JSON schema design, GitHub Trees API for SHA tracking, gray-matter for frontmatter parsing |
| REQ-2 | Change detection that classifies upstream diffs by impact tier | GitHub Trees API comparison against manifest SHAs, path-based tier classification logic |
| REQ-3 | Auto-update PIPELINE_STAGES + STAGE_CONTEXT_MAP when agents are added/removed | Manifest-driven stages.ts refactor, dynamic STAGE_CONTEXT_MAP with convention-based defaults |
| REQ-4 | Pass systems.md content as context to architect stage | Systems DB query, markdown serialization matching upstream systems.md format, adapter context injection |
| REQ-5 | GitHub webhook or scheduled check that creates issues/PRs for tier 2-3 changes | Vercel Cron + GitHub API (create issue, create branch + commit + PR) |
| REQ-6 | Support future iterations -- new pipeline agents surfaced without manual discovery | Manifest comparison flags unknown agents, auto-PR adds them to manifest |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.1.6 | API route for cron endpoint | Already in project |
| @octokit/rest or gh CLI pattern | N/A | GitHub API calls | Use raw fetch -- no extra dependency needed, GitHub REST API is straightforward |
| gray-matter | 4.0.3 | Parse agent .md frontmatter for manifest generation | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vercel Cron | N/A | Daily scheduled check | Platform feature, configured via vercel.json |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw fetch for GitHub API | @octokit/rest | Adds dependency; raw fetch is sufficient for 3-4 endpoints |
| Vercel Cron | Inngest cron | User explicitly decided against Inngest for this use case |
| JSON manifest file | DB table | User decided on version-controlled JSON for diffability in PRs |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
web/
├── lib/pipeline/
│   ├── pipeline-manifest.json     # NEW: source of truth for stages
│   ├── stages.ts                  # REFACTOR: reads from manifest
│   ├── adapter.ts                 # MODIFY: inject systems context
│   ├── manifest-sync.ts           # NEW: GitHub comparison + tier classification
│   ├── systems-serializer.ts      # NEW: DB systems -> markdown format
│   └── errors.ts                  # EXTEND: sync-related error codes
├── app/api/cron/
│   └── upstream-sync/route.ts     # NEW: Vercel Cron endpoint
├── components/health/
│   ├── health-dashboard.tsx       # EXTEND: add Pipeline Sync section
│   └── pipeline-sync-card.tsx     # NEW: sync status card component
└── ...
```

### Pattern 1: Manifest-Driven Stage Loading
**What:** Replace hardcoded `PIPELINE_STAGES` array with a function that reads `pipeline-manifest.json` and converts to `PipelineStage[]`.
**When to use:** At module load time in `stages.ts`.
**Example:**
```typescript
// web/lib/pipeline/stages.ts (refactored)
import manifestData from "./pipeline-manifest.json";

interface ManifestAgent {
  name: string;
  mdFile: string;
  displayName: string;
  stepOrder: number;
  needsApproval?: boolean;
  needsReview?: boolean;
  sha: string;
  inputTags: string[];
  outputFormat?: string;
  frontmatter?: { model?: string; files_to_read?: string[] };
  contextSources?: string[]; // which prior stages to include
}

interface PipelineManifest {
  version: string;
  lastSync: string;
  repoOwner: string;
  repoName: string;
  basePath: string;
  agents: ManifestAgent[];
  trackedPaths: Array<{ path: string; sha: string; tier: number }>;
}

const manifest: PipelineManifest = manifestData as PipelineManifest;

export const PIPELINE_STAGES: PipelineStage[] = manifest.agents
  .filter(a => a.stepOrder > 0) // Only active pipeline agents
  .sort((a, b) => a.stepOrder - b.stepOrder)
  .map(a => ({
    name: a.name,
    mdFile: a.mdFile,
    displayName: a.displayName,
    stepOrder: a.stepOrder,
    needsApproval: a.needsApproval,
    needsReview: a.needsReview,
  }));
```

### Pattern 2: Dynamic STAGE_CONTEXT_MAP
**What:** Replace hardcoded context map with convention-based context building from manifest.
**When to use:** In `pipeline.ts` when building context for each stage.
**Example:**
```typescript
// Convention-based context mapping
function buildContextFromManifest(
  stageName: string,
  results: Record<string, string>,
  useCase: string,
  extraContext?: Record<string, string>
): Record<string, string> {
  const agent = manifest.agents.find(a => a.name === stageName);
  if (!agent) return { useCase };

  const context: Record<string, string> = { useCase };

  if (agent.contextSources) {
    // Manifest specifies which prior stages to include
    for (const source of agent.contextSources) {
      if (results[source]) {
        context[source] = results[source];
      }
    }
  } else {
    // Convention: include all prior stage outputs
    for (const priorAgent of manifest.agents) {
      if (priorAgent.stepOrder < agent.stepOrder && results[priorAgent.name]) {
        context[priorAgent.name] = results[priorAgent.name];
      }
    }
  }

  // Merge extra context (e.g., systems for architect)
  if (extraContext) {
    Object.assign(context, extraContext);
  }

  return context;
}
```

### Pattern 3: Vercel Cron with CRON_SECRET
**What:** Secured daily API route that performs upstream sync check.
**When to use:** Vercel Cron invokes this endpoint daily.
**Example:**
```typescript
// web/app/api/cron/upstream-sync/route.ts
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  // Verify CRON_SECRET
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Perform sync check
  const result = await performUpstreamSync();
  return Response.json(result);
}
```

### Pattern 4: GitHub Trees API for Efficient Comparison
**What:** Single API call to get all file SHAs, then compare against manifest.
**When to use:** In the cron sync handler.
**Example:**
```typescript
// Fetch upstream state in one API call
async function getUpstreamState(): Promise<Map<string, string>> {
  const res = await fetch(
    "https://api.github.com/repos/NCrutzen/orqai-agent-pipeline/git/trees/main?recursive=1",
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
  const data = await res.json();
  const fileMap = new Map<string, string>();
  for (const item of data.tree) {
    if (item.type === "blob") {
      fileMap.set(item.path, item.sha);
    }
  }
  return fileMap;
}
```

### Pattern 5: Systems Context Serialization
**What:** Convert DB systems records to markdown matching upstream `systems.md` format.
**When to use:** Before calling architect stage in the pipeline.
**Example:**
```typescript
// web/lib/pipeline/systems-serializer.ts
import type { System } from "@/lib/systems/types";

export function serializeSystemsToMarkdown(systems: System[]): string {
  if (systems.length === 0) return "";

  const lines = ["# Systems Registry", ""];
  for (const sys of systems) {
    lines.push(`### ${sys.name}`);
    lines.push(`- **Integration method:** ${sys.integration_method}`);
    if (sys.url) lines.push(`- **URL:** ${sys.url}`);
    if (sys.auth_notes) lines.push(`- **Auth:** ${sys.auth_notes}`);
    if (sys.notes) lines.push(`- **Notes:** ${sys.notes}`);
    lines.push("");
  }
  return lines.join("\n");
}
```

### Anti-Patterns to Avoid
- **Polling GitHub API per-file:** Use Trees API for single-request listing instead of N+1 Contents API calls.
- **Storing manifest in DB:** User decided on version-controlled JSON for PR diffability.
- **Blocking pipeline on Tier 0/1 changes:** Only Tier 3 (breaking) should block pipeline execution.
- **Using Inngest for the cron check:** User explicitly decided Vercel Cron is sufficient for this simple periodic check.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter parsing | Custom regex parser | `gray-matter` (already installed) | Edge cases with multiline values, comments |
| Cron scheduling | Custom scheduler | Vercel Cron (`vercel.json` config) | Platform-managed, no infrastructure needed |
| Git SHA computation | Custom hash function | Compare SHAs from GitHub API | GitHub computes blob SHAs server-side |
| GitHub issue/PR creation | Manual API calls with complex auth | `fetch` with `GITHUB_TOKEN` | Simple REST calls, no SDK needed for 3 endpoints |

## Common Pitfalls

### Pitfall 1: GitHub API Rate Limiting
**What goes wrong:** Unauthenticated GitHub API calls limited to 60/hour. Daily cron won't hit this, but development/testing will.
**Why it happens:** Forgetting to include `Authorization: Bearer` header.
**How to avoid:** Always use `GITHUB_TOKEN` env var. The Trees API returns everything in one call (no pagination needed for this repo size).
**Warning signs:** 403 responses from GitHub API.

### Pitfall 2: Manifest-Stages Mismatch on Cold Start
**What goes wrong:** If `pipeline-manifest.json` is malformed or empty, the pipeline has zero stages and silently does nothing.
**Why it happens:** JSON import at module level fails silently if the file structure is wrong.
**How to avoid:** Add validation at import time. If manifest has zero agents with `stepOrder > 0`, fall back to a hardcoded minimum set or throw a clear startup error.
**Warning signs:** Pipeline runs complete instantly with no steps.

### Pitfall 3: Vercel Cron Only Runs in Production
**What goes wrong:** Cron jobs do NOT execute on preview deployments. Cannot test cron endpoint by deploying to preview.
**Why it happens:** Vercel design decision -- crons only trigger on production deployment URL.
**How to avoid:** Test the API route directly via `curl` or browser during development. The route is just a standard GET handler.
**Warning signs:** "Cron job never fires" reports that only happen in staging.

### Pitfall 4: Stale Context Map After Manifest Update
**What goes wrong:** `STAGE_CONTEXT_MAP` in `pipeline.ts` still references old hardcoded stage names after manifest is updated with new agents.
**Why it happens:** The context map and stages are defined in different files with no runtime validation.
**How to avoid:** Make `STAGE_CONTEXT_MAP` derive from the manifest (convention-based defaults). Stages not in the map get `{useCase + all prior outputs}` automatically.
**Warning signs:** New agents receive empty context, produce poor results.

### Pitfall 5: GitHub Issue/PR Creation Permissions
**What goes wrong:** `GITHUB_TOKEN` doesn't have permission to create issues or push branches.
**Why it happens:** Fine-grained tokens may not include `issues:write` or `contents:write` permissions.
**How to avoid:** Use a token with `repo` scope (classic) or `issues:write + contents:write` (fine-grained). Document required permissions.
**Warning signs:** 403/404 on issue creation API calls.

### Pitfall 6: Systems HITL Checkpoint in Inngest
**What goes wrong:** The `step.waitForEvent` pattern for "unknown system detected" requires the pipeline to be already running in an Inngest step context.
**Why it happens:** Systems detection happens inside the architect stage's context building, which is inside a `step.run()`.
**How to avoid:** Systems detection must happen as a separate Inngest step BEFORE the architect stage runs, or the architect result must be inspected AFTER completion. Cannot pause mid-step.run().
**Warning signs:** Inngest errors about nested step calls, or architect completing without systems context.

## Code Examples

### Current Upstream Repo Structure (verified via GitHub API)
```
orq-agent/
├── SKILL.md
├── systems.md                    # Systems registry template
├── agents/                       # 17 agent files
│   ├── architect.md              # sha: bf735cb...
│   ├── dataset-generator.md      # sha: ee8d5c1...
│   ├── dataset-preparer.md       # NOT in current pipeline
│   ├── deployer.md               # NOT in current pipeline
│   ├── experiment-runner.md      # NOT in current pipeline
│   ├── failure-diagnoser.md      # NOT in current pipeline
│   ├── hardener.md               # NOT in current pipeline
│   ├── iterator.md               # NOT in current pipeline
│   ├── kb-generator.md           # NOT in current pipeline
│   ├── orchestration-generator.md
│   ├── prompt-editor.md          # NOT in current pipeline
│   ├── readme-generator.md
│   ├── researcher.md
│   ├── results-analyzer.md       # NOT in current pipeline
│   ├── spec-generator.md
│   ├── tester.md                 # NOT in current pipeline
│   └── tool-resolver.md
├── commands/                     # Tier 1 tracked
├── references/                   # Tier 1 tracked
└── templates/                    # (directory exists in repo structure)
```

### Manifest JSON Schema (recommended)
```json
{
  "version": "1.0.0",
  "lastSync": "2026-03-23T00:00:00Z",
  "repo": {
    "owner": "NCrutzen",
    "name": "orqai-agent-pipeline",
    "branch": "main"
  },
  "agents": [
    {
      "name": "architect",
      "mdFile": "orq-agent/agents/architect.md",
      "displayName": "Designing agent swarm architecture",
      "stepOrder": 1,
      "sha": "bf735cbbeb722911533c9dcecfdce809ca41c608",
      "needsReview": true,
      "inputTags": ["useCase", "systems"],
      "outputFormat": "markdown-blueprint",
      "contextSources": null
    },
    {
      "name": "tool-resolver",
      "mdFile": "orq-agent/agents/tool-resolver.md",
      "displayName": "Resolving available tools",
      "stepOrder": 2,
      "sha": "1307d28fb20ea201d467dac3734de5af5a3557b3",
      "inputTags": ["useCase", "blueprint"],
      "contextSources": ["architect"]
    }
  ],
  "trackedPaths": [
    { "path": "orq-agent/references/", "sha": "bff0d776...", "tier": 1 },
    { "path": "orq-agent/commands/", "sha": "48c91d1b...", "tier": 1 },
    { "path": "orq-agent/systems.md", "sha": "...", "tier": 1 }
  ]
}
```

### Systems Markdown Serialization (matching upstream format)
```markdown
# Systems Registry

### CRM System
- **Integration method:** api
- **URL:** https://crm.example.com
- **Auth:** OAuth2 / API key
- **Notes:** Customer lookup, ticket creation

### Legacy Billing Portal
- **Integration method:** browser-automation
- **URL:** https://billing.internal.example.com
- **Auth:** Username/password (SSO not supported)
- **Notes:** No API available. Invoice lookup, payment status checks.
```

### Vercel Cron Configuration
```json
// vercel.json (new file at project root)
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/upstream-sync",
      "schedule": "0 6 * * *"
    }
  ]
}
```

### Impact Tier Classification Logic
```typescript
function classifyChange(
  path: string,
  oldSha: string | undefined,
  newSha: string | undefined
): { tier: 0 | 1 | 2 | 3; description: string } {
  const isAgent = path.startsWith("orq-agent/agents/") && path.endsWith(".md");
  const isReference = path.startsWith("orq-agent/references/");
  const isCommand = path.startsWith("orq-agent/commands/");
  const isTemplate = path.startsWith("orq-agent/templates/");

  // New or deleted agent file
  if (isAgent && (!oldSha || !newSha)) {
    return { tier: 3, description: newSha ? `New agent: ${path}` : `Deleted agent: ${path}` };
  }

  // Agent content changed -- need deeper analysis
  if (isAgent && oldSha !== newSha) {
    // Tier 2 by default; could be promoted to Tier 0 after frontmatter/structure comparison
    return { tier: 2, description: `Agent modified: ${path}` };
  }

  // Reference/command/template changes
  if (isReference || isCommand || isTemplate) {
    return { tier: 1, description: `Support file changed: ${path}` };
  }

  // Everything else
  return { tier: 0, description: `Other change: ${path}` };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded PIPELINE_STAGES | Manifest-driven stages | This phase | New agents added via PR, not code changes |
| No upstream tracking | Daily cron sync check | This phase | Drift detected automatically |
| No systems context in web pipeline | DB-backed systems passed as `<systems>` tag | This phase | Web pipeline matches CLI behavior |
| Manual discovery of upstream changes | Automated GitHub issue/PR creation | This phase | Zero-manual-effort change surfacing |

## Open Questions

1. **Tier 2 vs Tier 0 distinction for agent content changes**
   - What we know: SHA comparison detects any change. Some changes are just prompt wording (Tier 0), others change input/output structure (Tier 2).
   - What's unclear: How to automatically distinguish structural changes from content-only changes without fetching and parsing the full file.
   - Recommendation: Fetch the file content when SHA differs, compare frontmatter fields and XML tag patterns against manifest. If frontmatter and tag patterns match, downgrade to Tier 0. Otherwise Tier 2.

2. **GitHub token for auto-PR creation**
   - What we know: Need `contents:write` and `issues:write` permissions.
   - What's unclear: Whether the project already has a `GITHUB_TOKEN` env var configured on Vercel.
   - Recommendation: Document required token permissions. Use a single `GITHUB_TOKEN` env var for all GitHub API operations.

3. **Systems HITL checkpoint implementation details**
   - What we know: Phase 40 terminal panel pattern handles HITL interactions. Architect prompt has `<systems_awareness>` section.
   - What's unclear: How the architect stage "detects" an unknown system mid-execution (it would need to parse architect output after completion, not during).
   - Recommendation: Run architect stage first, then inspect output for system references not in the project's linked systems. If found, create a HITL checkpoint step, wait for user to add the system, then re-run architect with updated systems context.

## Sources

### Primary (HIGH confidence)
- GitHub Contents API -- verified via `gh api repos/NCrutzen/orqai-agent-pipeline/contents/orq-agent/agents` (returned 17 agent files with SHAs)
- GitHub Trees API -- verified via `gh api repos/NCrutzen/orqai-agent-pipeline/git/trees/main?recursive=1` (returned full recursive listing)
- Vercel Cron docs -- https://vercel.com/docs/cron-jobs (configuration, CRON_SECRET, security patterns)
- Vercel Cron management -- https://vercel.com/docs/cron-jobs/manage-cron-jobs (duration limits, error handling, concurrency, idempotency)
- Upstream `systems.md` -- verified via `gh api` (markdown format with heading-per-system structure)
- Upstream `architect.md` -- verified `<systems_awareness>` section exists with integration method cross-referencing

### Secondary (MEDIUM confidence)
- Existing codebase patterns (health dashboard, systems actions, pipeline function) -- read directly from source files

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all patterns verified against existing codebase
- Architecture: HIGH -- manifest design follows established project patterns, GitHub API verified
- Pitfalls: HIGH -- verified against official Vercel docs and GitHub API behavior
- Systems passthrough: MEDIUM -- serialization format verified, but HITL checkpoint timing needs careful implementation

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable domain, no fast-moving dependencies)
