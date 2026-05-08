---
phase: 52
slug: live-interactivity
status: draft
shadcn_initialized: true
preset: radix-nova
created: 2026-04-16
---

# Phase 52 - UI Design Contract

> Visual and interaction contract for the Live Interactivity phase: Claude-style terminal event stream, 5-column Kanban board with drag-and-drop, and smart sidebar filter chips. Inherits the V7 design system from Phase 48 (`48-UI-SPEC.md`), Phase 49 (`49-UI-SPEC.md`), and Phase 51 (`51-UI-SPEC.md`).
>
> **Phase 52 introduces ONE new keyframe** (`v7-blink` for the terminal caret) and **ONE new utility class** (`v7-terminal-shell`). Everything else reuses Phase 48 tokens. No new color tokens, no new font roles.
>
> Reference design: `docs/designs/agent-dashboard-v2.html` lines 82-105 (CSS), 222-263 (markup), 307-314 (events fixture).

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
| Mono font | Geist Mono (`--font-mono`) -- terminal payload + timestamp |
| Theme strategy | `next-themes` with `attribute="data-theme"` |
| Token namespace | `--v7-*` (read-only consumption) |
| New dependencies | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers` |

**Phase 52 introduces NO new design tokens.** All values come from Phase 48.

---

## Spacing Scale (inherited from Phase 48)

| Token | Value | Usage in Phase 52 |
|-------|-------|-------------------|
| xs | 4px | Job card title-to-description gap |
| sm | 8px | Tag gap, terminal log row gap, smart filter chip internal padding |
| md | 12px | Kanban column gap, terminal panel internal padding |
| lg | 14px | Terminal panel padding, job card padding |
| xl | 18px | Workbench section gap (between Kanban + Terminal) -- inherited from Phase 51 |
| 2xl | 20px | Outer shell padding -- inherited |

Exceptions: `22px` column radius (uses `--v7-radius`), `18px` job card radius (uses `--v7-radius-mini`), `999px` chip radius (`--v7-radius-pill`).

---

## Typography

Reuses Phase 48 + Phase 51 scale -- no new roles.

| Role | Font | Size | Weight | Line Height | Letter Spacing | Usage |
|------|------|------|--------|-------------|----------------|-------|
| Panel heading | Cabinet Grotesk | 20px | 700 | 1.2 | normal | "Kanban", "Live event stream" panel headings |
| Column title | Cabinet Grotesk | 14px | 700 | 1.2 | normal | "Backlog", "Ready", "In progress", "Human review", "Done" |
| Column count | Satoshi | 12.8px | 400 | 1.2 | normal | "(N)" beside column title in `--v7-muted` |
| Job title | Cabinet Grotesk | 15.5px | 700 | 1.3 | normal | Kanban card title |
| Job description | Satoshi | 14px | 400 | 1.4 | normal | Kanban card description (line-clamp-2) |
| Tag pill text | Satoshi | 11.8px | 400 | 1.2 | normal | Priority/risk pills |
| Empty column copy | Satoshi | 13px | 400 | 1.4 | normal | "No jobs in {label}" |
| Terminal time | Geist Mono | 12.5px | 400 | 1.45 | normal | `HH:mm:ss` left column |
| Terminal type chip | Geist Mono | 11.5px | 400 | 1.2 | normal | Event type pill text |
| Terminal payload | Geist Mono | 13.4px | 400 | 1.45 | normal | Right column body text |
| Eyebrow / label | Satoshi | 12px | 400 | 1.3 | 0.1em uppercase | "Live event stream", "Smart filters", "Job board" |
| Smart filter chip text | Satoshi | 14px | 500 | 1.3 | normal | Same as nav-btn from Phase 49 sidebar |

---

## Color

### Token Usage Map

#### Kanban
| Surface | Token | Treatment |
|---------|-------|-----------|
| Panel outer | `--v7-glass-bg` + `--v7-glass-border` via `<GlassCard>` | radius `--v7-radius` |
| Panel header eyebrow | `--v7-faint` | uppercase 0.1em letter-spacing |
| Panel header title | `--v7-text` | Cabinet 700 20/1.2 |
| Column wrapper bg | `rgba(255,255,255,0.025)` (dark) / `rgba(0,0,0,0.025)` (light) | derived |
| Column wrapper border | `--v7-line` | 1px solid |
| Column title | `--v7-text` | -- |
| Column count | `--v7-muted` | -- |
| Job card bg | `linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02))` (dark) / `linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.015))` (light) | reproduces design ref line 89 |
| Job card border | `--v7-line` | 1px solid |
| Job card shadow | `--v7-glass-shadow` | -- |
| Job title text | `--v7-text` | -- |
| Job description text | `--v7-muted` | line-clamp-2 |
| Tag pill default bg | `rgba(255,255,255,0.04)` (dark) / `rgba(0,0,0,0.04)` (light) | -- |
| Tag pill default border | `--v7-line` | -- |
| Tag pill text | `--v7-muted` | -- |
| Tag pill warn bg | `--v7-amber-soft` | -- |
| Tag pill risk bg | `--v7-pink-soft` | -- |
| Tag pill ok bg | `--v7-teal-soft` | -- |
| Drop target hover overlay | `rgba(58,199,201,0.06)` (dark) / `rgba(1,105,111,0.06)` (light) | + 2px dashed `--v7-teal` outline (offset -2px) |
| Active drag card | shadow `--v7-glass-shadow-heavy` + `transform: translateZ(0)` | dnd-kit-applied |
| Empty column copy | `--v7-faint` | centered, italic-free |

#### Terminal
| Surface | Token | Treatment |
|---------|-------|-----------|
| Panel outer | `--v7-glass-bg` + `--v7-glass-border` via `<GlassCard>` | radius `--v7-radius` |
| Panel header eyebrow | `--v7-faint` | + pulse dot `--v7-teal` (8px, `v7-pulse-eyebrow` 1.8s infinite) |
| Panel header title | `--v7-text` | Cabinet 700 20/1.2 |
| Pause / Clear buttons | `--v7-muted` text on `rgba(255,255,255,0.04)` bg | hover bg `rgba(255,255,255,0.06)` |
| Pause button (active) | `--v7-amber-soft` bg + `--v7-amber` text | indicates paused |
| Terminal-shell bg | `#071018` (FIXED, both themes) | intentional terminal feel |
| Terminal-shell border | `rgba(105,168,255,0.14)` | inner shadow `inset 0 1px 0 rgba(255,255,255,0.05)` |
| Terminal-shell drop shadow | `0 20px 70px rgba(0,0,0,0.24)` | -- |
| Terminal time text | `#6f8ab1` | -- |
| Terminal payload text | `#dbeaff` | -- |
| Terminal default row text | `#b8d7ff` | -- |
| Live caret | `--v7-teal` | 10px x 1.1em block, blinking 1s steps(1) infinite |
| New events pill | `--v7-teal-soft` bg + `--v7-teal` text + `--v7-teal` border | sticky bottom-right |

