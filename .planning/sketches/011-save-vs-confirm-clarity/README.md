---
sketch: 011
name: save-vs-confirm-clarity
question: "What treatment makes 'Save (revisit later)' vs 'Confirm (looks correct, close)' immediately differentiable?"
winner: null
tags: [phase-82.5, feedback, save, confirm, microcopy]
---

# Sketch 011 — Save vs Confirm clarity

## Design Question
Today's StageFeedbackPanel has two pill buttons (Save, ✓ Confirm) of equal weight, differentiated only by color. Operators reported the semantics aren't intuitive: which one closes the row, which one keeps it in their queue? The buttons also fire the same POST endpoint with different verdicts (`unclear` vs `confirm`) — that distinction is invisible at the surface.

We need a treatment that makes the **action consequence** obvious before clicking.

## How to View
```
open .planning/sketches/011-save-vs-confirm-clarity/index.html
```

## Variants
- **A — Current (pill + pill):** baseline. Equal weight, color-only differentiation.
- **B — Primary + secondary text:** Confirm becomes the primary filled button; Save shrinks to a subtle text link ("Save note (revisit later)"). Implicit recommendation: confirm is the typical close.
- **C — Iconography + microcopy:** both buttons keep equal weight, both gain icons + a second line of microcopy ("come back later" / "close + done").

## What to Look For
- Without reading anything, which variant tells you which button closes the row?
- Variant B: does demoting Save discourage operators from leaving useful notes?
- Variant C: does the taller two-line button feel too heavy in the panel?
- All three: how do they read at 1280px viewport (sidebar gets narrower)?

## Open Questions Resolved Here
- OQ-4 (from 82.5 SCOPE-DRAFT): Confirm-without-note hard guard or soft? Pending. Recommend soft confirm-dialog (not blocked) regardless of variant.
