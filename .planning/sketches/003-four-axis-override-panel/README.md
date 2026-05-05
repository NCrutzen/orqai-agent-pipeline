---
sketch: 003
name: four-axis-override-panel
question: "When the operator drills into one email, how do we surface 4 stage-override widgets (D-04..D-07) without losing the linear pipeline mental model and without overwhelming the common case (touching only 1 stage)?"
winner: null
tags: [interaction, override, phase-71, bulk-review-detail]
---

# Sketch 003: 4-axis override panel

## Design Question
Phase 71 expands the existing single-stage Stage 1 override (`detail-pane.tsx`) to **four independent axes** (Stage 1 category · Stage 2 customer · Stage 3 intent · Stage 4 quality). Each axis has different controls and side effects. How do we present all four without burying the common case (one axis touched per email) under chrome, while keeping the pipeline order legible?

## How to View
```
open .planning/sketches/003-four-axis-override-panel/index.html
```

## Variants
- **A: Tabs per axis** — horizontal tabs (S1 · S2 · S3 · S4); only the active axis renders its form. A dirty-dot on the tab indicates an unsaved override on that axis. Minimal scroll, but hides the other 3 stages.
- **B: Stacked accordion** — all 4 stages visible as collapsed cards; click to expand. Multiple can be open at once. Strong "this row's whole pipeline" feel; longer when expanded.
- **C: Vertical pipeline** — flow-style with a connecting line and circular step nodes. Each stage shows its current decision; a small "override" link reveals its form inline. The dirty step gets an amber node + amber-bordered control. Most pipeline-y mental model; takes the most vertical space.

All three variants share the same **eval_type radio bar** (regression default = highlighted) and submit button below — that's not the design question here.

## What to Look For
- **One-stage-dirty case (most common)**: which variant gets to the override form fastest with least chrome?
- **Multi-stage-dirty case (rare but real)**: e.g. operator overrides Stage 2 *and* rates Stage 4 quality — does the variant let them see and edit both at once?
- **Read-only vs. edit affordance**: when a stage looks correct, the operator should still see what it decided. Does the variant communicate "you can override this if you want" without making it feel like every stage demands attention?
- **Re-run toggle prominence (Stage 2)**: this toggle (`re_run_downstream`) is a money/time decision. Is it discoverable? Is "default off" clearly off?
- **Stage 4 "no re-run" warning**: where does the info banner ("update iController draft separately") best live?
- **Pipeline order legibility**: if I'm new to the system, does this UI teach me that there are 4 stages and they run in order?
