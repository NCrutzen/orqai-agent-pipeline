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
| 002 | per-email-strip | How should the 4-stage decision path render in Bulk Review's predicted-row feed? | _tbd_ | layout, bulk-review, phase-71, pipeline-events |
| 003 | four-axis-override-panel | How do we surface 4 stage-override widgets without burying the common case? | _tbd_ | interaction, override, phase-71, bulk-review-detail |

## Phase 71 — Bulk Review redesign (UX exploration, 2026-05-05)

Sketches 002 and 003 explore the two highest-risk surfaces of Phase 71's Bulk Review redesign:
the **predicted-row list** (one row per email aggregating 4 stages, backed by `pipeline_events_email_summary`)
and the **drill-in detail pane** (4-axis override widgets + eval_type tagging).

Theme + tokens reused unchanged from sketch 001 (dark / amber / `themes/default.css`) since this
is the same dashboard surface (`web/app/(dashboard)/automations/[swarm]/review/`).
Phase 71 CONTEXT (`.planning/phases/71-.../71-CONTEXT.md` §D-04..D-10) is the ground truth for
field shapes and behaviour referenced inside the mockups.
