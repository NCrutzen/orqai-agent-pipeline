# Collaboration — Multi-Person Workflow

> Added 2026-05-20 as the repo moves from solo to multi-developer.
> Lightweight by design. We tighten only when something actually breaks.

## First time in this repo? Read this section.

If you've never worked in this repo and you're about to build something, here's the 60-second version:

1. **Don't work on `main`.** `main` is for merges only. All real work happens in a *workspace* (an isolated copy of the repo for one phase of work).
2. **When you start a new piece of work, tell Claude what you want to build.** Claude will either confirm you don't need a workspace (small fix, doc change, question) OR walk you through creating one with `/gsd-new-workspace`. If Claude does not ask you about this, remind it: "should this be in a workspace?"
3. **Don't manually edit files under `.planning/`** — those track the project state and get rewritten by GSD commands. Edit through the commands (`/gsd-plan-phase`, etc.), not by hand.
4. **Don't manually edit files named `*.generated.ts`** — those are output of `npm run codegen`. Re-run codegen instead.
5. **Read `CLAUDE.md`** (top of the repo) — it has all the stack rules. Claude reads it automatically; you should read it once.

If those five rules feel restrictive, they're not — they prevent the failure mode where two people accidentally overwrite each other's project state. Everything below is the longer explanation.

## TL;DR

- **Workspaces are created when work starts, not reserved in advance.** One per *active stream*. Lifetime = phase (or sequential chain of related phases). Merged back through PR.
- **`/gsd-new-workspace <name>`** spins up an isolated worktree with its own `.planning/`.
- **Never edit `.planning/STATE.md` on `main` directly.** It is a single-writer file; the workspace owns it for the duration of the phase.
- **Registry changes go through migrations.** Every `swarms` / `swarm_intents` / `swarm_noise_categories` / `zapier_tools` insert or update is a new file in `supabase/migrations/` — never an ad-hoc psql run on a shared DB.
- **Run `npm run codegen` before every commit that touches a registry.** CI gates on `npm run codegen && git diff --exit-code`.
- **Architecture docs (`docs/agentic-pipeline/`) need architect review** — gated via `CODEOWNERS`.

## On not pre-creating workspaces for future milestones

The temptation to spin up workspaces for V8.1 / V9.0 / V10.0 in advance is real and wrong. `.planning/STATE.md` is a scalar (`milestone: vX.Y`), and reserved-but-idle workspaces drift before anyone uses them. Create the workspace when the phase actually starts. If two streams genuinely need to run in parallel and STATE.md fights you, that is a signal to revisit STATE's shape — not to pre-allocate workspaces. See `.planning/seeds/` for the planted seed on per-workstream STATE restructure.

## Collision Zones (in order of pain)

### 1. `.planning/` runtime state

`STATE.md`, `MILESTONES.md`, `ROADMAP.md`, `RETROSPECTIVE.md` are single-writer files. Two people editing them on `main` in the same week produces semantic merge conflicts that look syntactic — git auto-merges line-by-line and gives you garbage state.

**Rule:** active phase work happens in a workspace. `main` only sees these files via PR merges. If you are not in a phase (answering a question, writing docs, reading code, fixing infra) you do not need a workspace.

### 2. Supabase registries + generated TS

`swarms`, `swarm_intents`, `swarm_noise_categories` are source-of-truth tables; their literal-union TS types are generated into `web/lib/swarms/*.generated.ts` and `web/lib/automations/debtor-email/coordinator/*.generated.ts` by `npm run codegen`. Two people inserting rows concurrently and committing different `*.generated.ts` snapshots will conflict at merge time — or worse, drift silently if the CI gate is skipped.

**Rule:**
- One migration file per change. Filename: `YYYYMMDD<suffix>_<short_name>.sql`.
- Run `npm run codegen` locally before committing; commit the generated diff atomically with the migration.
- `CODEOWNERS` gates `*.generated.ts` so drift surfaces at PR-review time.
- Never hand-edit a `*.generated.ts` file.

### 3. Shared Supabase dev / acceptance DB

Two people testing different swarms hit the same `email_pipeline.emails`, `agent_runs`, and `pipeline_events`. Different `swarm_type` scope keeps them mostly apart — it doesn't if you are both touching debtor-email.

**Lightweight rule:** when seeding test rows, tag them with a per-developer prefix in subject / sender / metadata so cleanup is unambiguous (`[dev:nick]`, `[dev:teammate]`).

**Heavier options (defer until lightweight breaks):**
- Per-developer schema overlays.
- Branch-deploy Vercel previews on a separate Supabase project.

## Workflow per Active Phase

```
/gsd-new-workspace phase-NN-short-name      # creates worktree + branch + isolated .planning/
/gsd-discuss-phase NN                       # gather context
/gsd-plan-phase NN                          # produce PLAN.md
/gsd-execute-phase NN                       # wave-based execution
                                            # migrations + codegen committed atomically
/gsd-pr-branch                              # filter .planning/ commits out for clean code review
                                            # open PR for code review
                                            # open separate PR (or same branch) for .planning/ updates
```

When the PR merges, the workspace is archivable. See `/gsd-remove-workspace`.

## When You Don't Need a Workspace

- Writing or editing docs that do not touch `.planning/`.
- Reading code, answering questions, running smokes.
- Quick infra fixes that are not bound to a GSD phase.

For these, a normal feature branch (`git checkout -b docs/...` or `fix/...`) is sufficient.

## Ownership Map

| Surface | Who owns it | Review required? |
|---|---|---|
| Architecture canon (`docs/agentic-pipeline/`) | Architect | Yes (via `CODEOWNERS`) |
| `CLAUDE.md`, `docs/collaboration.md`, `CODEOWNERS` | Architect | Yes |
| Generated TS (`*.generated.ts`) | No one — output of `npm run codegen` | Yes (drift gate) |
| Registry migrations (`*_swarm*.sql`, `*_entity_brand*.sql`, `*_zapier_tools*.sql`) | Phase owner | Yes |
| Per-swarm implementation code (`web/lib/automations/<swarm>/`) | Phase owner | Default — no `CODEOWNERS` gate |
| `.planning/STATE.md` | The active phase workspace | Single-writer; PR-merged only |

## Bulk-rule violations to call out at PR review

These are the failure modes we have already seen (or expect to see) — flag at review time:

1. **Per-swarm if-branch in `classify.ts` / classifier worker.** Cross-swarm architecture is registry-driven; per-swarm code in a shared worker is leakage. Push the variance into a registry column.
2. **Hand-edited `*.generated.ts`.** Always a bug. Re-run codegen.
3. **Direct INSERT/UPDATE on a shared registry table from a script, no migration file.** Schema changes outside migrations are invisible to teammates and to CI.
4. **`STATE.md` edit on `main`** outside an active phase workspace.
5. **Hardcoded brand / swarm enum.** Brand is `swarms.entity_brand`; swarm is `swarms.swarm_type`. Both are registry-driven.

## See Also

- `CODEOWNERS` — PR-review routing for the gated surfaces above.
- `docs/agentic-pipeline/README.md` — canonical architecture; required reading before any pipeline work.
- `CLAUDE.md` — stack rules and pattern references.
- `/gsd-new-workspace`, `/gsd-list-workspaces`, `/gsd-remove-workspace`, `/gsd-pr-branch` — the workspace tooling.
