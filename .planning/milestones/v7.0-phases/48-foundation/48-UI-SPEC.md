---
phase: 48
slug: foundation
status: draft
shadcn_initialized: true
preset: radix-nova
created: 2026-04-15
---

# Phase 48 — UI Design Contract

> Visual and interaction contract for the Foundation phase. Establishes the V7 design system (fonts, colors, glassmorphism tokens, dark/light theme) and SSO login page. All values extracted from `docs/designs/agent-dashboard-v2.html` design reference.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (already initialized) |
| Preset | radix-nova, baseColor neutral |
| Component library | radix-ui (existing) |
| Icon library | lucide-react (existing) |
| Body font | Satoshi Variable (self-hosted woff2 via next/font/local, `--font-satoshi`) |
| Heading font | Cabinet Grotesk Variable (self-hosted woff2 via next/font/local, `--font-cabinet`) |
| Mono font | Geist Mono (existing, retained for terminal/code) |
| Theme strategy | `next-themes` with `attribute="data-theme"` (NOT class-based) |
| Token namespace | Parallel `--v7-*` prefix; existing shadcn `--` tokens untouched |
| Custom variant | `@custom-variant dark (&:is([data-theme="dark"] *))` replaces existing `(&:is(.dark *))` |

---

## Spacing Scale

Declared values — all multiples of 4. Extracted from HTML design prototype paddings and gaps, snapped to nearest multiple of 4.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Inline icon gaps, margin between label and value |
| sm | 8px | Nav group gaps, skill pill gaps, tag row gaps, compact spacing |
| md | 12px | Kanban column gap, job list gap, agent metric gap |
| base | 12px | KPI grid gap, timeline gap, drawer timeline gap |
| lg | 16px | Agent card padding, KPI inner padding, nav button padding, workbench gap |
| xl | 16px | Drawer body gap, theme toggle padding, mini-card padding |
| 2xl | 20px | Sidebar padding, main gap, briefing gap, brand bottom padding |
| 3xl | 20px | Main area padding, panel padding, graph card gap |
| 4xl | 24px | Sidebar padding (vertical) |

Exceptions: `44px` minimum touch target for interactive controls (nav buttons at `padding: 16px`, inputs at `height: 48px`). `48px` brand mark size.

---

## Typography

All fonts from HTML prototype. Satoshi for body/UI text, Cabinet Grotesk for headings/display. Scale collapsed to 4 sizes, weights to 2.

| Role | Font Family | Size | Weight | Line Height | Letter Spacing |
|------|-------------|------|--------|-------------|----------------|
| Body | Satoshi | 16px (1rem) | 400 | 1.5 | normal |
| Body small / label / caption / badge / tag / metric | Satoshi | 12px (0.75rem) | 400 | 1.3 | 0.1em uppercase for labels; normal for tags/badges |
| Display heading | Cabinet Grotesk | 32px (2rem) | 700 | 1.1 | -0.03em |
| Section heading / KPI number | Cabinet Grotesk | 20px (1.25rem) | 700 | 1.2 | normal |
| Terminal log | ui-monospace, SFMono-Regular, Menlo, Consolas, monospace | 12px (0.75rem) | 400 | 1.45 | normal |

Type scale summary: 4 sizes (32px, 20px, 16px, 12px). Font weights: 400 (regular) and 700 (bold) only — weight 500 is not used in Phase 48.

Note: The swimlane bar text and terminal badge use 12px weight 700 (bold) within the existing 2-weight system — this is valid as 700 is already declared.

---

## Color

Extracted verbatim from the HTML prototype CSS custom properties.

### Dark Mode (primary — `[data-theme="dark"]`)

