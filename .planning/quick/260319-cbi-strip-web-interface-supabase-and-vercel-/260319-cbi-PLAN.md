---
phase: quick
plan: 260319-cbi
type: execute
wave: 1
depends_on: []
files_modified:
  - web/ (DELETE entire directory)
  - supabase/ (DELETE entire directory)
  - .planning/PROJECT.md
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
  - .planning/STATE.md
autonomous: true
requirements: [STRIP-01]
must_haves:
  truths:
    - "web/ directory no longer exists in the repo"
    - "supabase/ directory no longer exists in the repo"
    - "Planning docs no longer reference V3.0 web interface as active milestone"
    - "orq-agent skill continues to function unchanged (Supabase-as-KB-provider refs preserved)"
    - "README.md and CHANGELOG.md remain untouched (they describe the CLI skill, which is kept)"
  artifacts:
    - path: ".planning/PROJECT.md"
      provides: "Updated project description without web UI focus"
    - path: ".planning/ROADMAP.md"
      provides: "Roadmap with V3.0 archived, V4.0/V5.0 remain defined"
    - path: ".planning/REQUIREMENTS.md"
      provides: "V3.0 requirements marked as dropped/archived"
    - path: ".planning/STATE.md"
      provides: "State reflecting stripped web interface"
  key_links:
    - from: "orq-agent/"
      to: "references/tool-catalog.md"
      via: "Supabase as external KB provider"
      pattern: "Supabase.*external"
---

<objective>
Strip the web interface (Next.js), Supabase database layer, and Vercel hosting from the repo. Keep only the Orq AI agent pipeline skill (`orq-agent/`), its installer, and distribution files.

Purpose: The project is pivoting away from the browser-based V3.0 web UI. The core value is the Claude Code skill, not the web app. Remove all web infrastructure to reduce repo complexity and eliminate dead code.

Output: Clean repo with only `orq-agent/`, `install.sh`, `README.md`, `CHANGELOG.md`, `VERSION`, `.claude-plugin/`, and updated planning docs.
</objective>

<execution_context>
@/Users/nickcrutzen/.claude/get-shit-done/workflows/execute-plan.md
@/Users/nickcrutzen/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete web/ and supabase/ directories</name>
  <files>web/ (DELETE), supabase/ (DELETE)</files>
  <action>
Remove the entire `web/` directory (72 files — Next.js app, components, Supabase client libs, Inngest functions, package.json, etc.) and the entire `supabase/` directory (2 SQL schema files).

Commands:
```bash
rm -rf web/
rm -rf supabase/
```

DO NOT touch:
- `orq-agent/` — this is the core skill, kept entirely
- `orq-agent/references/tool-catalog.md` — contains legitimate Supabase-as-KB-provider reference (not web infrastructure)
- `orq-agent/commands/kb.md` and `orq-agent/commands/deploy.md` — contain "External -- Supabase" as a KB provider option (legitimate, not web infrastructure)
- `orq-agent/agents/deployer.md` — contains `external_*` reference to Supabase as KB backend (legitimate)
- `install.sh` — only installs `orq-agent/`, has zero web/Supabase/Vercel references
- `README.md` — describes CLI skill only, no web references
- `CHANGELOG.md` — historical record, keep as-is
- `VERSION`, `.claude-plugin/`, `.gitignore` — keep as-is
  </action>
  <verify>
    <automated>test ! -d web/ && test ! -d supabase/ && test -d orq-agent/ && test -f install.sh && test -f README.md && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>web/ and supabase/ directories are gone. orq-agent/, install.sh, README.md, CHANGELOG.md, VERSION, .claude-plugin/ all still present.</done>
</task>

<task type="auto">
  <name>Task 2: Update planning docs to reflect stripped web interface</name>
  <files>.planning/PROJECT.md, .planning/ROADMAP.md, .planning/REQUIREMENTS.md, .planning/STATE.md</files>
  <action>
Update four planning documents to remove V3.0 web UI as active work and reflect the project's true scope.