#### Terminal event type chips
| event_type | bg | border | label |
|---|---|---|---|
| `thinking` | `rgba(255,120,207,0.12)` | `rgba(255,120,207,0.18)` | `Reasoning` |
| `tool_call` | `rgba(105,168,255,0.12)` | `rgba(105,168,255,0.18)` | `PreToolUse` |
| `tool_result` | `rgba(58,199,201,0.12)` | `rgba(58,199,201,0.18)` | `PostToolUse` |
| `waiting` | `rgba(255,181,71,0.13)` | `rgba(255,181,71,0.20)` | `HumanGate` |
| `done` | `rgba(58,199,201,0.18)` | `rgba(58,199,201,0.30)` | `Done` |
| `error` | `rgba(255,107,122,0.16)` | `rgba(255,107,122,0.30)` | `Error` |
| `delegation` | `rgba(105,168,255,0.18)` | `rgba(105,168,255,0.30)` | `Delegation` |

#### Smart Filter Chips (sidebar)
| Surface | Token | Treatment |
|---------|-------|-----------|
| Chip bg (idle) | `rgba(255,255,255,0.02)` (dark) / `rgba(0,0,0,0.02)` (light) | inherits Phase 49 nav-btn |
| Chip border (idle) | `--v7-line` | 1px solid |
| Chip text (idle) | `--v7-text` | Satoshi 500 14/1.3 |
| Chip arrow (idle) | `--v7-faint` | unicode `→` |
| Chip bg (active) | `--v7-teal-soft` | -- |
| Chip border (active) | `color-mix(in srgb, var(--v7-teal) 24%, transparent)` | + 3px teal left border accent (matches swarm-list-item active) |
| Chip text (active) | `--v7-teal` | -- |
| Chip arrow (active) | `--v7-teal` | unicode `✓` (replaces arrow) |
| Hover bg (idle) | `rgba(255,255,255,0.05)` (dark) / `rgba(0,0,0,0.04)` (light) | -- |
| Group label "Smart filters" | `--v7-faint` | uppercase 0.1em (matches "Swarms" label) |

