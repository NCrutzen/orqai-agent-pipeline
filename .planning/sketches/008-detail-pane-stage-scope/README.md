---
sketch: 008
name: detail-pane-stage-scope
question: "Which stages should the detail pane surface, and what does the bottom Approve mean?"
winner: null
tags: [phase-82.5, detail-pane, stage-scope, approve-semantics]
---

# Sketch 008 — Detail-pane stage scope + Approve semantics

## Design Question

Today's detail pane shows all 5 stages (0-4) even when the row only ran Stage 0+1. Future stages render as "didn't run — override to set" placeholders, padding the pane with surfaces that aren't actionable in the current tab.

Two coupled questions to resolve:

1. **Stage scope** — should the pane show only the stages that actually ran for this row (plus the current tab's stage), or always render the full pipeline for visual uniformity?
2. **Approve semantics** — the bottom bar has Approve / Reject / Skip. What does Approve mean? Is it row-level ("everything's good"), stage-level ("this stage's verdict is right"), or queue-level ("move me to the next row")? Today it conflates these.

This sketch is upstream of the original "read-back state" question — until we lock the pane's structure, the read-back placement can't be designed.

## How to View
```
open .planning/sketches/008-detail-pane-stage-scope/index.html
```

## Variants

- **A — Run + current only, Confirm per stage:** strongest opinion. The Stage 1 tab shows Stage 0 + Stage 1. Stages 2/3/4 are hidden (they belong to other tabs). No global Approve — each stage has its own per-stage Confirm chip (Sketch 011-C treatment). Bottom bar is navigation only (Reject / Skip).

- **B — Full timeline, future stages collapsed:** middle ground. All 5 stages visible, but future-yet-to-run ones collapse into a single pill ("Stages 2-4 haven't run yet · expand"). Bottom Approve = "approve every verdict that ran." Preserves Phase 76's unified-shell uniformity.

- **C — Run + current scope, bottom button reflects active stage:** combination. Stage scoping like A (future hidden). But the per-stage Confirm chip is replaced by a SINGLE bottom-button whose label inherits from the active tab: "Confirm Stage 1" / "Confirm Stage 3". One Confirm per row per tab.

## What to Look For

- **For Stage 1 tab specifically:** does showing only Stage 0+1 feel "too thin" or "exactly right"?
- **For Stage 3 tab:** with all 4 prior stages visible, does the pane feel info-dense or appropriately contextual?
- **Approve placement:** is per-stage (A) clearer, single bottom button (C), or row-level batch (B)?
- **Note textarea position:** in all three variants the textarea sits under the active stage. Does that placement need to change with the stage scope?
- **Cross-tab consistency:** does the pane structure stay recognizable when you switch tabs, even with different stages visible?

## Open Questions Surfaced Here

- **What does "Approve" mean for a row in the Stage 1 queue?** It can't approve Stage 2/3 because they haven't run. Variant A removes the verb. Variant B redefines it. Variant C swaps it for "Confirm Stage N."
- **Is the unified shell (Phase 76) worth the visual cost?** Variant B preserves it; A and C break it.
- **What happens to the keyboard ⏎ shortcut?** All variants want ⏎ to mean "the obvious action for this tab." With A, that's the active stage's Confirm chip. With C, that's the bottom Confirm-Stage button.

## Predecessor Note

The original Sketch 008 (read-back state, before this rewrite) is preserved in git history (commit before this one). The read-back question is parked until stage scope + Approve semantics are locked — those decisions determine where the read-back surface lives.
