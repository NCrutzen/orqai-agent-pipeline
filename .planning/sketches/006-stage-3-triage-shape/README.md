---
sketch: 006
name: stage-3-triage-shape
question: "Inside the Stage 3 · Intent tab, what's the layout for the unhandled-intent triage list?"
winner: "B — Filtered table + detail pane"
tags: [layout, phase-76, stage-3, table, detail-pane]
---

# Sketch 006: Stage 3 triage tab shape

## Design Question

After sketch 005 locked the stage-keyed tab shell, we need the layout *inside* the Stage 3 tab. Stage 3 captures two kinds of stuck rows: `no_handler` (intent picked, no Stage 4 worker exists) and `low_confidence` (Stage 3 unsure). Three plausible layouts:

- **Column-board (literal Kanban)** — visual columns by reason, draggable cards
- **Filtered table** — chip filter at top, dense rows below, mirrors Bulk Review's pattern
- **Hybrid** — chip filter + collapsible grouped sections

Stage 4 (handler errors) likely mirrors the winner — the same shape with reason='handler_error' and an error_detail field in the detail pane. Sketched only for Stage 3 here; no need to mock both stages.

## How to View

```
open .planning/sketches/006-stage-3-triage-shape/index.html
```

## Variants

- **A: Column-board** — Two columns within the Stage 3 tab (No handler / Low confidence). Cards. Drag-and-drop technically possible but conceptually wrong for triage.
- **B: Filtered table + detail pane** — Chip strip filters by reason. Dense rows on the left. Detail pane on the right with Stage 3 ranked output, body preview, three operator actions. Reuses Bulk Review row pattern.
- **C: Chip filter + grouped sections** — Same chip strip as B for filtering. When "All" active, rows render in collapsible sections grouped by reason with a one-sentence explainer per section.

## What to Look For

- **Density** — how many rows visible without scrolling on a typical viewport
- **Cross-stage consistency** — does Stage 3's layout pair well with Stage 1 (Bulk Review)'s existing row-strip pattern, or does it feel like a different page?
- **Reason visibility** — is the reason for each row obvious at-a-glance (Variant A: column membership; B: pill on row; C: section heading)?
- **Empty state** — if only one reason has rows, does the layout collapse gracefully?
- **Detail pane fit** — does the layout leave room for a detail pane (where Replay editor + Reclassify dropdown live), or is the detail pane modal/drawer?
- **Stage 4 reuse** — can the winning layout host the handler-error reason without re-design?

## Recommendation

Variant B is my top pick — reuses the Bulk Review row-strip pattern (operators learn one thing), supports the detail pane natively (where the three operator actions live), and Stage 4 inherits the same shape. Variant C is appealing for first-time operators (the section headers explain the reason inline) but the chrome-per-section cost is real once the daily-use mental model is built. Variant A is a wrong tool for the job — drag-and-drop is dead weight here.
