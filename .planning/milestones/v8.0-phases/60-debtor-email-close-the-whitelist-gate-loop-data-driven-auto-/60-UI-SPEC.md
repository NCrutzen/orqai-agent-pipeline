---
phase: 60
slug: debtor-email-close-the-whitelist-gate-loop-data-driven-auto
status: draft
shadcn_initialized: true
preset: radix-nova (existing)
created: 2026-04-28
---

# Phase 60 — UI Design Contract

> Visual and interaction contract for two frontend deliverables:
> 1. Bulk Review UI rewrite at `/automations/debtor-email-review` (queue-driven, drawer tree-nav).
> 2. New `/automations/classifier-rules` cross-swarm dashboard.
>
> Both pages live inside the established v7 design system (Satoshi + Cabinet Grotesk, glassmorphism, --v7-* tokens, dark/light toggle from Phase 48). This contract specifies **only the deltas and reuse points** — global tokens (color palette, fonts, radii, glass shadows) are inherited unchanged from `web/app/globals.css`.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (already initialized — `web/components.json`) |
| Preset | `radix-nova` style, baseColor `neutral`, CSS variables on |
| Component library | radix (via shadcn primitives) + bespoke v7 components in `web/components/v7/` |
| Icon library | lucide-react |
| Font | Satoshi Variable (body, `var(--font-satoshi)`) + Cabinet Grotesk Variable (headings, `var(--font-cabinet)`) + Geist Mono (mono, `var(--font-mono)`) |
| Theme tokens | `--v7-*` namespace from `app/globals.css` (light + dark via `[data-theme='dark']`) |
| Reuse anchors | `web/components/v7/drawer/agent-detail-drawer.tsx`, `web/components/v7/swarm-sidebar.tsx`, `web/components/v7/swarm-list-item.tsx`, `web/components/v7/sidebar-mini-stat.tsx`, `web/components/v7/kanban/job-tag-pill.tsx`, `web/components/v7/realtime-status-indicator.tsx` |

---

## Spacing Scale

All spacing must be a multiple of 4. v7 already uses 4-step rhythm; Phase 60 inherits without exception.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon-to-label gap inside chips, tree-row indent step |
| sm | 8px | Pill padding, count-badge padding, between status badge + label |
| md | 16px | Default row padding (queue list rows, dashboard table cells) |
| lg | 24px | Card / panel internal padding (drawer body, dashboard table container) |
| xl | 32px | Page-section vertical rhythm (page header → toolbar → content) |
| 2xl | 48px | Major section breaks (dashboard "Promoted" vs "Candidate" group break) |
| 3xl | 64px | Page top padding under app header on `/classifier-rules` only |

Component-level radii inherit `--v7-radius-card: 24px` (drawer / panels), `--v7-radius-sm: 14px` (queue rows, table rows), `--v7-radius-pill: 999px` (status badges, count badges). No new radii introduced.

Exceptions:
- Tree-row left-indent uses 16px per depth level (topic → entity → mailbox = 0 / 16 / 32px) — multiples of 4, on-scale.
- Drawer width: 480px on desktop, 100vw under 768px. (Drawer reuses `agent-detail-drawer.tsx` Sheet sizing.)

---

## Typography

Sizes pinned to four roles. Weights restricted to two (400 regular + 600 semibold). Cabinet Grotesk only used for the page-level `<h1>` and the drawer-detail panel heading.

| Role | Size | Weight | Line Height | Font |
|------|------|--------|-------------|------|
| Body | 14px | 400 | 1.5 | Satoshi |
| Label | 12px | 600 | 1.4 | Satoshi (uppercase tracking 0.06em on section labels: "RULES", "PENDING PROMOTION") |
| Heading | 20px | 600 | 1.3 | Cabinet Grotesk (drawer detail-panel title; table-section headings) |
| Display | 28px | 600 | 1.2 | Cabinet Grotesk (page `<h1>`: "Bulk Review" / "Classifier Rules") |

Numeric values in tables (N count, CI-lo percentage) use `font-variant-numeric: tabular-nums` at 14px / weight 600. Trend sparkline is graphical, no typography.

---

## Color