| Token | Value | Usage |
|-------|-------|-------|
| `--v7-bg` | `#0c1117` | Page background base |
| `--v7-bg-2` | `#101722` | Elevated background |
| `--v7-panel` | `rgba(19,26,36,0.82)` | Glass panel background |
| `--v7-panel-2` | `#151d29` | Opaque panel background |
| `--v7-line` | `rgba(255,255,255,0.08)` | Borders, dividers |
| `--v7-text` | `#edf3fb` | Primary text |
| `--v7-muted` | `#9fadc4` | Secondary text, descriptions |
| `--v7-faint` | `#6b7688` | Tertiary text, labels, captions |
| `--v7-inverse` | `#091018` | Inverse text (on bright backgrounds) |

### Light Mode (`[data-theme="light"]`, `:root`)

| Token | Value | Usage |
|-------|-------|-------|
| `--v7-bg` | `#f6f3ee` | Page background base |
| `--v7-bg-2` | `#fbfaf7` | Elevated background |
| `--v7-panel` | `#f9f6f1` | Panel background |
| `--v7-panel-2` | `#f2eee8` | Secondary panel background |
| `--v7-line` | `#d5d1ca` | Borders, dividers |
| `--v7-text` | `#231f19` | Primary text |
| `--v7-muted` | `#6f6a61` | Secondary text |
| `--v7-faint` | `#958f84` | Tertiary text |
| `--v7-inverse` | `#fbfaf7` | Inverse text |

### Accent Colors (both themes)

| Token | Dark Value | Light Value | Reserved For |
|-------|-----------|-------------|-------------|
| `--v7-teal` | `#3ac7c9` | `#01696f` | Brand mark gradient start, orchestrator node glow, pulse indicator, terminal caret, "done" swimlane bar, active state dots |
| `--v7-blue` | `#69a8ff` | `#0c6aa7` | Brand mark gradient end, particle accent, "tool_call" swimlane bar, terminal shell border glow |
| `--v7-lime` | `#8ad05e` | `#4d8d1c` | Positive delta indicators only |
| `--v7-amber` | `#ffb547` | `#b66a11` | Warning state, "watch" delta, "waiting" swimlane bar, bottleneck agent dot |
| `--v7-pink` | `#ff78cf` | `#b93e8a` | "Thinking" swimlane bar, risk tags, compliance bottleneck dot |
| `--v7-red` | `#ff6b7a` | `#b5454e` | Destructive actions, error states only |

### Soft Accent Backgrounds (for tags, badges)

| Token | Dark Value | Light Value |
|-------|-----------|-------------|
| `--v7-teal-soft` | `rgba(58,199,201,0.13)` | `rgba(1,105,111,0.12)` |
| `--v7-blue-soft` | `rgba(105,168,255,0.13)` | `rgba(12,106,167,0.12)` |
| `--v7-amber-soft` | `rgba(255,181,71,0.13)` | `rgba(182,106,17,0.13)` |
| `--v7-pink-soft` | `rgba(255,120,207,0.13)` | `rgba(185,62,138,0.13)` |

### 60/30/10 Split

| Split | Role | Dark | Light |
|-------|------|------|-------|
| 60% dominant | Page background + radial gradients | `#0c1117` | `#f6f3ee` |
| 30% secondary | Glass panels, sidebar, cards | `rgba(19,26,36,0.82)` | `#f9f6f1` |
| 10% accent | Teal for brand + active states, blue for links + graph paths | `#3ac7c9` / `#69a8ff` | `#01696f` / `#0c6aa7` |

### Background Gradient

Body background uses radial gradients for depth (both themes):
```css
background: radial-gradient(circle at top right, rgba(58,199,201,0.08), transparent 26%),
            radial-gradient(circle at bottom left, rgba(105,168,255,0.08), transparent 30%),
            var(--v7-bg);
```

---

## Glassmorphism Tokens

Extracted from `.glass` and `.sidebar` classes in the HTML prototype.

