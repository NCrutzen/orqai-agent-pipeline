---
captured: 2026-05-19
source: UAT — operator visual review of Stage 4
status: pending
priority: M
target_milestone: v8.1
tags: [stage-4, ui, layout, filter-chips, detail-pane, regression-suspected]
---

# Stage 4 layout parity with Stage 1/2/3 + detail-pane width regression

## Issue 1 — Stage 4 lacks the filter pills

Stage 1, 2, 3 use a filter-chip row above the row list (Needs review,
Payment Admittance, Auto-reply, OoO temp, OoO perm…). Stage 4 does
not — it uses three collapsible sections instead (Handler error / Needs
review / Auto-archived, Phase 82.8-05).

Operator request 2026-05-19: bring Stage 4 in line with the other
stages — same filter-pill pattern. Likely chip set:
- **Handler error** (drives the current default-open red section)
- **Needs review** (empty today but reserved)
- **Auto-archived** (the lime bucket from Phase 82.8)
- Possibly subdivision by `noise_category` (auto_reply, payment_admittance,
  ooo_temporary, ooo_permanent) inside Auto-archived, mirroring Stage 1's
  per-category chips.

Trade-off: chips give faster cross-section filtering and consistency.
Collapsible sections give discoverability of empty buckets ("Needs
review (0)") — keep an empty-state line if we drop sections entirely.

## Issue 2 — Detail-pane width regression

Earlier work widened the detail-pane to **540px** (Phase 82.7.3 G-03).
The grid columns in all stage shells today still show `minmax(640px, 1fr)
540px`:

- `stage-0/page.tsx:257`
- `stage-1/client-shell.tsx:226`
- `stage-2/page.tsx:253`
- `stage-3/client-shell.tsx:225`
- `stage-4/client-shell.tsx:342`

So the width is **set** at 540px everywhere. But operator perceives
"smaller again" — possible causes:

1. Phase 82.8-11 wrapped the Stage 4 pane in a `position: sticky` div
   without an explicit `width: 100%` — sticky can collapse to content
   width in some browsers depending on parent's `align-items` setting.
   That outer wrap may render the pane narrower than the 540px column.
2. `UnifiedDetailPane` itself may have an internal `max-width` smaller
   than 540px since the 82.7.3 change shipped.
3. Browser zoom / window size — verify operator's viewport.

Quick diagnostic for v8.1 phase: DevTools → measure the actual rendered
`<aside data-testid="...">` width on Stage 1 vs Stage 4. If Stage 4 is
narrower at the same viewport, item (1) is the cause; add `style={{
width: "100%" }}` to the sticky wrapper. If both are narrow, 82.7.3
was either reverted or never landed on this shell — git-blame the
relevant grid column.

## Why deferred

Both belong to the v8.1 review-surface cleanup phase alongside:
- `2026-05-18-stage-1-needs-review-semantics.md`
- `2026-05-18-override-note-flow-unclear.md`
- `2026-05-19-rename-label-resolver-and-tagger-plus-stage-alignment.md`
- `2026-05-18-granular-dry-run-gating-per-stage-and-handler.md`

Layout parity touches the three-section structure introduced by
Phase 82.8-05; can't be a tiny one-line fix without revisiting the
operator's mental model for Stage 4 (sections vs chips).

## Acceptance criteria for the v8.1 phase

- [ ] Stage 4 uses chips at the top matching Stage 1/2/3 visual
      pattern; collapsible sections removed OR demoted to a secondary
      grouping under the chips.
- [ ] Detail-pane measured width on Stage 4 equals Stage 1 at the same
      viewport (540px in 1280×800 baseline).
- [ ] If sticky wrapper was the culprit, add `width: 100%` or refactor
      to flex/grid item that fills the column.
- [ ] Phase 82.7.3 G-03 regression-test (Playwright snapshot or pixel
      check) restored so this can't drift again.

## Related items

See "Related items" lists in the four sibling 2026-05-18 / 2026-05-19
v8.1 todos — they're all part of the same surface refresh.
