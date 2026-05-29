---
name: sketch-findings-bulk-review-flow-ux
description: Validated design decisions, anti-drift contracts, codebase gap manifest, and step-by-step implementation sequence for the Bulk Review Flow UX milestone on agent-workforce. Auto-load when implementing any of REQ-01..REQ-07 (consolidated 4-axis Bulk Review · cross-stage context · pattern discovery · promotion-recommender handoff · live-mode + Stage 0 lane). Covers Stages 0-4 detail panes (Safety · Noise · Customer · Topic · Action) and the Patterns top-level mode.
---

<context>
## Project: bulk-review-flow-ux (workspace for agent-workforce)

The Bulk Review Flow UX milestone consolidates today's split override-capture surfaces into a single coherent operator workflow spanning all 5 pipeline stages (Stage 0 safety → Stage 1 noise/regex → Stage 2 entity → Stage 3 coordinator → Stage 4 handler) plus the pattern-discovery + Phase 72 promotion-recommender handoff.

7 sketches wrapped 2026-05-21. The design extends and refines the Phase 71/76/82.5 design lineage captured in the sibling skill `sketch-findings-agent-workforce`. Where the two skills overlap, **this skill's decisions supersede** for the Bulk Review milestone surfaces.

**Visual baseline**: V7 production tokens (`sources/themes/default.css` mirrors `Agent Workforce/.planning/sketches/themes/v7.css`). Brand-primary orange `#ff6a34` for Queue chrome, brand-secondary slate-blue `#69a8ff` for History, NEW purple `#b886ff` for Patterns. Dense-but-breathing dark-first tool aesthetic. Registry-driven (zero hardcoded enums).

**Anti-drift mission**: prior UI implementations on this product drifted severely between design and delivery. This skill captures the locks explicitly + flags every gap between sketch and codebase + recommends a strict build order. The four reference files below are read in this order during implementation.
</context>

<reading_order>
## Read these files when starting implementation work

1. **`references/MISSING-IN-CODEBASE.md`** — what data/components/server-actions need building before any sketch element can land. THE gap manifest.
2. **`references/canonical-patterns.md`** — the locked patterns, colors, copy strings, animation timings, and component shapes. Anti-drift contract.
3. **`references/operator-language.md`** — the operator-facing translation lock-table. Every operator-visible string must check against this.
4. **`references/IMPLEMENTATION-SEQUENCE.md`** — recommended build order across the 5 phases of the milestone. Phase 1 (foundation) blocks all others. Includes anti-drift grep gates between phases.
5. **`references/per-stage-content.md`** — per-stage detail-pane content specification. Read for the stage you're building.

Source HTML files (preserved verbatim) live in `sources/NNN-sketch-name/`. The MANIFEST is at `sources/MANIFEST.md`.
</reading_order>

<design_direction>
## Overall direction

**Outer chrome (sketch 001):** 3-third top mode-bar — Queue (orange) · History (slate-blue) · Patterns (purple). Mode confusion is *catastrophic severity* — every chrome element flips together when modes switch. URL-routed (`/queue` vs `/history` vs `/patterns`).

**Per-stage row strip (sketch 001):** 5-cell colored strip with operator-friendly outcomes (Safety · Noise · Customer · Topic · Action). Stage-cell states: `safe / match / warn / llm-rescue / idle / blocked`. Block-state amber tint when this is the stage waiting on the operator.

**Detail container (sketches 002-005):** inline-expand row → 2-col body (Read evidence left · Decide widget right) → footer with submit/skip/keyhints. **NOT a side-pane.** One row open at a time. `J/K` next-prev, `⏎` submit, `Esc` collapse, `N` skip.

**Read column (sketches 002-005):** plain section pattern (uppercase label + verdict-pill + key/value body). No bordered evidence-cards. Email body block with `pre-wrap`, NOT italic, 14px / 1.65 line-height, amber highlight token regardless of stage. Body toolbar with View-thread modal + Translate dropdown (future French inbox) + detected-language chip.

**Decide column (sketches 002-005):** stage-specific widget (radio for Stage 0; dropdown for Stage 1; pick-card + number-input override for Stage 2; ranked-list editor for Stage 3). Plus AuditBlock textarea (brand-orange left-border, semibold question heading, worked-example placeholder). Verdict button color triad: green=Confirm · amber=Override · red=Escalate/Dismiss.

**Pattern discovery (sketches 006-007):** new Patterns top-level mode. Stage-grouped cluster cards listing (sketch 006 Variant A locked). Full-page candidate detail with proposed-change before/after + evidence rows + Apply/Refine/Dismiss triad (sketch 007).

**Eval-type radio REMOVED from operator UI.** Server defaults to `regression`. Engineer admin retag surface is out of scope for this milestone.

**Operator language**: NO regex syntax, NO internal table/field names, NO statistical jargon. Full translation lock-table in `references/operator-language.md`.

