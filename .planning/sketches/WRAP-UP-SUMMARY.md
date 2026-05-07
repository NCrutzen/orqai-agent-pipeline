# Sketch Wrap-Up Summary

> **Wrap sessions:**
> - 2026-04-22 — sketch 001 (Phase 47 Smeba Draft Review)
> - 2026-05-07 — sketches 002–007 (Phase 71 retroactive + Phase 76)
>
> Both sessions write to the same skill at `./.claude/skills/sketch-findings-agent-workforce/`.

---

## Wrap session — 2026-05-07

**Sketches processed:** 6 (002–007)
**Design areas added:** 3 (Bulk Review · Stage-keyed Shell · Stage 3 Triage)
**Skill output:** `./.claude/skills/sketch-findings-agent-workforce/` (append mode)

### Included Sketches

| # | Name | Winner | Design Area |
|---|------|--------|-------------|
| 002 | per-email-strip | A — column strip (folded into 004) | Bulk Review (Phase 71) |
| 003 | four-axis-override-panel | C — vertical pipeline (folded into 004) | Bulk Review (Phase 71) |
| 004 | phase-71-synthesis | A — synthesis (002A + 003C reskinned to V7) | Bulk Review (Phase 71) |
| 005 | swarm-shell-integration | B refined — tab shell, stage-keyed | Stage-keyed Shell (Phase 76) |
| 006 | stage-3-triage-shape | B — filtered table + detail pane | Stage 3 Triage (Phase 76) |
| 007 | row-action-affordances | B — inline-expand within pane | Stage 3 Triage (Phase 76) |

### Excluded Sketches
None — all unprocessed sketches included. 002 + 003 captured under sketch 004's reference (they were explicitly superseded).

### Design Direction (this session)
Multi-surface frontend for the MR Automations agentic pipeline. V7 production tokens default for any Phase 71+ surface. Operators triage emails through a per-swarm stage-keyed tab shell at `/automations/[swarm]/stage-N`. Engineers run swarms through the V7 dashboard at `/swarm/[swarmId]`. Inside each Stage 3 / Stage 4 tab: chip filter + dense rows + persistent detail pane with inline-expand action editor. Inside Stage 1 tab: today's Bulk Review (per-email row with 4-stage column strip + 4-axis override panel + recipient chip filter).

### Key Decisions

**Layout / navigation**
- Stage-keyed tabs replace feature-keyed labels ("Bulk Review", "Kanban") — tabs ARE pipeline stages.
- Tab list registry-driven from `swarms` row; adding a swarm = registry insert, not UI code change.
- Per-swarm scope; cross-swarm aggregation deferred to Phase 999.2.
- `/swarm/[swarmId]` (engineer dashboard) stays at its own URL with a "↗ Swarm operations dashboard" link from the operator surface's tab strip.

**Triage tab interior (Stage 3 / Stage 4)**
- Filtered table + persistent detail pane (460px right). Mirrors Bulk Review row pattern for cross-stage consistency.
- Chip filter strip for reason filtering.
- Confidence bar only on `low_confidence` rows (no visual noise on `no_handler`).
- Stage 4 inherits the same shape with reason='handler_error' and an `error_detail` expanding section.

**Row actions**
- Inline-expand editor (no modals) for Replay-with-edit and Reclassify-as-noise.
- Same-intent Replay = ⏎ (one tap). Different-intent Replay = pick + ⏎ (two taps).
- Close fires immediately, no confirm modal. Future undo-toast can mitigate misclick risk.
- Keyboard shortcuts (⏎ / Esc / N / Space) match Bulk Review's existing cheat-sheet.

**Bulk Review (Phase 71, retroactive)**
- Per-email row with 4-stage column strip; override-flag dot in chip corners.
- Vertical 4-axis override panel; common-case Approve/Reject/Skip never buried.
- N-stage scaling via data-driven layout array.
- Recipient chip strip when swarm hosts multiple inboxes.

**Visual / theme**
- V7 tokens default for Phase 71+ surfaces (`sources/themes/v7.css`).
- Brand-primary orange (`#ff6a34`) for chrome / primary actions; amber (`#ffb547`) for override / dirty state.
- Information density: all relevant context visible simultaneously; progressive disclosure only within detail panes.

### CLAUDE.md routing
Auto-load routing line already present (Phase 47 session set it up). Skill description broadened to cover Phase 47 + Phase 71 + Phase 76. CLAUDE.md routing line keyed on the skill name, not description text — left as-is.

### Next Step
`/gsd-ui-phase 76` — formalize the locked patterns into UI-SPEC.md.
Then `/gsd-plan-phase 76` to break into plans.

---

## Wrap session — 2026-04-22

**Sketches processed:** 1
**Design areas:** Review Page Layout
**Skill output:** `./.claude/skills/sketch-findings-agent-workforce/`

## Included Sketches

| # | Name | Winner | Design Area |
|---|------|--------|-------------|
| 001 | review-layout | Variant A — Classic 3-panel | Review Page Layout |

## Excluded Sketches
None.

## Design Direction
Dark-first tool aesthetic voor Andrew's Smeba draft review werkplek. Amber accent op zwart, geïnspireerd door Braintrust's trace review UI. Classic 3-panel layout met altijd-zichtbare inbox en review-panel — alle context tegelijk beschikbaar, geen drawers of focus-mode. Progressive disclosure alleen binnen het review-panel (defect-tags en feedback ingeklapt tot reviewer 👎 kiest).

## Key Decisions
- **Layout:** 3-panel (320px inbox | flex middle | 380px review)
- **Palette:** dark backgrounds (`#0a0a0b` → `#2a2a2f`), amber accent `#e8a547`
- **Role colors:** customer=blue, AI-draft=purple, reviewer=amber
- **Typography:** system sans, 13px base, mono voor trace IDs en shortcuts
- **Spacing:** 4px grid (`--space-1` → `--space-6`)
- **Interactions:** collapsible review sections, mutually-exclusive 👍/👎, per-card NL/EN toggle
- **Field mapping:** alle 15 velden gemapped naar een plek in de layout (zie reference doc)

## Next Step
`/gsd-plan-phase` — start building. De skill `sketch-findings-agent-workforce` wordt auto-geladen zodra je UI-code schrijft in dit project.
