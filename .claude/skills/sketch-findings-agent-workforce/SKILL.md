---
name: sketch-findings-agent-workforce
description: Validated design decisions, CSS patterns, and visual direction from sketch experiments on agent-workforce. Covers Smeba Draft Review (Phase 47), Bulk Review per-email row + 4-axis override (Phase 71), and the stage-keyed shell + Stage 3 triage layout (Phase 76). Auto-loaded during UI implementation on agent-workforce.
---

<context>
## Project: agent-workforce

Multi-surface frontend for the MR Automations agentic pipeline. Operators triage emails through a 5-stage funnel; engineers run swarms through a separate operations dashboard. Visual language is **V7**: dark-first, OKLCH palette, Satoshi/Cabinet/Geist Mono typography, dense-but-breathable tool feel inspired by Braintrust trace review.

Two production-aligned themes coexist:
- `sources/themes/default.css` — original Phase 47 Smeba Draft Review theme (dark-first, warm amber accent).
- `sources/themes/v7.css` — production V7 namespace (mirrors `web/app/globals.css [data-theme="dark"]` V7 tokens). Use for any sketch that needs to feel like the live OS — Phase 71+ uses this by default.

**Reference points:** Braintrust trace review · MR Automations dashboard (web/app/globals.css, OKLCH palette, V7 tokens) · The 5-stage agentic-pipeline architecture (`docs/agentic-pipeline/README.md`)

Sketch sessions wrapped: 2026-04-22 (Phase 47), 2026-05-07 (Phase 71 retroactive + Phase 76)
</context>

<design_direction>
## Overall Direction

- **Theme:** dark-first; V7 tokens for production-aligned surfaces (`--bg #0c1117`, panels `#151d29`), legacy Smeba theme (`--bg #0a0a0b`) for older Phase 47 surfaces.
- **Accents:** brand-primary orange `#ff6a34` (V7) for chrome / primary actions; warm amber `#ffb547` for override / dirty state; semantic categorical colors (teal / blue / lime / pink / red) for stage chips and reason pills.
- **Typography:** system sans (Satoshi), 13px base, 11px uppercase section labels, Geist Mono for code / IDs / shortcuts.
- **Spacing:** 4px increments (`--space-1` → `--space-6`).
- **Shape:** `--radius-sm 4px / --radius 6px / --radius-md 8px`.
- **Layout primitives:**
  - **3-panel review surface** (Smeba) — inbox / mail+draft / review-panel.
  - **Pipeline strip + 4-axis override panel** (Bulk Review) — column strip per row, vertical override-card stack in detail pane.
  - **Stage-keyed tab shell** (Phase 76+) — `/automations/[swarm]/stage-N` with stage tabs + persistent detail pane on Stage 3/4.
- **Information density:** all relevant context visible simultaneously; progressive disclosure only within detail panes (inline-expand editors, collapsible sub-sections). No drawers, no hidden inboxes, no modals for high-frequency actions.
- **Operator vs engineer separation:** `/automations/[swarm]/...` is the operator surface (stage-keyed). `/swarm/[swarmId]` is the engineer dashboard (briefing + delegation graph + jobs Kanban + timeline + terminal). They live at separate URLs; the operator surface links to the engineer dashboard via a small "↗ Swarm operations dashboard" link in the tab strip's right edge.
</design_direction>

<findings_index>
## Design Areas

| Area | Reference | Key Decision |
|------|-----------|--------------|
| Review Page Layout (Smeba, Phase 47) | references/review-page-layout.md | Classic 3-panel (inbox \| mail+draft \| review-panel) with amber accent on dark |
| Bulk Review (Phase 71) | references/bulk-review-phase-71.md | Per-email row with 4-stage column strip + vertical 4-axis override panel + recipient chip filter; N-stage scaling via data-driven layout |
| Stage-keyed Shell (Phase 76) | references/stage-keyed-shell-phase-76.md | One per-swarm operator surface at /automations/[swarm]/stage-N; tabs are pipeline stages, not feature names; tab list is registry-driven |
| Stage 3 Triage Layout + Actions (Phase 76) | references/stage-3-triage-phase-76.md | Filtered table + persistent detail pane; inline-expand action editor for Replay / Reclassify-as-noise (no modals); same shape inherited by Stage 4 · Handler tab |

## Theme

Two themes coexist for production-aligned sketches:
- `sources/themes/default.css` — Phase 47 Smeba Draft Review theme. Use for legacy review surfaces.
- `sources/themes/v7.css` — V7 production namespace (default for all Phase 71+ sketches). Mirrors `web/app/globals.css [data-theme="dark"]` V7 tokens.

## Source Files

All wrapped sketches' HTML preserved under `sources/`. Each has a winning variant marked ★ in the variant-tabs row.
</findings_index>

<metadata>
## Processed Sketches

- 001-review-layout (Phase 47, Smeba Draft Review)
- 002-per-email-strip (Phase 71, folded into 004 — kept as source-only)
- 003-four-axis-override-panel (Phase 71, folded into 004 — kept as source-only)
- 004-phase-71-synthesis (Phase 71, the production-aligned reskin)
- 005-swarm-shell-integration (Phase 76, stage-keyed tab shell)
- 006-stage-3-triage-shape (Phase 76, filtered table + detail pane)
- 007-row-action-affordances (Phase 76, inline-expand editor in pane)
</metadata>