**Reversibility framing**: "all actions are logged · an engineer can reverse Apply if it misbehaves" in every action footer. Operator never sees "this is irreversible".
</design_direction>

<findings_index>
## Reference files

| File | What it contains |
|---|---|
| `references/MISSING-IN-CODEBASE.md` | Gap manifest — every data field, component, and server action the sketches show but the codebase doesn't yet provide. Per-stage + cross-cutting. **READ FIRST.** |
| `references/canonical-patterns.md` | Anti-drift contract — locked patterns, exact CSS values, color tokens, copy strings, animation timings. The "what NOT to change" reference. |
| `references/operator-language.md` | Translation lock-table — internal terms ↔ operator-facing copy. With "things operators NEVER see" + "things that are OK". |
| `references/IMPLEMENTATION-SEQUENCE.md` | Recommended build order across the 5 phases (Foundation · Single-row context · 4-axis capture · Patterns + handoff · Live-mode audit). Per-phase acceptance gates + grep checks. |
| `references/per-stage-content.md` | Per-stage detail-pane content spec. Read for the stage you're building. |

## Source files

| Sketch | Winner | Surface |
|---|---|---|
| `sources/001-live-vs-replay-mode/` | **A — Mode-keyed shell** | 3-third mode-bar chrome |
| `sources/002-stage-0-safety-detail-convergence/` | **C — Inline-expand · full-width** | Stage 0 detail pane |
| `sources/003-stage-1-noise-feedback/` | **section pattern (A+B equivalent)** | Stage 1 detail pane (regex + LLM rescue) |
| `sources/004-stage-2-resolver-attribution/` | **A+B layouts equivalent** | Stage 2 detail pane + resolver chain + number-only override |
| `sources/005-stage-3-ranked-intent-reorder/` | **vertical reorderable list + escalate** | Stage 3 detail pane + ranked-intent editor |
| `sources/006-pattern-discovery-cluster/` | **A — Stage-grouped** | Patterns mode listing |
| `sources/007-promotion-recommender-handoff/` | **A+B equivalent** | Candidate detail + Apply/Refine/Dismiss |

Each source dir contains the sketch's `index.html` + `README.md`. The README captures per-sketch decisions, gaps, and implementation dependencies. The MANIFEST at `sources/MANIFEST.md` summarizes the canonical pattern locks.

## Theme

`sources/themes/default.css` is the locked V7 token set used by every sketch. Coding agents MUST consume `var(--...)` tokens — never hardcode hex colors. See `canonical-patterns.md` §15 for the token vocabulary.
</findings_index>

<usage_guidance>
## When to load this skill

- Implementing any of REQ-01..REQ-07 from the Bulk Review Flow UX milestone roadmap
- Building or modifying any detail pane for Stages 0/1/2/3/4
- Building the Patterns top-level mode or candidate detail surface
- Writing operator-facing copy (always check `references/operator-language.md`)
- Adding new pipeline-events writes (check `references/MISSING-IN-CODEBASE.md` for the locked shape)
- Reviewing a PR that touches Bulk Review surfaces (use the grep gates in `IMPLEMENTATION-SEQUENCE.md` §Anti-drift gates)

## When NOT to use

- Backend-only work that doesn't touch operator UI (server logic, Inngest pipelines, registry migrations) — although DO check `MISSING-IN-CODEBASE.md` if the work adds new `decision_details` fields, since those become contracts the UI consumes
- Other swarms beyond debtor-email (this milestone's sketches use debtor-email as the worked example; the patterns generalize but operator-facing copy will need swarm-specific tuning)
- Engineer admin / QA surfaces (those CAN use internal terminology — operator-language.md only governs operator-facing copy)

## Drift signals — block if seen

These are common drift patterns from prior implementation cycles. Stop and reference this skill if a PR introduces any of them:

1. New color hex values not in `default.css` tokens
2. Side-pane detail container (`OptionZDetailPane` or similar) on a Bulk Review surface
3. Eval-type radio in operator override flow
4. Fuzzy name search on Stage 2 customer override
5. Drag-and-drop (HTML5 DnD or libraries) on Stage 3 reorder (deferred to v2)
6. Standalone 👍/👎 thumb widgets (rule feedback is implicit via Confirm/Override colors)
7. Internal terms in operator copy (`regex`, `Kanban`, `pipeline_events`, `LLM tiebreaker`, etc.)
8. Animation timings other than 0.12s / 0.15s / 0.6s
9. "Irreversible" framing in action footers (always say "an engineer can reverse")
10. Stage 3 escalate without a required audit note
</usage_guidance>

<metadata>
## Processed sketches

Wrapped 2026-05-21:
- 001-live-vs-replay-mode
- 002-stage-0-safety-detail-convergence
- 003-stage-1-noise-feedback
- 004-stage-2-resolver-attribution
- 005-stage-3-ranked-intent-reorder
- 006-pattern-discovery-cluster
- 007-promotion-recommender-handoff
</metadata>