**PROJECT.md** — Make these changes:
1. Update the opening description (line 5): Remove "web-based" and browser references. New description: "A Claude Code skill that transforms natural language use case descriptions into complete Orq.ai agent swarm specifications, then autonomously deploys, tests, iterates, and hardens them. Also available as a CLI pipeline (`/orq-agent`) for technical users."
2. Update "Core Value" (line 9): Change to: "Any colleague can go from a use case description to deployed, tested agents on Orq.ai — through an automated pipeline with real-time visibility and HITL approvals — without needing to understand the underlying AI platform."
3. In "Active" requirements section (lines 49-57): Move the V3.0 block under a new "### Archived (V3.0 — Removed)" heading. Replace checkbox items with strikethrough or note "Archived — web interface removed from scope".
4. Update "Current Milestone" section (line 66): Change to reflect V4.0 or remove the section if V4.0 is not yet started. Add a note: "V3.0 Web UI removed from scope (2026-03-19). Next milestone: V4.0 Cross-Swarm Intelligence."
5. In "Context" section: Remove bullet points about V3.0 stack (line 82), distribution model (line 85). Keep V4.0 and V5.0 context bullets.
6. In "Constraints" section: Remove lines 93-95 (Auth M365, Hosting Vercel/Supabase, auto-deploy from GitHub). Keep platform, SDK pins, backward compat constraints.
7. In "Key Decisions" table: Change the "Next.js + Supabase + Vercel" and "Node graph" and "GitHub repo as single source of truth" rows from "Pending" to "Dropped — V3.0 removed from scope".

**ROADMAP.md** — Make these changes:
1. Update Overview (line 5): Remove V3.0 sentence. Keep V4.0 and V5.0 descriptions.
2. In Milestones table: Change V3.0 status from "In Progress" to "Dropped" with note "(web interface removed from scope 2026-03-19)".
3. Move the entire "V3.0 Web UI & Dashboard (Phases 34-38)" block into a `<details>` collapsed section with summary "V3.0 Web UI & Dashboard (Phases 34-38) -- DROPPED". Mark all phases as dropped (not completed).
4. Remove Phase Details sections for phases 34-38 (they're no longer active).
5. Update Progress table: Remove rows for phases 34-38 or mark as "Dropped".
6. Update Progress Summary: Change V3.0 row status to "Dropped".
7. Update execution order note to reflect V4.0 as next active milestone.

**REQUIREMENTS.md** — Make these changes:
1. Add a "### Archived (V3.0 — Dropped)" section. Move all V3.0 requirements under it with a note: "Web interface removed from scope (2026-03-19). These requirements are no longer active."
2. Update the traceability table: Mark all V3.0 requirements as "Dropped".
3. Update coverage counts.

**STATE.md** — Make these changes:
1. Update "Core value" to match new PROJECT.md core value.
2. Update "Current focus" to "Between milestones — V3.0 dropped, V4.0 not yet started".
3. Update "Current Position" to reflect no active phase.
4. In "Decisions" section: Add entry: "V3.0 Web UI dropped from scope — project refocused on CLI pipeline skill only (2026-03-19)"
5. Remove web-specific decisions (Next.js + Supabase, Inngest, Supabase Broadcast, etc.) or mark as archived.
6. Remove web-specific blockers (prompt adapter, Inngest race condition, Azure AD tenant).
  </action>
  <verify>
    <automated>grep -c "Dropped" .planning/ROADMAP.md && grep -c "Archived" .planning/REQUIREMENTS.md && ! grep -q "Current focus.*Pipeline Engine" .planning/STATE.md && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>All four planning docs updated. V3.0 is archived/dropped throughout. No active references to web interface, Supabase-as-infrastructure, Vercel, or Inngest remain in planning docs. orq-agent references to Supabase-as-KB-provider are untouched.</done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `ls` at repo root shows: `.claude-plugin/`, `.git/`, `.gitignore`, `.planning/`, `CHANGELOG.md`, `install.sh`, `orq-agent/`, `README.md`, `VERSION` — NO `web/` or `supabase/`
2. `grep -r "supabase" orq-agent/` returns only KB-provider references (tool-catalog.md, kb.md, deploy.md, deployer.md) — NOT web infrastructure references
3. `grep "Dropped" .planning/ROADMAP.md` confirms V3.0 is marked as dropped
4. `grep "Archived" .planning/REQUIREMENTS.md` confirms V3.0 requirements are archived
5. `.planning/STATE.md` no longer references Phase 35 as current work
</verification>

<success_criteria>
- web/ directory deleted (72 files removed)
- supabase/ directory deleted (2 files removed)
- PROJECT.md reflects CLI-only project identity
- ROADMAP.md shows V3.0 as "Dropped", V4.0 as next defined milestone
- REQUIREMENTS.md has V3.0 requirements under "Archived" section
- STATE.md reflects no active web UI work
- orq-agent/ skill is completely untouched and functional
- install.sh, README.md, CHANGELOG.md, VERSION unchanged
</success_criteria>

<output>
After completion, create `.planning/quick/260319-cbi-strip-web-interface-supabase-and-vercel-/260319-cbi-SUMMARY.md`
</output>
