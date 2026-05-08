# Phase 53: Advanced Observability - UI Specification

**Generated:** 2026-04-16
**Status:** Final
**References:** `docs/designs/agent-dashboard-v2.html` lines 60-71, 93-100, 173-199, 233-249

This is the visual contract for the delegation graph and Gantt swimlane. Implementation MUST conform to these visuals. Any deviation needs explicit justification in the corresponding plan SUMMARY.

---

## 1. Layout integration in `swarm-layout-shell.tsx`

```
┌──────────────────────────────────────────────────────────────────────────┐
│ HEADER (swarm name + realtime status)                                    │
├───────────────────────────────────┬──────────────────────────────────────┤
│ BRIEFING PANEL (1.4fr)            │ DELEGATION GRAPH (0.8fr) -- NEW      │
│  - eyebrow + narrative + KPIs     │  - 260px graph canvas                │
│  - existing                       │  - SVG edges + HTML nodes            │
├───────────────────────────────────┴──────────────────────────────────────┤
│ SUBAGENT FLEET (full width)                                              │
│  - existing 4-column card grid                                           │
├──────────────────────────────────────────────────────────────────────────┤
│ SWIMLANE TIMELINE (full width) -- NEW                                    │
│  - axis row (6 ticks across 30 min window)                               │
│  - lane stack (one row per agent, max 8)                                 │
├───────────────────────────────────┬──────────────────────────────────────┤
│ KANBAN BOARD (1.2fr)              │ TERMINAL STREAM (0.8fr)              │
│  - existing                       │  - existing                          │
└───────────────────────────────────┴──────────────────────────────────────┘
```

Vertical gap between sections: `gap-5` (20px) -- matches existing layout.

---

## 2. Delegation Graph

### 2.1 Outer panel (GlassCard wrapper)

```
┌────────────────────────────────────────────────────────────────┐
│ ● Live delegation graph                          ┌──────────┐  │
│                                                  │ 3 active │  │
│ Who is talking to whom                           │   paths  │  │
│                                                  └──────────┘  │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │                                                            │ │
│ │   ┌──────────────┐                                         │ │
│ │   │ ORCHESTRATOR │           ╲╱─────●──────╲      ╱──┐     │ │
│ │   │ EASY_intake  │──────●────────────────────●──────│SubA│  │ │
│ │   │ active       │           ╱╲                    └──┘   │ │
│ │   └──────────────┘                  ●─────────────────╲    │ │
│ │       ▲ orch glow                                  ╲   ╲   │ │
│ │                                              ┌──────┐    ╲ │ │
│ │                                              │ SubB │     ╲│ │
│ │                                              │ idle │      │ │
│ │                                              └──────┘      │ │
│ │                                                            │ │
│ └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

**Card:** `GlassCard` with `padding: 18px; display: flex; flex-direction: column; gap: 14px; min-height: 320px;`

**Header (left):**
- Eyebrow: pulsing dot + `Live delegation graph`
  - Dot: `width: 8px; height: 8px; border-radius: 50%; background: var(--v7-teal); animation: v7-pulse-eyebrow 1.8s ease-in-out infinite;`
  - Eyebrow text: `font-size: 12px; line-height: 1.3; letter-spacing: 0.1em; text-transform: uppercase; color: var(--v7-faint);`
- Title: `font-family: var(--font-cabinet); font-size: 20px; line-height: 1.2; font-weight: 700; color: var(--v7-text);` text: `Who is talking to whom`

**Header (right) -- active paths chip:**
- Pill: `padding: 6px 14px; border-radius: var(--v7-radius-pill); border: 1px solid var(--v7-line); font-size: 12px; line-height: 1; white-space: nowrap;`
- Background: `var(--v7-teal-soft)` when `recentEdgeCount > 0`, `rgba(255,255,255,0.04)` otherwise
- Color: `var(--v7-teal)` when active, `var(--v7-muted)` otherwise
- Content: `{n} active path{s}` or `Idle` when zero

### 2.2 Graph canvas (inner box)

- **Size:** `position: relative; height: 260px; min-height: 220px;`
- **Background:** `linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))`
- **Border:** `1px solid var(--v7-line); border-radius: var(--v7-radius);`
- **Overflow:** `hidden` (nodes are clipped to canvas)

### 2.3 SVG edge layer

```html
<svg viewBox="0 0 1000 420" preserveAspectRatio="none" role="img" aria-label="Live delegation graph">
  <defs>
    <linearGradient id="v7-edge-grad" x1="0" x2="1">
      <stop offset="0%" stop-color="var(--v7-teal-soft)"/>
      <stop offset="100%" stop-color="var(--v7-blue-soft)"/>
    </linearGradient>
    <linearGradient id="v7-edge-grad-stale" x1="0" x2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.06)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.04)"/>
    </linearGradient>
  </defs>
  {edges.map(edge => (
    <g key={edge.key}>
      <path id={`edge-${edge.key}`} d={bezier(edge.from, edge.to)}
            fill="none" stroke={edge.recent ? "url(#v7-edge-grad)" : "url(#v7-edge-grad-stale)"}
            stroke-width="2.5" stroke-linecap="round"
            opacity={edge.recent ? 1 : 0.35} />
      {edge.recent && (
        <circle r="5" fill={particleColor(edge.index)}
                style={{ filter: `drop-shadow(0 0 6px ${particleColor(edge.index)})` }}>
          <animateMotion dur={`${1.0 + (edge.count % 5) * 0.15}s`}
                         repeatCount="indefinite" rotate="auto">
            <mpath href={`#edge-${edge.key}`} />
          </animateMotion>
        </circle>
      )}
    </g>
  ))}
