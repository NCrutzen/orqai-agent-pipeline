---
sketch: 005
name: stage-3-ranked-intent-reorder
question: "How does the operator see the full ranked intent list (not just the top pick) and reorder it inside the locked inline-expand pane?"
winner: "vertical reorderable list w/ ↑↓ buttons · #1 = dispatch-winner highlight"
tags: [stage-3, topic, ranked-intent, reorder, p3, req-01, axis-3]
---

# Sketch 005 — Stage 3 ranked-intent reorder

## What's already shipped (verified in code 2026-05-21)

- `Stage3Widget` (Phase 71-04 REVW-03): single-select dropdown of intents with handler tooltip on hover. **Only lets operator pick a different top intent — cannot reorder the list.** ✓ (partial — gap below)
- `coordinator_runs.ranked_intents` JSONB: the **full ranked list with confidences IS persisted** per CORD-01 (classifier emits `[{intent, confidence}, …]` ordered desc). UI doesn't surface it. ✓
- `swarm_intents` registry-driven dispatch table (Phase 68 SWRM-02 + Phase 78 codegen). Hard-separated from `swarm_noise_categories`. ✓
- Stage 3 / Stage 3.5 split (Phase 80): classifier emits `<swarm>/predicted`, dispatcher routes based on `handler_status` (registered → emit handler_event; placeholder → human queue). ✓
- `agent_runs.status='predicted'` is a first-class state ✓.

## Gap (REQ-01 Axis 3)

REQ-01 requires: "operator can re-pick the top intent AND reorder the full ranked list; each reorder emits its own `pipeline_events` row with `stage='3-coordinator'`, `eval_type='intent-correction'`."

The current `Stage3Widget` (a single-select dropdown) covers the "re-pick top intent" half but NOT the "reorder full list" half. This sketch defines the ranked-list editor.

## Locked decisions before sketching

- Inline-expand 2-col layout from sketch 002.
- Section pattern + email body + body toolbar + thread modal from sketch 003.
- Confirm-green / Override-amber footer + button-state swap from sketch 002/004.
- Audit-block "Why this verdict?" with promoted prominence from sketch 003/004. Optional for confirms.
- **Eval-type radio removed from operator UI**, server-defaults to `regression` (sketch 004 lock).
- No new variant of the override disclosure pattern — Stage 3's override IS the reorder itself. No separate "type a number" affordance needed (intent registry is closed-list and constrained).

## How to View
```
open .planning/sketches/005-stage-3-ranked-intent-reorder/index.html
```
Tab between **A | B**.

## Variants

- **A — Confident classifier** (top intent 94%, gap-to-#2 = 90 pts). Clear winner. Operator's likely action: hit ⏎ to Confirm without touching the list. Demonstrates the green-tinted "DISPATCH WINNER" treatment + the lime confidence bar.

- **B — Uncertain classifier** (top 41% vs runner-up 38%, gap = 3 pts). Flagged via the inline-head pill ("⚠ low-confidence ranking") and the editor sub-heading. Confidence bars sit nearly side-by-side. Operator should read the body carefully, often reorders. Demonstrates how the UI handles ambiguity without changing layout.

## What to Look For

1. **The ranked-intent editor (centerpiece).** Each row carries: drag-handle glyph (visual affordance), rank #, intent_key (mono), handler hint (→ handler_agent_key), confidence bar + percentage, up/down buttons. Position 1 is **green-tinted with the "DISPATCH WINNER" tag** — visually communicates "Stage 4 runs this."

2. **Try reordering.** Click ↑ or ↓ on any row. The list updates, the moved row pulses amber briefly, and:
   - If the new ordering matches the classifier's original → green-tinted #1 stays, "Confirm ranking" footer button.
   - If it differs → #1 row turns **amber** (your-pick state), "DISPATCH WINNER" tag becomes "YOUR PICK", and the footer button becomes amber **"Submit reorder → {new_top_intent} ⏎"**. A "Reset order" button appears next to the footer copy.

3. **Confidence bar widths.** In Variant A, position #1 has a near-full lime bar; the rest are tiny. In Variant B, positions #1 and #2 are nearly equal width — ambiguity is visceral.

4. **Disabled state at the edges.** Top-row ↑ button and bottom-row ↓ button are disabled (subtle opacity). No accidental edge clicks.

5. **Footer copy on the eval contract.** Below the list: *"Each move emits its own `pipeline_events` row · `eval_type=intent-correction`"* — sets expectation about backend writes.

## Implementation dependencies (for plan-phase)

Already shipped (reuse):
- `coordinator_runs.ranked_intents` JSONB persistence ✓
- `loadSwarmIntents(swarm_type)` registry helper ✓
- `pipeline_events` write helper (Phase 70) ✓
- Inline-expand 2-col container, audit-block, footer pattern from sketches 002/003/004.

New backend work:
- **Server action `reorderStage3Intents`** mirroring `overrideStage2Customer`: accepts `{email_id, swarm_type, new_order: string[]}`, validates each intent_key against `swarm_intents` (registry-bound), writes one `pipeline_events` row per moved position with `stage='3-coordinator'`, `eval_type='intent-correction'`, `decision_details={from_position, to_position, intent_key}`. Optimistic UI removal via `useSelection()` matches Stage 0/2 pattern.
- **Auto-rerun**: if the operator changes the top-1 position, Stage 4 must re-dispatch with the new intent → emit `<swarm>/predicted` again (matching the LLM-tiebreaker flip pattern in sketch 004). If the operator reorders below position 1 only, NO re-dispatch — pure eval signal.

New UI work:
- **Ranked-list editor component** — vertical list, ↑↓ buttons (primary), drag handle (visual only for now; HTML5 DnD or `@dnd-kit/sortable` in a follow-up). Position 1 highlight swaps green→amber on dirty. Reorder animation = 600ms amber pulse.
- **Replace the dropdown-only `Stage3Widget`** with this editor inside the unified detail pane at `activeStage=3`. The dropdown can remain elsewhere (legacy surfaces or admin tools) but operator override flows through the editor.

Optional polish (later):
- Drag-and-drop with HTML5 native DnD or `@dnd-kit/sortable`. Today's ↑↓ buttons are accessibility-first; drag is a faster path for power operators.
- Keyboard shortcuts on focused row: `J`/`K` move focused row up/down (mirrors the J/K next-prev pattern at the row level).

Out of scope (later sketches):
- Cross-row patterns ("3 emails this week had close top-2 intents — should we adjust the classifier prompt?") → sketch 006.
- Promotion-recommender handoff for new intent candidates → sketch 007.