### 60/30/10 Adherence
- **60% dominant**: inherited page bg + glass panel backgrounds + Kanban column wrappers
- **30% secondary**: GlassCard surfaces (Kanban panel, Terminal panel), job card gradients, chip idle bg
- **10% accent**: terminal teal caret + active chip bg, teal/blue/pink/amber chip backgrounds for event types, drop-target teal outline

Accent reserved for: chip activations, drop affordances, live indicators (terminal caret), event-type semantic chips. NOT used for: panel chrome, default tags, body text.

### Destructive
Phase 52 has no destructive UI. The `Clear` button in the terminal only clears the local ring buffer (no DB write). Failed `moveJob` server actions revert silently with a warning toast.

---

## Glassmorphism Application

Phase 52 uses three distinct glass treatments, all from Phase 48's spec, plus one **dark fixed-color override** for the terminal shell (intentional brand feel).

### Panel Glass (Kanban + Terminal outer panel)
Reuses `<GlassCard>` with radius `--v7-radius`. Default Phase 48 styling.

### Column Glass (Kanban columns)
Inner div with `rgba(255,255,255,0.025)` bg + `--v7-line` border + 22px radius. NOT a `<GlassCard>` -- columns are visually subordinate to the panel.

### Terminal Shell (fixed dark)
The actual scrolling terminal area inside the panel uses a **fixed dark theme** regardless of light/dark mode. This matches the design reference's intent (terminal looks like a terminal). Implemented via the `v7-terminal-shell` utility class:
```css
.v7-terminal-shell {
  background: #071018;
  border: 1px solid rgba(105,168,255,0.14);
  border-radius: 22px;
  padding: 14px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 20px 70px rgba(0,0,0,0.24);
  font-family: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  display: grid;
  gap: 8px;
  overflow-y: auto;
  min-height: 0;
}
```

### Smart Filter Chips
Reuse the existing nav-btn glass styling from Phase 49 sidebar. No new glass treatment.

---

## Border Radius

Reuses Phase 48 tokens.

| Element | Token | Value |
|---------|-------|-------|
| Kanban panel outer | `--v7-radius` | 22px |
| Terminal panel outer | `--v7-radius` | 22px |
| Kanban column wrapper | `--v7-radius` | 22px |
| Job card | `--v7-radius-mini` | 18px |
| Tag pill / event-type chip | `--v7-radius-pill` | 999px |
| Smart filter chip | `--v7-radius-pill` | 999px (matches Phase 49 nav-btn) |
| Terminal shell scroller | `--v7-radius` | 22px |
| New events pill | `--v7-radius-pill` | 999px |
| Pause/Clear button | `--v7-radius-pill` | 999px |

---

## Layout

### Workbench Section (`swarm-layout-shell.tsx` bottom row)

Inherited grid from Phase 49 -- only swap children:

