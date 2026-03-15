# Phase 35: Pipeline Engine - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Users submit a use case description (with optional reference files) from within a project and watch it execute as a durable pipeline. Pipeline translates existing markdown instruction files into Claude API calls via a prompt adapter, orchestrated by Inngest durable functions. Users see step-by-step progress, can retry failed steps, and view a list of their pipeline runs. Only the core generate flow (discuss → architect → research → generate specs) is in scope — deploy/test/iterate are later phases.

</domain>

<decisions>
## Implementation Decisions

### Use case input form
- Single textarea for freeform use case description — matches existing CLI behavior
- File upload support for reference files (any file type — PDFs, DOCX, spreadsheets, images, etc.)
- Placeholder example in textarea (realistic use case like "Process incoming invoices from email, match to PO, route for approval...")
- Form lives inside the project view — user navigates to a project first, then clicks "New Pipeline Run"
- Optional run name field — user can name the run, blank auto-generates from use case description

### Prompt adapter
- Claude's discretion on adapter architecture — research will determine best approach for translating .md pipeline files to Claude API calls
- Pipeline .md files read from GitHub repo at runtime (not bundled) — changes to pipeline prompts take effect immediately without redeploying
- Claude's discretion on multi-agent orchestration pattern (Inngest steps vs single call vs hybrid) — research will determine best fit
- Scope: core generate flow only (discuss → architect → research → generate specs) — deploy/test/iterate added in later phases

### Pipeline visibility & errors
- Step list with status badges (pending/running/complete/failed) as primary progress view
- Expandable log stream per step — users can click into a step to see detailed output
- After clicking "Start Pipeline", user is redirected to a dedicated run detail page (/projects/[id]/runs/[runId])
- Failed steps show plain-English error message with immediate retry button (no confirmation dialog)
- Retry resumes from the exact failed step, not from scratch

### Run list & history
- Run list lives inside the project view (project-scoped, per PROJ-03)
- Detailed run cards showing: run name, status badge (running/complete/failed), step progress (3/5), agent count, started timestamp, duration, last error if failed
- Project detail page uses tabs: "Overview" (project info + members) and "Runs" (run list)
- Sidebar "Runs" item can show all runs across projects (global view)

### Claude's Discretion
- Prompt adapter architecture (direct Claude API, Agent SDK, or hybrid)
- Inngest step granularity and orchestration pattern
- File upload storage and processing approach
- Database schema for runs, steps, and pipeline state
- Real-time update mechanism (Supabase Realtime or polling — Phase 36 will add full Realtime)
- Log stream format and content

</decisions>

<specifics>
## Specific Ideas

- Pipeline .md files are version-controlled in the GitHub repo — the web app reads them at runtime so prompt changes don't require a redeploy
- The "prompt adapter" is novel engineering (flagged in STATE.md) — validate the approach works before building the full UI
- Reference file uploads should support any file type since users may have diverse documentation (SOPs, spreadsheets, system screenshots)
- Step list should feel like a build pipeline (think GitHub Actions or Vercel deploy logs) — each step clearly named, status visible at a glance

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/lib/supabase/client.ts`, `server.ts`, `admin.ts`: Supabase client factories for browser, server, and admin contexts
- `web/components/ui/*`: shadcn/ui components (Dialog, Card, Button, etc.) from Phase 34
- `web/app/(dashboard)/layout.tsx`: Protected layout with sidebar — new pages slot in here
- `web/app/(dashboard)/projects/[id]/page.tsx`: Project detail page — will be refactored to tabbed layout
- `web/components/create-project-modal.tsx`: Modal pattern with zod validation — reusable for run creation

### Established Patterns
- Server components for data fetching, client components for interactivity
- Supabase RLS for per-user data isolation
- shadcn/ui for all UI components
- Clean minimal style (white/light, subtle borders, Tailwind defaults)

### Integration Points
- `orq-agent/commands/orq-agent.md`: Main pipeline orchestrator — the prompt adapter must translate this
- `orq-agent/agents/*.md`: Subagent instruction files (architect, researcher, spec-generator, etc.)
- Supabase for pipeline run state persistence and real-time updates
- Inngest for durable function orchestration (survives Vercel timeouts)
- Claude API for executing the adapted pipeline prompts
- Orq.ai API for eventual agent deployment (not in Phase 35 scope)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 35-pipeline-engine*
*Context gathered: 2026-03-15*
