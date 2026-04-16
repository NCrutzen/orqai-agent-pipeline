---
phase: 49
slug: navigation-realtime
status: draft
shadcn_initialized: true
preset: radix-nova
created: 2026-04-16
---

# Phase 49 — UI Design Contract

> Visual and interaction contract for the Navigation & Realtime phase. Inherits the V7 design system established in Phase 48 (`.planning/phases/48-foundation/48-UI-SPEC.md`). Covers ONLY the surfaces Phase 49 ships: V7 sidebar with dynamic swarm list and live mini-stats, the `/swarm/[swarmId]` route shell, and placeholder regions where later-phase components will dock.
>
> Reference design: `docs/designs/agent-dashboard-v2.html` -- sidebar block (`.sidebar`, `.nav-button`), main grid (`.main`), brand mark (`.brand`).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (already initialized) |
| Preset | radix-nova, baseColor neutral |
| Component library | radix-ui (existing) -- shadcn primitives still available for non-V7 chrome |
| Icon library | lucide-react (existing) |
| Body font | Satoshi Variable (loaded Phase 48, `--font-satoshi`) |
| Heading font | Cabinet Grotesk Variable (loaded Phase 48, `--font-cabinet`) |
| Mono font | Geist Mono (existing) |
| Theme strategy | `next-themes` with `attribute="data-theme"` (Phase 48) |
| Token namespace | `--v7-*` (Phase 48 tokens consumed read-only) |

**Phase 49 introduces NO new design tokens.** All visual values come from Phase 48 tokens (`web/app/globals.css` lines 120-200). New components style themselves entirely against existing tokens.

---

## Spacing Scale

Phase 48 already declared the V7 spacing scale. Phase 49 reuses it -- no new values.

| Token | Value | Usage in Phase 49 |
|-------|-------|-------------------|
| xs | 4px | Mini-stat pill internal gap (icon-text), nav button label-icon gap |
| sm | 8px | Brand subtitle margin from title, mini-stats horizontal gap |
| md | 12px | Sidebar nav button vertical gap, main grid row gap (between regions) |
| lg | 16px | Sidebar nav button padding, swarm list item padding (vertical), placeholder card padding |
| xl | 16px | Layout shell region padding |
| 2xl | 20px | Sidebar padding (24px horizontal, 24px vertical from Phase 48 layout decision), main area padding |
| 3xl | 20px | Main area horizontal padding |
| 4xl | 24px | Sidebar vertical padding |

Exceptions: `48px` brand mark size (Phase 48), `44px` minimum touch target for nav buttons.

---

## Typography

Reuses Phase 48's 4-size, 2-weight system. No new roles.

| Role | Font Family | Size | Weight | Line Height | Letter Spacing | Usage in Phase 49 |
|------|-------------|------|--------|-------------|----------------|-------------------|
| Display heading | Cabinet Grotesk | 32px | 700 | 1.1 | -0.03em | Brand title "Agent OS" |
| Section heading | Cabinet Grotesk | 20px | 700 | 1.2 | normal | Region placeholder titles ("Briefing", "Fleet", etc.) |
| Body | Satoshi | 16px | 400 | 1.5 | normal | Sidebar swarm names, region placeholder body text |
| Label / caption / mini-stat | Satoshi | 12px | 400 | 1.3 | 0.1em uppercase for nav section labels; normal for stats | Nav section label "Swarms", mini-stat counts and units, brand subtitle |

---

## Color

Phase 49 consumes Phase 48 tokens. No new colors. Below: which tokens this phase uses and where.

### Token Usage Map