```
┌──────────────────────────────────────────┐  ┌────────────────────┐
│ Job board                                │  │ Live event stream  │
│ Kanban for business stages, not micro... │  │ Latest events ...  │
│                                          │  │                    │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐       │  │ ┌────────────────┐ │
│ │BL2 │ │RD1 │ │PR3 │ │RV2 │ │DN1 │       │  │ │ 18:30 Reason   │ │
│ │    │ │    │ │    │ │    │ │    │       │  │ │ 18:31 ToolCall │ │
│ │job │ │job │ │job │ │job │ │job │       │  │ │ ...            │ │
│ │job │ │    │ │job │ │job │ │    │       │  │ │ ▮              │ │
│ │    │ │    │ │job │ │    │ │    │       │  │ └────────────────┘ │
│ └────┘ └────┘ └────┘ └────┘ └────┘       │  │                    │
└──────────────────────────────────────────┘  └────────────────────┘
       1.2fr                                         0.8fr
```

| Property | Value |
|----------|-------|
| Outer grid | `grid-template-columns: 1.2fr 0.8fr`, gap 20px (inherited Phase 49) |
| Kanban panel padding | 18px |
| Kanban grid (inside panel) | `grid-template-columns: repeat(5, 1fr)`, gap 12px, min-height 0 |
| Column wrapper padding | 10px |
| Column head padding | 6px 6px 12px 6px |
| Column title-to-count gap | auto (justify-between) |
| Job-list gap | 10px |
| Job-list overflow | `overflow-y: auto`, padding-right 3px |
| Terminal panel padding | 18px |
| Terminal head-to-shell gap | 14px |
| Terminal shell padding | 14px |
| Terminal log row gap | 8px (vertical, between rows) |
| Terminal log row internal | `grid-template-columns: auto auto 1fr`, gap 10px |

### Smart Filters (sidebar)

Inserted into the sidebar between the Swarms group and the bottom block. Conditional render: only when `usePathname().startsWith("/swarm/")`.

```
┌─────────────────────────────┐
│  ⌂ Agent OS                 │
│  Control room for swarms    │
│                             │
│  SWARMS                     │
│  ▶ EASY Email Agent  [3] ●  │
│  ▶ Tender Swarm      [8]    │
│                             │
│  SMART FILTERS              │  ← New (Phase 52)
│  • Only blocked     →       │
│  • Needs review     →       │
│  • High SLA risk    →       │
│                             │
│  [Toggle theme] ◐           │
└─────────────────────────────┘
```

| Property | Value |
|----------|-------|
| Group container | `flex flex-col gap-3` (matches Swarms group) |
| Group label | 12px uppercase 0.1em letter-spacing, `--v7-faint` |
| Chip stack | `flex flex-col gap-2` |
| Chip height | 44px (touch-friendly, matches existing nav-btn) |
| Chip padding | 0 14px |
| Chip layout | `flex items-center justify-between` |
| Chip border-radius | `--v7-radius-pill` (999px -- pill, NOT square as in design ref; reconciles with Phase 49 nav-btn) |

### Responsive Breakpoints

| Breakpoint | Kanban | Terminal | Smart filters |
|------------|--------|----------|---------------|
| ≥1280px | 5 col, full row | 0.8fr column | Visible (sidebar) |
| 1280-920px | 2 col, wraps to 3 rows | full-width below Kanban | Visible (sidebar) |
| <920px | 1 col, scrolls vertically | full-width below Kanban | Visible (sidebar collapses below at <720px per Phase 49) |

Mobile drag-and-drop is OUT OF SCOPE per REQUIREMENTS.md. On mobile, dnd-kit's PointerSensor still works for touch input (best-effort), but we do NOT add a TouchSensor -- this matches the desktop-first scope.

---

## Active States, Hover, Animation

