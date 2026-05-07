---
sketch: 005
name: swarm-shell-integration
question: "How do the three operator surfaces (swarm-ops dashboard, Bulk Review, Email Kanban) navigate together?"
winner: "B (refined to stage-keyed tabs)"
tags: [navigation, layout, phase-76, cross-swarm, stage-keyed]
---

# Sketch 005: Swarm shell integration

## Design Question

Phase 76 introduces a third surface (`/automations/[swarm]/kanban`) on top of two that already exist:
- `/swarm/[swarmId]` — V7 swarm-ops dashboard (briefing, delegation graph, jobs Kanban over `swarm_jobs`, timeline, terminal). Engineer/admin audience.
- `/automations/[swarm]/review` — Bulk Review (noise QA + Stage 1 promotion, reads `pipeline_events_email_summary`). Operator audience.
- `/automations/[swarm]/kanban` (new) — Unhandled-intent triage (reads `automation_runs status='pending'`). Operator audience.

How should the three relate? CONTEXT.md (D-04) locked "per-swarm route /automations/[swarm]/kanban" — Variant A honors that decision. Variants B and C are alternatives if the user wants the surfaces tied together more tightly than three separate routes.

## How to View

```
open .planning/sketches/005-swarm-shell-integration/index.html
```

## Variants

- **A: Three top-level routes, shared swarm-scoped top nav** — Each surface has its own URL. A swarm-scoped layout above all three renders the top nav with Bulk Review / Kanban / Operations links. Active surface highlighted.
- **B: Tab shell on `/automations/[swarm]`** — Bulk Review, Kanban, Pending Promotion become tabs of one operator surface. `/swarm/[swarmId]` stays a separate engineer-facing dashboard (linked via small "↗ Swarm operations" link in the tab strip).
- **C: Unified at `/swarm/[swarmId]`** — Everything on the existing swarm dashboard. Pill-button section nav switches between Operations (today's content) and the two new operator sections.

## What to Look For

- **URL clarity** — which variant produces URLs you'd be comfortable bookmarking and sharing in Slack?
- **Cognitive load** — does the variant feel like one product or three glued together?
- **Phase 999.2 trajectory** — which variant gives the cleanest path to a unified cross-swarm email inbox later?
- **Audience separation** — does the variant respect that engineers and operators have different mental models, or does it force one of them to work in a UI built for the other?
- **CONTEXT.md D-04 fidelity** — Variant A literally matches D-04. B and C deviate. Is the deviation worth the integration win?

## Recommendation

Variant A is the lowest-risk path that matches CONTEXT.md as-decided. Variant B is worth picking if the operator workflow benefits enough from in-page tabbing to justify revising D-04. Variant C is the most ambitious but blows up Phase 76's scope — defer to a future phase if it's the right end-state.

## Outcome (refinement, 2026-05-07)

**Winner: Variant B, refined to stage-keyed tabs.**

User's reframe during review: the original "Bulk Review vs Kanban" tab labels confused two concerns — "Bulk Review" was a UI noun describing today's surface, while "Kanban" was a feature label for Phase 76's lane. The natural axis is **the pipeline stage where human intervention is needed**:

| Tab | Stage | Status today |
|---|---|---|
| Stage 0 · Safety | input safety / injection escalations | already exists (`?tab=safety`) |
| Stage 1 · Noise | noise QA + Pending Promotion sub-view | already exists (default Bulk Review) |
| Stage 2 · Customer | customer mapping (iController lookup) | empty — Phase 77 ships content |
| Stage 3 · Intent | low_confidence + no_handler triage | Phase 76 ships |
| Stage 4 · Handler | handler_error queue | Phase 76 ships |

This reframe also resolved an existing UI inconsistency: the current Bulk Review surface already mixes Stage 0 (safety) and Stage 1 (noise + pending) under a single "Bulk Review" label using `?tab=` query params. Stage-keyed tabs unify these.

**Implications for CONTEXT.md** (revisions ship in the same commit as this sketch):
- **D-04 revised** — was "per-swarm route /automations/[swarm]/kanban"; now "per-swarm tab-shell at /automations/[swarm]/stage-N (or ?stage=N) with stage-keyed tabs."
- **D-05 revised** — was "Bulk Review and Kanban are conceptually distinct surfaces"; now "Bulk Review and Kanban are both views of the per-stage operator surface — Stage 1 tab is today's Bulk Review, Stage 3 tab is what Phase 76 was building under the 'Kanban' label."
- **Tab list driven by `swarms` registry** — which stages a swarm uses determines which tabs render. Sales-email (Phase 78) inherits the shell by registry insert.
- **Existing /automations/[swarm]/review URLs** — redirect to /automations/[swarm]/stage-1 (or remain as backwards-compat alias).
- **"Bulk Review" stops being a UI noun.** It becomes the human action verb on the Stage 1 tab. "Kanban" disappears as a UI label entirely (Phase 76 surface = "Stage 3" / "Stage 4" tabs).

**Next sketches:**
- **006** — Stage 3 triage tab shape (column-board vs filtered table vs hybrid). Possibly Stage 4 too if pattern differs.
- **007** — Row-action affordances per stage (Close, Replay-with-edit, Reclassify-as-noise; per-stage variations).