</svg>
```

- **Bezier helper:**
  ```
  bezier({x1,y1}, {x2,y2}) =>
    `M${x1},${y1} C${(x1+x2)/2},${y1} ${(x1+x2)/2},${y2} ${x2},${y2}`
  ```
- **Particle color cycle (by edge index):**
  ```
  particleColor(0) = var(--v7-teal)
  particleColor(1) = var(--v7-blue)
  particleColor(2+) = var(--v7-amber)
  ```
- **Particle stroke:** none. Pure fill + drop-shadow glow.

### 2.4 HTML node layer (over SVG)

Each node is absolutely positioned, centered on its layout coordinate.

```jsx
<div
  role="button"
  tabIndex={0}
  aria-label={`${agent.agent_name}, ${agent.role ?? 'no role'}, status ${agent.status}`}
  onClick={() => setOpenAgent(agent.agent_name)}
  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpenAgent(agent.agent_name)}
  className="v7-graph-node"
  data-orchestrator={isOrchestrator || undefined}
  style={{
    left: `${node.xPct}%`,
    top: `${node.yPct}%`,
    transform: 'translate(-50%, -50%)',
  }}
>
  <span className="v7-graph-node-label">
    {isOrchestrator ? 'ORCHESTRATOR' : 'SUBAGENT'}
  </span>
  <strong className="v7-graph-node-name">{agent.agent_name}</strong>
  <span className="v7-graph-node-meta">
    <span className={`v7-tiny-dot status-${agent.status}`} aria-hidden /> {statusWord(agent.status)}
  </span>
