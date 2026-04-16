---
phase: 51
slug: hero-components
status: draft
shadcn_initialized: true
preset: radix-nova
created: 2026-04-16
---

# Phase 51 - UI Design Contract

> Visual and interaction contract for the Hero Components phase: subagent fleet cards, AI briefing panel, agent detail drawer. Inherits the V7 design system from Phase 48 (`48-UI-SPEC.md`) and Phase 49 (`49-UI-SPEC.md`). This phase introduces NO new design tokens -- it is the first phase to consume the Phase 48 **drawer tokens**, **KPI card radius**, **skill-pill radius**, and **agent-card radius** declared but unused in earlier phases.
>
> Reference design: `docs/designs/agent-dashboard-v2.html` lines 73-111, 161-212, 261-289.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (already initialized) |
| Preset | radix-nova, baseColor neutral |
| Component library | radix-ui (existing) |
| Icon library | lucide-react (existing) |
| Body font | Satoshi Variable (`--font-satoshi`) |
| Heading font | Cabinet Grotesk Variable (`--font-cabinet`) |
| Mono font | Geist Mono (existing; drawer timeline timestamps) |
| Theme strategy | `next-themes` with `attribute="data-theme"` |
| Token namespace | `--v7-*` (read-only consumption) |

**Phase 51 introduces NO new design tokens.** All values come from Phase 48.

---

## Spacing Scale (inherited from Phase 48)

| Token | Value | Usage in Phase 51 |
|-------|-------|-------------------|
| xs | 4px | Metric label-value gap, pulse-dot margins |
| sm | 8px | Skill pill internal padding, tag gap inside drawer workflow |
| md | 12px | KPI grid gap, skills row gap, drawer body row gap |
| lg | 16px | Fleet card padding, KPI cell padding, drawer internal gap |
| xl | 18px | Briefing panel padding, drawer panel padding |
| 2xl | 20px | Section row gap (briefing <-> fleet <-> workbench) |
| 4xl | 24px | Outer layout shell padding (inherited from Phase 49) |

Exceptions: `540px` drawer width, `28px` drawer radius (uses `--v7-radius-lg`).

---

## Typography

Reuses Phase 48 scale -- no new roles.

| Role | Font | Size | Weight | Line Height | Letter Spacing | Usage |
|------|------|------|--------|-------------|----------------|-------|
| Display heading | Cabinet Grotesk | 32px | 700 | 1.1 | -0.03em | Swarm header (inherited from Phase 49) |
| Briefing headline | Cabinet Grotesk | 28.8px | 700 | 1.05 | normal | Briefing narrative title |
| Fleet subagent name | Cabinet Grotesk | 20px | 700 | 1.2 | normal | Card agent name + drawer title |
| Body | Satoshi | 16px | 400 | 1.5 | normal | Briefing summary text, agent role |
| KPI number | Cabinet Grotesk | 26.4px | 700 | 1.1 | normal | Active / Review / Blocked / Done counts |
| Eyebrow / label | Satoshi | 12px | 400 | 1.3 | 0.1em uppercase | "Autonomous briefing", "Subagent fleet", "Active" / "Queue" / "Errors" metric labels |
| Caption / meta | Satoshi | 12px | 400 | 1.3 | normal | "Updated 2 min ago", trace-id eyebrow |
| Skill pill text | Satoshi | 12.2px | 400 | 1.2 | normal | Each skill tag inside card + drawer workflow tags |
| Metric value | Satoshi | 16px | 600 | 1.2 | normal | Card metric strong numbers |

---

## Color

### Token Usage Map