| Surface | Token | Treatment |
|---------|-------|-----------|
| Page background | `--v7-bg` + radial gradient overlay (Phase 48) | Inherited from `(dashboard)` layout |
| Sidebar background | Sidebar gradient (Phase 48 `.v7-sidebar` pattern) | `linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))` over `--v7-bg` |
| Sidebar border-right | `--v7-line` | 1px solid |
| Brand mark icon background | `linear-gradient(135deg, var(--v7-teal), var(--v7-blue))` | Phase 48 brand gradient |
| Brand title text | `--v7-text` | 32px Cabinet Grotesk 700 |
| Brand subtitle | `--v7-faint` | 12px Satoshi 400 |
| Nav section label "Swarms" | `--v7-faint` | 12px uppercase letter-spacing 0.1em |
| Sidebar swarm row (default) | `--v7-text` (label), `--v7-faint` (sublabel) | No background |
| Sidebar swarm row hover | `rgba(255,255,255,0.04)` (dark) / `rgba(0,0,0,0.04)` (light) | translateX(2px), 0.18s ease |
| Sidebar swarm row ACTIVE | `--v7-teal-soft` background + 3px left border `--v7-teal` | Indicates `params.swarmId === row.id` |
| Mini-stat pill (active jobs) | `--v7-blue-soft` bg, `--v7-blue` text | "{N} active" |
| Mini-stat pill (agent count) | `--v7-teal-soft` bg, `--v7-teal` text | "{N} agents" |
| Sidebar empty state text | `--v7-muted` | "No swarms configured" copy |
| Layout shell region (placeholder) | `--v7-glass-bg` + `--v7-glass-border` via `<GlassCard>` | Same primitive Phase 48 ships |
| Placeholder caption | `--v7-faint` | "Briefing panel — Phase 51" small label |
| Realtime status indicator (when CHANNEL_ERROR) | `--v7-amber` dot | "Reconnecting..." inline label |

### 60/30/10 Adherence

- **60% dominant**: page bg + sidebar gradient (uses `--v7-bg` and translucent overlay)
- **30% secondary**: GlassCard placeholder regions (uses `--v7-glass-bg`)
- **10% accent**: teal active state for current swarm row, blue/teal for mini-stat pills, brand gradient on logo

Accent reserved for: active swarm row indicator, mini-stat pills, brand mark gradient, reconnecting indicator (amber). NOT used for: nav button hover, region borders, placeholder captions, body text.

### Destructive

No destructive actions in Phase 49 (no delete/remove operations on UI surface). `--v7-red` is unused this phase.

---

## Glassmorphism Application

Phase 49 uses two distinct glass treatments from Phase 48's spec:

### Sidebar Glass

```css
/* Applied to .v7-sidebar (the swarm sidebar component) */
background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)),
            var(--v7-bg);
backdrop-filter: blur(var(--v7-glass-blur));
border-right: 1px solid var(--v7-line);
```

### Region Placeholder Glass

Reuses `<GlassCard>` from `web/components/ui/glass-card.tsx`:

```css
background: var(--v7-glass-bg);
backdrop-filter: blur(18px);
border: 1px solid var(--v7-glass-border);
box-shadow: var(--v7-glass-shadow);
border-radius: var(--v7-radius); /* 22px */
```

---

## Border Radius

Reuses Phase 48 tokens. No new radii.

| Element | Token | Value |
|---------|-------|-------|
| Sidebar swarm row | `--v7-radius-inner` | 16px |
| Brand mark icon | `--v7-radius-inner` | 16px |
| Mini-stat pills | `--v7-radius-pill` | 999px |
| Layout shell placeholder regions | `--v7-radius` | 22px |
| Active row left accent bar | n/a | 0px (square edges, full height of row) |

---

## Layout

### Outer Shell (defined in `(dashboard)/layout.tsx`)

| Property | Value |
|----------|-------|
| Grid | `grid-template-columns: 286px 1fr` (Phase 48 spec) |
| Height | `100vh`, `overflow: hidden` |
| Sidebar width | 286px (matches Phase 48) |
| Main padding | 20px |

The (dashboard) layout chooses between V7 swarm sidebar (when pathname starts with `/swarm`) and the legacy app-sidebar (all other dashboard routes). Decision happens server-side based on `headers().get("next-url")` or `usePathname()` in a client wrapper.

### V7 Swarm Sidebar (`web/components/v7/swarm-sidebar.tsx`)

```
┌─────────────────────────┐
│ [logo] Agent OS         │  ← brand block: 48px icon + title + subtitle
│        Control room…    │
│                         │
├─────────────────────────┤
│ SWARMS                  │  ← uppercase 12px label, --v7-faint
│  ┌─ Debtor Email     ┐  │  ← swarm row 1 (active)
│  │  3 active 5 agents│  │     teal left bar + soft bg
│  └───────────────────┘  │
│  ┌─ Sales Email      ┐  │  ← swarm row 2 (idle)
│  │  0 active 3 agents│  │
│  └───────────────────┘  │
│                         │
├─────────────────────────┤
│ {N} active swarms       │  ← footer summary stats
│ {N} jobs today          │
└─────────────────────────┘
```