| Token | Dark Value | Light Value | Usage |
|-------|-----------|-------------|-------|
| `--v7-glass-bg` | `rgba(19,26,36,0.82)` | `#f9f6f1` | Panel/card backgrounds |
| `--v7-glass-border` | `rgba(255,255,255,0.08)` | `#d5d1ca` | Panel borders (same as `--v7-line`) |
| `--v7-glass-blur` | `18px` | `18px` | `backdrop-filter: blur()` value |
| `--v7-glass-shadow` | `0 10px 30px rgba(0,0,0,0.22)` | `0 8px 24px rgba(28,24,18,0.08)` | Card elevation shadow |
| `--v7-glass-shadow-heavy` | `0 30px 100px rgba(0,0,0,0.42)` | `0 24px 70px rgba(28,24,18,0.14)` | Hover/drawer elevation |

### Glass Component CSS Pattern

```css
.v7-glass {
  background: var(--v7-glass-bg);
  backdrop-filter: blur(var(--v7-glass-blur));
  border: 1px solid var(--v7-glass-border);
  box-shadow: var(--v7-glass-shadow);
}
```

### Sidebar Glass (distinct gradient)

```css
.v7-sidebar {
  background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
  backdrop-filter: blur(18px);
  border-right: 1px solid var(--v7-line);
}
```

---

## Border Radius

Extracted from HTML prototype. Uses larger radii than existing shadcn for the "cinematic" aesthetic.

| Token | Value | Usage |
|-------|-------|-------|
| `--v7-radius` | `22px` | Panels, columns, timeline grid, terminal shell, graph container |
| `--v7-radius-lg` | `28px` | Large panels (`.panel`), drawer |
| `--v7-radius-card` | `24px` | Agent fleet cards |
| `--v7-radius-sm` | `14px` | (reserved, from CONTEXT.md) |
| `--v7-radius-inner` | `16px` | Nav buttons, brand mark, graph nodes, agent metrics |
| `--v7-radius-kpi` | `20px` | KPI cards |
| `--v7-radius-mini` | `18px` | Mini cards, theme toggle, job cards |
| `--v7-radius-pill` | `999px` | Badges, tags, skills, pills, search input, chips, state badges |

---

## Layout

Extracted from HTML prototype grid structure.

| Property | Value |
|----------|-------|
| Shell grid | `grid-template-columns: 286px 1fr` |
| Shell height | `100vh`, `overflow: hidden` |
| Main grid | `grid-template-rows: auto auto auto 1fr` |
| Main gap | `20px` |
| Main padding | `20px` |
| Sidebar padding | `24px` |
| Sidebar gap | `20px` |
| Briefing grid | `grid-template-columns: 1.4fr 0.8fr` |
| Fleet cards grid | `grid-template-columns: repeat(4, 1fr)`, gap `16px` |
| KPI grid | `grid-template-columns: repeat(4, 1fr)`, gap `12px` |
| Workbench grid | `grid-template-columns: 1.2fr 0.8fr`, gap `20px` |
| Kanban grid | `grid-template-columns: repeat(5, 1fr)`, gap `12px` |

### Responsive Breakpoints

| Breakpoint | Changes |
|------------|---------|
| 1280px | Fleet cards: 2 cols. Briefing: 1 col. Workbench: 1 col. Kanban: 2 cols. |
| 920px | Single column layout. Sidebar top (no side). Scrollable body. Kanban: 1 col. Fleet/KPI: 1 col. |

---

## Transitions and Animations

