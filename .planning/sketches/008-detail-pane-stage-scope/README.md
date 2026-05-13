---
sketch: 008
name: detail-pane-stage-scope
question: "Future stages + Approve semantics — with the full surface stack visible (header, Show full email, audit expander per stage, feedback panel, read-back history, control area)."
winner: null
tags: [phase-82.5, detail-pane, stage-scope, approve-semantics, surface-stack]
---

# Sketch 008 — Detail-pane stage scope + Approve semantics (complete surface)

## Design Question

Today's detail pane shows all 5 stages even when only Stage 0+1 ran for the current row. The "stages 2-4 didn't run — override to set" placeholders pad the pane without serving Stage 1 review. Bottom footer "Approve" is ambiguous — what is it approving when the row hasn't run Stages 2-4?

All three variants here lean into the **Variant B family from sketch v1**:
- **Full pipeline visible** for context.
- **Future-not-yet-run stages collapse** into a single pill, dramatically reducing pane height.
- **Per-stage Save/Confirm stays tight to the textarea** inside each stage's `SHOW DETAILS` expander — never moved to the footer.

What varies between A / B / C is **what the bottom footer's "Approve" does**.

## How to View
```
open .planning/sketches/008-detail-pane-stage-scope/index.html
```

## What's Faithful to Production

This sketch renders the complete detail-pane surface from `web/app/(dashboard)/automations/[swarm]/_shell/detail-pane.tsx`:
- Header (mailbox label · subject · From sender)
- `Show full email` toggle (collapsible body section, max 320px scroll in prod)
- Vertical `PipelineFlow` with 30px node circles + 2px connecting line at 15px from left
- Per-stage `SHOW DETAILS` expander containing the audit panel (Phase 82.3 Plan 11)
- Inside each expander: `StageFeedbackPanel` (Phase 82.4 Plan 03) with textarea + Save + Confirm
- Override-coupling helper line under the textarea (Sketch 010-C winner: "⤓ Override + note save together")
- Two-line button treatment (Sketch 011-C winner)
- "✓ Looks correct" + "override stage" link in the control area for `state=ok` stages
- Read-back "What others said" collapsible inside the feedback panel (resolves the original 008 read-back question)
- Footer with Approve / Reject / Skip buttons

## Variants

### A — Keep Approve, relabel
- Bottom Approve stays. Microcopy: <em>"Approve verdicts that ran (Stages 0+1)"</em>.
- Two paths to confirm: per-stage chip OR bottom batch button.
- **Strength:** fastest one-shot clearing. **Risk:** redundancy ↔ which path do operators use?

### B — Drop bottom Approve
- Bottom is navigation only (Reject / Skip).
- Per-stage Confirm chips inside expanders are the only verdict writers.
- **Strength:** one way to write a verdict. **Risk:** loses the "everything's good, move on" shortcut.

### C — Batch-confirm dynamic
- Bottom Approve relabels dynamically: <em>"Approve all N unconfirmed verdicts"</em>. Count drops as operator confirms individually.
- Disappears entirely when nothing left to confirm.
- **Strength:** honest about what it does. **Risk:** moving target for muscle memory.

## What to Look For

1. **Density** — with audit panel + feedback panel + read-back history all visible, does Stage 1 alone feel cramped at 460px sidebar width (production prod size)?
2. **Future-stage pill placement** — bottom of pipeline is fine? Should it sit at the very bottom, or could it appear under the active stage?
3. **Bottom footer** — A's relabel, B's deletion, or C's dynamic count? Vote per role:
   - Operator clearing a high-volume queue
   - Operator training the corpus carefully
   - New operator
4. **Read-back placement** — the "What others said" block lives inside the feedback panel, after the Save/Confirm buttons. Does that feel right, or should history surface above the textarea?

## Decisions Already Locked (from this sketch's premise)
- **Future stages collapse** rather than render as "didn't run" placeholders (all 3 variants).
- **Per-stage Confirm + Save stay tight to the textarea** inside the audit expander (all 3 variants).
- **Read-back history** ("What others said") goes inside the feedback panel, below the buttons.

## Open Questions

- **OQ-1:** When the operator hits ⏎ keyboard shortcut, what fires?
  - A: bottom Approve
  - B: the active stage's Confirm chip
  - C: bottom Approve when N > 0, otherwise Skip
- **OQ-2:** Should the future-pill be clickable to expand all 3 stages at once, or open a sub-popup with per-stage override pickers?
- **OQ-3:** For Stage 3 tab (where 0+1+2+3 all ran), is the pane too tall now that every stage has expandable audit + feedback? Possibly default-collapse all non-active stage expanders.