| Element | Property | Value |
|---------|----------|-------|
| Job card hover | `transform`, `box-shadow` | `translateY(-2px)`, `--v7-glass-shadow-heavy`, 0.18s ease |
| Job card focus-visible | `outline` | 2px solid `--v7-teal`, offset 2px |
| Job card dragging | `transform` | dnd-kit-applied translate; `cursor: grabbing`; opacity 0.95 |
| Column drop hover | `outline`, `background` | 2px dashed `--v7-teal` (inset -2px), bg `rgba(58,199,201,0.06)` overlay |
| Smart filter chip hover (idle) | `background` | `rgba(255,255,255,0.05)` (dark) / `rgba(0,0,0,0.04)` (light) |
| Smart filter chip active | `background`, `border-left`, `color` | `--v7-teal-soft`, 3px solid `--v7-teal` left border, text `--v7-teal` |
| Terminal pulse dot | `opacity` | 0.45 -> 1 -> 0.45, 1.8s infinite (reuses `v7-pulse-eyebrow`) |
| Terminal pause button | `background`, `color` | hover bg `rgba(255,255,255,0.06)`; active state: `--v7-amber-soft` bg + `--v7-amber` text |
| Terminal new-events pill | `transform`, `opacity` | slide-in from below 8px + fade-in 200ms when N > 0; click scrolls + dismisses |
| Live caret | `opacity` | step 0/1, 1s infinite (`v7-blink` keyframe NEW in Phase 52) |
| Terminal row enter | `opacity`, `transform` | 0->1 fade + 4px translateY enter, 180ms ease-out (only on newest row) |

New keyframes added to `globals.css`:
```css
@keyframes v7-blink {
  50% { opacity: 0; }
}
```

---

## Copywriting Contract

### Kanban
| Element | Copy |
|---------|------|
| Panel header eyebrow | "Job board" |
| Panel header title | "Kanban for business stages, not micro-steps" |
| Panel right meta | "{N} jobs total" |
| Column title: backlog | "Backlog" |
| Column title: ready | "Ready" |
| Column title: progress | "In progress" |
| Column title: review | "Human review" |
| Column title: done | "Done" |
| Empty column copy | "No jobs in {label}" |
| Drop hint (during drag) | none -- visual outline communicates |
| Move success toast | (none -- silent on success; the row re-renders) |
| Move failure toast | "Couldn't move job. Reverted." |
| Tag pill: priority urgent | "Urgent" |
| Tag pill: priority high | "High" |
| Tag pill: priority normal | (no pill -- normal is implicit) |
| Tag pill: priority low | "Low" |
| Tag pill: SLA risk | "SLA" |
| Tag pill: blocked | "Blocked" |

### Terminal
| Element | Copy |
|---------|------|
| Panel header eyebrow | "Live event stream" |
| Panel header title | "Latest events from the swarm" |
| Pause button (idle) | "Pause" (icon `Pause` from lucide) |
| Pause button (active) | "Resume" (icon `Play`) |
| Clear button | "Clear" (icon `Eraser`) |
| Empty state row | "> Awaiting events..." |
| New events pill | "{N} new events ↓" |
| Live row label (no event yet) | "live · awaiting next event" |

### Smart Filter Chips (sidebar)
| Element | Copy |
|---------|------|
| Group label | "SMART FILTERS" |
| Chip 1 | "Only blocked" |
| Chip 2 | "Needs review" |
| Chip 3 | "High SLA risk" |
| Active indicator | unicode `✓` (replaces `→`) |

No destructive actions, no confirmation modals.

---

## Drop Affordance Specification

dnd-kit-driven. Drop targets are entire `<KanbanColumn>` regions.