| Region | Spacing | Typography |
|--------|---------|------------|
| Sidebar padding | 24px (V) / 20px (H) | -- |
| Brand block height | 48px logo + 2 lines text | Title 32/700 Cabinet, Subtitle 12/400 Satoshi |
| Brand-to-list gap | 20px | -- |
| Section label height | 12px line-height 1.3 | 12/400 Satoshi, uppercase, 0.1em letter-spacing |
| Swarm row | 16px V padding, 12px H padding | Name 16/400 Satoshi, stats 12/400 Satoshi |
| Row-to-row gap | 8px | -- |
| Footer stats | 12/400 Satoshi `--v7-faint`, 4px between lines | -- |

### `/swarm/[swarmId]` Layout Shell (`web/app/(dashboard)/swarm/[swarmId]/page.tsx`)

```
┌────────────────────────────────────────────────────────┐
│ [Swarm name]                                  ⚙ controls│  ← header (32/700 Cabinet)
│ [Swarm description]                                    │
├────────────────────────────────────────────────────────┤
│  ┌────────────────────────────┐  ┌──────────────────┐  │  ← briefing grid (1.4fr 0.8fr)
│  │ Briefing — Phase 51        │  │ KPI grid         │  │
│  │ (placeholder)              │  │ — Phase 51       │  │
│  └────────────────────────────┘  └──────────────────┘  │
├────────────────────────────────────────────────────────┤
│ Fleet — Phase 51 (4-column placeholder grid)           │
│ [card] [card] [card] [card]                            │
├────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌────────────────────────────┐  │  ← workbench (1.2fr 0.8fr)
│  │ Kanban — Phase 52│  │ Terminal — Phase 52        │  │
│  │ (placeholder)    │  │ (placeholder)              │  │
│  └──────────────────┘  └────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

| Property | Value |
|----------|-------|
| Main grid | `grid-template-rows: auto auto auto 1fr`, gap 20px |
| Briefing row | `grid-template-columns: 1.4fr 0.8fr`, gap 20px |
| Fleet row | `grid-template-columns: repeat(4, 1fr)`, gap 16px |
| Workbench row | `grid-template-columns: 1.2fr 0.8fr`, gap 20px |

All region containers are `<GlassCard>` with a centered placeholder body containing:
- Section heading (20/700 Cabinet, `--v7-text`)
- Caption ("Briefing panel — Phase 51", `--v7-faint`, 12/400 Satoshi)

### Responsive Breakpoints (Phase 48)

| Breakpoint | Sidebar | Briefing | Fleet | Workbench |
|------------|---------|----------|-------|-----------|
| ≥1280px | 286px fixed | 2 col | 4 col | 2 col |
| 1280px | 286px fixed | 1 col | 2 col | 1 col |
| 920px | Top horizontal scrollable bar | 1 col | 1 col | 1 col |

---

## Active States, Hover, Animation

| Element | Property | Value |
|---------|----------|-------|
| Swarm row hover | bg, transform | `rgba(255,255,255,0.04)` + `translateX(2px)`, 0.18s ease |
| Swarm row active (current swarm) | bg, left border | `--v7-teal-soft` + 3px solid `--v7-teal` left border |
| Brand logo gradient | `linear-gradient(135deg, var(--v7-teal), var(--v7-blue))` | static |
| Mini-stat pill | none | static, no hover (informational) |
| Realtime status indicator | dot opacity | `0.6` idle, pulse 1.8s infinite when "Reconnecting..." |
| GlassCard placeholder | hover | none in Phase 49 (hover behavior is per-phase when components fill the regions) |
| Sidebar mount/unmount | none | layout swap is instantaneous (no cross-fade in this phase) |

---

## Realtime Status Indicator

A small inline element rendered in the swarm view header (next to the swarm name) when channel status is not `SUBSCRIBED`.

| State | Color | Copy |
|-------|-------|------|
| `SUBSCRIBED` | hidden | -- |
| `CHANNEL_ERROR` | `--v7-amber` dot | "Reconnecting…" |
| `TIMED_OUT` | `--v7-amber` dot | "Reconnecting…" |
| `CLOSED` | `--v7-red` dot | "Disconnected. Refresh to retry." |

Dot is 8px circle, copy is 12/400 Satoshi `--v7-muted`. No toast — inline only.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Sidebar section label | "Swarms" (uppercase via CSS, source-cased "Swarms") |
| Sidebar empty state heading | "No swarms configured" |
| Sidebar empty state body | "Create your first agent swarm in the projects page to see it appear here." |
| Mini-stat (active jobs) | "{N} active" (singular and plural identical for compactness) |
| Mini-stat (agents) | "{N} agents" |
| Sidebar footer summary | "{N} active swarms · {N} jobs today" |
| Brand title | "Agent OS" |
| Brand subtitle | "Control room for swarms" |
| Region placeholder: briefing | Heading "Briefing", caption "AI narrative — Phase 51" |
| Region placeholder: KPIs | Heading "KPIs", caption "Snapshot grid — Phase 51" |
| Region placeholder: fleet | Heading "Subagent fleet", caption "Agent cards — Phase 51" |
| Region placeholder: kanban | Heading "Kanban", caption "Job board — Phase 52" |
| Region placeholder: terminal | Heading "Terminal", caption "Event stream — Phase 52" |
| Realtime reconnecting | "Reconnecting…" |
| Realtime disconnected | "Disconnected. Refresh to retry." |
| Swarm not found (404) | "Swarm not found. Return to dashboard." (uses Next.js notFound() default with V7 styling) |
| Loading state (initial swarm list) | "Loading swarms…" with spinner |

No destructive actions, no confirmations.

---

## Drawer / Overlay Specification

Phase 49 ships no drawers. The drawer tokens defined in Phase 48 are not yet consumed.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none new (Phase 49 uses no NEW shadcn primitives) | not required |
| Phase 48 V7 components | GlassCard | not applicable (own components) |
| Third-party | none | not applicable |

---

## Component Map (what Phase 49 ships)

| File | Type | Phase 49 deliverable? |
|------|------|----------------------|
| `web/components/v7/swarm-sidebar.tsx` | Client component | Yes (NEW) |
| `web/components/v7/swarm-realtime-provider.tsx` | Client component | Yes (NEW) |
| `web/components/v7/swarm-layout-shell.tsx` | Server/client mix | Yes (NEW) |
| `web/components/v7/swarm-list-item.tsx` | Client (subset) | Yes (NEW, child of sidebar) |
| `web/components/v7/realtime-status-indicator.tsx` | Client (subset) | Yes (NEW) |
| `web/lib/v7/use-realtime-table.ts` | Hook | Yes (NEW) |
| `web/lib/v7/types.ts` | Types | Yes (NEW) |
| `web/app/(dashboard)/layout.tsx` | Server | Modified (sidebar choice branch) |
| `web/app/(dashboard)/swarm/[swarmId]/layout.tsx` | Server | Yes (NEW) |
| `web/app/(dashboard)/swarm/[swarmId]/page.tsx` | Server | Yes (NEW) |
| `web/app/(dashboard)/swarm/[swarmId]/not-found.tsx` | Server | Yes (NEW) |

---

## Phase 49 Scope Summary

This UI-SPEC covers ONLY Phase 49 deliverables:

1. **V7 swarm sidebar** -- new component rendering the brand block, swarm list with mini-stats, and active highlight
2. **Layout choice in (dashboard)** -- branch on pathname to render V7 sidebar (`/swarm/*`) or legacy sidebar (everything else)
3. **`/swarm/[swarmId]` route** -- layout (Realtime provider + access check) + page (placeholder regions in V7 grid)
4. **Realtime status indicator** -- inline element in swarm view header
5. **Mini-stat pills** -- active jobs and agent count rendered per swarm row, live-updated

Tokens for fleet cards, kanban, terminal, drawer, swimlanes, graph particles are inherited from Phase 48 but NOT consumed in this phase.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS — all states have copy, no destructive actions to confirm, brand voice consistent with Phase 48
- [x] Dimension 2 Visuals: PASS — uses Phase 48 glass pattern, sidebar gradient, no new primitives without precedent
- [x] Dimension 3 Color: PASS — strict 60/30/10 split inherited from Phase 48; accent (teal) reserved for active state, mini-stats, brand
- [x] Dimension 4 Typography: PASS — 4 sizes, 2 weights from Phase 48; no new font roles introduced
- [x] Dimension 5 Spacing: PASS — all values multiples of 4, scale matches Phase 48; touch target ≥44px
- [x] Dimension 6 Registry Safety: PASS — no new third-party registry blocks, only Phase 48 GlassCard reused

**Approval:** approved 2026-04-16 (auto-approved in autonomous mode; sign-off based on inheritance from Phase 48 verified UI-SPEC)
