---
sketch: 009
name: row-strip-review-indicators
question: "What chip/treatment shows verdict status on rows without clashing with existing stage badges?"
winner: null
tags: [phase-82.5, bulk-review, row-strip, verdict-indicator]
---

# Sketch 009 — Row-strip review indicators

## Design Question
Operators triage hundreds of rows daily. Today there's no scannable signal that says "I already reviewed this and what I said." The verdict lives only inside the detail-pane's StageFeedbackPanel — invisible until you select the row. We need a row-strip indicator that:
- Encodes confirm / override / unclear at a glance
- Doesn't visually compete with the existing stage badge (which already carries a colored chip)
- Doesn't break the selected-row left-border treatment (`--brand-primary`)
- Stays readable at 1280px viewport widths

## How to View
```
open .planning/sketches/009-row-strip-review-indicators/index.html
```

## Variants
- **A — Dot before stage badge:** 8px colored circle at row left, before the badge. Empty dashed circle = no feedback yet. Adds a 14px grid column; no badge restyling.
- **B — Verdict letter chip:** `C` / `O` / `U` chip clipped to the stage badge. Color + glyph (color-blind safe). Doubles visual weight on the badge.
- **C — Left-edge color bar:** 3px vertical bar on the row's left edge encodes verdict. No new column, no badge change. Risk: collides with the existing selected-row left border.

## What to Look For
- Scanability — can you spot "what's been touched" while scrolling fast?
- Selected-row conflict (especially Variant C) — does the verdict bar still read correctly on selected rows?
- Density at 1280px — does any variant feel cramped?
- Color separation — confirm (lime) / override (amber) / unclear (blue) must stay clearly distinct at small sizes.

## Open Questions Resolved Here
- OQ-2 (from 82.5 SCOPE-DRAFT): does the chip color clash with existing stage badges? Variants A and C decouple from the badge entirely; B doubles up.