| Element | Property | Value |
|---------|----------|-------|
| Nav button hover | all | `0.18s ease` + `translateX(2px)` |
| Agent card hover | all | `0.22s ease` + `translateY(-3px)` + shadow-heavy |
| Job card hover | all | `0.18s ease` + `translateY(-2px)` |
| Drawer slide | right | `0.28s cubic-bezier(0.16, 1, 0.3, 1)` |
| Main area dim | transform + filter | `scale(0.985)` + `blur(2px)` + `0.28s cubic-bezier(0.16, 1, 0.3, 1)` |
| Backdrop fade | opacity | `0.2s ease` |
| Pulse indicator | box-shadow | `1.8s infinite` keyframe |
| Terminal caret | opacity | `1s steps(1) infinite` blink |
| Graph particles | offset-distance | `4.8-6.1s linear infinite` via SVG `<animateMotion>` |

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA (login) | "Sign in with Microsoft" |
| Brand title | "Agent OS" |
| Brand subtitle | "Control room for swarms" |
| Empty state heading (access pending) | "Access pending" |
| Empty state body (access pending) | "Your Microsoft account has been verified, but you don't have project access yet. Ask your administrator to add you to a project team." |
| Empty state heading (no swarms) | "No swarms configured" |
| Empty state body (no swarms) | "Create your first agent swarm in the projects page to see it appear here." |
| Error state (SSO failure) | "Sign-in failed. Microsoft returned an error. Try again or contact your administrator if the problem persists." |
| Error state (session expired) | "Your session has expired. Sign in again to continue." |
| Theme toggle label | "Toggle theme" |
| Nav section labels | "Views" (uppercase), "Smart filters" (uppercase) |
| Sidebar stats | "{count} Active swarms", "{count} Jobs today" |

No destructive actions in Phase 48 (foundation phase has no delete operations).

---

## Drawer / Overlay Specification

Relevant to Phase 48 only for establishing the CSS tokens and transitions. Actual drawer content is Phase 51.

| Property | Value |
|----------|-------|
| Width | `min(540px, calc(100vw - 20px))` |
| Position | Fixed, `top: 16px`, `right: 16px` (open) / `right: -560px` (closed) |
| Height | `calc(100vh - 32px)` |
| Border radius | `28px` |
| Backdrop | `rgba(3,7,13,0.34)` + `backdrop-filter: blur(4px)` |

---

## Terminal Visual Specification

Relevant to Phase 48 for establishing design tokens. Actual terminal component is Phase 52.

| Property | Value |
|----------|-------|
| Background | `#071018` (always dark, regardless of theme) |
| Border | `1px solid rgba(105,168,255,0.14)` |
| Font | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` |
| Text color | `#b8d7ff` (log text), `#6f8ab1` (timestamps), `#dbeaff` (payload) |
| Badge background | `rgba(105,168,255,0.12)` with `rgba(105,168,255,0.15)` border |
| Inner shadow | `inset 0 1px 0 rgba(255,255,255,0.05)` |
| Outer shadow | `0 20px 70px rgba(0,0,0,0.24)` |

---

## Swimlane Bar Colors

| Phase | Dark Gradient | Light Gradient |
|-------|-------------|----------------|
| Thinking | `linear-gradient(90deg, var(--v7-pink), #ffb0df)` | same pattern with light pink values |
| Tool call | `linear-gradient(90deg, var(--v7-blue), #b5d0ff)` | same pattern with light blue values |
| Waiting | `linear-gradient(90deg, var(--v7-amber), #ffd89a)` | same pattern with light amber values |
| Done | `linear-gradient(90deg, var(--v7-teal), #b7f6f7)` | same pattern with light teal values |

Bar properties: `height: 18px`, `border-radius: 999px`, `font-size: 0.75rem` (12px), `font-weight: 700`, `color: #081018`, `box-shadow: 0 6px 16px rgba(0,0,0,0.18)`.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | button, dropdown-menu (theme toggle) | not required |
| Third-party | none | not applicable |

---

## Phase 48 Scope Summary

This UI-SPEC covers only what Phase 48 delivers:

1. **V7 CSS tokens** added to `globals.css` in `--v7-*` namespace (all color, glass, radius, shadow tokens above)
2. **Font loading** via `next/font/local` for Satoshi Variable and Cabinet Grotesk Variable
3. **Theme switching** via `next-themes` with `data-theme` attribute (replaces `.dark` class approach)
4. **Login page** with "Sign in with Microsoft" button using existing shadcn Button component
5. **Access pending page** with empty state copy
6. **GlassCard** utility component implementing the glass pattern

Tokens for terminal, swimlanes, drawer, graph, fleet cards, and Kanban are defined here but implemented in later phases.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