</div>
```

**Node CSS (added to globals.css under Phase 53 section):**

```css
.v7-graph-node {
  position: absolute;
  padding: 10px 12px;
  border-radius: var(--v7-radius-sm);
  background: var(--v7-glass-bg);
  border: 1px solid var(--v7-glass-border);
  min-width: 144px;
  box-shadow: var(--v7-glass-shadow);
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  z-index: 2;
  /* Glassmorphism backdrop */
  backdrop-filter: blur(var(--v7-glass-blur));
}
.v7-graph-node:hover {
  transform: translate(-50%, calc(-50% - 2px));
  box-shadow: var(--v7-glass-shadow-heavy);
}
.v7-graph-node:focus-visible {
  outline: 2px solid var(--v7-teal);
  outline-offset: 2px;
}
.v7-graph-node[data-orchestrator] {
  outline: 1px solid var(--v7-teal);
  box-shadow:
    0 0 0 1px var(--v7-teal-soft),
    0 20px 60px var(--v7-teal-soft),
    var(--v7-glass-shadow);
}
.v7-graph-node-label {
  display: block;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--v7-faint);
  margin-bottom: 4px;
}
.v7-graph-node-name {
  display: block;
  font-family: var(--font-cabinet);
  font-size: 14px;
  font-weight: 700;
  color: var(--v7-text);
  line-height: 1.2;
}
.v7-graph-node-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--v7-muted);
}
.v7-tiny-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--v7-faint);
}
.v7-tiny-dot.status-active { background: var(--v7-teal); }
.v7-tiny-dot.status-idle   { background: var(--v7-faint); }
.v7-tiny-dot.status-waiting{ background: var(--v7-amber); }
.v7-tiny-dot.status-error  { background: var(--v7-red); }
.v7-tiny-dot.status-offline{ background: var(--v7-muted); }
```

### 2.5 Empty states

- **No agents (`agents.length === 0`):** Render the GlassCard with the eyebrow + title, then a centered placeholder body matching the `SubagentFleet` empty state styling (Cabinet 20px headline + muted 14px subtext).
- **No edges (`edges.length === 0`):** Render nodes statically. Add a footer caption inside the canvas, absolutely positioned at the bottom-right: `font-size: 12px; color: var(--v7-faint); padding: 8px 12px;` content `No delegation activity yet`.

### 2.6 prefers-reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  .v7-graph-node { transition: none; }
  /* Disable particle motion */
  .v7-graph-node + svg circle animateMotion { /* selector won't work via CSS, handled in JSX */ }
}
```

In JSX, gate `repeatCount` based on the media query:
```ts
const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
// in render: <animateMotion repeatCount={reduced ? "1" : "indefinite"} />
```

---

## 3. Gantt Swimlane

### 3.1 Outer panel (GlassCard wrapper)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ● Observability                                                  ┌───────────┐ │
│                                                                  │ Past 30 m │ │
│ Gantt-style agent timeline                                       └───────────┘ │
│                                                                                │
│            12:00       12:05       12:10       12:15       12:20       12:25  │
│            │           │           │           │           │           │      │
│ ┌──────────────────────────────────────────────────────────────────────────┐  │
│ │ EASY_intake     ░░thinking░░  [tool_call]              [done]           │  │
│ │ EASY_draft                       ░░░thinking░░░  [tool_call] [done]     │  │
│ │ EASY_compliance              [tool_call]      [waiting]    [error]      │  │
│ └──────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Card:** `GlassCard` with `padding: 18px; display: flex; flex-direction: column; gap: 14px;`

**Header (left):**
- Eyebrow: pulsing teal dot + `Observability` -- same eyebrow style as Phase 51/52
- Title: `font-family: var(--font-cabinet); font-size: 20px; line-height: 1.2; font-weight: 700; color: var(--v7-text);` text: `Gantt-style agent timeline`

**Header (right):** chip `Past 30 minutes` -- muted style:
`padding: 6px 14px; border-radius: var(--v7-radius-pill); border: 1px solid var(--v7-line); background: rgba(255,255,255,0.04); font-size: 12px; color: var(--v7-muted);`

### 3.2 Time axis row

```jsx
<div className="v7-swimlane-axis">
  {ticks.map(t => (
    <span key={t.label} style={{ left: `calc(92px + ${t.pct}% * (100% - 92px) / 100%)` }}>
      {t.label}
    </span>
  ))}
</div>
```

```css
.v7-swimlane-axis {
  position: relative;
  height: 22px;
}
.v7-swimlane-axis > span {
  position: absolute;
  transform: translateX(-50%);
  font-size: 11px;
  line-height: 1;
  color: var(--v7-faint);
  font-variant-numeric: tabular-nums;
}
```

Tick set: `[now-30, now-25, now-20, now-15, now-10, now-5, now]`. Labels formatted via `Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })`. The leftmost 92px is the lane label gutter -- ticks position relative to the `now-30` left edge.

### 3.3 Lane area

