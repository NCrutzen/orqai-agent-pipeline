---
captured: 2026-05-18
source: UAT — Stage 0 override on FarmPlus row
status: pending
priority: M
target_milestone: v8.1
tags: [stage-0, stage-1, stage-2, stage-3, override, note, ux, terminology]
---

# Override + note flow on Stage 0/2/3 is unclear — needs UX consolidation

## Symptom

Operator opens detail-pane for an `injection_suspected` row, clicks
'override stage' on Stage 0, and sees:

1. SHOW DETAILS auto-expands and shows a `NOTES` block with:
   - "⤓ Override + note save together" hint (amber)
   - Textarea ("Add a note about this stage's decision...")
   - **Save note** button
   - **✓ Confirm** button
2. Below the expander: Injection suspected / Clean radio
   - Subtext: "Note and override are saved together"
3. Footer: **Submit override (Stage 0)** + Cancel override + Reject + Skip

Three button surfaces (`Save note`, `Confirm`, `Submit override`) +
two "save together" hints (one in NOTES block, one under the radio).
Operator doesn't know:

- Which button actually persists my override + note?
- What does `Confirm` do vs `Submit override`?
- If I type a note then click `Save note`, is that the same as
  clicking `Submit override`?
- Does changing the radio AFTER typing a note do anything?

## What actually happens (current contract)

- `StageFeedbackPanel.Save note` → POST `verdict='unclear'` with prose
- `StageFeedbackPanel.Confirm` → POST `verdict='confirm'` (+ prose)
- Click `override stage` link → POST `verdict='override'` (+ prose) AT
  THAT MOMENT (snapshot of current prose state). State flips to dirty.
- Footer `Submit override` → dispatches `bulk-review:override-submit`
  window event → Inngest override pipeline runs (this is the real
  override; the prior fireFeedback was just audit substrate).
- Radio choice (Injection suspected / Clean) → bound to the override
  widget's "next category" picker. Footer submit reads that value.

So the actual flow is: type note → click override stage → change radio
if needed → Submit override. The two panel buttons (Save note /
Confirm) are alternate paths for non-override scenarios that LOOK like
they belong to the override flow.

## What's confusing

1. **Three buttons with overlapping semantics.** Save note + Confirm
   + Submit override all post to the feedback endpoint but with
   different verdict values; only Submit override actually fires the
   Inngest pipeline that changes the row's state.
2. **Two "save together" hints** suggest two different couplings.
3. **fireFeedback on link-click** captures prose-at-that-moment, not
   prose-at-submit-time. Editing the note AFTER clicking `override
   stage` doesn't update the audit row (only the Inngest payload at
   Submit time uses the latest value).
4. **Radio + override are visually disconnected** — radio sits below
   the expanded panel and the panel buttons look like the primary
   action surface.

## Proposed direction for v8.1

Pick one of two consolidation paths:

**Path A — single override surface inside the audit row.**
- Move the radio (Injection suspected / Clean) INTO the audit
  expander, next to the NOTES textarea.
- Replace 3-button surface with ONE button per state: "Confirm
  current" (state=ok), "Save override" (state=dirty, includes radio +
  note in one POST).
- Footer keeps Reject/Skip only — primary action moves into the
  per-stage cell.
- Pro: each stage's review is self-contained; no "save together" hints
  needed; Submit always means submit.
- Con: footer no longer has the per-stage Submit affordance the
  keyboard shortcuts depend on (Phase 82.7.1 D-01/D-02).

**Path B — keep footer as primary, remove panel buttons.**
- Delete `Save note` + `Confirm` buttons from `StageFeedbackPanel`.
- Textarea is purely a prose input. Submit happens via footer only.
- Confirm-without-override path: replaced by the implicit footer
  "Approve (Stages X+Y)" or a per-stage "Confirm" link replacing
  "override stage" when state is OK.
- Pro: footer = single source of truth; matches Phase 82.7.3 H-01.
- Con: loses the in-cell Save Note draft mechanism (operator can no
  longer save a note WITHOUT giving a verdict — but that mechanism
  was always unclear anyway).

Path B is closer to the existing Phase 82.7.3 trajectory ("canonical
Submit/Cancel/Reject surface is the detail-pane footer only").

## Out of scope for today

- Picking A vs B. v8.1 spec call.
- Renaming hints. Whatever survives should have ONE "save together"
  line, not two.

## Related items

- `.planning/todos/pending/2026-05-18-stage-1-needs-review-semantics.md`
  — also v8.1, same surface, same operator confusion category.

## Next step

Open a v8.1 phase that covers BOTH this and the "Needs review"
semantics todo. They're tightly coupled — both are operator-mental-
model fixes on the per-stage review surface.