- Drag start: card lifts via `box-shadow: var(--v7-glass-shadow-heavy)`, opacity 0.95, `cursor: grabbing`
- Drag over column: column shows 2px dashed `--v7-teal` outline (offset -2px) + soft teal bg overlay
- Drop: optimistic update applied immediately; server action fired via `useTransition`
- Failure: optimistic state reverted, `sonner` toast shown
- Keyboard alternative (Space + Arrow + Space) per dnd-kit `KeyboardSensor` defaults

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | reuses sonner (already installed Phase 51), GlassCard | reuse, no re-add |
| Phase 48 V7 components | GlassCard | reuse |
| Third-party | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers` | NEW -- locked architectural decision per CONTEXT D-13 |
| No other new npm dependencies | -- | pass |

dnd-kit footprint check:
- `@dnd-kit/core`: ~12KB gzipped
- `@dnd-kit/sortable`: ~6KB gzipped
- `@dnd-kit/modifiers`: ~2KB gzipped
- Total: ~20KB gzipped — within budget for the V7 Agent OS interactive surface

---

## Component Map (what Phase 52 ships)

| File | Type | Phase 52 deliverable? |
|------|------|----------------------|
| `web/components/v7/terminal/terminal-stream.tsx` | Client | Yes (NEW) |
| `web/components/v7/terminal/terminal-row.tsx` | Client (subset) | Yes (NEW) |
| `web/components/v7/terminal/event-type-chip.tsx` | Client (subset) | Yes (NEW) |
| `web/components/v7/kanban/kanban-board.tsx` | Client | Yes (NEW) |
| `web/components/v7/kanban/kanban-column.tsx` | Client (subset) | Yes (NEW) |
| `web/components/v7/kanban/kanban-job-card.tsx` | Client (subset) | Yes (NEW) |
| `web/components/v7/kanban/job-tag-pill.tsx` | Client (subset) | Yes (NEW) |
| `web/components/v7/sidebar-smart-filters.tsx` | Client | Yes (NEW) |
| `web/lib/v7/terminal/event-buffer.ts` | Module store | Yes (NEW) |
| `web/lib/v7/terminal/format.ts` | Pure helpers | Yes (NEW) |
| `web/lib/v7/kanban/stages.ts` | Constants | Yes (NEW) |
| `web/lib/v7/kanban/filters.ts` | Pure helpers | Yes (NEW) |
| `web/lib/v7/kanban/actions.ts` | Server action | Yes (NEW) |
| `web/components/v7/swarm-layout-shell.tsx` | Client | Modified (swap 2 placeholders) |
| `web/components/v7/swarm-sidebar.tsx` | Client | Modified (insert smart filter group) |
| `web/app/globals.css` | CSS | Modified (add `v7-blink` keyframe + `v7-terminal-shell` utility) |
| `supabase/fixtures/52-test-data.sql` | SQL fixture | Yes (NEW) |
| `web/package.json` | Manifest | Modified (add @dnd-kit deps) |

---

## Phase 52 Scope Summary

1. **Terminal event stream** -- `<TerminalStream>` reads `useRealtimeTable("events")`, bridges into a 500-event ring buffer via `useSyncExternalStore`. Auto-scroll + pause + clear. Mono-font dark shell.
2. **Kanban board** -- `<KanbanBoard>` reads `useRealtimeTable("jobs")`, renders 5 columns with dnd-kit sortable contexts. Drop -> optimistic state -> `moveJob` server action -> Realtime UPDATE reconciles.
3. **Smart sidebar filters** -- 3 chips in `<SwarmSidebar>` write `?filter=<key>` URL param via `router.replace`. Kanban filters its visible cards via shared predicate.
4. **Fixture + apply** -- 10 swarm_jobs seeded on EASY swarm via `supabase/fixtures/52-test-data.sql` + Management API call.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS -- empty/loading/active states covered, error toast wording is reassuring not alarming, no destructive actions
- [x] Dimension 2 Visuals: PASS -- reuses Phase 48 glass + Phase 49 sidebar + Phase 51 chip patterns; new `v7-terminal-shell` utility is a single self-contained darker surface that matches the design reference exactly
- [x] Dimension 3 Color: PASS -- 60/30/10 preserved; semantic chip colors are constrained to event types and filter active states; terminal shell's fixed dark bg is intentional terminal feel (matches reference)
- [x] Dimension 4 Typography: PASS -- reuses 4-size / 2-weight system from Phase 48; mono font slot is a documented role (`--font-mono` already in globals.css for shadcn)
- [x] Dimension 5 Spacing: PASS -- all values multiples of 2; column wrappers have comfortable 10px interior padding; chip targets >= 44px
- [x] Dimension 6 Registry Safety: PASS -- only new deps are dnd-kit (locked per CONTEXT decision), no shadcn re-installs, GlassCard + sonner reused

**Approval:** approved 2026-04-16 (auto-approved in autonomous mode; inheritance from Phase 48 + Phase 49 + Phase 51 UI-SPECs is intact)
