---
sketch: 008
name: feedback-read-back-state
question: "How does StageFeedbackPanel look when re-opening a row that already has feedback (own + others)?"
winner: null
tags: [phase-82.5, feedback, detail-pane, read-back]
---

# Sketch 008 — Feedback read-back state

## Design Question
When an operator re-opens a row that already has prior feedback (their own and/or other operators'), what should the StageFeedbackPanel surface?

Today (post-82.4) the textarea is always empty on mount — the durable note disappears from the UI as soon as the row deselects. We need to (a) show the operator's own prior prose, (b) optionally surface what other operators said, without (c) hiding the everyday "type a quick note" affordance.

## How to View
```
open .planning/sketches/008-feedback-read-back-state/index.html
```

## Variants
- **A — Pre-fill + verdict chip:** simplest. Textarea pre-filled with the operator's latest prose; verdict chip next to the stage label. No cross-operator surface.
- **B — Pre-fill + "Others said" collapsible:** A + a dashed-separator block under the textarea: "What others said (N)" — collapsible cards with author/time/verdict per prior cross-operator note.
- **C — Verdict timeline view:** replaces the textarea-first layout with a chronological timeline (your latest expanded, prior verdicts as pill rows). Optimised for "how did we converge?" not "type fast."

## What to Look For
- Does the verdict chip placement (next to stage label vs inside the panel) feel right?
- Variant B: is "What others said" enough context, or does it need authorship per chip?
- Variant C: does the timeline make the everyday "save a quick note" flow feel slower?
- Color tokens: is the unclear/override/confirm chip palette readable against `--bg-panel-soft`?

## Open Questions Resolved Here
- OQ-1 (from 82.5 SCOPE-DRAFT): latest only vs full history → Variant A=latest only, B=latest + collapsed others, C=full chronological.