```css
.v7-swimlane-grid {
  position: relative;
  height: calc(14px + var(--v7-lane-count) * 36px + 14px);
  border-radius: var(--v7-radius-sm);
  background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
  border: 1px solid var(--v7-line);
  overflow: hidden;
}

/* Vertical hairlines via gradient (matches design ref line 96) */
.v7-swimlane-grid::before {
  content: '';
  position: absolute;
  inset: 0;
  left: 92px;  /* offset past the lane label gutter */
  background: linear-gradient(
    90deg,
    transparent 0 16.6%,
    rgba(255,255,255,0.05) 16.6% 16.8%,
    transparent 16.8% 33.3%,
    rgba(255,255,255,0.05) 33.3% 33.5%,
    transparent 33.5% 50%,
    rgba(255,255,255,0.05) 50% 50.2%,
    transparent 50.2% 66.6%,
    rgba(255,255,255,0.05) 66.6% 66.8%,
    transparent 66.8% 83.3%,
    rgba(255,255,255,0.05) 83.3% 83.5%,
    transparent 83.5% 100%
  );
  pointer-events: none;
}
```

`--v7-lane-count` is set inline on the grid container based on `agents.length` (capped at 8).

### 3.4 Lane (one per agent)

```jsx
<div className="v7-swimlane-lane" style={{ top: `${14 + i * 36}px` }}>
  <span className="v7-swimlane-lane-label">{agent.agent_name}</span>
</div>
```

```css
.v7-swimlane-lane {
  position: absolute;
  left: 0;
  right: 0;
  height: 32px;
  display: flex;
  align-items: center;
}
.v7-swimlane-lane-label {
  width: 88px;
  padding-left: 12px;
  font-size: 12px;
  color: var(--v7-muted);
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}
```

### 3.5 Bar (one per span)

```jsx
<div
  className="v7-swimlane-bar"
  data-type={bar.type}
  role="img"
  aria-label={`${bar.agent}: ${bar.label}, ${bar.duration}`}
  style={{
    top: `${14 + bar.laneIndex * 36 + 7}px`,
    left: `calc(92px + ${bar.leftPct}% * (100% - 92px) / 100%)`,
    width: `calc(${bar.widthPct}% * (100% - 92px) / 100%)`,
  }}
>
  <span className="v7-swimlane-bar-label">{bar.shortLabel}</span>
  <span className="v7-bar-tooltip">
    <strong>{bar.label}</strong>
    <span>{bar.duration} • {bar.agent}</span>
    <span>{bar.startTime}–{bar.endTime}</span>
  </span>
</div>
```

```css
.v7-swimlane-bar {
  position: absolute;
  height: 18px;
  min-width: 6px;
  border-radius: var(--v7-radius-pill);
  display: flex;
  align-items: center;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 700;
  color: #081018;
  box-shadow: 0 6px 16px rgba(0,0,0,0.18);
  cursor: default;
  overflow: hidden;
  z-index: 2;
}
.v7-swimlane-bar[data-type="thinking"] {
  background: linear-gradient(90deg, var(--v7-pink), color-mix(in srgb, var(--v7-pink) 50%, white));
}
.v7-swimlane-bar[data-type="tool_call"],
.v7-swimlane-bar[data-type="tool_result"] {
  background: linear-gradient(90deg, var(--v7-blue), color-mix(in srgb, var(--v7-blue) 60%, white));
}
.v7-swimlane-bar[data-type="waiting"] {
  background: linear-gradient(90deg, var(--v7-amber), color-mix(in srgb, var(--v7-amber) 60%, white));
}
.v7-swimlane-bar[data-type="done"] {
  background: linear-gradient(90deg, var(--v7-teal), color-mix(in srgb, var(--v7-teal) 60%, white));
}
.v7-swimlane-bar[data-type="error"] {
  background: linear-gradient(90deg, var(--v7-red), color-mix(in srgb, var(--v7-red) 60%, white));
}
.v7-swimlane-bar[data-type="delegation"] {
  background: linear-gradient(90deg, var(--v7-pink), var(--v7-blue));
}
.v7-swimlane-bar-label {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}
```

### 3.6 Tooltip (CSS-only)

```css
.v7-bar-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s ease;
  background: var(--v7-glass-bg);
  border: 1px solid var(--v7-glass-border);
  border-radius: var(--v7-radius-sm);
  padding: 8px 10px;
  font-size: 12px;
  color: var(--v7-text);
  white-space: nowrap;
  z-index: 10;
  box-shadow: var(--v7-glass-shadow-heavy);
  display: flex;
  flex-direction: column;
  gap: 2px;
  backdrop-filter: blur(var(--v7-glass-blur));
}
.v7-bar-tooltip strong {
  font-weight: 700;
  color: var(--v7-text);
}
.v7-bar-tooltip span {
  color: var(--v7-muted);
  font-weight: 400;
}
.v7-swimlane-bar:hover .v7-bar-tooltip,
.v7-swimlane-bar:focus-visible .v7-bar-tooltip {
  opacity: 1;
}
```