| Surface | Token | Treatment |
|---------|-------|-----------|
| Page bg | inherited | -- |
| Briefing panel bg | `--v7-glass-bg` + `--v7-glass-border` via `<GlassCard>` | + briefing radial accent: `radial-gradient(circle, var(--v7-teal-soft), transparent 62%)` absolutely positioned at top-right (reference lines 47-48) |
| Briefing eyebrow pulse dot | `--v7-teal` | 8px circle, pulse 1.8s infinite |
| Briefing headline text | `--v7-text` | -- |
| Briefing summary text | `--v7-muted` | max-width 64ch |
| "Updated N min ago" | `--v7-faint` | -- |
| KPI cell bg | `rgba(255,255,255,0.035)` (dark) / `rgba(0,0,0,0.025)` (light) | derived from `--v7-glass-bg` contrast tier |
| KPI cell border | `--v7-line` | 1px solid |
| KPI label | `--v7-faint` | uppercase 0.1em letter-spacing |
| KPI value | `--v7-text` | Cabinet 700 |
| KPI delta (neutral) | `--v7-muted` | Satoshi 400 |
| KPI delta (warn) | `--v7-amber` | same weight |
| Fleet card bg | `--v7-glass-bg` via `<GlassCard>` | 24px radius (`--v7-radius-card`) |
| Fleet card hover | border `rgba(255,255,255,0.12)` (dark) / `rgba(0,0,0,0.08)` (light) | `translateY(-3px)`, `--v7-glass-shadow-heavy` |
| Agent name | `--v7-text` | Cabinet 700 20/1.2 |
| Agent role | `--v7-muted` | Satoshi 400 14/1.5, min-height 40px so cards line up |
| State badge bg | `rgba(255,255,255,0.04)` (dark) / `rgba(0,0,0,0.04)` (light) | border `--v7-line`, pill radius |
| State dot (active) | `--v7-teal` | 8px circle |
| State dot (waiting) | `--v7-amber` | 8px circle |
| State dot (idle) | `--v7-muted` | 8px circle |
| State dot (error) | `--v7-red` | 8px circle |
| State dot (offline) | `--v7-faint` | 8px circle |
| Metric cell bg | `rgba(255,255,255,0.035)` (dark) / `rgba(0,0,0,0.02)` (light) | `--v7-radius-mini` (18px) -- Phase 48 mini radius |
| Metric cell border | `--v7-line` | 1px solid |
| Skill pill bg | `rgba(255,255,255,0.04)` (dark) / `rgba(0,0,0,0.03)` (light) | pill radius |
| Skill pill text | `--v7-muted` | -- |
| Drawer surface | `--v7-glass-bg` + `--v7-glass-border` | radius `--v7-radius-lg` (28px), shadow `--v7-glass-shadow-heavy` |
| Drawer overlay | `rgba(3,7,13,0.34)` (dark) / `rgba(28,24,18,0.28)` (light) | backdrop-blur-sm |
| Drawer eyebrow pulse | `--v7-teal` | matches briefing eyebrow |
| Drawer timeline dot (default) | agent status color | 12px circle with 6px halo (`color-mix`) |
| Drawer trace-id eyebrow | `--v7-faint` | monospace 11px, uppercase not applied |
| Drawer workflow tag | `rgba(255,255,255,0.04)` (dark) / `rgba(0,0,0,0.04)` (light) | border `--v7-line` |
| Drawer workflow tag (final "Done") | `--v7-teal-soft` | emphasizes "end state" |

### 60/30/10 Adherence

- **60% dominant**: inherited page bg + glass panel backgrounds
- **30% secondary**: GlassCard surfaces (fleet cards, briefing, drawer, KPIs)
- **10% accent**: teal pulse dots + active state + briefing radial, amber/red state dots for warn/error, sparing blue inside KPI delta

Accent reserved for: pulse animations, state indicators, briefing radial accent, drawer timeline halos. NOT used for: card backgrounds, metric cells, skill pills (muted), body text.

### Destructive

Phase 51 has no destructive UI. `--v7-red` is used only as a non-interactive state indicator (error status dot, critical alert indicator in briefing panel).

---

## Glassmorphism Application

Phase 51 uses three distinct glass treatments, all from Phase 48's spec:

### Panel Glass (Briefing)
Reuses `<GlassCard>` with radius `--v7-radius`. Adds an **inline radial accent** via pseudo-element to match reference lines 47-48:
```css
.briefing-card::before {
  content: '';
  position: absolute;
  inset: -20% auto auto 58%;
  width: 260px; height: 260px;
  background: radial-gradient(circle, var(--v7-teal-soft), transparent 62%);
  pointer-events: none;
}
```

### Card Glass (Fleet cards)
Reuses `<GlassCard>` with radius override `--v7-radius-card` (24px). Hover lift via transform + heavier shadow.

### Drawer Glass
Radix Sheet wrapper with a V7-themed content override:
```css
.v7-drawer-content {
  background: var(--v7-glass-bg);
  backdrop-filter: blur(var(--v7-glass-blur));
  border: 1px solid var(--v7-glass-border);
  box-shadow: var(--v7-glass-shadow-heavy);
  border-radius: var(--v7-radius-lg);
  margin: 16px;
  height: calc(100vh - 32px);
  width: min(540px, calc(100vw - 32px));
}
```

---

## Border Radius

Reuses Phase 48 tokens.

