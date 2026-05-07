# Stage-keyed Shell (Phase 76)

Origin: sketch 005 (swarm-shell-integration). Locks the navigation architecture for per-swarm operator surfaces.

## Design Decisions

### One per-swarm operator surface, tabs by pipeline stage

The agent-workforce product has three audiences/surfaces that overlap on the word "swarm":
- `/swarm/[swarmId]` — V7 swarm-ops dashboard (briefing + delegation graph + jobs Kanban over `swarm_jobs` + timeline + terminal). Engineer/admin audience. Stays at its existing URL.
- `/automations/[swarm]/...` — operator surface. Stage-keyed tabs.

Inside `/automations/[swarm]/...`, tabs are **pipeline stages**, not feature names. This replaces the prior "Bulk Review vs Kanban" feature-keyed labelling.

**Tab structure:**

| Tab | Stage | Content |
|---|---|---|
| Stage 0 · Safety | input safety / injection escalations | existing surface (was `?tab=safety`) |
| Stage 1 · Noise | noise filter QA + Pending Promotion sub-view | existing default Bulk Review (was `/automations/[swarm]/review` default) |
| Stage 2 · Customer | customer mapping (iController lookup issues) | empty until Phase 77 ships content |
| Stage 3 · Intent | low_confidence + no_handler triage | Phase 76 ships |
| Stage 4 · Handler | handler_error queue | Phase 76 ships |

Tab badges show per-stage row counts. Empty tabs (Stage 0/2 today) render with a muted `0` badge — they're signal ("the pipeline is doing its job at this stage"), not visual noise.

### Tab list is registry-driven

Which stages render as tabs comes from the `swarms` registry (e.g. derived from `stage1_regex_module IS NOT NULL`, `stage2_entity_resolver IS NOT NULL`, etc.). Adding a new swarm doesn't add new UI code — the tab list is computed from the registry row at render time. Sales-email (Phase 78) inherits the shell by registry insert.

### A small "↗ Swarm operations dashboard" link points engineers at /swarm/[swarmId]

Engineers / admins still go to the V7 swarm-ops dashboard for orchestrator-level work. Operators don't need to leave `/automations/[swarm]` for daily work. The link sits on the right edge of the tab strip, muted styling, never the primary CTA.

### "Bulk Review" stops being a UI noun

Existing internal docs use "Bulk Review" — after this lands, that term refers to the *operator action verb* on the Stage 1 tab ("you bulk-review noise on the Stage 1 tab"), not a UI label. "Kanban" disappears as a UI label entirely (the original Phase 76 "Kanban" surface is just the Stage 3 / Stage 4 tabs).

### URL pattern

Path-based: `/automations/[swarm]/stage-1`, `/automations/[swarm]/stage-3`, etc. Existing URLs (`/automations/[swarm]/review`, `?tab=safety`, `?tab=pending`) redirect to their stage-keyed equivalents. Old URLs stay alive as backwards-compat aliases for at least one milestone after this lands so existing bookmarks survive the rename.

## CSS Patterns

### Stage tab strip

```css
.stage-tab-strip {
  display: flex; background: var(--bg-2); border-bottom: 1px solid var(--border);
  padding: 0 var(--space-5);
}
.stage-tab-strip a {
  color: var(--text-muted); text-decoration: none;
  padding: var(--space-3) var(--space-4);
  font-size: var(--fs-base);
  border-bottom: 2px solid transparent;
  display: flex; align-items: center; gap: var(--space-2);
}
.stage-tab-strip a:hover { color: var(--text); }
.stage-tab-strip a.current {
  color: var(--text);
  border-bottom-color: var(--brand-primary);
  font-weight: 500;
}
.stage-tab-strip .badge {
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
  font-size: var(--fs-xs);
  padding: 1px 6px; border-radius: 999px;
  font-family: var(--font-mono);
}
.stage-tab-strip .badge.zero {
  background: transparent;
  color: var(--text-dim);
}
.stage-tab-strip .meta-link {
  margin-left: auto;
  color: var(--text-dim);
  font-size: var(--fs-xs);
  padding: var(--space-3) var(--space-2);
  text-decoration: underline;
}
```

### Page header above tabs

```css
.page-header {
  background: var(--bg-2); border-bottom: 1px solid var(--border);
  padding: var(--space-4) var(--space-5);
}
.page-header h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
}
.page-header .sub {
  color: var(--text-muted);
  font-size: var(--fs-sm);
  margin-top: 2px;
  font-family: var(--font-mono);
}
```

## HTML Structures

```html
<div class="page-header">
  <h2>Debtor Email</h2>
  <div class="sub">debiteuren@smeba.nl · debiteuren@berki.com · debiteuren@smeba-fire.be</div>
</div>

<nav class="stage-tab-strip">
  <a href="/automations/debtor-email/stage-0"><span>Stage 0 · Safety</span><span class="badge zero">0</span></a>
  <a href="/automations/debtor-email/stage-1"><span>Stage 1 · Noise</span><span class="badge">12</span></a>
  <a href="/automations/debtor-email/stage-2"><span>Stage 2 · Customer</span><span class="badge zero">0</span></a>
  <a href="/automations/debtor-email/stage-3" class="current"><span>Stage 3 · Intent</span><span class="badge">7</span></a>
  <a href="/automations/debtor-email/stage-4"><span>Stage 4 · Handler</span><span class="badge">2</span></a>
  <a href="/swarm/{swarmId}" class="meta-link">↗ Swarm operations dashboard</a>
</nav>
```

## What to Avoid

- **Feature-keyed tab labels** ("Bulk Review", "Kanban") — they don't compose with the canonical 5-stage architecture vocabulary. Picked them once in Phase 76's first CONTEXT.md draft; replaced before sketch lock-in.
- **Hardcoding which tabs render per swarm** — must come from the swarm registry. Adding a swarm should be a registry insert, not a UI code change.
- **Cross-swarm aggregation right now** — that's Phase 999.2 territory. Phase 76 ships per-swarm only. A cross-swarm `/automations/email/...` shell is a future migration, not part of this iteration.
- **Tabs that disappear when empty** — empty tabs are signal. Operators want to see "Stage 2 has 0 issues today" as a positive indicator, not have it blink in/out as the count flips.
- **Over-mixing Operations + operator surfaces in one shell** — sketch 005 Variant C tried this; the visual densities clashed (engineer dashboard is multi-section + dense; operator surface is focused + single-task). Keep them separate.

## Origin

Sketch 005 (swarm-shell-integration). Three variants explored — winner was **Variant B refined to stage-keyed tabs**. The user's review reframed the original "Bulk Review / Kanban" feature-keyed tabs into stage-keyed tabs after spotting that the existing UI already mixed concerns under "Bulk Review" via `?tab=` params.

Source: `sources/005-swarm-shell-integration/`.

CONTEXT.md decisions D-04, D-05, D-10 (revised inline) reflect this winner.
