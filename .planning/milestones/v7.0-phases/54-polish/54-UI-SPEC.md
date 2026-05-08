---
phase: 54
slug: polish
status: draft
shadcn_initialized: true
preset: radix-nova
created: 2026-04-16
---

# Phase 54 — UI Design Contract (Polish)

> Styling contract for migrating pre-V7 pages (home dashboard, executive dashboard, projects detail, settings) to V7 tokens. Visual rules defined by Phase 48-53 UI-SPECs; this document records the token-for-token substitutions.

---

## Token Substitution Map

| Old (shadcn / ad-hoc) | New (V7) | Scope |
|-----------------------|----------|-------|
| `bg-card` / `bg-background` | `bg-[var(--v7-panel)]` | Page-level surfaces |
| `bg-muted` (in cards) | `bg-[var(--v7-panel-2)]` | Stat cell backgrounds |
| `text-foreground` | `text-[var(--v7-text)]` | Page titles, primary text |
| `text-muted-foreground` | `text-[var(--v7-muted)]` | Descriptions, secondary text |
| `text-muted-foreground` (captions 10-12px) | `text-[var(--v7-faint)]` | "Updated at", tiny metadata |
| `border` (shadcn card) | `border border-[var(--v7-glass-border)]` | Glass surfaces |
| `rounded-lg` (Card default) | `rounded-[var(--v7-radius)]` | Glass cards |
| `rounded-md` (buttons, inputs) | unchanged | Keep shadcn buttons |
| `font-semibold` on H1 | `font-[var(--font-cabinet)] font-bold` | Page titles only |
| `font-bold` on KPI number | `font-[var(--font-cabinet)] font-bold` | KPI numbers |
| Card component | `GlassCard` | KPI/stat/project surfaces |

## Typography map (from 48-UI-SPEC)

| Role | Class |
|------|-------|
| Page title (H1) | `text-[32px] leading-[1.1] tracking-[-0.03em] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]` |
| Section heading (H2/H3) | `text-[20px] leading-[1.2] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]` |
| Body | `text-[16px] leading-[1.5] text-[var(--v7-text)]` (inherits via `font-sans`) |
| Description | `text-[14px] text-[var(--v7-muted)]` (keep 14px — 12px is too small for page descriptions) |
| Caption / "Updated at" | `text-[12px] text-[var(--v7-faint)] uppercase tracking-[0.1em]` |
| KPI number | `text-[26.4px] font-bold font-[var(--font-cabinet)] leading-[1.1] text-[var(--v7-text)]` |

## Layout map

| Element | Old | New |
|---------|-----|-----|
| Page outer padding | `p-6` (24px) | `p-5` (20px) |
| Section gap | `space-y-6` / `mt-6` | `space-y-5` / `mt-5` (20px) |
| Card inner padding | `p-6` (shadcn default) | `p-5` (20px) |
| KPI grid gap | `gap-4` (16px) | `gap-3` (12px — V7 KPI grid gap) |
| Project grid gap | `gap-4` | `gap-4` (unchanged — V7 fleet card gap is 16px) |

## GlassCard usage pattern

```tsx
import { GlassCard } from "@/components/ui/glass-card";

<GlassCard className="p-5">
  <div className="flex items-center gap-2 pb-2">
    <Icon className="size-4 text-[var(--v7-muted)]" />
    <span className="text-[12px] uppercase tracking-[0.1em] text-[var(--v7-faint)]">
      Label
    </span>
  </div>
  <div className="text-[26.4px] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
    Value
  </div>
</GlassCard>
```

## Hover state — ProjectCard

```tsx
<GlassCard className="transition-all duration-[220ms] ease-out hover:-translate-y-[3px] hover:shadow-[var(--v7-glass-shadow-heavy)]">
  ...
</GlassCard>
```

Matches 48-UI-SPEC "Agent card hover: 0.22s ease + translateY(-3px) + shadow-heavy".

## Page-by-page summary

### 1. Home dashboard (`(dashboard)/page.tsx`)

- Outer: `p-5` container, `bg-[var(--v7-bg)]` via body (already set)
- H1: Cabinet Grotesk, 32px
- Description: Satoshi, 14px, muted
- 3 stat cards → `GlassCard` with simplified inner (no nested shadcn Card/Header/Content)
- Empty state: outer remains, Button stays shadcn (primary action)
- `ProjectSearch` → still client, grid unchanged, each `ProjectCard` swaps to GlassCard

### 2. Executive dashboard (`(dashboard)/executive/page.tsx`)

- Outer: `p-5` container
- H1: Cabinet Grotesk
- `KpiGrid` (6 KpiCards): each KpiCard uses GlassCard internally
- Tabs: shadcn Tabs untouched (inherits V7 bg via CSS cascade)
- Section headings inside tabs (H3) → Cabinet Grotesk 20px
- SourceStatusCard used in "Sources" tab keeps internal shadcn Card (out of scope; card-within-card nesting avoided by swapping the outer `grid` spacing only)
- Error/empty states use GlassCard with V7 tokens

### 3. Projects detail (`(dashboard)/projects/[id]/page.tsx`)

- Outer: `p-5`
- Breadcrumb: `text-[var(--v7-muted)]` with hover `text-[var(--v7-text)]`
- Header: H1 Cabinet Grotesk 32px, description 14px muted, metadata icons `text-[var(--v7-faint)]`
- `Members` Card → GlassCard
- Empty-state cards in Creations/Swarm Graph tabs → GlassCard with `p-5`

### 4. Settings (`(dashboard)/settings/page.tsx`)

- Outer: `p-5`
- H1 Cabinet Grotesk
- Description Satoshi muted
- Auth-profile Card grid → GlassCard per profile
- Other tabs wrap existing components; outer container inherits V7 via page body

## Dark/light theme

No additional work needed — all tokens above are already defined for both themes in Phase 48's globals.css. `[data-theme="dark"]` switch is handled by Phase 48 ThemeProvider.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | Button, Tabs, Tooltip, Avatar (retained in targets) | Not required |
| V7 internal | GlassCard | Pre-existing |

## Scope Summary

- 4 pages migrated
- 1 shared component (`KpiCard`) updated to use GlassCard
- 1 shared component (`ProjectCard`) updated to use GlassCard + hover
- No new dependencies introduced
- No data/logic changes

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS (no copy changes)
- [x] Dimension 2 Visuals: PASS (GlassCard + V7 tokens)
- [x] Dimension 3 Color: PASS (pure V7 tokens)
- [x] Dimension 4 Typography: PASS (Cabinet + Satoshi)
- [x] Dimension 5 Spacing: PASS (p-5, gap-3 KPI, gap-4 project, space-y-5)
- [x] Dimension 6 Registry Safety: PASS (no new registry deps)

**Approval:** ready
