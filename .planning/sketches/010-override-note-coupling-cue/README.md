---
sketch: 010
name: override-note-coupling-cue
question: "When the override picker opens, how do we make it obvious the textarea note attaches?"
winner: "C"
tags: [phase-82.5, override, coupling, detail-pane]
---

# Sketch 010 — Override + note coupling cue

## Design Question
Plan 82.4-04 wired override actions to dual-write an `email_feedback` row carrying the current textarea content. Operators don't realise their note is being attached — the picker and textarea look like independent surfaces. We need a cue that makes the coupling visible without crowding the panel.

## How to View
```
open .planning/sketches/010-override-note-coupling-cue/index.html
```

## Variants
- **A — Tooltip arrow:** when picker opens, a tooltip pops out pointing toward the textarea. Strong discoverability; adds overlay noise.
- **B — Shared accent border:** picker + textarea both gain an amber glow when picker is focused. Subtler; risks being read as a focus ring, not a coupling cue.
- **C — Inline microcopy:** persistent line under the picker: "Override + note save together." No animation, cheapest to ship.

## What to Look For
- Does the cue read as "these are coupled" or just "this is active"?
- Does it crowd the already-dense detail pane?
- For veteran operators: which variant is least annoying after they've internalised the pattern?
- For new operators: which teaches the coupling fastest?

## Open Questions Resolved Here
- Pattern for affordance microcopy in feedback flows (will apply to multi-stage flag-on-override too).