60/30/10 follows v7 light-default theme. Dark theme inherits from `[data-theme='dark']` automatically. **No new color tokens introduced** — only assignment of existing tokens to roles.

| Role | Token | Light value | Usage |
|------|-------|-------------|-------|
| Dominant (60%) | `--v7-bg` | `#f6f3ee` | Page background, outermost canvas |
| Secondary (30%) | `--v7-panel` / `--v7-panel-2` | `#f9f6f1` / `#f2eee8` | Sidebar tree, drawer detail panel, dashboard table, queue rows |
| Accent (10%) | `--v7-brand-primary` | `#dc4c19` | Reserved-for list below — never used as default button color |
| Destructive | `--v7-red` | `#b5454e` | Reject buttons, demoted-status badge, manual_block badge, "failed" automation_run badge |

**Accent (`--v7-brand-primary`) reserved exclusively for:**
1. Primary CTA button on the queue row: "Approve & action".
2. The active node in the topic→entity→mailbox tree (left tree, current selection background `--v7-brand-primary-soft`, text `--v7-brand-primary`).
3. The "Bulk-clear remaining {N} predicted rows" race-cohort affordance button (D-21).
4. The promoted-status badge text on `/classifier-rules` (background `--v7-brand-primary-soft`).
5. Count-badge fill on the active tree node only — inactive count badges use `--v7-panel-2` background with `--v7-text` foreground.

**Status-badge palette mapping (rules dashboard + queue):**

| Status | Background | Foreground | Token Source |
|--------|-----------|-----------|--------------|
| `candidate` | `--v7-amber-soft` | `--v7-amber` | gathering N |
| `promoted` | `--v7-brand-primary-soft` | `--v7-brand-primary` | live whitelist |
| `demoted` | `--v7-red` @ 13% (use rgba inline) | `--v7-red` | needs review |
| `manual_block` | `--v7-panel-2` | `--v7-muted` | operator override |
| `shadow_would_promote` | `--v7-blue-soft` | `--v7-blue` | shadow-mode preview only |

Accent and destructive must never overlap (no orange "delete" buttons; no red "approve" buttons).

---

## Copywriting Contract

All copy in **English** (matches existing v7 surfaces). All copy below is the canonical, ship-as-is text — executor must not rewrite.

### Bulk Review page (`/automations/debtor-email-review`)

| Element | Copy |
|---------|------|
| Page heading (h1) | `Bulk Review` |
| Page subhead | `Review predicted classifications. Approved rows trigger Outlook categorize+archive and iController delete in the background.` |
| Tree section label | `QUEUE BY TOPIC` |
| Tab 1 label | `All predicted` |
| Tab 2 label | `Pending promotion` |
| Filter chip label (rule filter active) | `Filtered to rule: {rule_key} — Clear` |
| Per-row primary CTA | `Approve` |
| Per-row secondary CTA | `Reject` |
| Race-cohort affordance (only when applicable) | `Bulk-clear remaining {N} predicted rows for promoted rule "{rule_key}"` |
| Race-cohort confirmation (modal) | Heading: `Bulk-clear {N} rows?` · Body: `These rows were predicted before "{rule_key}" was auto-promoted. Approving them runs categorize+archive on each. This cannot be undone.` · CTA: `Approve all {N}` · Cancel: `Cancel` |
| Empty state heading (no predicted rows for selection) | `Queue clear` |
| Empty state body | `No predicted classifications waiting for this selection. New rows appear automatically as the ingest route writes them.` |
| Empty state heading (entire queue empty) | `Nothing to review` |
| Empty state body (entire queue) | `Predicted classifications will appear here once the debtor-email ingest route receives mail. Check back shortly.` |
| Error state | Heading: `Couldn't load the queue` · Body: `Refresh the page. If the problem persists, check the automation_runs broadcast in the v7 dashboard.` · CTA: `Retry` |
| Pagination footer | `Showing {N} of {total} predicted rows · Load older` |
| Status pill (row pending action) | `Predicted` |
| Status pill (row finishing) | `Approving…` / `Rejecting…` |
| Status pill (failure on side-effect) | `Action failed — Retry` |