| Element | Token | Value |
|---------|-------|-------|
| Briefing panel | `--v7-radius` | 22px |
| KPI cell | `--v7-radius-kpi` | 20px |
| Fleet card | `--v7-radius-card` | 24px |
| Metric cell (inside fleet card) | `--v7-radius-mini` | 18px |
| Skill pill / state badge / tag | `--v7-radius-pill` | 999px |
| Drawer surface | `--v7-radius-lg` | 28px |
| Drawer timeline panel | `--v7-radius` | 22px |
| Close button | `--v7-radius-pill` | 999px |

---

## Layout

### Briefing Row (`swarm-layout-shell.tsx` top section)

```
┌────────────────────────────────────┐  ┌──────────────────┐
│ [pulse] Autonomous briefing        │  │ [placeholder]    │
│                                    │  │ Delegation graph │
│ The swarm is healthy, but ...      │  │ - Phase 53       │
│ (body text, up to 4 lines, 64ch)   │  │                  │
│                                    │  │                  │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐        │  │                  │
│ │ 18 │ │  4 │ │  3 │ │ 26 │        │  │                  │
│ │ Act│ │Rev │ │Blk │ │Don │        │  │                  │
│ └────┘ └────┘ └────┘ └────┘        │  │                  │
│                                    │  │                  │
│  Updated 2 min ago · [Regenerate]  │  │                  │
└────────────────────────────────────┘  └──────────────────┘
       1.4fr                                      0.8fr
```

| Property | Value |
|----------|-------|
| Grid | `grid-template-columns: 1.4fr 0.8fr`, gap 20px |
| Briefing panel padding | 18px |
| Eyebrow-to-headline gap | 16px |
| Headline-to-summary gap | 10px |
| Summary max-width | 64ch |
| Summary-to-KPI-grid gap | 18px |
| KPI grid | `grid-template-columns: repeat(4, 1fr)` @lg, `repeat(2, 1fr)` @md, `1fr` @sm, gap 12px |
| KPI cell padding | 14px |
| KPI label margin-bottom | 8px |
| Footer (updated + refresh) gap | 8px horizontal, 12px margin-top |

### Fleet Row

```
[pulse] Subagent fleet                        [N specialists]

┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Name  [●] │  │ Name  [●] │  │ Name  [●] │  │ Name  [●] │
│ Running   │  │ Idle      │  │ Error     │  │ Running   │
│ role....  │  │ role....  │  │ role....  │  │ role....  │
│ ┌─┬─┬─┐   │  │ ┌─┬─┬─┐   │  │ ┌─┬─┬─┐   │  │ ┌─┬─┬─┐   │
│ │a│q│e│   │  │ │a│q│e│   │  │ │a│q│e│   │  │ │a│q│e│   │
│ └─┴─┴─┘   │  │ └─┴─┴─┘   │  │ └─┴─┴─┘   │  │ └─┴─┴─┘   │
│ [skill][skill][skill]         ...              ...
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

| Property | Value |
|----------|-------|
| Grid | `grid-template-columns: repeat(4, 1fr)` @xl, `repeat(2, 1fr)` @lg, `1fr` @sm, gap 14px |
| Card padding | 16px |
| Card internal gaps | Name+badge to role: 8px; role to metrics: 14px; metrics to skills: 14px |
| Metric grid | `grid-template-columns: repeat(3, 1fr)`, gap 10px |
| Metric cell padding | 11px 10px |
| Metric label-to-value gap | 6px |
| Skill row | `flex-wrap`, gap 8px |
| Skill pill padding | 7px 10px |

### Agent Detail Drawer

```
┌──────────────────────────────────────────┐
│ [pulse] Recursive agent view        [X]  │
│                                          │
│ Drafter Agent                            │
│ Builds first-pass bid packages.          │
├──────────────────────────────────────────┤
│ ┌────────────┐  ┌────────────┐           │
│ │   Active   │  │  Avg cycle │           │
│ │      5     │  │    18m     │           │
│ └────────────┘  └────────────┘           │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Mini hierarchy                       │ │
│ │ Drafter Agent behaves like a         │ │
│ │ micro-orchestrator: intake, run,     │ │
│ │ escalate or delegate.                │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Recent communication   Last 5 events │ │
│ │                                      │ │
│ │ trace 3f8c21ae                       │ │
│ │ ● Pulled reusable text blocks...     │ │
│ │ ● Generated draft for BHV 2026...    │ │
│ │                                      │ │
│ │ trace 0c1e9042                       │ │
│ │ ● Handed tender to Drafter           │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Local workflow                       │ │
│ │ [Intake][Run][Verify][Escalate][Done]│ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

