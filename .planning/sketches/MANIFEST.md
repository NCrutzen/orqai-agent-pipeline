# Sketch Manifest — Smeba Draft Review Frontend

## Design Direction
Frontend voor Andrew (engelstalige reviewer) om door Smeba sales-AI gegenereerde drafts te beoordelen, bewerken en verzenden. Dense-maar-ademend tool-gevoel, geïnspireerd door Braintrust's trace review UI. Dark-first, amber accent, gebouwd met dezelfde design-tokens als de bestaande MR Automations dashboard (shadcn + Tailwind v4) zodat de stap naar productie klein is.

## Reference Points
- **Braintrust trace review** — 3-panel layout met collapsible annotation-panel, pass/fail verdict, issue tags, dark mode + oranje accent
- **MR Automations dashboard** — bestaande shadcn/tailwind setup (web/app/globals.css), Satoshi/Cabinet/Geist Mono fonts, OKLCH kleurenpalette

## Field Scope (15 velden)

**Context (lezen):** ontvangen mail · gebruikte context · AI-redenering · confidence · SLA-indicator · status
**Draft (lezen + bewerken):** NL-draft (verstuurd) · EN-draft (Andrew leest) · inline edit met diff
**Review (invullen):** 👍/👎 · defect-categorieën · feedback tekst
**Acties:** Approve & Send · Send back to AI · Reject

## Sketches

| # | Name | Design Question | Winner | Tags |
|---|------|----------------|--------|------|
| 001 | review-layout | Which page layout works best for Andrew's draft review? | **A — Classic 3-panel** | layout, review, smeba |
| 002 | per-email-strip | How should the 4-stage decision path render in Bulk Review's predicted-row feed? | **A — Column strip** (refined in 004) | layout, bulk-review, phase-71, pipeline-events |
| 003 | four-axis-override-panel | How do we surface 4 stage-override widgets without burying the common case? | **C — Vertical pipeline** (refined in 004) | interaction, override, phase-71, bulk-review-detail |
| 004 | phase-71-synthesis | Combine 002A + 003C, reskinned to V7 tokens, plus inbox-filter and N-stage scaling | **A — Synthesis** | synthesis, phase-71, v7-design-system |
| 005 | swarm-shell-integration | How do the three operator surfaces (swarm-ops, Bulk Review, Email Kanban) navigate together? | **B — Tab-shell, stage-keyed** (revises CONTEXT.md D-04/D-05) | navigation, layout, phase-76, stage-keyed |
| 006 | stage-3-triage-shape | Inside the Stage 3 · Intent tab, what's the layout for the unhandled-intent triage list? | **B — Filtered table + detail pane** | layout, phase-76, stage-3, table, detail-pane |
| 007 | row-action-affordances | How do Replay (with intent edit), Reclassify-as-noise, and Close work as interactions inside the detail pane? | **B — Inline-expand within pane** | interaction, phase-76, stage-3, detail-pane, actions, inline-editor |

## Phase 71 — Bulk Review redesign (UX exploration, 2026-05-05)

Sketches 002 and 003 explored the two highest-risk surfaces of Phase 71's Bulk Review redesign:
the **predicted-row list** (one row per email aggregating 4 stages, backed by `pipeline_events_email_summary`)
and the **drill-in detail pane** (4-axis override widgets + eval_type tagging).

Sketch 004 is the **synthesis** that lands the design in production: 002 Variant A (column strip)
+ 003 Variant C (vertical pipeline), reskinned to the V7 design system (`themes/v7.css` mirrors
`web/app/globals.css [data-theme="dark"]` V7 namespace), with two feedback items resolved:
**(a)** per-recipient inbox filtering via a chip strip + recipient column on every row, and
**(b)** N-stage scaling — the detail pane's pipeline renders from a data array, so swarms with
5/6 stages work without redesign (toggle `4 stages ↔ 6 stages` in the sketch toolbar).

Phase 71 CONTEXT (`.planning/phases/71-.../71-CONTEXT.md` §D-04..D-10) is the ground truth for
field shapes and behaviour referenced inside the mockups. Sketch 004 is the input for `/gsd-ui-phase 71`.
