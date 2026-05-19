# Spike Conventions

Patterns established during the first spike session (smeba-info recon, 2026-05-19).

## Stack

- TypeScript via `tsx` (no compile step), under Node 24+.
- Supabase JS client (`@supabase/supabase-js`), service-role key from `.env.local`.
- Zapier SDK (`@zapier/zapier-sdk`) for cross-tenant Microsoft Graph calls.
- Reuse the existing `web/debtor-email-analyzer/` package — it already has `.env`, `node_modules`, `tsconfig.json` set up. **Do not bootstrap a new TS project per spike.**

## File layout

For corpus-analysis spikes that need the existing analyzer's deps:

- Spike directory: `.planning/spikes/NNN-name/`
  - `README.md` — frontmatter, investigation trail, results, files index
  - `*-output.txt` — captured stdout from runs, for reproducibility audits
- Scripts: `web/debtor-email-analyzer/src/spike-NNN-*.ts`
  - Naming: `spike-NNN-{role}.ts` where role is `probe` / `backfill` / `stats` / `cluster` / `overlap` / `sample`
  - Multiple scripts per spike are normal (probe → backfill → stats)

For self-contained spikes (no analyzer deps needed), keep everything under `.planning/spikes/NNN-name/`.

## Patterns

- **Probe before backfill.** When a spike writes to a shared resource (Supabase, an external mailbox), first run a read-only probe to measure volume. Decide on scope (90d / 365d / all-time) before writing.
- **Idempotent writes.** Backfills upsert on a natural key (`source_id`). Re-running a spike is always safe.
- **Read-only by default.** Stats / clustering / overlap / sampling spikes never write. They take a small `.eq("mailbox", X)` slice from `email_pipeline.emails`.
- **Paginate explicitly.** Supabase's default 1000-row limit is silent. When fetching corpora >1000 rows, page with `.range(from, from+PAGE-1)` and a sentinel loop.
- **Deterministic samples.** Use seeded LCG shuffle when sampling for human inspection so the spike is reproducible (`seed=42` by default).
- **Stdout, not UI.** Analytical spikes (volume, clustering, overlap) print tables to stdout and dump to a `*-output.txt` next to the README. The user reads numbers + samples directly, not through a UI shell.
- **First-match-wins rule sets.** When trialling regex classifiers, order rules by specificity, use an explicit `RULES` array, and report cluster sizes + sample rows per rule. Iterate the array, not the script.
- **Tag samples in the README, not the registry.** When sampling for capacity planning, describe what the operator sees in plain English (`"looks like sales quote request"`). Don't propose registry rows — that's a phase's job, not a spike's.

## Known workarounds

- **Dynamic `import()` for cross-package TS imports under tsx + Node 24.** Static `import { x } from "../../lib/.../foo.ts"` failed with "does not provide an export named x" despite the export existing. Dynamic `import()` works. Use this **only in spike code** — never in production. See `spike-003-overlap.ts`.

## Tools & libraries

| Tool | Version pin in `package.json` | Why |
|---|---|---|
| `@zapier/zapier-sdk` | `latest` | Cross-tenant Graph access via shared connection |
| `@supabase/supabase-js` | `^2.49.0` | Persisted corpus access |
| `@orq-ai/node` | `^4.7.6` | Available for LLM-driven spikes (not yet exercised in this session) |
| `tsx` | `^4.19.0` | Run TS directly, no compile |
| `dotenv` | `^16.4.0` | `.env` loader |