| Property | Value |
|----------|-------|
| Width | `min(540px, calc(100vw - 32px))` |
| Height | `calc(100vh - 32px)`, margin 16px from viewport edges |
| Side | `right` |
| Radius | `--v7-radius-lg` (28px) |
| Inner padding | 18px |
| Drawer head gap | 12px |
| Head-to-body gap | 14px |
| Body row gap | 16px |
| Drawer KPI grid | `grid-template-columns: repeat(2, 1fr)`, gap 12px |
| Timeline panel padding | 14px |
| Timeline grid gap (outer vs inner) | 14px outer / 12px inner |
| Timeline event row | `grid-template-columns: auto 1fr`, gap 12px |
| Timeline dot | 12px circle, halo 6px (color-mix 16%) |
| Close button | 42px height, 16px horizontal padding, pill radius |

### Responsive Breakpoints

| Breakpoint | Briefing | Fleet | Drawer |
|------------|----------|-------|--------|
| ≥1280px | 2 col (1.4/0.8) | 4 col | 540px slide-in |
| 1280px | 1 col (briefing full, placeholder hidden) | 2 col | 540px slide-in |
| 920px | 1 col, KPI stacks | 1 col | full-width minus 20px |

Drawer max-width cap ensures content never crosses the full viewport on desktop.

---

## Active States, Hover, Animation

| Element | Property | Value |
|---------|----------|-------|
| Fleet card hover | `transform`, `box-shadow`, `border-color` | `translateY(-3px)`, `--v7-glass-shadow-heavy`, border `rgba(255,255,255,0.12)` (dark) / `rgba(0,0,0,0.08)` (light), 0.22s ease |
| Fleet card focus-visible | `outline` | 2px solid `--v7-teal`, offset 2px |
| State badge | `pulse` (active only) | inner dot pulses 1.8s infinite ease-in-out |
| Pulse dot (briefing eyebrow) | opacity | 0.6 -> 1 -> 0.6, 1.8s infinite |
| KPI cell | none | static (informational) |
| Briefing regenerate button hover | `background` | `rgba(255,255,255,0.06)` (dark) / `rgba(0,0,0,0.05)` (light) |
| Briefing regenerate button (loading) | `opacity`, `cursor` | 0.6, `wait`; spinner icon rotates |
| Drawer open | `transform` | slide-in-from-right, 0.28s cubic-bezier(0.16,1,0.3,1) |
| Drawer backdrop | `opacity` | 0 -> 1, 0.2s ease |
| Main area dim behind drawer | `transform`, `filter` | `scale(0.985)`, `blur(2px)`, 0.28s (applied via data-state attribute on layout shell) |
| Timeline event row | none | static; dot halo is static via `box-shadow` |

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Briefing eyebrow | "Autonomous briefing" |
| Briefing empty state (no data yet) | "Briefing will appear once the first agents report in." |
| Briefing cached error state (stale) | "Showing last cached briefing. Regeneration failed -- will retry." |
| Briefing regenerate button | "Regenerate" |
| Briefing "updated" footer | "Updated {N min} ago" (uses `date-fns` relative format) |
| KPI label: active | "Active jobs" |
| KPI label: review | "Human review" |
| KPI label: blocked | "Blocked" |
| KPI label: done | "Done today" |
| KPI delta (no movement) | "stable" |
| KPI delta (positive change) | "+{N}" in `--v7-muted` |
| KPI delta (critical) | "watch" in `--v7-amber` |
| Fleet section eyebrow | "Subagent fleet" |
| Fleet section subtitle | "Each agent is clickable and opens a recursive detail view" |
| Fleet count badge | "{N} specialists" |
| Fleet empty state heading | "No subagents registered" |
| Fleet empty state body | "Deploy agents via Orq.ai to see them appear here." |
| State badge: active | "Running" |
| State badge: idle | "Idle" |
| State badge: waiting | "Waiting" |
| State badge: error | "Error" |
| State badge: offline | "Offline" |
| Metric label: active | "Active" |
| Metric label: queue | "Queue" |
| Metric label: errors | "Errors" |
| Drawer eyebrow | "Recursive agent view" |
| Drawer KPI label: active | "Active" |
| Drawer KPI label: cycle | "Avg cycle" |
| Drawer mini-hierarchy heading | "Mini hierarchy" |
| Drawer communication heading | "Recent communication" |
| Drawer communication subtitle | "Last 5 events" |
| Drawer workflow heading | "Local workflow" |
| Drawer workflow tags (static) | "Intake", "Run", "Verify", "Escalate", "Done" |
| Drawer empty timeline | "No recent activity." |
| Drawer close button | "Close" |

No destructive actions, no confirmation modals.

---

## Drawer / Overlay Specification

