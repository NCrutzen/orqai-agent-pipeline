---
sketch: 004
name: phase-71-synthesis
question: "Synthesis — combine 002 Variant A (column strip) with 003 Variant C (vertical pipeline), reskinned to match the production V7 design system, with two missing pieces resolved: (1) per-recipient inbox filtering, (2) N-stage scaling beyond Phase 71's 4 stages."
winner: A
tags: [synthesis, phase-71, v7-design-system, recipient-filter, n-stage-scaling]
---

# Sketch 004: Phase 71 synthesis

## Design Question
Sketch 002 Variant A (column strip) and 003 Variant C (vertical pipeline) were chosen as the
direction. Three open questions before locking the UI-SPEC:

1. **Match the production OS** — sketches 002/003 used a Braintrust-inspired amber-on-black
   theme. Production agent-workforce uses the V7 design system: navy backgrounds (`#0c1117`),
   brand-orange (`#ff6a34`) for primary actions, blue (`#69a8ff`) for selected/info, larger
   radii (8–22px), Satoshi/Cabinet/Geist Mono. This sketch uses `themes/v7.css` so the visuals
   land where production already is.

2. **Per-recipient filtering** — the swarm receives mail at multiple inboxes (debiteuren@smeba.nl,
   debiteuren@iccafe.nl, finance@belgie.smeba.be, finance@iccafe-france.fr). Bulk Review needs
   to (a) **show** which inbox each row arrived at, and (b) **filter** to one inbox at a time.
   Resolved with two additions: (i) a recipient column on every row with a colour dot + address;
   (ii) a chip strip above the list, one chip per inbox (with row count), filtering the list.

3. **N-stage scaling** — Phase 71 has 4 stages, but Phase 73's sales-email swarm or a future
   compliance/reconciliation extension may add Stage 5 / 6. The detail pane's pipeline must not
   require a redesign every time. Resolved by rendering the flow from a data array. Toggle
   `4 stages ↔ 6 stages` in the toolbar to see the layout scale automatically — connecting line
   stretches, nodes flow, no horizontal overflow, dirty-state still readable.

## How to View
```
open .planning/sketches/004-phase-71-synthesis/index.html
```

Try:
- Click the **6 stages** toggle (top-right of toolbar) — pipeline grows to 6 nodes, hypothetical
  Stage 5 (compliance) and Stage 6 (cross-entity reconciliation) appear inline.
- Click any **inbox chip** — visual filter affordance is wired up (chip becomes active).
- Hover any **stage cell** in the list — stages with `↻` are operator-overridden.

## What Changed vs 002A and 003C
| Element | 002A / 003C | 004 |
|---|---|---|
| Theme | Custom amber/black | Production V7 tokens (`themes/v7.css`) |
| Brand colour | Amber `#e8a547` | Orange `#ff6a34` (brand-primary), Blue `#69a8ff` (selected) |
| Recipient address | Not shown | New column on every row + filter chip strip |
| Inbox filter | Missing | 5 chips (All + 4 inboxes) with row counts |
| Pipeline stages | Hardcoded to 4 | Data-driven array → renders 4 or 6 |
| Override accent | Amber as primary | Amber kept as **override-only** semantic colour, not chrome |
| Radii | 4–8px | 8–22px (V7) |
| Border | Solid `#2a2a2f` | Translucent `rgba(255,255,255,0.08)` (V7 hairline) |

## Open Questions for UI-SPEC
- **Confirmation modal copy** — overrides emit Inngest events; not undo-able. D-15 says surface
  an info-banner ("update iController draft separately") for Stage 4. Modal vs banner vs both?
- **Recipient palette stability** — the 4 dot colours (lime/amber/pink/teal) are visual-only;
  if a 5th brand inbox lands, the palette needs a sixth slot. Tie the colour to `swarms.entity_brand`
  registry so it's deterministic per entity, not hand-picked per UI tweak.
- **Multi-inbox-select** — the chip strip is single-select today. Should "Show smeba.nl + iccafe.nl
  but hide France" be a real workflow? Probably YAGNI for v1; revisit if operator asks.
- **N-stage future** — the data array drives the layout, but sketch 004's 6-stage demo uses
  hypothetical stage names. The actual 5/6-stage scenario won't land before Phase 73+; treat the
  scaling as a forward-compat assertion, not a required v1 feature.

## Winner
**Variant A** is the only variant in this sketch — it's the synthesis of 002A + 003C with all
three feedback items resolved. Marking it as the winning direction so `/gsd-ui-phase 71` picks it up.
