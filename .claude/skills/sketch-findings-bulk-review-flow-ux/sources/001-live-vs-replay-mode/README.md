---
sketch: 001
name: live-vs-replay-mode
question: "How does the surface signal 'live audit queue' vs 'history/replay correction' without hijacking the chrome, when mode confusion is catastrophic?"
winner: "A"
tags: [mode, chrome, p5, req-06, severity-catastrophic]
---

## Locked decisions (carry into 002-007)
- **Mode-keyed shell** with URL split: `/queue` (live) vs `/history`.
- **Orange (`--brand-primary`) = live queue · slate-blue (`--brand-secondary`) = history.** Every chrome element flips together.
- **5-stage strip** column order: **Safety · Noise · Customer · Topic · Action** (matches docs/agentic-pipeline Stage 0 → 4).
- **Cell content** = human-readable outcome (top line, color-coded) + optional dim hint (bottom line, mechanism / confidence / customer name).
- **Blocked-stage treatment**: amber-tinted cell with subtle ring; downstream stages render as dashed `waiting` cells. Tells the operator at a glance *where* the row is stuck.

# Sketch 001 — Live vs Replay Mode Chrome

## Design Question
The operator works in two modes:
- **Live (Queue):** emails blocked at some Stage waiting for human verdict — clearing inbound work
- **History (Replay):** previously-handled emails opened retrospectively to correct if Regex/LLM was wrong at any stage

Both write to `agent_runs.human_verdict` + `pipeline_events` and feed the Phase 72 promotion-recommender. The catastrophic failure is **mode confusion** — operator clicks "approve/override" thinking they're in mode X but they're in mode Y, poisoning recommender data with wrong-context corrections.

Switching is weekly (not per-session), same operator, severity = catastrophic.

## How to View
```
open .planning/sketches/001-live-vs-replay-mode/index.html
```

Tab between **A | B | C** at the top of the page. Within each variant, click the mode toggle to flip Queue ↔ History.

## Variants
- **A — Mode-keyed shell (URL-routed):** `/queue` and `/history` are separate URLs. Top split-bar with orange/slate-blue halves dominates the chrome. Every visual cue (color, header pill, copy, row treatment, primary action) flips together. Impossible to mistake.
- **B — Single shell + persistent stripe:** One URL, mode toggle in toolbar. 4px full-bleed top stripe changes color, badge in toolbar names what writes mean. Subtler — mode always glanceable but the surface doesn't shout.
- **C — Mode-as-tab (anti-pattern):** Mode rendered as sibling "Queue / History" filter-tab inside the stage-keyed shell from sketch 005. Built to make the failure mode visible — tabs read as "filter by status" not "different consequence semantics."

## What to Look For
1. **A vs B:** how loud should the chrome be? A is bulletproof but visually heavy; B trusts the operator to read the stripe.
2. **C as warning:** flip C's tab back and forth — notice how the page barely changes. That's the muscle-memory failure mode you're worried about.
3. **Cross-stage carry-over:** the orange-vs-slate color choice anchors all downstream sketches. If A wins, sketches 002-007 inherit "orange chrome = you are in live queue."
4. **Header copy density:** A's header is wordy ("47 emails blocked, waiting for your verdict"). Is that helpful framing or noise?