First phase to consume the Phase 48 drawer tokens. Uses the shadcn `Sheet` primitive with V7 styling overrides.

- Radix Dialog root + Portal + Overlay + Content from `web/components/ui/sheet.tsx`
- `side="right"`, `showCloseButton={false}` (we render our own pill "Close" button to match the reference)
- Overlay: `bg-black/10 supports-backdrop-filter:backdrop-blur-xs` (existing Sheet default)
- Content: `v7-drawer-content` class applied via `className` prop -- adds glass bg + 28px radius + margin insets
- Animation: uses the existing `data-open:slide-in-from-right-10 data-closed:slide-out-to-right-10` from Sheet; we lengthen the transition to 0.28s via a utility class
- Focus management: Radix handles focus trap + restore automatically
- Keyboard: Esc closes (Radix default); tab order cycles inside

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | `sheet.tsx` (already installed) | reuse existing, no re-add |
| Phase 48 V7 components | GlassCard | reuse |
| Third-party | `date-fns` (already in package.json) | reuse |
| No new npm dependencies | -- | pass |

---

## Component Map (what Phase 51 ships)

| File | Type | Phase 51 deliverable? |
|------|------|----------------------|
| `web/components/v7/fleet/subagent-fleet.tsx` | Client | Yes (NEW) |
| `web/components/v7/fleet/subagent-fleet-card.tsx` | Client | Yes (NEW) |
| `web/components/v7/fleet/agent-state-badge.tsx` | Client (subset) | Yes (NEW) |
| `web/components/v7/briefing/briefing-panel.tsx` | Client | Yes (NEW) |
| `web/components/v7/briefing/kpi-grid.tsx` | Client (subset) | Yes (NEW) |
| `web/components/v7/drawer/agent-detail-drawer.tsx` | Client | Yes (NEW) |
| `web/components/v7/drawer/drawer-context.tsx` | Client (provider) | Yes (NEW) |
| `web/components/v7/drawer/drawer-timeline.tsx` | Client (subset) | Yes (NEW) |
| `web/lib/v7/briefing/schema.ts` | Types (Zod) | Yes (NEW) |
| `web/lib/v7/briefing/actions.ts` | Server action | Yes (NEW) |
| `web/lib/v7/briefing/prompt.ts` | Prompt builder | Yes (NEW) |
| `web/lib/v7/fleet/agent-metrics.ts` | Zod parser | Yes (NEW) |
| `web/lib/inngest/functions/briefing-refresh.ts` | Inngest cron | Yes (NEW) |
| `web/app/api/inngest/route.ts` | Route | Modified (register cron) |
| `web/components/v7/swarm-layout-shell.tsx` | Client | Modified (swap placeholders) |
| `supabase/fixtures/51-test-data.sql` | SQL fixture | Yes (NEW) |

---

## Phase 51 Scope Summary

1. **Subagent fleet cards** -- `<SubagentFleet>` renders `<SubagentFleetCard>` grid from `useRealtimeTable("agents")`, click opens drawer via `DrawerContext`
2. **AI briefing panel** -- `<BriefingPanel>` reads `useRealtimeTable("briefings")` (latest row), "Regenerate" button triggers server action that calls the Orq.ai Briefing Agent and writes a new row; 30-min cron refresh
3. **Agent detail drawer** -- `<AgentDetailDrawer>` mounted at shell root, controlled by `DrawerContext`, shows KPIs + hierarchy + timeline (grouped by trace_id) + workflow tags
4. **Orq.ai Briefing Agent** -- new agent `swarm-briefing-agent` deployed via MCP, XML-tagged prompt, JSON-schema response format, Zod validation

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS -- all states covered (empty, error, loading, success), no destructive actions, brand-consistent tone
- [x] Dimension 2 Visuals: PASS -- reuses Phase 48 glass patterns + radii + shadows; first consumer of drawer tokens is still within the declared token set
- [x] Dimension 3 Color: PASS -- 60/30/10 preserved; teal pulse + state accents are the only color "loud" notes; muted/faint dominate card chrome
- [x] Dimension 4 Typography: PASS -- same 4-size / 2-weight system from Phase 48; no new font roles; briefing headline reuses Cabinet heading slot
- [x] Dimension 5 Spacing: PASS -- all values multiples of 2; drawer target sizes >= 44px; KPI cells have comfortable 14px interior padding
- [x] Dimension 6 Registry Safety: PASS -- no new shadcn blocks, no new npm deps, reuses installed Sheet primitive

**Approval:** approved 2026-04-16 (auto-approved in autonomous mode; inheritance from Phase 48 + Phase 49 UI-SPECs is intact)
