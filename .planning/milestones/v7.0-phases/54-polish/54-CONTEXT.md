---
phase: 54
slug: polish
status: ready
created: 2026-04-16
---

# Phase 54 — Polish: CONTEXT

## Goal

Migrate the pre-V7 pages — executive dashboard, home dashboard (projects landing), projects detail, and settings — to the V7 design system (tokens, fonts, GlassCard surfaces) so the entire app shares a cohesive visual identity with the V7 `/swarm/*` routes.

## Scope (locked)

### In-scope pages

1. **Home dashboard** — `web/app/(dashboard)/page.tsx`
   - Header + 3 activity-overview stat cards + empty state + project grid (via `ProjectSearch` + `ProjectCard`)
2. **Executive dashboard** — `web/app/(dashboard)/executive/page.tsx`
   - Header + `KpiGrid` (6 KPI cards) + 4 tabs (Activity, Projects, ROI, Sources) + all card/chart surfaces inside
3. **Projects detail** — `web/app/(dashboard)/projects/[id]/page.tsx`
   - Breadcrumb, header, 4 tabs (Overview/Creations/Swarm Graph/Settings), `Members` card, empty-state cards
4. **Settings** — `web/app/(dashboard)/settings/page.tsx`
   - Header + 4 tabs (Credentials, Auth Profiles, Health, Systems) + auth-profile Card grid + HealthDashboard + list surfaces

### Out-of-scope (explicitly)

- Do **not** rewrite data fetchers, server actions, Zod schemas, or type layers
- Do **not** change routing, auth gating, or tab behavior
- Do **not** touch `web/app/(auth)/*` (already V7 via Phase 48) or `web/app/(dashboard)/swarm/*` (already V7)
- Do **not** migrate `runs/page.tsx`, `projects/[id]/new-run/`, `projects/[id]/runs/[runId]` — those are nested pipeline views and can polish in a follow-up; POL requirements only cover dashboard/projects/settings
- Do **not** migrate `HealthDashboard` internals, `SwarmGraph`, `RunListLive`, charts — they wrap their own data; their outer container inherits V7 but their internals stay
- Do **not** touch `SourceStatusCard`, `ProjectHealthTable`, `AgentMetricsTable`, `RoiTable`, `StatusDistributionChart`, `ActivityChart`, `SuccessRateChart`, `TypeBreakdownChart`, `CostTrendChart` internals — they are complex existing artifacts; only the container around them moves to V7 tokens

### Migration strategy per page

- **Replace `Card`/`CardHeader`/`CardContent`** (`@/components/ui/card`) with `GlassCard` (`@/components/ui/glass-card`) at the page level where the card is a top-level KPI or stat surface
- **KpiCard + KpiGrid (dashboard)** — swap the `Card` inside `KpiCard` for `GlassCard` and adopt V7 typography (Cabinet Grotesk for value, Satoshi label)
- **ProjectCard** — swap `Card` for `GlassCard`; add hover lift `translateY(-3px)` per UI-SPEC
- **Headers** — use Cabinet Grotesk variable (`font-[var(--font-cabinet)]`) for page titles, keep descriptions in Satoshi (`text-[var(--v7-muted)]`)
- **Text tokens** — replace `text-muted-foreground` with `text-[var(--v7-muted)]` and `text-foreground` with `text-[var(--v7-text)]` at the page scope only (component internals keep shadcn for now)
- **Outer page container** — add `p-5` (20px per V7 layout tokens) instead of `p-6`; use V7 gap instead of `space-y-6`

## Decisions locked

| Decision | Rationale |
|----------|-----------|
| Use existing `GlassCard` from `components/ui/glass-card.tsx` | Already built in Phase 48, already consumes V7 tokens |
| Do NOT modify `components/dashboard/*` internals beyond `kpi-card.tsx` | Minimizes blast radius; tables/charts are complex — polish later |
| Keep `Tabs` from shadcn untouched | V7 UI-SPEC does not redefine tabs; existing shadcn tabs will inherit V7 bg/text through tokens |
| Page padding: `p-5` (20px) | Matches V7 main grid padding (see 48-UI-SPEC) |
| Heading font: Cabinet Grotesk for H1/H2 titles; Satoshi elsewhere | Matches UI-SPEC typography |
| Hover state for ProjectCard: `translateY(-3px)` + `shadow-heavy` | Matches V7 agent card hover (48-UI-SPEC transitions table) |
| Breadcrumb/muted link color: `var(--v7-muted)` | V7 token |
| Single plan (54-01) combining all four pages | Scope is cohesive styling work; splitting adds ceremony without value |

## Risks

- shadcn `Card` inside `KpiCard` currently relies on shadcn tokens; swapping to GlassCard must preserve `CardHeader`/`CardContent` spacing — mitigated by using simple `<div>` structure inside GlassCard with explicit padding
- `Tabs` styling (shadcn) uses `bg-muted`/`bg-background`; this may look out of place on the new darker V7 background. Accept as-is for Phase 54 — the `Tabs` redesign belongs to a future polish phase; UI-SPEC (48) does not redefine tab chrome
- Executive dashboard uses `TooltipProvider`; must remain for KpiCard tooltips — preserve

## Success criteria (from ROADMAP Phase 54)

1. Executive dashboard page renders with V7 design tokens (Satoshi/Cabinet Grotesk fonts, glassmorphism panels, V7 color palette) — POL-01
2. Projects page (home + detail) renders with V7 design tokens and all project cards use the new visual style — POL-02
3. Settings page renders with V7 design tokens with no visual inconsistencies against V7 pages — POL-03