### Classifier Rules page (`/automations/classifier-rules`)

| Element | Copy |
|---------|------|
| Page heading (h1) | `Classifier Rules` |
| Page subhead | `Auto-promotion of regex and intent rules across all swarms. Wilson 95% CI-lo gates promotion at N≥30 and demotion at <92%.` |
| Shadow-mode banner (until flip) | `Shadow mode — cron records evaluations but does not mutate rule status. Showing "would have promoted" indicators.` |
| Section heading (group 1) | `Promoted` |
| Section heading (group 2) | `Candidates` |
| Section heading (group 3) | `Demoted` |
| Section heading (group 4) | `Manually blocked` |
| Column headers | `Rule` · `Swarm` · `Kind` · `Status` · `N` · `CI-lo` · `Trend (14d)` · `Last evaluated` · `Actions` |
| Empty state heading | `No rules yet` |
| Empty state body | `Rules appear here as the debtor-email ingest route writes telemetry to agent_runs. The first daily cron run seeds candidates.` |
| Manual-block CTA | `Block` |
| Manual-unblock CTA | `Unblock` |
| Block-confirmation (modal) | Heading: `Block rule "{rule_key}"?` · Body: `This sets status to manual_block. Future ingest decisions will skip auto-action for matching rows. The cron will not auto-promote until you unblock.` · CTA: `Block rule` · Cancel: `Cancel` |
| Shadow-mode indicator on row | `Would have promoted` (small chip on candidate rows when CI-lo math says go but flag is off) |
| Error state | Heading: `Couldn't load rules` · Body: `Refresh the page. The classifier_rules table read failed.` · CTA: `Retry` |

### Sidebar count badges (cross-page)

Badge format: numeric only, no thousands separator under 1000, comma separator at 1000+. Hidden when count is 0. Aria-label: `{count} predicted rows for {node label}`.

---

## Interaction Contract

### Bulk Review tree drawer

- **Tree selection state lives in URL.** Format: `?topic=payment_admittance&entity=smeba&mailbox=4&rule=subject_paid_marker&tab=all`. All four are independently optional. Browser back/forward must restore the selection.
- **Tree expand state is local** (component state, not URL). Topic groups expand on click; entity groups inside expand on click; mailbox is a leaf.
- **Right detail panel renders the row list** for the current selection. When no leaf is selected, panel shows the "Select a node" prompt: `Pick a topic, entity, or mailbox on the left to see its predicted rows.`
- **Realtime updates** (Phase 59 broadcast on `automation_runs`): new rows prepend to the visible list with a 200ms fade-in. Counts in the tree update without re-render of the detail panel. No toast on every insert — only on explicit user action.
- **Cursor pagination** at the bottom of the detail panel: button `Load older` fetches next 100 rows by `created_at < cursor`. Button is disabled and labeled `End of queue` when no older rows exist.
- **Approve / Reject** are per-row only. Both buttons render inline at the right of each row with 8px gap. Approve is filled `--v7-brand-primary`; Reject is outline `--v7-red` border + `--v7-red` text. Clicking either: optimistic transition to `Approving…` / `Rejecting…`, row removes from list on success (server confirmed `status='feedback'` write), reverts with toast `Couldn't record verdict — try again` on failure.
- **Race-cohort affordance** appears as a sticky banner at the top of the detail panel **only** when (a) selection includes a rule that was promoted by today's cron and (b) ≥1 row remains. Banner contains: explainer line + `Bulk-clear remaining {N} predicted rows for promoted rule "{rule_key}"` button. Click → modal confirmation → approve all sequentially (UI streams progress: `12 of 47 cleared…`).

### Classifier Rules dashboard

- Single sortable table, grouped by status with sticky group headers. Default sort within each group: `last_evaluated DESC`.
- Trend sparkline is 14 days of `ci_lo` from `classifier_rule_evaluations`. Render as a 64px-wide × 24px-tall inline SVG. Stroke `--v7-text`, fill `--v7-panel-2`, no axes, no labels. Tooltip on hover shows the latest value.
- "Would have promoted" indicator is a small pill (12px label) that appears only on `candidate` rows during shadow mode. Use `shadow_would_promote` color tokens above.
- Manual block/unblock action buttons are icon+label (lucide `Ban` / `CircleCheck`). Located in the rightmost column. Confirmation modal required for block; no confirmation for unblock (reversible).
- No realtime updates needed — page re-fetches on focus and on a 5-minute interval. Cron writes daily, so churn is low.