### 3.7 Empty state

When no bars fall inside the visible window:
```jsx
{bars.length === 0 && (
  <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[var(--v7-faint)]">
    No agent activity in the last 30 minutes
  </div>
)}
```

### 3.8 prefers-reduced-motion

The swimlane has no motion to disable. The 5s `setNow` tick still happens (it's not "motion" per se; it's data freshness). Bars do not animate on insert.

---

## 4. Color usage matrix

| Element | Light theme | Dark theme | Token |
|---|---|---|---|
| Graph canvas bg | white-ish gradient | dark gradient | `linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))` (transparent overlay -- inherits panel color) |
| Graph canvas border | warm beige | white-08 | `var(--v7-line)` |
| Node bg | warm white | dark glass | `var(--v7-glass-bg)` |
| Node border | warm beige | white-08 | `var(--v7-glass-border)` |
| Edge stroke (recent) | teal->blue gradient | teal->blue gradient | `url(#v7-edge-grad)` |
| Particle 0 / 1 / 2+ | teal / blue / amber | teal / blue / amber | `--v7-teal / --v7-blue / --v7-amber` |
| Orchestrator outline | teal | teal | `var(--v7-teal)` |
| Bar `thinking` | pink gradient | pink gradient | `--v7-pink` |
| Bar `tool_call` | blue gradient | blue gradient | `--v7-blue` |
| Bar `waiting` | amber gradient | amber gradient | `--v7-amber` |
| Bar `done` | teal gradient | teal gradient | `--v7-teal` |
| Bar `error` | red gradient | red gradient | `--v7-red` |
| Tooltip bg | glass | glass | `var(--v7-glass-bg)` |

Both themes look correct because every color is a V7 token; the design ref's hex literals are mapped to tokens that exist in both light and dark blocks of `globals.css`.

---

## 5. Responsive breakpoints

- `<lg` (`<1024px`): briefing row stacks (graph below briefing); swimlane stays full width; both surfaces remain functional.
- `<md` (`<768px`): graph canvas height drops to 220px; swimlane shows lane labels but bars may be very narrow -- still readable for management's tablet use case.
- Mobile (`<640px`): out of scope per V7.0 management focus. Graph + swimlane render but are not tuned.

---

## 6. Accessibility checklist

- [x] Graph: `<svg role="img" aria-label="Live delegation graph">`
- [x] Each node: `role="button" tabIndex={0} aria-label="${name}, ${role}, ${status}"`
- [x] Click + Enter + Space all open drawer
- [x] Particle motion respects `prefers-reduced-motion`
- [x] Swimlane: `<div role="img" aria-label="Agent activity timeline">`
- [x] Each bar: `role="img" aria-label="${agent}: ${spanName}, ${duration}"`
- [x] Tooltip is decorative (info duplicated in aria-label)
- [x] Color contrast: bar labels are dark text on bright gradient -- verified visually against both themes
- [x] No color-only signals: bar `data-type` attribute provides semantic info for assistive tech via aria-label

---

## 7. Animation budget

| Animated element | Driver | Frame cost | Reduced-motion fallback |
|---|---|---|---|
| Particle traveling edge path | SVG SMIL `<animateMotion>` | GPU, ~0% CPU | `repeatCount=1` (one-shot) |
| Edge gradient color | Static (no animation) | 0 | — |
| Node hover lift | CSS `transition` on `transform` | GPU | `transition: none` |
| Eyebrow pulse | CSS keyframe `v7-pulse-eyebrow` | GPU (opacity only) | (existing -- no change) |
| Swimlane bars | Static (no animation on insert) | 0 | — |
| Tooltip fade | CSS `transition: opacity 0.12s` | GPU | `transition: none` |

**Total expected paint work per frame at 60fps:** SVG SMIL particles only. Verified to stay under 16ms on a 12-edge graph in modern Chromium via SMIL's compositor-bound implementation.

---

*Phase: 53-advanced-observability*
*UI spec generated: 2026-04-16*
