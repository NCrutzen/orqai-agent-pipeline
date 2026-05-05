---
sketch: 002
name: per-email-strip
question: "How should the 4-stage decision path render in Bulk Review's predicted-row feed (one row per email × 4 stages × override flag × cost)?"
winner: A
winner_note: "Direction A picked; refined into sketch 004 with V7 tokens + recipient filter."
tags: [layout, bulk-review, phase-71, pipeline-events]
---

# Sketch 002: Per-email row strip (4 stages)

## Design Question
Phase 71 collapses Bulk Review to **one row per email**, backed by `pipeline_events_email_summary`. Each row must surface: 4 stage decisions, per-stage override flag, total cost, and the `eval_type` tag (capability/regression). How dense should this be? Is the pipeline mental model best preserved as columns, glyphs, or a breadcrumb?

## How to View
```
open .planning/sketches/002-per-email-strip/index.html
```

## Variants
- **A: Column strip** — fixed 4-column grid, each stage gets its own labeled cell with the decision text. Maximum information density; easy to scan vertically (compare same stage across emails).
- **B: Glyph pipeline** — single horizontal line, each stage is a 26px square glyph with hover tooltip. Minimum density; easy to scan horizontally (lots of rows visible). Override = amber glyph + dot.
- **C: Breadcrumb path** — each row is a stacked block (header + subject + breadcrumb of stage chips). Reads like a story; override chips bloom amber. Lowest rows-per-screen, but the cleanest representation of the pipeline as a *path*.

## What to Look For
- **Override discoverability**: which variant makes "this row was touched" most obvious at a glance?
- **Stage-X scanning**: if Andrew wants to find every email where Stage 3 was overridden, which is fastest?
- **Density**: how many emails fit on screen vs how much detail per row?
- **eval_type pill**: where does `regression`/`capability` belong — column, end-of-line, or top-right of card?
- **Empty stages**: when Stage 1 = noise so Stage 2-4 never ran — A greys cells, B fades glyphs, C compresses to "stages 2-4 skipped". Which reads cleanest?
