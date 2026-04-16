---
phase: 54
plan: 54-01
title: V7 migration across dashboard, executive, projects, settings
status: complete
completed: 2026-04-16
---

# Plan 54-01 — SUMMARY

## What shipped

5 atomic commits migrating all pre-V7 pages and two shared card components to the V7 design system.

| Commit | Files | Purpose |
|--------|-------|---------|
| `b7c6b0c` | `components/dashboard/kpi-card.tsx`, `components/project-card.tsx` | Swap shadcn Card for GlassCard + V7 tokens |
| `fc62c0c` | `app/(dashboard)/page.tsx` | Home dashboard (3 stat cards + empty state + projects grid) |
| `be75229` | `app/(dashboard)/executive/page.tsx` | Executive dashboard (header, error states, section headings) |
| `ba4f8b7` | `app/(dashboard)/projects/[id]/page.tsx` | Project detail (breadcrumb, header, Members card, empty states) |
| `62a5026` | `app/(dashboard)/settings/page.tsx` | Settings (header + auth-profile cards) |

## Token-level changes

- **Radii:** `rounded-lg` (shadcn Card) → `rounded-[var(--v7-radius)]` (22px) via GlassCard
- **Background:** `bg-card` → `bg-[var(--v7-glass-bg)]` via GlassCard; `bg-muted` (icon wells) → `bg-[var(--v7-panel-2)]`
- **Text:** `text-foreground` → `text-[var(--v7-text)]`; `text-muted-foreground` → `text-[var(--v7-muted)]` (body) or `text-[var(--v7-faint)]` (10-12px captions)
- **Borders:** shadcn default → `border-[var(--v7-glass-border)]` via GlassCard; stale amber → `border-[var(--v7-amber)]`
- **Fonts:** H1 32px / H2 20px / H3 20px wrapped in `font-[var(--font-cabinet)] font-bold`; body retains Satoshi via root `font-sans`
- **Padding:** page `p-6` → `p-5` (20px per 48-UI-SPEC main-padding token)
- **Gaps:** section `space-y-6` → `space-y-5`; KPI `gap-4` → `gap-3`
- **Hover (ProjectCard):** `translateY(-3px)` + `shadow-[var(--v7-glass-shadow-heavy)]` / 220ms ease — matches agent card hover in 48-UI-SPEC

## Preserved

- All data fetchers, server actions, auth guards, RLS behavior
- All component APIs (KpiCard, ProjectCard props identical)
- Tabs chrome (shadcn Tabs untouched — inherits V7 via cascade)
- KpiGrid, charts, tables, SourceStatusCard, RunListLive, SwarmGraph, HealthDashboard, CredentialList, SystemList, ProjectCredentialLinker internals

## Dark/light theme

No additional work — all V7 tokens already defined in both themes in Phase 48 globals.css. Pages render correctly in both themes via `[data-theme="dark"]` attribute set by ThemeProvider.

## Typecheck

`npx tsc --noEmit` on all modified files returns zero errors. (Pre-existing errors in `debtor-email-analyzer/` and `sales-email-analyzer/` are unrelated to Phase 54 scope.)

## Out of scope (intentional)

- Tabs chrome restyling (deferred — 48-UI-SPEC does not redefine tabs)
- Internal restyle of SourceStatusCard / ProjectHealthTable / AgentMetricsTable / RoiTable / charts / HealthDashboard / CredentialList / SystemList (deferred — complex surfaces; outer page now V7)
- `runs/`, `new-run/`, and `runs/[runId]` nested pages (not in POL-01/02/03 scope)