---

## Component Reuse Map

| New surface | Reuses | New code |
|-------------|--------|----------|
| Bulk Review tree (left panel) | `swarm-sidebar.tsx` mini-stat pattern, `sidebar-mini-stat.tsx` count-badge | `QueueTree.tsx` (recursive tree-row component, 3-level deep) |
| Bulk Review detail panel (right) | `agent-detail-drawer.tsx` Sheet body styles, `kanban/job-tag-pill.tsx` for status pills | `PredictedRowList.tsx` + `PredictedRowItem.tsx` |
| Race-cohort banner | `realtime-status-indicator.tsx` chip styling | `RaceCohortBanner.tsx` |
| Classifier Rules table | shadcn `<Table>` primitives, v7 tokens, `kanban/job-tag-pill.tsx` for status badges | `RulesTable.tsx`, `CIloSparkline.tsx`, `RuleStatusBadge.tsx`, `BlockRuleModal.tsx` |
| Tab strip ("All predicted" / "Pending promotion") | shadcn `<Tabs>` | none |

The tree drawer reuses the `agent-detail-drawer` Sheet component **only as a structural reference for the slide-in pattern** — the Bulk Review page itself is full-page (left tree + right detail), not a drawer over another page. Drawer is only used inside the rules dashboard if the user wants a per-rule detail view (deferred — out of Phase 60 scope unless trivial).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | `Tabs`, `Table`, `Dialog` (modal), `Sheet` (drawer pattern, already in tree), `Button`, `Badge` | not required (official) |

No third-party registries declared. No `npx shadcn view` vetting needed.

---

## Accessibility & Realtime Contract

- Tree-row keyboard nav: arrow up/down moves selection within siblings, arrow right expands, arrow left collapses or moves to parent. Enter activates leaf selection. Matches WAI-ARIA tree pattern.
- All status badges include `aria-label` with the full status name (badges show only color + short label visually).
- Approve/Reject buttons have `aria-label` containing the row identity (e.g. `Approve predicted classification for email from {sender} matching rule {rule_key}`).
- Realtime row-insert animation respects `prefers-reduced-motion: reduce` — falls back to instant insert.
- Sparkline SVG has `<title>` element with `Wilson CI-lower trend over the last 14 evaluations, latest {value}%`.

---

## Out of Scope (Confirmed Deferred)

The following design questions are **not** answered here because they are explicitly deferred in `60-CONTEXT.md`:

- General bulk-approve UX (Phase 55 deferred until ≥200 rows + <5% disagreement).
- Saved-views / shareable named queries on the queue.
- Per-rule manual-flip approval workflow on the dashboard.
- Mobile/tablet layout — desktop-first, ≥1280px viewport target.
- Rule-discovery UI (Phase 61+).

---

## Pre-Population Audit

| Source | Decisions Used |
|--------|---------------|
| 60-CONTEXT.md | D-10..D-15 (queue UI), D-21 (race-cohort affordance), D-26 (dashboard), D-12 (drawer reuse), D-23 (intent rules), D-19 (shadow-mode banner) |
| ROADMAP.md Phase 60 | Page paths, deliverable count, dependency on Phase 59 broadcast |
| REQUIREMENTS.md | DS-01..DS-04 (font + theme contract inherited), POL-01..03 (v7 token migration completed) |
| `web/components.json` | shadcn preset confirmed `radix-nova`, lucide icons, neutral baseColor |
| `web/app/globals.css` | All --v7-* tokens, glass shadows, radii, font vars |
| `web/components/v7/*` | Component reuse anchors |
| sketch-findings skill | Confirmed Smeba review work uses different reviewer-page pattern (3-panel English review). Phase 60 is operator-facing bulk-review, not reviewer-facing — distinct surface, no copy-conflict |
| User input (this session) | None — context fully covered the design decisions |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
