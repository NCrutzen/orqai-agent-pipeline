---
sketch: 007
name: row-action-affordances
question: "How do Replay (with intent edit), Reclassify-as-noise, and Close work as interactions inside the detail pane?"
winner: "B — Inline-expand within pane"
tags: [interaction, phase-76, stage-3, detail-pane, actions, inline-editor]
---

# Sketch 007: Row action affordances

## Design Question

Sketch 006 locked the layout (filtered table + detail pane). This sketch focuses on the *interaction* of the three operator actions:

- **Replay through Stage 4** — re-fires the handler_event for this row's intent. Operator may edit the intent first; if they do, an axis-3 override is also written (CONTEXT.md D-01).
- **Reclassify as noise** — operator says "this should have been Stage 1 noise." Picks a noise key from the registry-driven list. Writes axis-1 override + fires categorize_archive (CONTEXT.md D-03).
- **Close (manual)** — operator handled it outside the system. Mark resolved.

Three plausible interaction patterns:

- **Modal-driven** — click → modal opens → confirm
- **Inline-expand** — click → action area expands inline within the pane → confirm
- **Dropdown-on-button** (split-button) — main click confirms current value; chevron reveals editor

## How to View

```
open .planning/sketches/007-row-action-affordances/index.html
```

## Variants

- **A: Modal-driven** — Click Replay → modal with intent dropdown + optional note + Cancel/Confirm. Same shape for Reclassify.
- **B: Inline-expand within pane** — Click Replay → button area expands into an intent editor inline. Confirm with ⏎, cancel with Esc. Other action buttons dim while editing. Email body + ranked output stay visible.
- **C: Dropdown-on-button (split-button)** — Replay button shows current intent in its label (one click confirms). Chevron reveals dropdown to edit intent. Compact but discoverability cost.

## What to Look For

- **Same-intent happy path** — operator agrees with Stage 3's pick and just wants the handler to re-fire. How many clicks? How visually heavy?
- **Different-intent path** — operator wants to override. Is the editor obvious? Does it block reading the email while picking?
- **Keyboard ergonomics** — daily-use operators will live on ⏎ / Esc / N / Space. Which variant feels best with eyes off the trackpad?
- **Audit-note slot** — do we have somewhere obvious for an optional note explaining the action? (relevant for axis-3 overrides — Phase 79 learning loop wants this signal)
- **Reclassify reuse** — does the same pattern work for Reclassify-as-noise (4-noise-key dropdown), or does Reclassify need its own pattern?
- **CONTEXT.md §Specific Ideas alignment** — the spec says "Replay editor uses the same dropdown pattern as Stage 1 widget in Bulk Review (`stage-1-widget.tsx`)". Variant B's inline editor is closest to that component shape; A's modal and C's split-button deviate.

## Recommendation

Variant B is my top pick. Reasons:
- Email body stays visible while picking intent (no blocked context).
- Two-click happy path for same-intent replay (Replay → ⏎).
- Matches the Stage 1 widget reuse explicitly noted in CONTEXT.md §Specific Ideas.
- Reclassify-as-noise gets the identical UX pattern with a different field — operators learn one interaction.
- Pane never loses scroll position; no modal stacking issues for keyboard navigation across rows.

Variant A (modal) is the safe fallback if we want explicit destination-state separation. Variant C (split-button) is the most compact but adds a learning curve for the chevron — better suited to power-user surfaces, not a triage queue with rotating operators.
